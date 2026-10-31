import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSessionService } from '../src/services/sessionService.js';

function store() {
  let time = Date.UTC(2026, 9, 31);
  const records = [];
  const users = new Map([['premium-user', { _id: 'premium-user', isPremium: true }]]);
  const service = createSessionService({
    sessions: { create: async record => { records.push(record); return record; }, findOne: async query => records.find(record => record.tokenHash === query.tokenHash) ?? null },
    users: { findById: async userId => users.get(userId) ?? null },
    now: () => time,
  });
  return { service, records, users, advance: ms => { time += ms; } };
}
const request = token => ({ headers: { authorization: `Bearer ${token}` } });

test('issues unguessable tokens and stores only their SHA-256 digest with a 14-day expiry', async () => {
  const { service, records } = store();
  const first = await service.issueSession('premium-user');
  const second = await service.issueSession('premium-user');
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(records[0].tokenHash, createHash('sha256').update(first).digest('hex'));
  assert.equal(records[0].expiresAt.getTime(), Date.UTC(2026, 9, 31) + 14 * 86400000);
  assert.ok(!JSON.stringify(records).includes(first));
  assert.deepEqual(Object.keys(records[0]).sort(), ['expiresAt', 'tokenHash', 'userId']);
});

test('authenticates an issued token against the current user entitlement', async () => {
  const { service, users } = store();
  const token = await service.issueSession('premium-user');
  assert.equal((await service.authenticateSession(request(token))).isPremium, true);
  users.set('premium-user', { _id: 'premium-user', isPremium: false });
  assert.equal((await service.authenticateSession(request(token))).isPremium, false);
});

test('rejects expired tokens even before Mongo TTL cleanup and returns null for deleted users', async () => {
  const { service, advance, users } = store();
  const token = await service.issueSession('premium-user');
  users.delete('premium-user');
  assert.equal(await service.authenticateSession(request(token)), null);
  users.set('premium-user', { _id: 'premium-user', isPremium: true });
  advance(14 * 86400000);
  assert.equal(await service.authenticateSession(request(token)), null);
});

test('does not accept public user IDs, malformed headers, or invented tokens', async () => {
  const { service } = store();
  const token = await service.issueSession('premium-user');
  for (const req of [{ body: { userId: 'premium-user' } }, { headers: {} }, request(''), request(token + 'x'), request('a'.repeat(43)), { headers: { authorization: `Basic ${token}` } }, { headers: { authorization: [`Bearer ${token}`] } }]) {
    assert.equal(await service.authenticateSession(req), null);
  }
});

test('persistence failures never become authenticated access', async () => {
  const service = createSessionService({ sessions: { findOne: async () => { throw new Error('database unavailable'); } } });
  await assert.rejects(service.authenticateSession(request('a'.repeat(43))), /database unavailable/);
});

test('existing accounts require verified ownership to attach a passkey', async () => {
  const { ownsAccount, canCompleteRegistration } = await import('../src/services/sessionService.js');
  const user = { _id: 'account', isPremium: true, authenticators: [] };
  assert.equal(ownsAccount(user, null), false);
  assert.equal(ownsAccount(user, { _id: 'other' }), false);
  assert.equal(ownsAccount(user, { _id: 'account' }), true);
  assert.equal(canCompleteRegistration(user, null, { ownerId: 'account' }), false);
  assert.equal(canCompleteRegistration(user, { _id: 'other' }, { ownerId: 'account' }), false);
  assert.equal(canCompleteRegistration(user, { _id: 'account' }, { ownerId: 'account' }), true);
  assert.equal(canCompleteRegistration(user, { _id: 'account' }, { ownerId: 'other' }), false);
});

test('new registration cannot complete anonymously after an account acquires paid entitlement or a passkey', async () => {
  const { canCompleteRegistration } = await import('../src/services/sessionService.js');
  const user = { _id: 'account', isPremium: false, authenticators: [] };
  assert.equal(canCompleteRegistration(user, null, { ownerId: null }), true);
  assert.equal(canCompleteRegistration({ ...user, isPremium: true }, null, { ownerId: null }), false);
  assert.equal(canCompleteRegistration({ ...user, authenticators: [{}] }, null, { ownerId: null }), false);
  assert.equal(canCompleteRegistration(user, null, null), false);
});

test('registration challenges are bound to their ceremony and owner', async () => {
  const { encodeRegistrationChallenge, decodeRegistrationChallenge } = await import('../src/services/sessionService.js');
  const challenge = 'a'.repeat(43);
  const ownerId = '0123456789abcdef01234567';
  assert.deepEqual(decodeRegistrationChallenge(encodeRegistrationChallenge(challenge)), { ownerId: null, challenge });
  assert.deepEqual(decodeRegistrationChallenge(encodeRegistrationChallenge(challenge, ownerId)), { ownerId, challenge });
  assert.equal(decodeRegistrationChallenge(challenge), null);
  assert.equal(decodeRegistrationChallenge('register:new:bad:extra'), null);
});
