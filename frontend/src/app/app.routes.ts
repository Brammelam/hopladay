import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard';
import { AuthVerifyComponent } from './auth-verify/auth-verify';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'auth/verify', component: AuthVerifyComponent },
  { path: '**', redirectTo: '' }
];
