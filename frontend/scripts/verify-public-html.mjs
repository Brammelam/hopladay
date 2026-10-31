import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../dist/frontend/browser/', import.meta.url);
const langs = ['en', 'no', 'nl', 'de', 'fr', 'es', 'sv', 'da'];
for (const path of ['index.html', ...langs.flatMap(lang => [`${lang}/index.html`, `${lang}/faq/index.html`, `${lang}/preview/index.html`, `${lang}/optimize/index.html`])]) {
  const html = await readFile(new URL(path, root), 'utf8');
  const lang = path === 'index.html' ? 'en' : path.split('/')[0];
  assert.ok(html.includes(`<html lang="${lang}"`), `${path}: incorrect server-rendered document language`);
  if (path.includes('/preview/')) assert.match(html, /name="robots"[^>]*content="noindex/, `${path}: previews must be noindex even without JavaScript`);
  assert.match(html, /<h[12][\s>]/, `${path}: missing rendered headings`);
  assert.doesNotMatch(html, /<app-root[^>]*>\s*<\/app-root>/, `${path}: JavaScript shell`);
  assert.match(html, /rel="canonical"[^>]*href="https:\/\/www\.hopladay\.com\//, `${path}: wrong canonical hostname`);
  assert.doesNotMatch(html, />(app\.(tagline|welcome)|seo\.[a-zA-Z]+)</, `${path}: untranslated content`);
}
for (const path of ['api-docs.html', 'openapi.json', 'llms.txt']) {
  const content = await readFile(new URL(path, root), 'utf8');
  assert.ok(content.includes('plan-preview'), `${path}: missing preview documentation`);
}
for (const path of ['optimizer-api.html', 'openapi-v2.json']) {
  const content=await readFile(new URL(path,root),'utf8');
  assert.ok(content.includes('optimize'), `${path}: missing annual optimizer contract`);
}
console.log('Public HTML verified: readable root, localized home/FAQ/preview pages, www canonicals and API docs.');
