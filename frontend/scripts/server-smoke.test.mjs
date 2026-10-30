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
    assert.match(html, /<h1[^>]*>Hopladay/);
    assert.doesNotMatch(html, /<app-root[^>]*>\s*<\/app-root>/);
    const faq = await fetch(`${base}/no/faq`);
    assert.equal(faq.status, 200);
    assert.match(await faq.text(), /<html lang="no"/);
    const preview = await fetch(`${base}/en/preview?country=NO&year=2027&availableDays=20`);
    assert.equal(preview.status, 200);
    assert.match(await preview.text(), /name="robots"[^>]*content="noindex/);
    for (const path of ['/api-docs.html', '/openapi.json', '/llms.txt', '/robots.txt', '/sitemap.xml']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('cache-control'), /max-age=0.*must-revalidate/, path);
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
