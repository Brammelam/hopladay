import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateLandingPages, renderLandingPage } from '../scripts/generate-landings.js';
import { optimizeAnnualLeave } from '../src/services/annualOptimizer.js';
import { normalizeHolidayCatalog } from '../src/services/holidayCatalog.js';

test('the three public landing pages reproduce fixture-backed optimizer results without drift', async () => {
  const pages = await generateLandingPages({ write: false });
  assert.equal(pages.length, 3);
  const routes = JSON.parse(await readFile(new URL('../../frontend/public/landing-routes.json', import.meta.url), 'utf8'));
  assert.deepEqual(routes, pages.map(page => page.route));
  for (const { route, snapshot, result, html } of pages) {
    const national = normalizeHolidayCatalog(snapshot.rows, route.year, route.country).filter(h => h.global && h.types.includes('Public'));
    const expected = optimizeAnnualLeave({ year: route.year, availableDays: 20, strategy: 'maximum_time_off' }, national);
    assert.equal(result.strategy, 'maximum_time_off');
    assert.equal(result.usedDays, 20);
    if (route.country === 'NO') assert.equal(result.totalDaysOff, 66);
    assert.equal(result.usedDays, expected.usedDays);
    assert.equal(result.totalDaysOff, expected.totalDaysOff);
    assert.deepEqual(result.suggestions, expected.suggestions);
    assert.equal(html, await readFile(new URL(`../../frontend/public/${route.file}`, import.meta.url), 'utf8'), `${route.path}: regenerate the committed page`);
    assert.ok(html.includes(`<html lang="${route.lang}">`));
    assert.ok(html.includes(`<link rel="canonical" href="https://www.hopladay.com/${route.file}">`));
    assert.ok(html.includes(`data-used-days="${expected.usedDays}"`));
    assert.ok(html.includes(`data-calendar-days="${expected.totalDaysOff}"`));
    assert.ok(html.includes(`data-longest-vacation="${expected.longestVacation}"`));
    assert.equal((html.match(/<table /g) || []).length, 12);
    assert.equal((html.match(/<td data-date=/g) || []).length, 365);
    for (const holiday of national) assert.ok(html.includes(`datetime="${holiday.date}"`));
    for (const suggestion of expected.suggestions) {
      assert.ok(html.includes(`data-break-start="${suggestion.startDate}" data-break-end="${suggestion.endDate}"`));
      for (const date of suggestion.leaveDates) assert.ok(html.includes(`<time datetime="${date}">${date}</time>`));
    }
    assert.ok(html.includes(`/${route.lang}/optimize?country=${route.country}&amp;year=2027&amp;availableDays=20`));
    assert.ok(html.includes(snapshot.retrievedAt));
    assert.ok(!html.includes('hreflang='), 'Do not invent translations between different countries');
    assert.ok(!html.includes('noindex'), 'Landing page must remain indexable');
  }
});

test('Dutch landing content is Dutch rather than untranslated engine descriptions', async () => {
  const pages = await generateLandingPages({ write: false });
  const page = pages.find(page => page.route.lang === 'nl');
  assert.ok(page.html.includes('Vakantie plannen in Nederland in 2027'));
  assert.ok(page.html.includes('Feestdagen'));
  assert.ok(page.html.includes('Werkdagen om vrij te vragen'));
  assert.ok(page.html.includes('januari'));
  assert.ok(!page.html.includes('Length, preferred months and seasonal utility'));
  assert.ok(!page.html.includes('leave days for'));
});

test('provider strings are escaped in visible HTML and embedded structured data', async () => {
  const [{ route, snapshot }] = await generateLandingPages({ write: false });
  const hostile = { ...snapshot, rows: snapshot.rows.map((row, i) => i === 0 ? { ...row, name: '<script>alert(1)</script>', localName: '<img src=x onerror=alert(1)>' } : row) };
  const { html } = renderLandingPage(route, hostile);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
});


test('advertised guide links and sitemap use the static-host-compatible canonical files', async () => {
  const [routes, sitemap, template] = await Promise.all([
    readFile(new URL('../../frontend/public/landing-routes.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../frontend/public/sitemap.xml', import.meta.url), 'utf8'),
    readFile(new URL('../../frontend/src/app/annual-planner/annual-planner.html', import.meta.url), 'utf8'),
  ]);
  for (const route of routes) {
    assert.ok(sitemap.includes(`<loc>https://www.hopladay.com/${route.file}</loc>`));
    assert.ok(!sitemap.includes(`<loc>https://www.hopladay.com${route.path}</loc>`));
    assert.ok(template.includes(`href="/${route.file}"`));
  }
});
