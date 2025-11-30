import { Injectable, signal, computed } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

export type Language = 'en' | 'no' | 'nl';

interface Translations {
  [key: string]: string | Translations;
}

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private translations: Map<Language, Translations> = new Map();
  private currentLanguage = signal<Language>('en');
  
  readonly currentLang = this.currentLanguage.asReadonly();
  readonly isNorwegian = computed(() => this.currentLanguage() === 'no');

  constructor(private router: Router) {
    this.detectLanguage();
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.detectLanguage());
  }

  setLanguage(lang: Language): void {
    this.currentLanguage.set(lang);
    this.updateHtmlLang(lang);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('hopladay_lang', lang);
    }
  }

  loadTranslations(lang: Language, translations: Translations): void {
    this.translations.set(lang, translations);
  }

  translate(key: string, params?: Record<string, string | number>): string {
    const lang = this.currentLanguage();
    const translations = this.translations.get(lang) || this.translations.get('en') || {};
    const value = this.getNestedValue(translations, key);
    
    if (!value) {
      console.warn(`Translation missing for key: ${key} (lang: ${lang})`);
      return key;
    }

    if (params) {
      return this.interpolate(value, params);
    }

    return value;
  }

  private getNestedValue(obj: Translations, path: string): string {
    return path.split('.').reduce((current: any, key: string) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj) as string || '';
  }

  private interpolate(template: string, params: Record<string, string | number>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key]?.toString() || match;
    });
  }

  private detectLanguage(): void {
    // Use window.location.pathname to get the actual browser path (more reliable than router.url on initial load)
    const browserPath = typeof window !== 'undefined' ? window.location.pathname : this.router.url;
    const routerPath = this.router.url;
    const path = browserPath || routerPath;
    
    // Don't redirect on auth/verify route - let it handle its own language
    if (path.includes('/auth/verify') || (typeof window !== 'undefined' && window.location.pathname.includes('/auth/verify'))) {
      const langMatch = path.match(/^\/(en|no|nl)(\/|$)/);
      if (langMatch) {
        const lang = langMatch[1] as Language;
        this.setLanguage(lang);
      } else {
        this.setLanguage('en');
      }
      return;
    }
    
    const langMatch = path.match(/^\/(en|no|nl)(\/|$)/);
    
    // If language is already in the URL, use it
    if (langMatch) {
      const lang = langMatch[1] as Language;
      this.setLanguage(lang);
      return;
    }

    // Only redirect based on stored preference, not browser language
    // This prevents SEO issues from automatic redirects
    // Default to 'en' if no stored preference
    const stored = typeof window !== 'undefined' && window.localStorage 
      ? localStorage.getItem('hopladay_lang') as Language 
      : null;
    
    if (stored && (stored === 'en' || stored === 'no' || stored === 'nl')) {
      this.setLanguage(stored);
      // Only redirect if we're not already on a language route
      // This prevents redirect loops
      if (!path.match(/^\/(en|no|nl)(\/|$)/)) {
        this.redirectToLanguage(stored);
      }
      return;
    }

    // Default to English - no redirect needed as router handles it
    this.setLanguage('en');
  }

  private redirectToLanguage(lang: Language): void {
    // Use window.location.pathname to get the actual browser path
    const browserPath = typeof window !== 'undefined' ? window.location.pathname : this.router.url;
    const currentPath = browserPath || this.router.url;
    
    // Never redirect on auth/verify route - let it handle its own language
    if (currentPath.includes('/auth/verify') || (typeof window !== 'undefined' && window.location.pathname.includes('/auth/verify'))) {
      return;
    }
    
    if (!currentPath.match(/^\/(en|no|nl)(\/|$)/)) {
      const newPath = `/${lang}${currentPath === '/' ? '' : currentPath}`;
      this.router.navigateByUrl(newPath, { replaceUrl: true });
    }
  }

  private updateHtmlLang(lang: Language): void {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }

  getLanguageFromPath(path: string): Language {
    const match = path.match(/^\/(en|no|nl)(\/|$)/);
    return (match?.[1] as Language) || 'en';
  }

  getPathWithoutLanguage(path: string): string {
    return path.replace(/^\/(en|no|nl)(\/|$)/, '/') || '/';
  }
}

