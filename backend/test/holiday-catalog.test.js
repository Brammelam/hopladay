import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHolidayCatalog, normalizeHolidayCatalog } from '../src/services/holidayCatalog.js';

const row = (date, extra = {}) => ({ date, countryCode: 'DE', name: 'Holiday', localName: 'Feiertag', global: true, counties: null, types: ['Public'], ...extra });
const rows = [
  row('2027-01-01', { name: 'New Year' }),
  row('2027-01-06', { name: 'Epiphany', global: false, counties: ['DE-BY', 'DE-BW'] }),
  row('2027-03-08', { name: "Women's Day", global: false, counties: ['DE-BE'] }),
  row('2027-04-01', { name: 'Observance only', types: ['Observance'] }),
];

test('nationwide fallback never applies an unselected regional holiday', async () => {
  const load = createHolidayCatalog({ fetchRows: async () => rows, now: () => 0 });
  const result = await load(2027, 'DE');
  assert.deepEqual(result.holidays.map(h => h.date), ['2027-01-01']);
  assert.deepEqual(result.regions, ['DE-BE', 'DE-BW', 'DE-BY']);
  assert.equal(result.source.scope, 'nationwide-public-holidays');
  assert.equal(result.source.region, null);
});

test('explicit subdivision includes its own dates and national dates only', async () => {
  const load = createHolidayCatalog({ fetchRows: async () => rows });
  const result = await load(2027, 'DE', 'DE-BY');
  assert.deepEqual(result.holidays.map(h => h.date), ['2027-01-01', '2027-01-06']);
  assert.equal(result.source.scope, 'national-and-selected-region');
  assert.equal(result.source.region, 'DE-BY');
  assert.match(result.source.url, /PublicHolidays\/2027\/DE$/);
  for (const region of ['DE-XX', 'NO-03', '', 42]) {
    await assert.rejects(load(2027, 'DE', region), err => err.status === 400 && err.code === 'INVALID_INPUT');
  }
});

test('retains distinct same-date names and regional applicability', () => {
  const normalized = normalizeHolidayCatalog([
    row('2027-01-01', { name: 'National name' }),
    row('2027-01-01', { name: 'Regional name', global: false, counties: ['DE-BY'] }),
    row('2027-01-01', { name: 'Second national name' }),
  ], 2027, 'DE');
  assert.equal(normalized.length, 3);
  assert.deepEqual(normalized.map(h => h.name), ['National name', 'Regional name', 'Second national name']);
});

test('provider-supplied observed dates are preserved without generating replacements', async () => {
  const supplied = [
    row('2027-07-04', { countryCode: 'US', name: 'Independence Day' }),
    row('2027-07-05', { countryCode: 'US', name: 'Independence Day (observed)' }),
  ];
  const load = createHolidayCatalog({ fetchRows: async () => supplied });
  assert.deepEqual((await load(2027, 'US')).holidays.map(h => h.date), ['2027-07-04', '2027-07-05']);
  const sundayOnly = createHolidayCatalog({ fetchRows: async () => supplied.slice(0, 1) });
  assert.deepEqual((await sundayOnly(2027, 'US')).holidays.map(h => h.date), ['2027-07-04']);
});

test('all regions share cached raw data, which expires after 24 hours', async () => {
  let calls = 0, time = 0;
  const load = createHolidayCatalog({ fetchRows: async () => { calls++; return rows; }, now: () => time });
  const first = await load(2027, 'DE');
  await load(2027, 'DE', 'DE-BY');
  await load(2027, 'DE', 'DE-BE');
  assert.equal(calls, 1);
  time = 86400001;
  const refreshed = await load(2027, 'DE', 'DE-BY');
  assert.equal(calls, 2);
  assert.notEqual(first.source.retrievedAt, refreshed.source.retrievedAt);
});

test('concurrent requests share one upstream request and failed requests can recover', async () => {
  let calls = 0, release;
  const ready = new Promise(resolve => { release = resolve; });
  const load = createHolidayCatalog({ fetchRows: async () => { calls++; await ready; return rows; } });
  const first = load(2027, 'DE');
  const second = load(2027, 'DE', 'DE-BY');
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  let attempts = 0;
  const recover = createHolidayCatalog({ fetchRows: async () => { if (++attempts === 1) throw new Error('upstream failed'); return rows; } });
  await assert.rejects(recover(2027, 'DE'), err => err.status === 503);
  assert.equal((await recover(2027, 'DE')).holidays.length, 1);
  assert.equal(attempts, 2);
});

test('bad provider rows fail closed and are never cached', async () => {
  const malformed = [
    null, {}, [],
    [row('2027-02-30')], [row('2028-01-01')],
    [row('2027-01-01', { types: ['Public', {}] })],
    [row('2027-01-01', { counties: ['FR-IDF'] })],
    [row('2027-01-01', { counties: 'DE-BY' })],
    [row('2027-01-01', { global: undefined })],
    [row('2027-01-01', { countryCode: 'FR' })],
    [row('2027-01-01', { name: {} })],
  ];
  for (const data of malformed) {
    assert.throws(() => normalizeHolidayCatalog(data, 2027, 'DE'));
    let count = 0;
    const load = createHolidayCatalog({ fetchRows: async () => { count++; return data; } });
    await assert.rejects(load(2027, 'DE'), err => err.status === 503);
    await assert.rejects(load(2027, 'DE'), err => err.status === 503);
    assert.equal(count, 2);
  }
});

test('invalid country and year inputs fail before contacting the provider', async () => {
  let calls = 0;
  const load = createHolidayCatalog({ fetchRows: async () => { calls++; return rows; } });
  for (const [year, country] of [[2023, 'DE'], [2101, 'DE'], ['2027', 'DE'], [2027.5, 'DE'], [2027, 'ZZ'], [2027, 'de']]) {
    await assert.rejects(load(year, country), err => err.status === 400);
  }
  assert.equal(calls, 0);
});

test('verified Germany 2027 provider fixture keeps federal-state applicability', async () => {
  // Snapshot subset: https://date.nager.at/api/v3/PublicHolidays/2027/DE, retrieved 2026-10-31.
  const snapshot = [
    row('2027-01-01', { name: "New Year's Day", localName: 'Neujahr' }),
    row('2027-01-06', { name: 'Epiphany', localName: 'Heilige Drei Könige', global: false, counties: ['DE-BW', 'DE-BY', 'DE-ST'] }),
    row('2027-03-08', { name: "International Women's Day", localName: 'Internationaler Frauentag', global: false, counties: ['DE-BE', 'DE-MV'] }),
  ];
  const load = createHolidayCatalog({ fetchRows: async () => snapshot });
  assert.deepEqual((await load(2027, 'DE')).holidays.map(h => h.date), ['2027-01-01']);
  assert.deepEqual((await load(2027, 'DE', 'DE-BY')).holidays.map(h => h.date), ['2027-01-01', '2027-01-06']);
  assert.deepEqual((await load(2027, 'DE', 'DE-BE')).holidays.map(h => h.date), ['2027-01-01', '2027-03-08']);
});

test('cache evicts older entries after 128 country-year combinations', async () => {
  let calls = 0;
  const load = createHolidayCatalog({ fetchRows: async (year, country) => { calls++; return [row(`${year}-01-01`, { countryCode: country })]; } });
  for (let i = 0; i < 129; i++) await load(2024 + i % 77, i < 77 ? 'NO' : 'DE');
  assert.equal(calls, 129);
  await load(2024, 'NO');
  assert.equal(calls, 130);
});
