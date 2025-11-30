import { Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface SEOData {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SEOService {
  private defaultTitle = 'Hopladay - Maximize your days off';
  private defaultDescription = 'Hopladay is the ultimate holiday planner and vacation app. Plan your holidays, maximize vacation days, and optimize your time off with AI-powered scheduling.';
  private defaultImage = 'https://hopladay.com/assets/favicon.png';
  private baseUrl = 'https://hopladay.com';

  constructor(
    private title: Title,
    private meta: Meta
  ) {}

  updateSEO(data: SEOData, currentLang: string = 'en'): void {
    const title = data.title 
      ? `${data.title}`
      : this.defaultTitle;
    
    const description = data.description || this.defaultDescription;
    const image = data.image || this.defaultImage;
    const url = data.url || `${this.baseUrl}/${currentLang}`;
    const type = data.type || 'website';
    const keywords = data.keywords || 'holiday planner, vacation app, vacation planner, holiday planning app, maximize vacation days, optimize holidays';

    this.title.setTitle(title);

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'keywords', content: keywords });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: type });
    this.meta.updateTag({ property: 'og:locale', content: currentLang === 'no' ? 'nb_NO' : currentLang === 'nl' ? 'nl_NL' : 'en_US' });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });
    
    // Update canonical URL
    if (typeof document !== 'undefined') {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (link) {
        link.setAttribute('href', url);
      } else {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        link.setAttribute('href', url);
        document.head.appendChild(link);
      }

      // Update or add hreflang tags for SEO
      this.updateHreflangTags(currentLang, url);
    }
  }

  private updateHreflangTags(currentLang: string, currentUrl: string): void {
    // Extract the path without language prefix
    const urlObj = new URL(currentUrl);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    const langIndex = pathParts.findIndex(p => ['en', 'no', 'nl'].includes(p));
    
    // Get path without language
    let pathWithoutLang = '';
    if (langIndex >= 0) {
      pathWithoutLang = '/' + pathParts.slice(langIndex + 1).join('/');
    }
    
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    const languages = ['en', 'no', 'nl'];
    
    // Remove existing hreflang tags
    const existingHreflang = document.querySelectorAll('link[rel="alternate"][hreflang]');
    existingHreflang.forEach(link => link.remove());
    
    // Add hreflang tags for all languages
    languages.forEach(lang => {
      const langUrl = `${baseUrl}/${lang}${pathWithoutLang}`;
      const link = document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', lang);
      link.setAttribute('href', langUrl);
      document.head.appendChild(link);
    });
    
    // Add x-default pointing to English
    const defaultUrl = `${baseUrl}/en${pathWithoutLang}`;
    const defaultLink = document.createElement('link');
    defaultLink.setAttribute('rel', 'alternate');
    defaultLink.setAttribute('hreflang', 'x-default');
    defaultLink.setAttribute('href', defaultUrl);
    document.head.appendChild(defaultLink);
  }

  setDefaultSEO(): void {
    this.updateSEO({});
  }
}

