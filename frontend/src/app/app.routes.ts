import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard';
import { AuthVerifyComponent } from './auth-verify/auth-verify';

import { StripeInfoComponent } from './stripe-info/stripe-info';
import { RefundPolicyComponent } from './refund-policy/refund-policy';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'auth/verify', component: AuthVerifyComponent },
  { path: 'payment/success', component: DashboardComponent },
  { path: 'payment/cancel', component: DashboardComponent },
  { path: 'payment/info', component: StripeInfoComponent },
  { path: 'refunds', component: RefundPolicyComponent },
  { path: '**', redirectTo: '' }
];
