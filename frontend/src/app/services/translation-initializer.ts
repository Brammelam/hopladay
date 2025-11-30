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
      ))
    ]).then(([en, no, nl]) => {
      translationService.loadTranslations('en', en);
      translationService.loadTranslations('no', no);
      translationService.loadTranslations('nl', nl);
    }).catch((error) => {
      console.error('Failed to load translations:', error);
      // Load empty translations as fallback to prevent showing keys
      translationService.loadTranslations('en', {});
      translationService.loadTranslations('no', {});
      translationService.loadTranslations('nl', {});
    });
  };
}

