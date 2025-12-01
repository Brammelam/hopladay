import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TranslationService } from './translation.service';

export function translationInitializer() {
  return () => {
    const translationService = inject(TranslationService);
    const http = inject(HttpClient);
    
    // Always try to load translations
    // In browser, this will use HttpClient
    // In SSR, HttpClient should still work for relative paths
    return Promise.all([
      firstValueFrom(http.get<any>('/assets/i18n/en.json').pipe(
        catchError(() => of({ common: {}, dashboard: {} }))
      )),
      firstValueFrom(http.get<any>('/assets/i18n/no.json').pipe(
        catchError(() => of({ common: {}, dashboard: {} }))
      )),
      firstValueFrom(http.get<any>('/assets/i18n/nl.json').pipe(
        catchError(() => of({ common: {}, dashboard: {} }))
      )),
      firstValueFrom(http.get<any>('/assets/i18n/de.json').pipe(
        catchError(() => of({ common: {}, dashboard: {} }))
      )),
      firstValueFrom(http.get<any>('/assets/i18n/fr.json').pipe(
        catchError(() => of({ common: {}, dashboard: {} }))
      )),
      firstValueFrom(http.get<any>('/assets/i18n/es.json').pipe(
        catchError(() => of({ common: {}, dashboard: {} }))
      )),
      firstValueFrom(http.get<any>('/assets/i18n/sv.json').pipe(
        catchError(() => of({ common: {}, dashboard: {} }))
      )),
      firstValueFrom(http.get<any>('/assets/i18n/da.json').pipe(
        catchError(() => of({ common: {}, dashboard: {} }))
      ))
    ]).then(([en, no, nl, de, fr, es, sv, da]) => {
      translationService.loadTranslations('en', en);
      translationService.loadTranslations('no', no);
      translationService.loadTranslations('nl', nl);
      translationService.loadTranslations('de', de);
      translationService.loadTranslations('fr', fr);
      translationService.loadTranslations('es', es);
      translationService.loadTranslations('sv', sv);
      translationService.loadTranslations('da', da);
    }).catch((error) => {
      console.error('Failed to load translations:', error);
      // Load empty translations as fallback to prevent showing keys
      translationService.loadTranslations('en', {});
      translationService.loadTranslations('no', {});
      translationService.loadTranslations('nl', {});
      translationService.loadTranslations('de', {});
      translationService.loadTranslations('fr', {});
      translationService.loadTranslations('es', {});
      translationService.loadTranslations('sv', {});
      translationService.loadTranslations('da', {});
    });
  };
}

