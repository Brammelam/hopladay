import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicFile = name => readFile(new URL(`../../frontend/public/${name}`, import.meta.url), 'utf8');

test('public discovery leads with the free maximum-time-off v2 contract and labels v1 legacy', async () => {
  const [llms, legacy, reference, raw] = await Promise.all(['llms.txt', 'api-docs.html', 'optimizer-api.html', 'openapi-v2.json'].map(publicFile));
  assert.ok(llms.indexOf('/api/v2/optimize') < llms.indexOf('/api/v1/plan-preview'));
  assert.match(llms, /maximum_time_off \(default\) and explicit balanced/);
  assert.match(llms, /unrelated weekends and holidays do not count/);
  assert.match(legacy, /legacy v1 endpoint/);
  assert.match(legacy, /does not reproduce the main planner/);
  assert.doesNotMatch(legacy, /same free balanced strategy as the planner/);
  assert.match(reference, /default strategy is <code>maximum_time_off<\/code>/);
  assert.match(reference, /then used allowance/);
  const schema = JSON.parse(raw);
  const input = schema.components.schemas.OptimizationInput.properties;
  assert.equal(input.strategy.default, 'maximum_time_off');
  assert.match(input.strategy.description, /balanced is also free/);
  assert.match(input.strategy.description, /longest_vacation requires verified Premium/);
  for (const [field, value] of Object.entries({ minBreakLength: 1, maxBreakLength: 366, maxBreaks: 366, minSeparationDays: 1 })) {
    assert.equal(input[field].default, value);
    assert.match(input[field].description, /Premium when supplied/);
  }
  assert.match(input.maxBreakLength.description, /21 for explicitly selected balanced/);
  assert.equal(input.maxBreakLength.maximum, 366);
  assert.equal(input.maxBreaks.maximum, 366);
  assert.equal(input.lockedBreaks.maxItems, 366);
  const result = schema.components.schemas.OptimizationResult.properties;
  assert.equal(result.unusedAllowanceReason.nullable, true);
  assert.ok(result.unusedAllowanceReason.enum.includes('balanced_objective'));
  assert.equal(result.longestVacation.maximum, 366);
  assert.equal(result.suggestions.maxItems, 366);
  assert.equal(result.optimality.properties.bounds.properties.maxBreakLength.maximum, 366);
  assert.equal(result.optimality.properties.bounds.properties.maxBreaks.maximum, 366);
});
