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

const routes = [
  '/',
  '/en',
  '/no',
  '/nl',
  '/en/payment/info',
  '/no/payment/info',
  '/nl/payment/info',
  '/en/refunds',
  '/no/refunds',
  '/nl/refunds',
];

await prerenderer.prerender({
  indexHtml,
  routes,
  outputPath: browserDistFolder,
});

