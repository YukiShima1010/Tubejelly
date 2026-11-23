import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { hashToken, TokenStore } from './tokenStore.js';

describe('TokenStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tubejelly-token-'));
    filePath = path.join(dir, 'nested', 'extension-tokens.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('トークンはハッシュのみ保存され、再読み込み後も検証できる', async () => {
    const store = new TokenStore(filePath);
    const { token, record } = await store.issue({
      userKey: 'discord-1',
      via: 'discord',
      deviceName: 'Chrome',
    });

    const raw = await readFile(filePath, 'utf-8');
    assert.ok(!raw.includes(token), '平文トークンがファイルに含まれている');
    assert.ok(raw.includes(hashToken(token)));

    const reloaded = new TokenStore(filePath);
    const found = await reloaded.find(token);
    assert.equal(found?.id, record.id);
    assert.equal(found?.userKey, 'discord-1');
    assert.equal(await reloaded.find('wrong-token'), null);
    assert.equal(await reloaded.find(''), null);
  });

  it('失効させたトークンは使えない', async () => {
    const store = new TokenStore(filePath);
    const { token, record } = await store.issue({
      userKey: 'line-1',
      via: 'line',
      deviceName: 'Chrome',
    });
    assert.equal(await store.revoke(record.id), true);
    assert.equal(await store.find(token), null);
    assert.equal(await store.revoke(record.id), false);

    const reloaded = new TokenStore(filePath);
    assert.equal(await reloaded.find(token), null);
  });

  it('同時に発行しても全件保存される', async () => {
    const store = new TokenStore(filePath);
    const issued = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        store.issue({ userKey: `u${i}`, via: 'discord', deviceName: 'Chrome' })
      )
    );
    const reloaded = new TokenStore(filePath);
    for (const { token } of issued) {
      assert.ok(await reloaded.find(token));
    }
  });

  it('保存に失敗したトークンは使えない', async () => {
    const store = new TokenStore(path.join(dir, 'blocker', 'tokens.json'));
    await store.find('x'); // 読み込み（ファイルなし）は成功させる
    // 保存先のディレクトリと同名のファイルを置いて書き込みを失敗させる
    await writeFile(path.join(dir, 'blocker'), 'x', 'utf-8');
    await assert.rejects(() => store.issue({ userKey: 'u', via: 'discord', deviceName: 'Chrome' }));
    assert.equal((store as unknown as { records: unknown[] }).records.length, 0);
  });

  it('壊れたファイルは空として扱わずエラーにする', async () => {
    await writeFile(path.join(dir, 'broken.json'), '{ broken', 'utf-8');
    const store = new TokenStore(path.join(dir, 'broken.json'));
    await assert.rejects(() => store.find('x'), /読み込みに失敗/);
  });

  it('lastUsedAt の保存は1時間に1回に抑える', async () => {
    let now = Date.parse('2026-11-24T00:00:00Z');
    const store = new TokenStore(filePath, () => now);
    const { record } = await store.issue({ userKey: 'u', via: 'discord', deviceName: 'Chrome' });

    await store.touch(record);
    const first = JSON.parse(await readFile(filePath, 'utf-8')).tokens[0].lastUsedAt;
    assert.equal(first, '2026-11-24T00:00:00.000Z');

    now += 60 * 1000;
    await store.touch(record);
    const second = JSON.parse(await readFile(filePath, 'utf-8')).tokens[0].lastUsedAt;
    assert.equal(second, first);
  });
});
