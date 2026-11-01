import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { createOptimizerRouter } from '../src/routes/optimizer.js';
import { OPTIMIZER_LANGS } from '../src/services/optimizerMessages.js';
import { PREVIEW_COUNTRIES } from '../src/services/previewService.js';

const contract = JSON.parse(await readFile(new URL('../../frontend/public/openapi-v2.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(await readFile(new URL('./fixtures/holiday-NO-2027.json', import.meta.url), 'utf8'));

test('v2 OpenAPI names only implemented HTTP operations and supported locale/country values', () => {
  const router = createOptimizerRouter();
  const actual = router.stack.filter(layer => layer.route).flatMap(layer => Object.keys(layer.route.methods).map(method => `${method.toUpperCase()} ${layer.route.path.replace(/:([a-zA-Z]+)/g, '{$1}')}`)).sort();
  const documented = Object.entries(contract.paths).flatMap(([path, operations]) => Object.keys(operations).map(method => `${method.toUpperCase()} ${path}`)).sort();
  assert.deepEqual(documented, actual);
  const input = contract.components.schemas.OptimizationInput;
  assert.deepEqual(input.properties.lang.enum.slice().sort(), OPTIMIZER_LANGS.slice().sort());
  assert.deepEqual(input.properties.country.enum, PREVIEW_COUNTRIES);
  assert.equal(input.additionalProperties, false);
  assert.equal(input.properties.availableDays.maximum, 366);
  assert.equal(input.properties.year.maximum, 2100);
});

test('documented required result fields and Premium rejection agree with real HTTP responses', async t => {
  const app = express();
  app.use(express.json());
  app.use('/api/v2', createOptimizerRouter({
    authenticate: async () => null,
    loadHolidays: async () => ({ holidays: fixture.rows.filter(row => row.global && row.types.includes('Public')), regions: [], source: { name: 'Nager.Date', url: fixture.sourceUrl, retrievedAt: fixture.retrievedAt, scope: 'nationwide-public-holidays', region: null } }),
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v2/optimize`;
  const example = contract.paths['/optimize'].post.requestBody.content['application/json'].example;
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(example) });
  assert.equal(response.status, 200);
  const result = await response.json();
  const schema = contract.components.schemas.OptimizationResult;
  for (const key of schema.required) assert.ok(Object.hasOwn(result, key), key);
  assert.ok(schema.properties.status.enum.includes(result.status));
  assert.equal(result.version, 2);
  assert.equal(result.linkScope, 'basic-inputs-only');
  assert.ok(!new URL(result.previewUrl).searchParams.has('approvedLeave'));
  for (const day of result.calendar) for (const key of schema.properties.calendar.items.required) assert.ok(Object.hasOwn(day, key), key);
  for (const strategy of contract.components.schemas.OptimizationInput.properties.strategy.enum.filter(value => value === 'longest_vacation')) {
    const denied = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...example, strategy }) });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'PREMIUM_REQUIRED');
  }
});
