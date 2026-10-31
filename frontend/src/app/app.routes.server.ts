import { RenderMode, ServerRoute } from '@angular/ssr';
import { SITE_LANGS } from './services/seo.service';

const publicPages = ['', '/faq', '/payment/info', '/refunds', '/preview', '/optimize'];

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  ...SITE_LANGS.flatMap(lang => publicPages.map<ServerRoute>(page => ({
    path: `${lang}${page}`,
    renderMode: RenderMode.Prerender,
  }))),
  { path: '**', renderMode: RenderMode.Client },
];
