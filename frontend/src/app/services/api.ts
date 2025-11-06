import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = environment.apiUrl;
  private holidayCache = new Map<string, any[]>(); // cache holidays per "country-year"

  constructor(private http: HttpClient) {}

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
   * Create a new user — typically a temporary or anonymous session.
   */
  createUser(user: { name: string; email: string; availableDays: number }): Observable<any> {
    return this.http.post(`${this.baseUrl}/users`, user);
  }

  /**
   * Generate or fetch a vacation optimization plan for a given user/year.
   */
  createPlan(
    userId: string,
    year: number,
    country: string,
    availableDays: number,
    preference: string
  ): Observable<any> {
    return this.http.post(`${this.baseUrl}/plans`, { userId, year, country, availableDays, preference });
  }

  /**
   * Get detailed plan info (for summaries, analytics, etc.).
   */
  getPlanDetails(planId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/plans/details/${planId}`);
  }
}
