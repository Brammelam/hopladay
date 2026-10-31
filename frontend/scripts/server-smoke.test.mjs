import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { reqHandler } from '../dist/frontend/server/server.mjs';

test('production server serves readable localized HTML and revalidates mutable documentation', async () => {
  const server = createServer(reqHandler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(`${base}/en`);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<h1[^>]*>[^<]+<\/h1>/);
    assert.ok(html.includes('Find my best vacation dates'));
    assert.ok(html.includes('Hopladay'));
    assert.doesNotMatch(html, /<app-root[^>]*>\s*<\/app-root>/);
    const account = await fetch(`${base}/en/plans`);
    assert.equal(account.headers.get('x-robots-tag'),'noindex');
    const shared = await fetch(`${base}/en/optimize?country=NO&year=2027&availableDays=20`);
    assert.equal(shared.headers.get('x-robots-tag'),'noindex');
    const faq = await fetch(`${base}/no/faq`);
    assert.equal(faq.status, 200);
    assert.match(await faq.text(), /<html lang="no"/);
    const preview = await fetch(`${base}/en/preview?country=NO&year=2027&availableDays=20`);
    assert.equal(preview.status, 200);
    assert.match(await preview.text(), /name="robots"[^>]*content="noindex/);
    for (const path of ['/api-docs.html', '/openapi.json', '/openapi-v2.json', '/optimizer-api.html', '/llms.txt', '/robots.txt', '/sitemap.xml']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('cache-control'), /max-age=0.*must-revalidate/, path);
    }
    for (const path of ['/en/norway/2027','/en/norway/2027/','/en/sweden/2027','/nl/nederland/2027']) {
      const response = await fetch(base+path);
      assert.equal(response.status,200);
      const page = await response.text();
      assert.ok(page.includes(`href="https://www.hopladay.com${path.replace(/\/$/,'')}"`));
      assert.ok(page.includes('2027-'));
      assert.ok(!page.includes('<app-root'));
    }
    const js = html.match(/src="([^"\s]+-[A-Z0-9]{8}\.js)"/);
    assert.ok(js, 'Hashed browser script is present');
    const script = await fetch(new URL(js[1], base));
    assert.equal(script.status, 200);
    assert.match(script.headers.get('cache-control'), /max-age=31536000.*immutable/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
