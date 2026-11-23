import type { IncomingMessage, ServerResponse } from 'http';
import chalk from 'chalk';
import { PayloadTooLargeError, readRawBody, sendJson, type RouteHandler } from '../http/server.js';
import { JobLimitError } from './jobs.js';
import { PairingLimitError } from './pairing.js';
import { ValidationError, type ExtensionAuth, type ExtensionService } from './service.js';

export const EXTENSION_API_PREFIX = '/ext/v1';
const MAX_BODY_BYTES = 16 * 1024;
const JOB_PATH_REGEX = new RegExp(`^${EXTENSION_API_PREFIX}/jobs/([A-Za-z0-9-]{1,64})$`);

type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'too_many_requests'
  | 'internal';

class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function sendError(res: ServerResponse, statusCode: number, code: ErrorCode, message: string) {
  sendJson(res, statusCode, { error: { code, message } });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = String(req.headers['content-type'] ?? '');
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new ApiError(400, 'bad_request', 'Content-Type は application/json にしてください。');
  }

  const raw = await readRawBody(req, MAX_BODY_BYTES);
  if (!raw.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'bad_request', 'JSONの形式が正しくありません。');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(400, 'bad_request', 'JSONオブジェクトを送信してください。');
  }
  return parsed as Record<string, unknown>;
}

function extractBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{16,128})$/);
  return match ? match[1] : null;
}

async function requireAuth(
  req: IncomingMessage,
  service: ExtensionService
): Promise<ExtensionAuth> {
  const token = extractBearerToken(req);
  const auth = token ? await service.authenticate(token) : null;
  if (!auth) {
    throw new ApiError(401, 'unauthorized', '連携が無効です。拡張機能から再連携してください。');
  }
  return auth;
}

/**
 * 接続元の識別子。Cloudflare Tunnel 経由では cf-connecting-ip を使う。
 */
function clientKey(req: IncomingMessage): string {
  const cfIp = req.headers['cf-connecting-ip'];
  const ip = (Array.isArray(cfIp) ? cfIp[0] : cfIp) || req.socket.remoteAddress || 'unknown';
  return ip.trim().slice(0, 64);
}

function methodNotAllowed(): never {
  throw new ApiError(405, 'method_not_allowed', 'このメソッドは使用できません。');
}

/**
 * /ext/v1/* を処理するルートハンドラーを作成する
 */
export function createExtensionApiHandler(service: ExtensionService): RouteHandler {
  return async (req, res, requestPath) => {
    if (requestPath !== EXTENSION_API_PREFIX && !requestPath.startsWith(`${EXTENSION_API_PREFIX}/`)) {
      return false;
    }

    const method = req.method ?? 'GET';

    try {
      if (requestPath === `${EXTENSION_API_PREFIX}/health`) {
        if (method !== 'GET') methodNotAllowed();
        sendJson(res, 200, { ok: true, service: 'tubejelly' });
        return true;
      }

      if (requestPath === `${EXTENSION_API_PREFIX}/pair/start`) {
        if (method !== 'POST') methodNotAllowed();
        const body = await readJsonBody(req);
        sendJson(res, 201, service.startPairing(body.deviceName, clientKey(req)));
        return true;
      }

      if (requestPath === `${EXTENSION_API_PREFIX}/pair/poll`) {
        if (method !== 'POST') methodNotAllowed();
        const body = await readJsonBody(req);
        sendJson(res, 200, await service.pollPairing(body.pairingId));
        return true;
      }

      if (requestPath === `${EXTENSION_API_PREFIX}/me`) {
        if (method !== 'GET') methodNotAllowed();
        const auth = await requireAuth(req, service);
        sendJson(res, 200, {
          userName: auth.userName,
          deviceName: auth.record.deviceName,
          via: auth.record.via,
          linkedAt: auth.record.createdAt,
        });
        return true;
      }

      if (requestPath === `${EXTENSION_API_PREFIX}/token`) {
        if (method !== 'DELETE') methodNotAllowed();
        const auth = await requireAuth(req, service);
        await service.revoke(auth);
        sendJson(res, 200, { ok: true });
        return true;
      }

      if (requestPath === `${EXTENSION_API_PREFIX}/jobs`) {
        if (method !== 'POST') methodNotAllowed();
        const auth = await requireAuth(req, service);
        const body = await readJsonBody(req);
        const job = service.createJob(auth, {
          url: body.url,
          kind: body.kind,
          playlist: body.playlist,
          title: body.title,
        });
        sendJson(res, 202, { job });
        return true;
      }

      const jobMatch = requestPath.match(JOB_PATH_REGEX);
      if (jobMatch) {
        if (method !== 'GET') methodNotAllowed();
        const auth = await requireAuth(req, service);
        const job = service.getJob(auth, jobMatch[1]);
        if (!job) {
          throw new ApiError(404, 'not_found', 'ジョブが見つかりません。サーバーが再起動した可能性があります。');
        }
        sendJson(res, 200, { job });
        return true;
      }

      throw new ApiError(404, 'not_found', 'APIが見つかりません。');
    } catch (error) {
      if (error instanceof ApiError) {
        sendError(res, error.statusCode, error.code, error.message);
      } else if (error instanceof ValidationError) {
        sendError(res, 400, 'bad_request', error.message);
      } else if (error instanceof PayloadTooLargeError) {
        res.setHeader('Connection', 'close');
        sendError(res, 413, 'payload_too_large', 'リクエストが大きすぎます。');
      } else if (error instanceof PairingLimitError || error instanceof JobLimitError) {
        sendError(res, 429, 'too_many_requests', error.message);
      } else {
        console.error(chalk.red(`❌ 拡張機能API処理エラー (${method} ${requestPath}):`), error);
        sendError(res, 500, 'internal', 'サーバー内部でエラーが発生しました。');
      }
      return true;
    }
  };
}
