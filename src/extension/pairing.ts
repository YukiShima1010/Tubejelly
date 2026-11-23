import { randomBytes, randomInt } from 'crypto';

/** 紛らわしい文字（0 O 1 I L）を除いた31文字 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_GROUP_LENGTH = 4;

export const PAIRING_TTL_MS = 10 * 60 * 1000;
/** サーバー全体で保持する未受け取りコードの上限 */
export const MAX_PENDING_PAIRINGS = 50;
/** 接続元ごとの未受け取りコードの上限（第三者による枠の占有を防ぐ） */
export const MAX_PENDING_PAIRINGS_PER_CLIENT = 3;
/** 承認後、拡張機能がトークンを受け取るまでの最低猶予 */
export const APPROVED_GRACE_MS = 5 * 60 * 1000;

/** メッセージ中から連携コードを探す正規表現（ハイフンは省略可） */
const CODE_IN_TEXT_REGEX = new RegExp(
  `(?:^|[^A-Za-z0-9])TJ-?([${CODE_ALPHABET}]{${CODE_GROUP_LENGTH}})-?([${CODE_ALPHABET}]{${CODE_GROUP_LENGTH}})(?![A-Za-z0-9])`,
  'i'
);

export type PairingVia = 'discord' | 'line';

export interface PairingApproval {
  userKey: string;
  userName: string;
  via: PairingVia;
}

interface PairingRecord {
  pairingId: string;
  code: string;
  deviceName: string;
  createdAt: number;
  expiresAt: number;
  clientKey: string;
  approval?: PairingApproval;
  /** トークン発行処理中（同時の受け取りで二重発行しないため） */
  claimed?: boolean;
}

export type PairingPollResult =
  | { status: 'pending'; expiresAt: number }
  | { status: 'approved'; deviceName: string; approval: PairingApproval }
  | { status: 'expired' };

export type PairingApproveResult =
  | { ok: true; deviceName: string }
  | { ok: false; reason: 'not_found' | 'already_used' };

export class PairingLimitError extends Error {
  constructor() {
    super('未承認の連携コードが多すぎます。しばらくしてから再度お試しください。');
    this.name = 'PairingLimitError';
  }
}

function generateCode(): string {
  const pick = () =>
    Array.from(
      { length: CODE_GROUP_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    ).join('');
  return `TJ-${pick()}-${pick()}`;
}

/**
 * 連携コードの文字列を正規化する（大文字化・ハイフン補完）。
 * 連携コードとして解釈できない場合は null。
 */
export function normalizePairingCode(input: string): string | null {
  const compact = input.trim().toUpperCase().replace(/[\s-]/g, '');
  const match = compact.match(
    new RegExp(`^TJ([${CODE_ALPHABET}]{${CODE_GROUP_LENGTH}})([${CODE_ALPHABET}]{${CODE_GROUP_LENGTH}})$`)
  );
  return match ? `TJ-${match[1]}-${match[2]}` : null;
}

/**
 * メッセージ本文から連携コードを抽出する
 */
export function findPairingCode(text: string): string | null {
  const match = text.match(CODE_IN_TEXT_REGEX);
  if (!match) return null;
  return `TJ-${match[1].toUpperCase()}-${match[2].toUpperCase()}`;
}

/**
 * 連携コードの発行・承認・受け取りを管理する（メモリ上のみ）
 */
export class PairingManager {
  private readonly byId = new Map<string, PairingRecord>();
  private readonly byCode = new Map<string, PairingRecord>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = PAIRING_TTL_MS,
    private readonly maxPending: number = MAX_PENDING_PAIRINGS,
    private readonly maxPendingPerClient: number = MAX_PENDING_PAIRINGS_PER_CLIENT
  ) {}

  start(
    deviceName: string,
    clientKey = 'unknown'
  ): { pairingId: string; code: string; expiresAt: number } {
    this.purgeExpired();

    // 同じ接続元の上限に達したら、その接続元の未承認コードを古い順に破棄する
    // （再発行・キャンセルを繰り返しても締め出されないように。他の接続元のコードは消さない）
    const fromClient = Array.from(this.byId.values())
      .filter((record) => record.clientKey === clientKey)
      .sort((a, b) => a.createdAt - b.createdAt);
    let overflow = fromClient.length + 1 - this.maxPendingPerClient;
    for (const record of fromClient) {
      if (overflow <= 0) break;
      if (record.approval) continue;
      this.remove(record);
      overflow--;
    }
    if (overflow > 0 || this.byId.size >= this.maxPending) {
      throw new PairingLimitError();
    }

    let code = generateCode();
    while (this.byCode.has(code)) {
      code = generateCode();
    }

    const createdAt = this.now();
    const record: PairingRecord = {
      pairingId: randomBytes(32).toString('base64url'),
      code,
      deviceName,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      clientKey,
    };

    this.byId.set(record.pairingId, record);
    this.byCode.set(record.code, record);

    return { pairingId: record.pairingId, code: record.code, expiresAt: record.expiresAt };
  }

  approve(code: string, approval: PairingApproval): PairingApproveResult {
    this.purgeExpired();

    const normalized = normalizePairingCode(code);
    const record = normalized ? this.byCode.get(normalized) : undefined;
    if (!record) {
      return { ok: false, reason: 'not_found' };
    }
    if (record.approval) {
      return { ok: false, reason: 'already_used' };
    }

    record.approval = approval;
    // 承認直後に期限切れにならないよう、受け取り猶予を確保する
    record.expiresAt = Math.max(record.expiresAt, this.now() + APPROVED_GRACE_MS);
    return { ok: true, deviceName: record.deviceName };
  }

  /**
   * 連携状態を確認する。承認済みの場合は受け取り中として確保し、結果を返す。
   * 呼び出し側はトークンの保存に成功したら consume()、失敗したら release() を呼ぶこと。
   */
  poll(pairingId: string): PairingPollResult {
    this.purgeExpired();

    const record = this.byId.get(pairingId);
    if (!record) {
      return { status: 'expired' };
    }

    if (!record.approval || record.claimed) {
      return { status: 'pending', expiresAt: record.expiresAt };
    }

    record.claimed = true;
    return { status: 'approved', deviceName: record.deviceName, approval: record.approval };
  }

  /** トークンを渡し終えた連携コードを破棄する */
  consume(pairingId: string): void {
    const record = this.byId.get(pairingId);
    if (record) this.remove(record);
  }

  /** トークン発行に失敗した場合、再度受け取れるように戻す */
  release(pairingId: string): void {
    const record = this.byId.get(pairingId);
    if (record) record.claimed = false;
  }

  /** 未承認・未受け取りの件数（テスト用） */
  get size(): number {
    this.purgeExpired();
    return this.byId.size;
  }

  private remove(record: PairingRecord): void {
    this.byId.delete(record.pairingId);
    this.byCode.delete(record.code);
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const record of this.byId.values()) {
      if (record.expiresAt <= now) {
        this.remove(record);
      }
    }
  }
}
