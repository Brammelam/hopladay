import { Routes } from '@angular/router';

const SUPPORTED_LANGUAGES = ['en', 'no', 'nl', 'de', 'fr', 'es', 'sv', 'da'];

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
  ...SUPPORTED_LANGUAGES.map(lang => ({
    path: lang,
    children: appRoutes
  })),
  {
    path: '',
    pathMatch: 'full' as const,
    redirectTo: 'en'
  },
  {
    path: '**',
    redirectTo: 'en'
  }
];
