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
    localStorage.setItem('hopladay_lang', lang);
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
    const path = this.router.url;
    const langMatch = path.match(/^\/(en|no|nl)(\/|$)/);
    
    if (langMatch) {
      const lang = langMatch[1] as Language;
      this.setLanguage(lang);
      return;
    }

    const stored = localStorage.getItem('hopladay_lang') as Language;
    if (stored && (stored === 'en' || stored === 'no' || stored === 'nl')) {
      this.setLanguage(stored);
      this.redirectToLanguage(stored);
      return;
    }

    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'no' || browserLang === 'nb' || browserLang === 'nn') {
      this.setLanguage('no');
      this.redirectToLanguage('no');
    } else if (browserLang === 'nl') {
      this.setLanguage('nl');
      this.redirectToLanguage('nl');
    } else {
      this.setLanguage('en');
      if (!path.startsWith('/en')) {
        this.redirectToLanguage('en');
      }
    }
  }

  private redirectToLanguage(lang: Language): void {
    const currentPath = this.router.url;
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

