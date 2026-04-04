import { Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

/** URL path segments; hreflang hrefs use these (matches sitemap & routes). */
export const SITE_LANGS = ['en', 'no', 'nl', 'de', 'fr', 'es', 'sv', 'da'] as const;
export type SiteLang = (typeof SITE_LANGS)[number];

const LANG_PATH_SET = new Set<string>(SITE_LANGS);

/** Open Graph locale codes (BCP 47 / Facebook). */
const OG_LOCALE: Record<SiteLang, string> = {
  en: 'en_US',
  no: 'nb_NO',
  nl: 'nl_NL',
  de: 'de_DE',
  fr: 'fr_FR',
  es: 'es_ES',
  sv: 'sv_SE',
  da: 'da_DK',
};

export interface SEOData {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
  /** When true, sets robots to noindex,nofollow (auth flows, unsubscribe, etc.). */
  noindex?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class SEOService {
  private defaultTitle = 'Hopladay – Smart vacation planner & holiday optimizer';
  private defaultDescription =
    'Turn a few vacation days into long breaks. Plan around public holidays, weekends, and your PTO for Norway, Sweden, Denmark, and more—free vacation planning app.';
  private defaultImage = 'https://hopladay.com/og-image.png';
  private baseUrl = 'https://hopladay.com';

  constructor(
    private title: Title,
    private meta: Meta,
  ) {}

  updateSEO(data: SEOData, currentLang: string = 'en'): void {
    const lang = (SITE_LANGS.includes(currentLang as SiteLang)
      ? currentLang
      : 'en') as SiteLang;

    const title = data.title ? `${data.title}` : this.defaultTitle;
    const description = data.description || this.defaultDescription;
    const image = data.image || this.defaultImage;
    const url = data.url || `${this.baseUrl}/${lang}`;
    const type = data.type || 'website';
    const keywords =
      data.keywords ||
      'holiday planner, vacation app, vacation planner, maximize vacation days, optimize holidays, public holidays, PTO planner';

    this.title.setTitle(title);

    if (data.noindex) {
      this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    } else {
      this.meta.updateTag({
        name: 'robots',
        content:
          'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      });
    }

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'keywords', content: keywords });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: type });
    this.meta.updateTag({ property: 'og:site_name', content: 'Hopladay' });
    this.meta.updateTag({ property: 'og:locale', content: OG_LOCALE[lang] });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    if (typeof document !== 'undefined') {
      document
        .querySelectorAll('meta[property="og:locale:alternate"]')
        .forEach((el) => el.remove());
      SITE_LANGS.forEach((code) => {
        if (code === lang) return;
        const alt = document.createElement('meta');
        alt.setAttribute('property', 'og:locale:alternate');
        alt.setAttribute('content', OG_LOCALE[code]);
        document.head.appendChild(alt);
      });

      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (link) {
        link.setAttribute('href', url);
      } else {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        link.setAttribute('href', url);
        document.head.appendChild(link);
      }

      this.updateHreflangTags(lang, url);
    }
  }

  private updateHreflangTags(currentLang: SiteLang, currentUrl: string): void {
    const urlObj = new URL(currentUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    let pathWithoutLang = '';
    if (pathParts.length > 0 && LANG_PATH_SET.has(pathParts[0])) {
      pathWithoutLang = pathParts.length > 1 ? '/' + pathParts.slice(1).join('/') : '';
    } else {
      pathWithoutLang =
        urlObj.pathname === '/' || urlObj.pathname === '' ? '' : urlObj.pathname;
    }

    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());

    SITE_LANGS.forEach((code) => {
      const langUrl = `${baseUrl}/${code}${pathWithoutLang}`;
      const link = document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', code);
      link.setAttribute('href', langUrl);
      document.head.appendChild(link);
    });

    const defaultUrl = `${baseUrl}/en${pathWithoutLang}`;
    const defaultLink = document.createElement('link');
    defaultLink.setAttribute('rel', 'alternate');
    defaultLink.setAttribute('hreflang', 'x-default');
    defaultLink.setAttribute('href', defaultUrl);
    document.head.appendChild(defaultLink);
  }

  /**
   * Inject or replace a JSON-LD script in document head (SSR-safe guard).
   */
  setJsonLd(id: string, data: Record<string, unknown>): void {
    if (typeof document === 'undefined') return;
    this.removeJsonLd(id);
    const script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  removeJsonLd(id: string): void {
    if (typeof document === 'undefined') return;
    document.getElementById(id)?.remove();
  }

  setDefaultSEO(): void {
    this.updateSEO({});
  }
}
