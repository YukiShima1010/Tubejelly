import { randomUUID } from 'crypto';
import chalk from 'chalk';

export type JobKind = 'music' | 'video';
export type JobMode = 'single' | 'playlist';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type JobLogLevel = 'info' | 'error';

export interface JobLog {
  at: string;
  level: JobLogLevel;
  message: string;
}

export interface JobResult {
  skipped: boolean;
  filename?: string;
  size?: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
}

/** 拡張機能へ返すジョブ情報 */
export interface PublicJob {
  id: string;
  kind: JobKind;
  mode: JobMode;
  url: string;
  title: string | null;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: JobResult | null;
  error: string | null;
  logs: JobLog[];
}

export interface JobSpec {
  kind: JobKind;
  mode: JobMode;
  /** 正規化済みのYouTube URL */
  url: string;
  title?: string;
  /** 保存先ディレクトリ */
  targetPath: string;
}

export interface JobContext {
  log(message: string, level?: JobLogLevel): void;
  setTitle(title: string): void;
}

export type JobRunner = (spec: JobSpec, ctx: JobContext) => Promise<JobResult>;

interface Job extends PublicJob {
  ownerKey: string;
  spec: JobSpec;
  finishedAtMs: number | null;
}

export const MAX_LOG_LINES = 500;
export const MAX_JOBS_PER_OWNER = 50;
export const MAX_UNFINISHED_JOBS_PER_OWNER = 20;
export const JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_LOG_MESSAGE_LENGTH = 1000;

export class JobLimitError extends Error {
  constructor() {
    super(`未完了のジョブが多すぎます（最大${MAX_UNFINISHED_JOBS_PER_OWNER}件）。完了を待ってから追加してください。`);
    this.name = 'JobLimitError';
  }
}

/**
 * 拡張機能から登録されたダウンロードジョブを1件ずつ順番に処理する
 */
export class JobManager {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private processing = false;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly runner: JobRunner,
    private readonly now: () => number = Date.now
  ) {}

  enqueue(ownerKey: string, spec: JobSpec): PublicJob {
    this.prune(ownerKey);

    const unfinished = this.ownerJobs(ownerKey).filter(
      (job) => job.status === 'queued' || job.status === 'running'
    );
    if (unfinished.length >= MAX_UNFINISHED_JOBS_PER_OWNER) {
      throw new JobLimitError();
    }

    const job: Job = {
      id: randomUUID(),
      ownerKey,
      spec,
      kind: spec.kind,
      mode: spec.mode,
      url: spec.url,
      title: spec.title?.trim() || null,
      status: 'queued',
      createdAt: this.isoNow(),
      startedAt: null,
      finishedAt: null,
      finishedAtMs: null,
      result: null,
      error: null,
      logs: [],
    };

    this.appendLog(job, '📨 受け付けました。順番に処理します。');
    this.jobs.set(job.id, job);
    this.queue.push(job);
    // 応答（queued）を返してから処理を始める
    setImmediate(() => void this.processQueue());

    return toPublicJob(job);
  }

  get(id: string, ownerKey: string): PublicJob | null {
    const job = this.jobs.get(id);
    if (!job || job.ownerKey !== ownerKey) {
      return null;
    }
    return toPublicJob(job);
  }

  /** キューが空になるまで待つ（テスト用） */
  async waitForIdle(): Promise<void> {
    if (!this.processing && this.queue.length === 0) return;
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      let job: Job | undefined;
      while ((job = this.queue.shift())) {
        await this.run(job);
      }
    } finally {
      this.processing = false;
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }

  private async run(job: Job): Promise<void> {
    job.status = 'running';
    job.startedAt = this.isoNow();
    this.appendLog(job, '▶️ 処理を開始しました。');

    const ctx: JobContext = {
      log: (message, level = 'info') => this.appendLog(job, message, level),
      setTitle: (title) => {
        if (title.trim()) job.title = title.trim();
      },
    };

    try {
      const result = await this.runner(job.spec, ctx);
      job.result = result;

      if (result.failedCount > 0) {
        job.status = 'failed';
        job.error =
          job.mode === 'playlist'
            ? `${result.failedCount}件のダウンロードに失敗しました（成功 ${result.successCount}件 / スキップ ${result.skippedCount}件）`
            : 'ダウンロードに失敗しました。';
        this.appendLog(job, `❌ ${job.error}`, 'error');
      } else {
        job.status = 'succeeded';
        this.appendLog(
          job,
          result.skipped ? '⏭️ 既に保存済みのためスキップしました。' : '✅ 追加が完了しました。'
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      job.status = 'failed';
      job.error = message;
      this.appendLog(job, `❌ ${message}`, 'error');
      console.error(chalk.red(`❌ 拡張機能ジョブ失敗 (${job.id}):`), message);
    } finally {
      job.finishedAtMs = this.now();
      job.finishedAt = new Date(job.finishedAtMs).toISOString();
    }
  }

  private appendLog(job: Job, message: string, level: JobLogLevel = 'info'): void {
    const trimmed = message.trim().slice(0, MAX_LOG_MESSAGE_LENGTH);
    if (!trimmed) return;

    const last = job.logs[job.logs.length - 1];
    if (last && last.message === trimmed && last.level === level) {
      return;
    }

    job.logs.push({ at: this.isoNow(), level, message: trimmed });
    if (job.logs.length > MAX_LOG_LINES) {
      // 先頭（受付ログ）は残し、古い途中経過から捨てる
      job.logs.splice(1, job.logs.length - MAX_LOG_LINES);
    }
  }

  private ownerJobs(ownerKey: string): Job[] {
    return Array.from(this.jobs.values()).filter((job) => job.ownerKey === ownerKey);
  }

  /**
   * 終了から一定時間経過したジョブと、ユーザーごとの上限を超えた古い終了済みジョブを破棄する
   */
  private prune(ownerKey: string): void {
    const now = this.now();
    for (const job of this.jobs.values()) {
      if (job.finishedAtMs !== null && now - job.finishedAtMs > JOB_RETENTION_MS) {
        this.jobs.delete(job.id);
      }
    }

    const finished = this.ownerJobs(ownerKey)
      .filter((job) => job.finishedAtMs !== null)
      .sort((a, b) => (a.finishedAtMs ?? 0) - (b.finishedAtMs ?? 0));
    const total = this.ownerJobs(ownerKey).length;
    // 新しいジョブを1件追加した後に上限以内となるよう、古い終了済みジョブを破棄する
    let overflow = total + 1 - MAX_JOBS_PER_OWNER;
    for (const job of finished) {
      if (overflow <= 0) break;
      this.jobs.delete(job.id);
      overflow--;
    }
  }

  private isoNow(): string {
    return new Date(this.now()).toISOString();
  }
}

function toPublicJob(job: Job): PublicJob {
  return {
    id: job.id,
    kind: job.kind,
    mode: job.mode,
    url: job.url,
    title: job.title,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    result: job.result ? { ...job.result } : null,
    error: job.error,
    logs: job.logs.map((log) => ({ ...log })),
  };
}
