import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import usersRouter from '../src/routes/users.js';
import plansRouter from '../src/routes/plans.js';
import User from '../src/models/User.js';
import Session from '../src/models/Session.js';
import HolidayPlan from '../src/models/HolidayPlan.js';
import authRouter from '../src/routes/auth.js';
import MagicLink from '../src/models/MagicLink.js';

const ownerId = 'a'.repeat(24), otherId = 'b'.repeat(24), planId = 'c'.repeat(24);
const token = 's'.repeat(43);
async function serve(t) {
  const owner = { _id: ownerId, email: 'owner@example.test', name: 'Owner', browserId: 'private-browser', availableDays: 25, isPremium: true, currentChallenge: 'secret-challenge', authenticators: [{ credentialID: 'secret-credential' }] };
  const other = { _id: otherId, email: 'other@example.test', availableDays: 25 };
  const records = [{ _id: planId, userId: ownerId, year: 2027, countryCode: 'NO', suggestions: [] }];
  const query = value => ({ then: (resolve, reject) => Promise.resolve(value).then(resolve, reject), populate() { return this; }, sort() { return this; } });
  const matches = (record, filter) => Object.entries(filter).every(([key, value]) => String(record[key]) === String(value));
  t.mock.method(Session, 'findOne', async q => q.tokenHash === createHash('sha256').update(token).digest('hex') ? { userId: ownerId, expiresAt: new Date(Date.now() + 60000) } : null);
  t.mock.method(Session, 'create', async doc => doc);
  t.mock.method(HolidayPlan, 'updateMany', async () => ({}));
  t.mock.method(User, 'deleteOne', async () => ({}));
  t.mock.method(HolidayPlan, 'findOneAndUpdate', async () => records[0]);
  t.mock.method(User, 'findById', async id => String(id) === ownerId ? owner : other);
  t.mock.method(User, 'findOne', async q => q.email === other.email ? other : owner);
  t.mock.method(User.prototype, 'save', async function () { return this; });
  t.mock.method(HolidayPlan, 'find', q => query(records.filter(r => matches(r, q))));
  t.mock.method(HolidayPlan, 'findById', id => query(records.find(r => r._id === id) ?? null));
  t.mock.method(HolidayPlan, 'findOne', q => query(records.find(r => matches(r, q)) ?? null));
  const remove = q => { const index = records.findIndex(r => matches(r, q)); return index === -1 ? null : records.splice(index, 1)[0]; };
  t.mock.method(HolidayPlan, 'findByIdAndDelete', async id => remove({ _id: id }));
  t.mock.method(HolidayPlan, 'findOneAndDelete', async q => remove(q));
  const app = express(); app.use(express.json()); app.use('/users', usersRouter); app.use('/plans', plansRouter); app.use('/auth', authRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (path, method = 'GET', body, authenticated = true) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  return { request, records, owner };
}

test('legacy user lookup requires a verified session and hides authentication internals', async t => {
  const { request } = await serve(t);
  assert.equal((await request(`/users/${ownerId}`, 'GET', undefined, false)).status, 401);
  assert.equal((await request(`/users/${otherId}`)).status, 404);
  const response = await request(`/users/${ownerId}`);
  assert.equal(response.status, 200); assert.equal(response.body.email, 'owner@example.test');
  assert.equal(response.body.currentChallenge, undefined); assert.equal(response.body.authenticators, undefined);
  assert.equal(response.body.browserId, undefined);
});

test('email and browser IDs never recover accounts through legacy initialization', async t => {
  const { request } = await serve(t);
  for (const path of ['/users/init', '/users']) {
    assert.equal((await request(path, 'POST', { email: 'other@example.test' }, false)).status, 401);
    assert.equal((await request(path, 'POST', { email: 'other@example.test' })).status, 403);
    const anon = await request(path, 'POST', { browserId: 'private-browser' }, false);
    assert.equal(anon.status, 200); assert.notEqual(anon.body._id, ownerId); assert.equal(anon.body.email, undefined);
    assert.equal(anon.body.isPremium, false); assert.match(anon.body.sessionToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(anon.body.browserId, undefined);
  }
  const current = await request('/users/init', 'POST', {});
  assert.equal(current.body._id, ownerId); assert.equal(current.body.currentChallenge, undefined);
});

test('unverified legacy email claiming is retired', async t => {
  const { request } = await serve(t);
  assert.equal((await request('/users/claim', 'POST', { browserId: 'private-browser', email: 'other@example.test' }, false)).status, 410);
});

test('all legacy plan routes reject missing sessions', async t => {
  const { request } = await serve(t);
  for (const [path, method, body] of [
    ['/plans', 'POST', { userId: ownerId, year: 2027, generateAI: false }],
    [`/plans/${ownerId}`, 'GET'], [`/plans/${ownerId}/2027`, 'GET'], [`/plans/details/${planId}`, 'GET'],
    [`/plans/${planId}`, 'DELETE'], [`/plans/${planId}/manual-days`, 'POST', { dates: ['2027-01-05'] }],
    [`/plans/${planId}/suggestions/id`, 'DELETE'], [`/plans/${planId}/suggestions/id/days/2027-01-05`, 'DELETE'],
    [`/plans/${planId}/regenerate`, 'POST', {}], [`/plans/${planId}/optimize-remaining`, 'POST', {}],
  ]) assert.equal((await request(path, method, body, false)).status, 401, path);
});

test('legacy plan reads and writes cannot target another account', async t => {
  const { request, records } = await serve(t);
  assert.equal((await request(`/plans/${otherId}`)).status, 404);
  assert.equal((await request(`/plans/${otherId}/2027`)).status, 404);
  assert.equal((await request('/plans', 'POST', { userId: otherId, year: 2027, generateAI: false })).status, 403);
  records[0].userId = otherId;
  for (const [path, method, body] of [
    [`/plans/details/${planId}`, 'GET'], [`/plans/${planId}`, 'DELETE'],
    [`/plans/${planId}/manual-days`, 'POST', { dates: ['2027-01-05'] }],
    [`/plans/${planId}/suggestions/id`, 'DELETE'], [`/plans/${planId}/suggestions/id/days/2027-01-05`, 'DELETE'],
    [`/plans/${planId}/regenerate`, 'POST', {}], [`/plans/${planId}/optimize-remaining`, 'POST', {}],
  ]) assert.equal((await request(path, method, body)).status, 404, path);
  assert.equal(records.length, 1);
});

test('owners retain access to plan lists, detail, year lookup and deletion', async t => {
  const { request, records } = await serve(t);
  assert.equal((await request(`/plans/${ownerId}`)).body.length, 1);
  assert.equal((await request(`/plans/${ownerId}/2027`)).body._id, planId);
  assert.equal((await request(`/plans/details/${planId}`)).body._id, planId);
  assert.equal((await request(`/plans/${planId}`, 'DELETE')).status, 200);
  assert.equal(records.length, 0);
});

test('passkey registration cannot claim an anonymous account using only its browser ID', async t => {
  const { request } = await serve(t);
  const victim = { _id: otherId, browserId: 'known-browser', availableDays: 25, isPremium: false, save: async () => {} };
  t.mock.method(User, 'findOne', async q => q.browserId ? victim : null);
  const result = await request('/auth/register/start', 'POST', { email: 'new@example.test', browserId: 'known-browser' }, false);
  assert.equal(result.status, 200);
  assert.equal(victim.email, undefined);
});

test('magic-link login does not migrate plans based only on a client browser ID', async t => {
  const { request, owner } = await serve(t);
  owner.save = async () => {};
  t.mock.method(MagicLink, 'findOne', async () => ({ email: owner.email, used: false, expiresAt: new Date(Date.now() + 60000), save: async () => {} }));
  let migrated = false;
  const victimPlan = { year: 2027, userId: undefined, save: async () => { migrated = true; }, deleteOne: async () => { migrated = true; } };
  t.mock.method(HolidayPlan, 'find', async () => [victimPlan]);
  t.mock.method(HolidayPlan, 'findOne', async () => null);
  const result = await request('/auth/magic-link/verify', 'POST', { token: 'm'.repeat(43), browserId: 'known-browser' }, false);
  assert.equal(result.status, 200);
  assert.equal(migrated, false);
  assert.equal(result.body.user.browserId, undefined);
});

test('magic-link login migrates only the session-owned anonymous plans', async t => {
  const { request, owner } = await serve(t);
  delete owner.email;
  const target = { _id: otherId, email: 'target@example.test', save: async () => {} };
  t.mock.method(User, 'findOne', async () => target);
  t.mock.method(MagicLink, 'findOne', async () => ({ email: target.email, used: false, expiresAt: new Date(Date.now() + 60000), save: async () => {} }));
  let saved = false;
  const plan = { userId: ownerId, year: 2027, save: async () => { saved = true; } };
  t.mock.method(HolidayPlan, 'find', async q => q.userId === ownerId ? [plan] : []);
  t.mock.method(HolidayPlan, 'findOne', async () => null);
  const result = await request('/auth/magic-link/verify', 'POST', { token: 'm'.repeat(43) });
  assert.equal(result.status, 200); assert.equal(saved, true); assert.equal(plan.userId, otherId);
});
