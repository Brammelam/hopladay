import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { getPrerenderer } from '@angular/ssr/prerender';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const indexHtml = readFileSync(
  resolve(browserDistFolder, 'index.html'),
  'utf-8',
);

const prerenderer = getPrerenderer(new URL('./main.server.mjs', import.meta.url));

const langs = ['en', 'no', 'nl', 'de', 'fr', 'es', 'sv', 'da'] as const;
const pages = ['', '/faq', '/payment/info', '/refunds'] as const;

const routes: string[] = ['/'];
for (const lang of langs) {
  for (const page of pages) {
    routes.push(`/${lang}${page}`);
  }
}

await prerenderer.prerender({
  indexHtml,
  routes,
  outputPath: browserDistFolder,
});
