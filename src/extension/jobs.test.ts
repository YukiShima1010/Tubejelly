import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JobLimitError, JobManager, MAX_JOBS_PER_OWNER, MAX_LOG_LINES, type JobRunner, type JobSpec } from './jobs.js';
import { createLogMessageAdapter, formatProgressMessage } from './runner.js';

const spec: JobSpec = {
  kind: 'music',
  mode: 'single',
  url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
  targetPath: '/music',
};

const okResult = { skipped: false, successCount: 1, skippedCount: 0, failedCount: 0 };

describe('JobManager', () => {
  it('ジョブを1件ずつ順番に処理する', async () => {
    let running = 0;
    let maxRunning = 0;
    const order: string[] = [];
    const runner: JobRunner = async (s) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(s.url);
      running--;
      return okResult;
    };

    const manager = new JobManager(runner);
    const a = manager.enqueue('u', { ...spec, url: 'a' });
    const b = manager.enqueue('u', { ...spec, url: 'b' });
    assert.equal(manager.get(b.id, 'u')?.status, 'queued');

    await manager.waitForIdle();
    assert.deepEqual(order, ['a', 'b']);
    assert.equal(maxRunning, 1);
    assert.equal(manager.get(a.id, 'u')?.status, 'succeeded');
    assert.ok(manager.get(a.id, 'u')?.finishedAt);
  });

  it('ログとタイトルを記録し、例外は失敗として扱う', async () => {
    const runner: JobRunner = async (_s, ctx) => {
      ctx.setTitle('曲名');
      ctx.log('📥 ダウンロード中');
      ctx.log('📥 ダウンロード中'); // 連続する同一ログはまとめる
      throw new Error('yt-dlp エラー');
    };
    const manager = new JobManager(runner);
    const job = manager.enqueue('u', spec);
    await manager.waitForIdle();

    const result = manager.get(job.id, 'u');
    assert.equal(result?.status, 'failed');
    assert.equal(result?.title, '曲名');
    assert.equal(result?.error, 'yt-dlp エラー');
    const messages = result?.logs.map((log) => log.message) ?? [];
    assert.equal(messages.filter((m) => m === '📥 ダウンロード中').length, 1);
    assert.equal(result?.logs.at(-1)?.level, 'error');
  });

  it('スキップは成功扱い、プレイリストの一部失敗は失敗扱い', async () => {
    const results = [
      { skipped: true, successCount: 0, skippedCount: 1, failedCount: 0 },
      { skipped: false, successCount: 2, skippedCount: 0, failedCount: 1 },
    ];
    const manager = new JobManager(async () => results.shift()!);
    const skipped = manager.enqueue('u', spec);
    const partial = manager.enqueue('u', { ...spec, mode: 'playlist' });
    await manager.waitForIdle();

    assert.equal(manager.get(skipped.id, 'u')?.status, 'succeeded');
    assert.equal(manager.get(skipped.id, 'u')?.result?.skipped, true);
    assert.equal(manager.get(partial.id, 'u')?.status, 'failed');
    assert.match(manager.get(partial.id, 'u')?.error ?? '', /1件のダウンロードに失敗/);
  });

  it('他のユーザーのジョブは参照できない', async () => {
    const manager = new JobManager(async () => okResult);
    const job = manager.enqueue('owner', spec);
    assert.equal(manager.get(job.id, 'other'), null);
    assert.equal(manager.get('missing', 'owner'), null);
    await manager.waitForIdle();
  });

  it('返却したジョブを書き換えても内部状態は変わらない', async () => {
    const manager = new JobManager(async () => okResult);
    const job = manager.enqueue('u', spec);
    job.logs.push({ at: '', level: 'info', message: '改ざん' });
    job.status = 'failed';
    assert.equal(manager.get(job.id, 'u')?.logs.length, 1);
    await manager.waitForIdle();
  });

  it('ログは上限行数で古い途中経過から捨てる', async () => {
    const manager = new JobManager(async (_s, ctx) => {
      for (let i = 0; i < MAX_LOG_LINES + 100; i++) ctx.log(`line ${i}`);
      return okResult;
    });
    const job = manager.enqueue('u', spec);
    await manager.waitForIdle();
    const logs = manager.get(job.id, 'u')?.logs ?? [];
    assert.equal(logs.length, MAX_LOG_LINES);
    assert.match(logs[0].message, /受け付けました/);
    assert.match(logs.at(-1)?.message ?? '', /完了/);
  });

  it('未完了ジョブが多すぎると拒否する', () => {
    const manager = new JobManager(() => new Promise(() => {}));
    assert.throws(() => {
      for (let i = 0; i < 100; i++) manager.enqueue('u', spec);
    }, JobLimitError);
  });

  it('終了済みジョブはユーザーごとの上限を超えると古いものから破棄する', async () => {
    const manager = new JobManager(async () => okResult);
    const first = manager.enqueue('u', spec);
    await manager.waitForIdle();
    for (let i = 0; i < MAX_JOBS_PER_OWNER; i++) {
      manager.enqueue('u', spec);
      await manager.waitForIdle();
    }
    assert.equal(manager.get(first.id, 'u'), null);
  });

  it('終了から24時間経過したジョブは破棄する', async () => {
    let now = 0;
    const manager = new JobManager(async () => okResult, () => now);
    const old = manager.enqueue('u', spec);
    await manager.waitForIdle();
    now += 24 * 60 * 60 * 1000 + 1;
    manager.enqueue('other', spec);
    await manager.waitForIdle();
    assert.equal(manager.get(old.id, 'u'), null);
  });
});

describe('進捗メッセージのログ化', () => {
  it('装飾と進捗バーを除いて1行にする', () => {
    assert.equal(
      formatProgressMessage('🎵 **曲名**\n👤 作者 | ⏱️ 3:00\n📥 ダウンロード中: 40%\n[████████░░░░░░░░░░░░]'),
      '🎵 曲名 / 👤 作者 | ⏱️ 3:00 / 📥 ダウンロード中: 40%'
    );
  });

  it('send と edit の内容をログに流す', async () => {
    const logs: string[] = [];
    const adapter = createLogMessageAdapter({ log: (m) => logs.push(m), setTitle: () => {} });
    const channel = adapter.channel as unknown as {
      send: (text: string) => Promise<{ edit: (text: string) => Promise<void> }>;
    };
    const sent = await channel.send('開始');
    await sent.edit('完了');
    assert.deepEqual(logs, ['開始', '完了']);
  });
});
