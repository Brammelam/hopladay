import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard';
import { AuthVerifyComponent } from './auth-verify/auth-verify';
import { StripeInfoComponent } from './stripe-info/stripe-info';
import { RefundPolicyComponent } from './refund-policy/refund-policy';
import { UnsubscribeComponent } from './unsubscribe/unsubscribe';

const appRoutes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'auth/verify', component: AuthVerifyComponent },
  { path: 'payment/success', component: DashboardComponent },
  { path: 'payment/cancel', component: DashboardComponent },
  { path: 'payment/info', component: StripeInfoComponent },
  { path: 'refunds', component: RefundPolicyComponent },
  { path: 'unsubscribe', component: UnsubscribeComponent }
];

export const routes: Routes = [
  {
    path: ':lang',
    children: appRoutes
  },
  {
    path: '',
    redirectTo: '/en',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: '/en'
  }
];
