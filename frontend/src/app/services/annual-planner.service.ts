import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export type AnnualStrategy = 'balanced' | 'maximum_time_off' | 'longest_vacation';
export interface AnnualInterval { startDate: string; endDate: string }
export interface AnnualInput {
  country: string; year: number; availableDays: number; strategy: AnnualStrategy; lang: string; region?: string; horizon?: AnnualInterval;
  approvedLeave?: string[]; excludedDates?: string[]; lockedBreaks?: AnnualInterval[];
  workingDays?: number[]; companyHolidays?: string[]; holidayWorkingDates?: string[]; preferredMonths?: number[];
  minBreakLength?: number; maxBreakLength?: number; preferredBreakLength?: number; maxBreaks?: number;
  minSeparationDays?: number; seasonalWeight?: number; requiredSummerBreak?: { minDays: number; months: number[] };
}
export interface AnnualDay {
  date: string; ordinal: number; weekday: number; month: number; publicHoliday: boolean; companyHoliday: boolean;
  approvedLeave: boolean; excluded: boolean; regularNonWorking: boolean; requiresLeave: boolean;
  holidayNames: string[]; recommendedLeave: boolean;
}
export interface AnnualBreak extends AnnualInterval {
  totalDaysOff: number; vacationDaysUsed: number; leaveDates: string[];
  publicHolidays: { date: string; names: string[] }[]; approvedLeave: string[];
  locked: boolean; reasonCode: AnnualStrategy; description: string; reason: string;
}
export interface AnnualPlan {
  version: 2; status: 'ok' | 'infeasible'; year: number; strategy: AnnualStrategy; availableDays: number;
  usedDays: number; remainingDays: number; totalDaysOff: number; longestVacation: number; breakCount: number;
  input: AnnualInput; suggestions: AnnualBreak[]; calendar: AnnualDay[]; constraintsSatisfied: boolean;
  violations: string[]; constraints: Record<string, unknown>;
  optimality: { exact: boolean; objective: string; method: string; bounds: { maxBreakLength: number; maxBreaks: number } };
  unusedAllowanceReason?: 'infeasible_constraints' | 'balanced_objective' | 'no_additional_leave_within_optimal_plan_and_constraints' | null;
  limitations: string[]; source: { name: string; url: string; retrievedAt: string; scope: string; region: string | null };
  regions: string[]; previewUrl: string;
}
export interface SavedAnnualPlan { _id: string; version: 2; title?: string; input: AnnualInput; result: AnnualPlan }
export interface AnnualSession { authenticated: boolean; premium: boolean }
export type PlanningEvent = 'opened' | 'generated' | 'strategy_selected' | 'recommendation_accepted' | 'regenerated' | 'saved' | 'export_requested' | 'upgrade_initiated' | 'purchase_completed';

@Injectable({ providedIn: 'root' })
export class AnnualPlannerService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private platform = inject(PLATFORM_ID);
  private baseUrl = `${environment.apiUrl}/v2`;
  private consent: boolean | null = null;

  private headers(): HttpHeaders {
    const token = this.auth.getSessionToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
  holidays(country: string, year: number): Observable<{ regions: string[] }> { return this.http.get<{ regions: string[] }>(`${this.baseUrl}/holidays/${year}`, { params: { country } }); }
  session(): Observable<AnnualSession> { return this.http.get<AnnualSession>(`${this.baseUrl}/session`, { headers: this.headers() }); }
  optimize(input: AnnualInput): Observable<AnnualPlan> { return this.http.post<AnnualPlan>(`${this.baseUrl}/optimize`, input, { headers: this.headers() }); }
  save(input: AnnualInput): Observable<SavedAnnualPlan> { return this.http.post<SavedAnnualPlan>(`${this.baseUrl}/plans`, { input }, { headers: this.headers() }); }
  plans(): Observable<SavedAnnualPlan[]> { return this.http.get<SavedAnnualPlan[]>(`${this.baseUrl}/plans`, { headers: this.headers() }); }
  export(id: string, mode: 'leave' | 'breaks'): Observable<string> {
    return this.http.post(`${this.baseUrl}/plans/${encodeURIComponent(id)}/export`, { mode }, { headers: this.headers(), responseType: 'text' });
  }
  analyticsEnabled(): boolean {
    if (!isPlatformBrowser(this.platform)) return false;
    if (this.consent !== null) return this.consent;
    try { return localStorage.getItem('hopladay_analytics_opt_in') === 'true'; } catch { return false; }
  }
  setAnalytics(enabled: boolean): void {
    this.consent = enabled;
    if (!isPlatformBrowser(this.platform)) return;
    try {
      if (enabled) localStorage.setItem('hopladay_analytics_opt_in', 'true');
      else localStorage.removeItem('hopladay_analytics_opt_in');
    } catch { /* Consent remains local to this tab if storage is unavailable. */ }
  }
  track(event: PlanningEvent): void {
    if (!this.analyticsEnabled()) return;
    this.http.post(`${this.baseUrl}/events`, { event }).subscribe({ error: () => undefined });
  }
}
