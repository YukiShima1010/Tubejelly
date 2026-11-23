import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createHttpServer } from '../http/server.js';
import type { UserConfigEntry } from '../types.js';
import { createExtensionApiHandler } from './api.js';
import type { JobRunner, JobSpec } from './jobs.js';
import { ExtensionService } from './service.js';
import { TokenStore } from './tokenStore.js';

const users: Record<string, UserConfigEntry> = {
  'discord-1': { NAME: 'hoge', DISCORD_USER_ID: 'discord-1', MUSIC_DL_DIR: '/music', VIDEO_DL_DIR: '/video' },
  'line-2': { NAME: 'fuga', LINE_USER_ID: 'line-2', MUSIC_DL_DIR: '/music2', VIDEO_DL_DIR: '/video2' },
};

describe('拡張機能API', () => {
  let server: Server;
  let baseUrl: string;
  let dir: string;
  let service: ExtensionService;
  const ranSpecs: JobSpec[] = [];

  const runner: JobRunner = async (spec, ctx) => {
    ranSpecs.push(spec);
    ctx.setTitle('テスト曲');
    ctx.log('📥 ダウンロード中: 100%');
    return { skipped: false, filename: 'テスト曲.mp3', size: 10, successCount: 1, skippedCount: 0, failedCount: 0 };
  };

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tubejelly-api-'));
    service = new ExtensionService(
      new TokenStore(path.join(dir, 'tokens.json')),
      async (userKey) => users[userKey] ?? null,
      runner
    );
    server = createHttpServer([createExtensionApiHandler(service)]);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ext/v1`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });

  async function call(
    method: string,
    pathname: string,
    options: { body?: unknown; token?: string; rawBody?: string; contentType?: string } = {}
  ) {
    const headers: Record<string, string> = {};
    if (options.body !== undefined || options.rawBody !== undefined) {
      headers['Content-Type'] = options.contentType ?? 'application/json';
    }
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const res = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers,
      body: options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
  }

  async function pairAs(userKey: string, via: 'discord' | 'line' = 'discord'): Promise<string> {
    const start = await call('POST', '/pair/start', { body: { deviceName: 'Test Chrome' } });
    assert.equal(start.status, 201);
    const reply = await service.handlePairingMessage(`コード ${start.json.code}`, userKey, via);
    assert.match(reply ?? '', /連携しました/);
    const poll = await call('POST', '/pair/poll', { body: { pairingId: start.json.pairingId } });
    assert.equal(poll.json.status, 'approved');
    return poll.json.token;
  }

  it('health は認証なしで応答し、CORSヘッダーを返さない', async () => {
    const res = await call('GET', '/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true, service: 'tubejelly' });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  it('連携コードの発行から承認、トークン受け取りまで', async () => {
    const start = await call('POST', '/pair/start', { body: { deviceName: 'My <Chrome>' } });
    assert.equal(start.status, 201);
    assert.match(start.json.code, /^TJ-/);

    const pending = await call('POST', '/pair/poll', { body: { pairingId: start.json.pairingId } });
    assert.equal(pending.json.status, 'pending');

    const reply = await service.handlePairingMessage(start.json.code, 'discord-1', 'discord');
    assert.match(reply ?? '', /My Chrome/);

    const approved = await call('POST', '/pair/poll', { body: { pairingId: start.json.pairingId } });
    assert.equal(approved.json.status, 'approved');
    assert.equal(approved.json.userName, 'hoge');
    assert.equal(approved.json.deviceName, 'My Chrome');

    const again = await call('POST', '/pair/poll', { body: { pairingId: start.json.pairingId } });
    assert.equal(again.json.status, 'expired');

    const me = await call('GET', '/me', { token: approved.json.token });
    assert.equal(me.status, 200);
    assert.equal(me.json.userName, 'hoge');
  });

  it('未登録ユーザーは連携コードを承認できない', async () => {
    const start = await call('POST', '/pair/start', { body: {} });
    const reply = await service.handlePairingMessage(start.json.code, 'stranger', 'discord');
    assert.match(reply ?? '', /未登録/);
    const poll = await call('POST', '/pair/poll', { body: { pairingId: start.json.pairingId } });
    assert.equal(poll.json.status, 'pending');
  });

  it('連携コードを含まないメッセージは処理しない', async () => {
    assert.equal(
      await service.handlePairingMessage('https://youtu.be/aaaaaaaaaaa', 'discord-1', 'discord'),
      null
    );
  });

  it('認証が必要なAPIはトークンなし・不正トークンで401', async () => {
    assert.equal((await call('GET', '/me')).status, 401);
    assert.equal((await call('GET', '/me', { token: 'x'.repeat(43) })).status, 401);
    const res = await call('POST', '/jobs', { body: { url: 'https://youtu.be/aaaaaaaaaaa', kind: 'music' } });
    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, 'unauthorized');
  });

  it('ジョブを登録して状態とログを取得できる', async () => {
    const token = await pairAs('discord-1');
    ranSpecs.length = 0;
    const created = await call('POST', '/jobs', {
      token,
      body: {
        url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa&list=PLxxxx&t=10',
        kind: 'music',
        title: 'タブのタイトル',
      },
    });
    assert.equal(created.status, 202);
    assert.equal(created.json.job.mode, 'single');
    assert.equal(created.json.job.url, 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
    assert.equal(created.json.job.title, 'タブのタイトル');
    assert.equal('ownerKey' in created.json.job, false);
    assert.equal('spec' in created.json.job, false);

    await service.jobs.waitForIdle();
    const fetched = await call('GET', `/jobs/${created.json.job.id}`, { token });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.json.job.status, 'succeeded');
    assert.equal(fetched.json.job.title, 'テスト曲');
    assert.ok(fetched.json.job.logs.some((log: { message: string }) => log.message.includes('100%')));
    assert.deepEqual(ranSpecs[0], {
      kind: 'music',
      mode: 'single',
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      title: 'タブのタイトル',
      targetPath: '/music',
    });
  });

  it('動画・プレイリストの保存先とURLを正しく選ぶ', async () => {
    const token = await pairAs('line-2', 'line');
    ranSpecs.length = 0;

    const playlist = await call('POST', '/jobs', {
      token,
      body: { url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa&list=PLabc', kind: 'video', playlist: true },
    });
    assert.equal(playlist.json.job.mode, 'playlist');
    assert.equal(playlist.json.job.url, 'https://www.youtube.com/playlist?list=PLabc');

    const playlistOnly = await call('POST', '/jobs', {
      token,
      body: { url: 'https://www.youtube.com/playlist?list=PLdef', kind: 'music' },
    });
    assert.equal(playlistOnly.json.job.mode, 'playlist');

    await service.jobs.waitForIdle();
    assert.equal(ranSpecs[0].targetPath, '/video2');
    assert.equal(ranSpecs[1].targetPath, '/music2');
  });

  it('入力が不正な場合は400', async () => {
    const token = await pairAs('discord-1');
    const cases = [
      { url: 'https://example.com/watch?v=aaaaaaaaaaa', kind: 'music' },
      { url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', kind: 'podcast' },
      { url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', kind: 'music', playlist: true },
      { kind: 'music' },
    ];
    for (const body of cases) {
      const res = await call('POST', '/jobs', { token, body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.json.error.code, 'bad_request');
    }

    const badJson = await call('POST', '/jobs', { token, rawBody: '{', contentType: 'application/json' });
    assert.equal(badJson.status, 400);
    const badType = await call('POST', '/jobs', { token, rawBody: '{}', contentType: 'text/plain' });
    assert.equal(badType.status, 400);
  });

  it('大きすぎるボディは413', async () => {
    const res = await call('POST', '/pair/start', { rawBody: JSON.stringify({ deviceName: 'x'.repeat(20000) }) });
    assert.equal(res.status, 413);
  });

  it('他人のジョブは404、未知のパスは404、メソッド違いは405', async () => {
    const tokenA = await pairAs('discord-1');
    const tokenB = await pairAs('line-2', 'line');
    const created = await call('POST', '/jobs', {
      token: tokenA,
      body: { url: 'https://youtu.be/bbbbbbbbbbb', kind: 'music' },
    });
    await service.jobs.waitForIdle();

    assert.equal((await call('GET', `/jobs/${created.json.job.id}`, { token: tokenB })).status, 404);
    assert.equal((await call('GET', '/unknown')).status, 404);
    assert.equal((await call('GET', '/jobs', { token: tokenA })).status, 405);
    assert.equal((await call('POST', '/health', { body: {} })).status, 405);
  });

  it('連携解除したトークンは使えなくなる', async () => {
    const token = await pairAs('discord-1');
    assert.equal((await call('DELETE', '/token', { token })).status, 200);
    assert.equal((await call('GET', '/me', { token })).status, 401);
  });

  it('users.json から削除されたユーザーのトークンは無効', async () => {
    const token = await pairAs('discord-1');
    const saved = users['discord-1'];
    delete users['discord-1'];
    try {
      assert.equal((await call('GET', '/me', { token })).status, 401);
    } finally {
      users['discord-1'] = saved;
    }
  });

  it('トークンの保存に失敗しても承認は失われず、再確認で受け取れる', async () => {
    const start = await call('POST', '/pair/start', { body: {} });
    await service.handlePairingMessage(start.json.code, 'discord-1', 'discord');
    const store = (service as unknown as { tokenStore: TokenStore }).tokenStore;
    const original = store.issue.bind(store);
    store.issue = async () => {
      throw new Error('EACCES');
    };
    try {
      const failed = await call('POST', '/pair/poll', { body: { pairingId: start.json.pairingId } });
      assert.equal(failed.status, 500);
    } finally {
      store.issue = original;
    }
    const retried = await call('POST', '/pair/poll', { body: { pairingId: start.json.pairingId } });
    assert.equal(retried.json.status, 'approved');
  });

  it('/ext/v1 以外のパスは担当しない', async () => {
    const res = await fetch(baseUrl.replace('/ext/v1', '/ext/v10/health'));
    assert.equal(res.status, 404);
    assert.equal(await res.text(), 'Not Found');
  });
});
