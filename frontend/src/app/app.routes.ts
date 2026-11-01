import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import landingRoutes from '../../public/landing-routes.json';
import { Routes } from '@angular/router';

const SUPPORTED_LANGUAGES = ['en', 'no', 'nl', 'de', 'fr', 'es', 'sv', 'da'];

const appRoutes: Routes = [
  {
    path: 'optimize',
    loadComponent: () => import('./annual-planner/annual-planner').then(m => m.AnnualPlannerComponent)
  },
  {
    path: 'plans',
    loadComponent: () => import('./dashboard/dashboard').then(m => m.DashboardComponent)
  },
  {
    path: 'preview',
    loadComponent: () => import('./plan-preview/plan-preview').then(m => m.PlanPreviewComponent)
  },
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
    loadComponent: () => import('./annual-planner/annual-planner').then(m => m.AnnualPlannerComponent)
  }
];

export const routes: Routes = [
  // Static hosts may return the SPA shell for directory URLs. Recover the real
  // generated guide before the wildcard redirects it to the homepage.
  ...landingRoutes.map(entry => ({
    path: entry.path.slice(1),
    pathMatch: 'full' as const,
    canActivate: [() => {
      const location = inject(DOCUMENT).location;
      location.replace(`/${entry.file}${location.search}${location.hash}`);
      return false;
    }],
    loadComponent: () => import('./annual-planner/annual-planner').then(m => m.AnnualPlannerComponent),
  })),
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
