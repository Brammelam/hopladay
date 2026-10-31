import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPreviewRouter } from '../src/routes/preview.js';
import { normalizePublicHolidays } from '../src/services/previewService.js';

const row = (date, extra = {}) => ({ date, countryCode: 'NO', name: 'Holiday', localName: 'Helligdag', global: true, types: ['Public'], ...extra });
const holidays = [row('2027-01-01'), row('2027-05-06'), row('2027-05-17')];
async function serve(t, options = {}) {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use('/api/v1', createPreviewRouter({ fetchHolidays: async () => holidays, ...options }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return async (query, headers = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/plan-preview?${query}`, { headers });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
}
const query = 'country=NO&year=2027&availableDays=20';

test('anonymous preview has exact leave dates, transparent totals and a reproducible link', async t => {
  const get = await serve(t);
  const { status, body } = await get(query);
  assert.equal(status, 200);
  assert.equal(body.input.preference, 'balanced');
  assert.equal(body.tier, 'free');
  assert.equal(body.usedDays, body.suggestions.reduce((n, s) => n + s.leaveDates.length, 0));
  assert.equal(body.totalDaysOff, body.suggestions.reduce((n, s) => n + s.totalDaysOff, 0));
  assert.equal(body.remainingDays, 20 - body.usedDays);
  assert.ok(body.usedDays <= 20);
  assert.ok(body.suggestions.some(s => s.leaveDates.includes('2027-05-07')));
  for (const s of body.suggestions) {
    assert.equal(s.vacationDaysUsed, s.leaveDates.length);
    for (const date of s.leaveDates) {
      const day = new Date(`${date}T12:00:00Z`).getUTCDay();
      assert.ok(day !== 0 && day !== 6);
      assert.ok(!holidays.some(h => h.date === date));
    }
  }
  assert.equal(new URL(body.previewUrl).pathname, '/en/preview');
  assert.equal(new URL(body.previewUrl).searchParams.get('availableDays'), '20');
  assert.match(body.source.url, /PublicHolidays\/2027\/NO$/);
  assert.ok(!JSON.stringify(body).includes('userId'));
  assert.ok(!JSON.stringify(body).includes('_id'));
});

test('zero allowance yields an empty plan', async t => {
  const get = await serve(t);
  const { body } = await get('country=NO&year=2027&availableDays=0&lang=no');
  assert.equal(body.usedDays, 0);
  assert.equal(body.totalDaysOff, 0);
  assert.deepEqual(body.suggestions, []);
  assert.match(body.previewUrl, /\/no\/preview/);
});

test('invalid, duplicate, unknown and premium inputs fail before fetching', async t => {
  let calls = 0;
  const get = await serve(t, { fetchHolidays: async () => { calls++; return holidays; } });
  for (const q of [query + '&preference=summer_vacation', query + '&isPremium=true', query + '&userId=123', query + '&year=2028', 'country=ZZ&year=2027&availableDays=20', 'country=NO&year=2031&availableDays=20', 'country=NO&year=2027&availableDays=-1', 'country=NO&year=2027&availableDays=1.5', 'country=NO&year=2027&availableDays=366', query + '&lang=xx', 'country=NO&year=2027', query + '&country[]=SE']) {
    const { status, body } = await get(q);
    assert.equal(status, 400, q);
    assert.ok(body.error.code);
  }
  assert.equal(calls, 0);
});

test('holiday data cache is shared across budgets and languages and expires', async t => {
  let calls = 0, time = 0;
  const get = await serve(t, { now: () => time, fetchHolidays: async () => { calls++; return holidays; } });
  const first = await get(query);
  await get(query + '&lang=no');
  await get('country=NO&year=2027&availableDays=5');
  assert.equal(calls, 1);
  time = 86400001;
  const next = await get(query);
  assert.equal(calls, 2);
  assert.notEqual(first.body.source.retrievedAt, next.body.source.retrievedAt);
});

test('failed upstream produces 503 and can recover without a poisoned cache', async t => {
  let calls = 0;
  const get = await serve(t, { fetchHolidays: async () => { if (++calls === 1) throw new Error('private upstream details'); return holidays; } });
  const failed = await get(query);
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error.code, 'HOLIDAY_DATA_UNAVAILABLE');
  assert.ok(!JSON.stringify(failed.body).includes('private upstream'));
  assert.equal((await get(query)).status, 200);
});

test('per-client request limit returns Retry-After and resets', async t => {
  let time = 0;
  const get = await serve(t, { now: () => time });
  for (let i = 0; i < 30; i++) assert.equal((await get(query)).status, 200);
  const limited = await get(query);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  time = 60001;
  assert.equal((await get(query)).status, 200);
});

test('only nationwide Public holidays are used and malformed provider data fails closed', () => {
  const result = normalizePublicHolidays([row('2027-05-06'), row('2027-05-06'), row('2027-05-07', { global: false, counties: ['NO-01'] }), row('2027-05-08', { types: ['Observance'] })], 'NO', 2027);
  assert.equal(result.length, 1);
  assert.equal(result[0].date, '2027-05-06');
  for (const rows of [null, {}, [], [row('2027-02-30')], [row('2028-01-01')], [row('2027-05-06', { global: undefined })], [row('2027-05-06', { countryCode: 'SE' })]]) {
    assert.throws(() => normalizePublicHolidays(rows, 'NO', 2027));
  }
});

test('concurrent requests share one provider request', async t => {
  let calls = 0;
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const get = await serve(t, { fetchHolidays: async () => { calls++; await wait; return holidays; } });
  const first = get(query);
  const second = get(query + '&lang=no');
  await new Promise(resolve => setImmediate(resolve));
  release();
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  assert.equal(calls, 1);
});

test('calendar invariants hold for leap years and maximum budgets', async t => {
  const get = await serve(t, { fetchHolidays: async (country, year) => [row(`${year}-01-01`, { countryCode: country }), row(`${year}-05-01`, { countryCode: country }), row(`${year}-12-25`, { countryCode: country })] });
  for (const year of [2024, 2027, 2028, 2030]) {
    const { status, body } = await get(`country=NO&year=${year}&availableDays=365`);
    assert.equal(status, 200);
    const booked = body.suggestions.flatMap(s => s.leaveDates);
    assert.equal(new Set(booked).size, booked.length);
    assert.equal(body.usedDays, booked.length);
    assert.ok(body.usedDays <= 365);
    const allDays = new Set();
    for (const s of body.suggestions) {
      assert.equal(s.vacationDaysUsed, s.leaveDates.length);
      assert.equal(s.totalDaysOff, (Date.parse(s.endDate) - Date.parse(s.startDate)) / 86400000 + 1);
      for (let date = Date.parse(s.startDate); date <= Date.parse(s.endDate); date += 86400000) allDays.add(date);
    }
    assert.equal(body.totalDaysOff, allDays.size);
  }
});

test('public OpenAPI contract matches runtime inputs and response fields', async t => {
  const { readFile } = await import('node:fs/promises');
  const { PREVIEW_COUNTRIES } = await import('../src/services/previewService.js');
  const spec = JSON.parse(await readFile(new URL('../../frontend/public/openapi.json', import.meta.url), 'utf8'));
  const operation = spec.paths['/plan-preview'].get;
  assert.equal(operation.operationId, 'previewVacationPlan');
  assert.deepEqual(operation.parameters.find(p => p.name === 'country').schema.enum, PREVIEW_COUNTRIES);
  assert.deepEqual(operation.parameters.find(p => p.name === 'preference').schema.enum, ['balanced']);
  const get = await serve(t);
  const { body } = await get(query);
  const schema = spec.components.schemas.Preview;
  assert.deepEqual(Object.keys(body).sort(), schema.required.slice().sort());
  assert.deepEqual(Object.keys(body.suggestions[0]).sort(), schema.properties.suggestions.items.required.slice().sort());
  assert.deepEqual(Object.keys(body.assumptions).sort(), schema.properties.assumptions.required.slice().sort());
  assert.deepEqual(Object.keys(body.source).sort(), schema.properties.source.required.slice().sort());
});


test('global request budget applies across different client addresses', async t => {
  const get = await serve(t);
  for (let i = 0; i < 300; i++) {
    const response = await get(query, { 'X-Forwarded-For': `192.0.2.${Math.floor(i / 30) + 1}` });
    assert.equal(response.status, 200);
  }
  assert.equal((await get(query, { 'X-Forwarded-For': '192.0.2.250' })).status, 429);
});


test('invalid upstream local names fall back to the validated name', () => {
  for (const localName of [{ malformed: true }, 42, null]) {
    assert.equal(normalizePublicHolidays([row('2027-05-06', { localName })], 'NO', 2027)[0].localName, 'Holiday');
  }
});
