import { inject, PLATFORM_ID } from '@angular/core';
import { Routes, CanMatchFn } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';

const SUPPORTED_LANGUAGES = ['en', 'no', 'nl', 'de', 'fr', 'es', 'sv', 'da'] as const;

const langMatch: CanMatchFn = (_route, segments) =>
  segments.length > 0 && SUPPORTED_LANGUAGES.includes(segments[0].path as typeof SUPPORTED_LANGUAGES[number]);

function getStoredOrDefaultLang(): string {
  const platformId = inject(PLATFORM_ID);
  if (isPlatformBrowser(platformId)) {
    const stored = localStorage.getItem('hopladay_lang');
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored;
    }
  }
  return 'en';
}

const appRoutes: Routes = [
  {
    path: 'auth/verify',
    loadComponent: () => import('./auth-verify/auth-verify').then(m => m.AuthVerifyComponent)
  },
  {
    path: 'payment/success',
    loadComponent: () => import('./dashboard/dashboard').then(m => m.DashboardComponent)
  },
  {
    path: 'payment/cancel',
    loadComponent: () => import('./dashboard/dashboard').then(m => m.DashboardComponent)
  },
  {
    path: 'payment/info',
    loadComponent: () => import('./stripe-info/stripe-info').then(m => m.StripeInfoComponent)
  },
  {
    path: 'refunds',
    loadComponent: () => import('./refund-policy/refund-policy').then(m => m.RefundPolicyComponent)
  },
  {
    path: 'faq',
    loadComponent: () => import('./faq/faq').then(m => m.FAQComponent)
  },
  {
    path: 'unsubscribe',
    loadComponent: () => import('./unsubscribe/unsubscribe').then(m => m.UnsubscribeComponent)
  },
  {
    path: '',
    loadComponent: () => import('./dashboard/dashboard').then(m => m.DashboardComponent)
  }
];

export const routes: Routes = [
  {
    path: ':lang',
    canMatch: [langMatch],
    children: appRoutes
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: getStoredOrDefaultLang
  },
  {
    path: '**',
    redirectTo: getStoredOrDefaultLang
  }
];
