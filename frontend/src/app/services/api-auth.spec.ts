import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService } from './api';
import { AuthService } from './auth.service';
import { UserService } from './user.service';
import { PlatformService } from './platform';
import { environment } from '../../environments/environment';

describe('Legacy API sessions', () => {
  let http: HttpTestingController;
  let api: ApiService;
  let auth: AuthService;
  const token = 'a'.repeat(43);
  beforeEach(() => {
    const storage = new Map<string, string>();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), { provide: PlatformService, useValue: {
      isBrowser: () => true, safeGetItem: (key: string) => storage.get(key) ?? null,
      safeSetItem: (key: string, value: string) => storage.set(key, value), safeRemoveItem: (key: string) => storage.delete(key),
    } }] });
    api = TestBed.inject(ApiService); auth = TestBed.inject(AuthService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('retains the anonymous session returned by initialization for all protected operations', () => {
    api.initUser('browser').subscribe();
    http.expectOne(`${environment.apiUrl}/users/init`).flush({ _id: 'owner', sessionToken: token });
    expect(auth.getSessionToken()).toBe(token);
    const calls: [() => void, string][] = [
      [() => { api.getUserById('owner').subscribe(); }, '/users/owner'],
      [() => { api.getAllPlans('owner').subscribe(); }, '/plans/owner'],
      [() => { api.getPlanByYear('owner', 2027).subscribe(); }, '/plans/owner/2027'],
      [() => { api.getPlanDetails('plan').subscribe(); }, '/plans/details/plan'],
      [() => { api.deletePlan('plan').subscribe(); }, '/plans/plan'],
      [() => { api.createPlan('owner', 2027, 'NO', 25, 'balanced').subscribe(); }, '/plans'],
      [() => { api.addManualDays('plan', []).subscribe(); }, '/plans/plan/manual-days'],
      [() => { api.removeSuggestion('plan', 'suggestion').subscribe(); }, '/plans/plan/suggestions/suggestion'],
      [() => { api.removeDayFromSuggestion('plan', 'suggestion', '2027-01-01').subscribe(); }, '/plans/plan/suggestions/suggestion/days/2027-01-01'],
      [() => { api.optimizeRemainingDays('plan').subscribe(); }, '/plans/plan/optimize-remaining'],
      [() => { api.regeneratePlanWithStrategy('plan', 'balanced').subscribe(); }, '/plans/plan/regenerate'],
    ];
    for (const [call, path] of calls) {
      call(); const request = http.expectOne(`${environment.apiUrl}${path}`);
      expect(request.request.headers.get('Authorization')).withContext(path).toBe(`Bearer ${token}`); request.flush({});
    }
    api.initUser().subscribe();
    const init = http.expectOne(`${environment.apiUrl}/users/init`);
    expect(init.request.headers.get('Authorization')).toBe(`Bearer ${token}`); init.flush({ _id: 'owner' });
    expect(auth.getSessionToken()).toBe(token);
  });
  it('refreshes cached profiles through the verified session and clears credentials on logout', () => {
    const users = TestBed.inject(UserService);
    users.setCurrentUser({ _id: 'owner', name: 'Owner', email: 'owner@example.test', availableDays: 25 });
    api.initUser().subscribe();
    http.expectOne(`${environment.apiUrl}/users/init`).flush({ _id: 'owner', sessionToken: token });
    users.initUser('owner@example.test').subscribe();
    const refresh = http.expectOne(`${environment.apiUrl}/users/init`);
    expect(refresh.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    refresh.flush({ _id: 'owner', name: 'Owner', email: 'owner@example.test', availableDays: 25, isPremium: true });
    expect(users.getCurrentUser()?.isPremium).toBeTrue();
    users.clearCurrentUser(); expect(auth.getSessionToken()).toBeNull();
  });
  it('proves anonymous ownership when verifying a magic link for plan migration', () => {
    api.initUser().subscribe();
    http.expectOne(`${environment.apiUrl}/users/init`).flush({ _id: 'owner', sessionToken: token });
    auth.verifyMagicLink('magic', 'browser').subscribe();
    const verify = http.expectOne(`${environment.apiUrl}/auth/magic-link/verify`);
    expect(verify.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    verify.flush({ verified: true, user: { _id: 'owner' }, sessionToken: token });
  });

  it('replaces an expired anonymous session once without attempting account recovery', () => {
    const users = TestBed.inject(UserService);
    users.clearCurrentUser();
    users.setCurrentUser({ _id: 'anonymous', name: 'Anonymous', availableDays: 25 });
    auth.rememberSessionToken(token);
    let currentId: string | undefined;
    users.initUser().subscribe({ next: user => { currentId = user._id; }, error: () => {} });
    const expired = http.expectOne(`${environment.apiUrl}/users/init`);
    expect(expired.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    expired.flush({}, { status: 401, statusText: 'Unauthorized' });
    const retry = http.expectOne(`${environment.apiUrl}/users/init`);
    expect(retry.request.headers.has('Authorization')).toBeFalse();
    expect(retry.request.body.email).toBeUndefined();
    retry.flush({ _id: 'fresh', name: 'Anonymous', availableDays: 25, sessionToken: 'b'.repeat(43) });
    expect(currentId).toBe('fresh'); expect(auth.getSessionToken()).toBe('b'.repeat(43));
    users.clearCurrentUser();
  });
  it('does not replace email accounts or retry forbidden and unavailable responses', () => {
    const users = TestBed.inject(UserService);
    for (const [email, status] of [['owner@example.test', 401], [undefined, 403], [undefined, 503]] as const) {
      users.setCurrentUser({ _id: 'owner', name: 'Owner', email, availableDays: 25 });
      auth.rememberSessionToken(token);
      let errorStatus: number | undefined;
      users.initUser().subscribe({ error: error => { errorStatus = error.status; } });
      http.expectOne(`${environment.apiUrl}/users/init`).flush({}, { status, statusText: 'Failure' });
      http.expectNone(`${environment.apiUrl}/users/init`);
      expect(errorStatus).toBe(status); expect(auth.getSessionToken()).toBe(token);
    }
    users.clearCurrentUser();
  });

  it('does not loop when fresh anonymous initialization also fails', () => {
    const users = TestBed.inject(UserService);
    users.clearCurrentUser(); auth.rememberSessionToken(token);
    let status: number | undefined;
    users.initUser().subscribe({ error: error => { status = error.status; } });
    http.expectOne(`${environment.apiUrl}/users/init`).flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${environment.apiUrl}/users/init`).flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectNone(`${environment.apiUrl}/users/init`); expect(status).toBe(401);
  });

});
