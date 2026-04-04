import { Injectable, signal, computed } from '@angular/core';

export type Language = 'en' | 'no' | 'nl' | 'de' | 'fr' | 'es' | 'sv' | 'da';

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

  constructor() {
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/^\/(en|no|nl|de|fr|es|sv|da)(\/|$)/);
      if (match) {
        this.currentLanguage.set(match[1] as Language);
        this.updateHtmlLang(match[1] as Language);
      }
    }
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

  private updateHtmlLang(lang: Language): void {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }

  getLanguageFromPath(path: string): Language {
    const match = path.match(/^\/(en|no|nl|de|fr|es|sv|da)(\/|$)/);
    return (match?.[1] as Language) || 'en';
  }

  getPathWithoutLanguage(path: string): string {
    return path.replace(/^\/(en|no|nl|de|fr|es|sv|da)(\/|$)/, '/') || '/';
  }

  getTranslations(): Translations {
    const lang = this.currentLanguage();
    return this.translations.get(lang) || this.translations.get('en') || {};
  }
}

