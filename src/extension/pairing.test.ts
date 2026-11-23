import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVED_GRACE_MS,
  findPairingCode,
  normalizePairingCode,
  PAIRING_TTL_MS,
  PairingLimitError,
  PairingManager,
} from './pairing.js';

const approval = { userKey: 'discord-1', userName: 'hoge', via: 'discord' as const };

describe('連携コードの正規化と抽出', () => {
  it('大文字小文字・ハイフンの有無を吸収する', () => {
    assert.equal(normalizePairingCode('tj-abcd-2345'), 'TJ-ABCD-2345');
    assert.equal(normalizePairingCode('TJABCD2345'), 'TJ-ABCD-2345');
    assert.equal(normalizePairingCode(' TJ-ABCD-2345 '), 'TJ-ABCD-2345');
  });

  it('紛らわしい文字や桁数違いは受け付けない', () => {
    assert.equal(normalizePairingCode('TJ-ABC0-2345'), null);
    assert.equal(normalizePairingCode('TJ-ABCD-234'), null);
    assert.equal(normalizePairingCode('XX-ABCD-2345'), null);
  });

  it('メッセージ本文からコードを見つける', () => {
    assert.equal(findPairingCode('連携します TJ-ABCD-2345 よろしく'), 'TJ-ABCD-2345');
    assert.equal(findPairingCode('tj-abcd-2345'), 'TJ-ABCD-2345');
    assert.equal(findPairingCode('https://www.youtube.com/watch?v=xxxxxxxxxxx'), null);
    assert.equal(findPairingCode('XTJ-ABCD-2345'), null);
    assert.equal(findPairingCode('TJ-ABCD-23456'), null);
  });
});

describe('PairingManager', () => {
  it('発行したコードを承認するとトークン受け取りが1回だけできる', () => {
    const manager = new PairingManager();
    const { pairingId, code } = manager.start('Chrome');
    assert.match(code, /^TJ-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    assert.equal(manager.poll(pairingId).status, 'pending');
    assert.deepEqual(manager.approve(code.toLowerCase(), approval), {
      ok: true,
      deviceName: 'Chrome',
    });

    const result = manager.poll(pairingId);
    assert.equal(result.status, 'approved');
    if (result.status === 'approved') {
      assert.deepEqual(result.approval, approval);
    }
    // 受け取り処理中の同時確認では二重に渡さない
    assert.equal(manager.poll(pairingId).status, 'pending');
    manager.consume(pairingId);
    assert.equal(manager.poll(pairingId).status, 'expired');
  });

  it('トークン発行に失敗したら release で再度受け取れる', () => {
    const manager = new PairingManager();
    const { pairingId, code } = manager.start('Chrome');
    manager.approve(code, approval);
    assert.equal(manager.poll(pairingId).status, 'approved');
    manager.release(pairingId);
    assert.equal(manager.poll(pairingId).status, 'approved');
  });

  it('接続元ごとの上限では、その接続元の古い未承認コードから破棄する', () => {
    let now = 0;
    const manager = new PairingManager(() => now++, 1000, 10, 2);
    const user = manager.start('u', 'user');
    const a = manager.start('a', 'attacker');
    manager.start('b', 'attacker');
    const c = manager.start('c', 'attacker');
    assert.equal(manager.poll(a.pairingId).status, 'expired');
    assert.equal(manager.poll(c.pairingId).status, 'pending');
    assert.equal(manager.poll(user.pairingId).status, 'pending');
  });

  it('承認済みのコードは破棄せず、全て承認済みなら発行を拒否する', () => {
    const manager = new PairingManager(Date.now, 60_000, 10, 1);
    const first = manager.start('a', 'me');
    manager.approve(first.code, approval);
    assert.throws(() => manager.start('b', 'me'), PairingLimitError);
    assert.equal(manager.poll(first.pairingId).status, 'approved');
  });

  it('全体の上限を超えると発行を拒否する', () => {
    const manager = new PairingManager(Date.now, 60_000, 2, 5);
    manager.start('a', 'c1');
    manager.start('b', 'c2');
    assert.throws(() => manager.start('c', 'c3'), PairingLimitError);
  });

  it('同じコードは2回承認できない', () => {
    const manager = new PairingManager();
    const { code } = manager.start('Chrome');
    assert.equal(manager.approve(code, approval).ok, true);
    assert.deepEqual(manager.approve(code, approval), { ok: false, reason: 'already_used' });
  });

  it('存在しないコードは not_found', () => {
    const manager = new PairingManager();
    assert.deepEqual(manager.approve('TJ-AAAA-AAAA', approval), {
      ok: false,
      reason: 'not_found',
    });
  });

  it('有効期限が切れると承認も受け取りもできない', () => {
    let now = 1_000_000;
    const manager = new PairingManager(() => now);
    const { pairingId, code } = manager.start('Chrome');
    now += PAIRING_TTL_MS;
    assert.deepEqual(manager.approve(code, approval), { ok: false, reason: 'not_found' });
    assert.equal(manager.poll(pairingId).status, 'expired');
  });

  it('期限直前に承認されても受け取り猶予がある', () => {
    let now = 1_000_000;
    const manager = new PairingManager(() => now);
    const { pairingId, code } = manager.start('Chrome');
    now += PAIRING_TTL_MS - 1000;
    assert.equal(manager.approve(code, approval).ok, true);
    now += APPROVED_GRACE_MS - 1000;
    assert.equal(manager.poll(pairingId).status, 'approved');
  });

  it('未承認コードの上限を超えると発行を拒否し、期限切れ分は解放される', () => {
    let now = 0;
    const manager = new PairingManager(() => now, 1000, 2);
    manager.start('a', 'c1');
    manager.start('b', 'c2');
    assert.throws(() => manager.start('c', 'c3'), PairingLimitError);
    now += 1000;
    assert.doesNotThrow(() => manager.start('d', 'c3'));
    assert.equal(manager.size, 1);
  });
});
