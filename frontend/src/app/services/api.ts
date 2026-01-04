import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, map, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = environment.apiUrl;
  private holidayCache = new Map<string, any[]>(); // cache holidays per "country-year"

  constructor(private http: HttpClient) {}

  /**
   * Initialize user session - always returns userId
   * Body: { browserId?, email?, name?, availableDays? }
   */
  initUser(browserId?: string | null, email?: string | null, name?: string, availableDays?: number): Observable<any> {
    const body: any = {};
    if (browserId) body.browserId = browserId;
    if (email) body.email = email;
    if (name) body.name = name;
    if (availableDays) body.availableDays = availableDays;
    return this.http.post(`${this.baseUrl}/users/init`, body);
  }

  /**
   * Fetch holidays for a given year/country — with caching.
   */
  getHolidays(year: number, country = 'NO'): Observable<any[]> {
    const key = `${country}-${year}`;
    if (this.holidayCache.has(key)) {
      return of(this.holidayCache.get(key)!);
    }

    return this.http
      .get<any[]>(`${this.baseUrl}/holidays/${year}?country=${country}`)
      .pipe(tap((data) => this.holidayCache.set(key, data)));
  }

  /**
   * Generate or fetch a vacation optimization plan for a given user/year.
   * userId is required - always use userId (no browserId)
   */
  createPlan(
    userId: string,
    year: number,
    country: string,
    availableDays: number,
    preference: string,
    generateAI: boolean = true,
    lang: string = 'en'
  ): Observable<any> {
    return this.http.post(`${this.baseUrl}/plans`, {
      userId,
      year,
      country,
      availableDays,
      preference,
      generateAI,
      lang
    });
  }

  /**
   * Get detailed plan info (for summaries, analytics, etc.).
   */
  getPlanDetails(planId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/plans/details/${planId}`);
  }

  /**
   * Get all plans for a user
   */
  getAllPlans(userId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/plans/${userId}`);
  }

  /**
   * Get plan by userId, year, and optionally country
   */
  getPlanByYear(userId: string, year: number, country?: string): Observable<any> {
    const url = country 
      ? `${this.baseUrl}/plans/${userId}/${year}?country=${country}`
      : `${this.baseUrl}/plans/${userId}/${year}`;
    return this.http.get(url);
  }

  /**
   * Add manual vacation days to a plan
   */
  addManualDays(planId: string, dates: { date: string; note?: string }[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/plans/${planId}/manual-days`, { dates });
  }

  /**
   * Remove a manual vacation day
   */
  removeManualDay(planId: string, dayId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/plans/${planId}/manual-days/${dayId}`);
  }

  /**
   * Remove a suggestion from the plan
   */
  removeSuggestion(planId: string, suggestionId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/plans/${planId}/suggestions/${suggestionId}`);
  }

  /**
   * Remove a specific day from a suggestion
   */
  removeDayFromSuggestion(planId: string, suggestionId: string, date: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/plans/${planId}/suggestions/${suggestionId}/days/${date}`);
  }

  /**
   * Optimize remaining vacation days (keeps existing suggestions, fills gaps)
   */
  optimizeRemainingDays(planId: string, preference: string = 'balanced', lang: string = 'en'): Observable<any> {
    return this.http.post(`${this.baseUrl}/plans/${planId}/optimize-remaining`, { preference, lang });
  }

  regeneratePlanWithStrategy(planId: string, preference: string, lang: string = 'en'): Observable<any> {
    return this.http.post(`${this.baseUrl}/plans/${planId}/regenerate`, { preference, lang });
  }

  /**
   * Create initial plan with manual days (use case 1: start with manual, then optimize)
   */
  createPlanWithManualDays(
    userId: string,
    year: number,
    country: string,
    availableDays: number,
    manualDays: { date: string; note?: string }[]
  ): Observable<any> {
    return this.http.post(`${this.baseUrl}/plans`, {
      userId,
      year,
      country,
      availableDays,
      preference: 'balanced'
    }).pipe(
      map((plan: any) => ({ plan, manualDays }))
    );
  }

  /**
   * Get user by ID (fetches latest premium status from backend)
   */
  getUserById(userId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/users/${userId}`);
  }

  /**
   * Create Stripe checkout session for premium upgrade
   * userId is required
   */
  createCheckoutSession(userId: string, successUrl?: string, cancelUrl?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/payment/create-checkout-session`, {
      userId,
      successUrl,
      cancelUrl
    });
  }

  /**
   * Check if a checkout session was successful
   */
  checkSession(sessionId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/payment/check-session?session_id=${sessionId}`);
  }

  /**
   * Check unsubscribe link validity
   */
  checkUnsubscribe(email: string, token: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`);
  }

  /**
   * Process unsubscribe request
   */
  unsubscribe(email: string, token: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/unsubscribe`, { email, token });
  }
}
