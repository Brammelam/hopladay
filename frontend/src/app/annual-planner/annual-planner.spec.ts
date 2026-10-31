import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AnnualPlannerComponent } from './annual-planner';
import { AuthService } from '../services/auth.service';
import { TranslationService } from '../services/translation.service';
import { environment } from '../../environments/environment';

@Component({ standalone: true, template: '' })
class AuthVerifyStub {}

const result = {
  version: 2, status: 'ok', year: 2027, strategy: 'balanced', availableDays: 20, usedDays: 1, remainingDays: 19, totalDaysOff: 4, longestVacation: 4, breakCount: 1,
  input: { country: 'NO', year: 2027, availableDays: 20, strategy: 'balanced', lang: 'en' },
  suggestions: [{ startDate: '2027-05-06', endDate: '2027-05-09', totalDaysOff: 4, vacationDaysUsed: 1, leaveDates: ['2027-05-07'], publicHolidays: [{ date: '2027-05-06', names: ['Ascension'] }], approvedLeave: [], locked: false, reasonCode: 'balanced', description: '1 for 4', reason: 'Balanced' }],
  calendar: ['2027-05-06', '2027-05-07', '2027-05-08', '2027-05-09'].map((date, i) => ({ date, ordinal: 20944 + i, weekday: (4+i)%7, month: 5, publicHoliday: i === 0, companyHoliday: false, approvedLeave: false, excluded: false, regularNonWorking: i > 1, requiresLeave: i === 1, holidayNames: i === 0 ? ['Ascension'] : [], recommendedLeave: i === 1 })),
  constraintsSatisfied: true, violations: [], constraints: {}, optimality: { exact: true, objective: 'Balanced', method: 'DP', bounds: { maxBreakLength: 90, maxBreaks: 12 } }, limitations: [],
  source: { name: 'Nager.Date', url: 'https://date.nager.at', retrievedAt: '2026-10-31T00:00:00Z', scope: 'nationwide', region: null }, regions: ['NO-01'], previewUrl: 'https://www.hopladay.com/en/optimize?country=NO&year=2027&availableDays=20',
};

describe('Annual leave planner', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.removeItem('hopladay_annual_settings');
    localStorage.removeItem('hopladay_analytics_opt_in');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: 'en/optimize', component: AnnualPlannerComponent }, { path: 'en/auth/verify', component: AuthVerifyStub }])] });
    http = TestBed.inject(HttpTestingController);
    spyOn(TestBed.inject(AuthService), 'getSessionToken').and.returnValue(null);
    spyOn(TestBed.inject(TranslationService), 'translate').and.callFake(key => key);
  });
  afterEach(() => http.verify());
  async function open(premium = false) {
    const harness = await RouterTestingHarness.create('/en/optimize');
    http.expectOne(`${environment.apiUrl}/v2/session`).flush({ authenticated: premium, premium });
    if (premium) http.expectOne(`${environment.apiUrl}/v2/plans`).flush([]);
    harness.detectChanges();
    return harness;
  }
  async function generate(harness: RouterTestingHarness) {
    harness.routeNativeElement?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    http.expectOne(`${environment.apiUrl}/v2/optimize`).flush(result);
    harness.detectChanges();
  }
  it('generates anonymously, displays twelve calendar months and exact leave labels', async () => {
    const harness = await open();
    await generate(harness);
    expect(harness.routeNativeElement?.querySelectorAll('[data-calendar-month]').length).toBe(12);
    expect(harness.routeNativeElement?.querySelector('[data-date="2027-05-07"]')?.getAttribute('aria-label')).toContain('optimizer.proposed');
    expect(harness.routeNativeElement?.textContent).toContain('19');
    http.expectNone(r => r.url.includes('/users') || r.url.includes('/events'));
  });
  it('locks a break and preserves that hard constraint during regeneration', async () => {
    const harness = await open();
    await generate(harness);
    const lock = harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="lock"]');
    lock?.click();
    const req = http.expectOne(`${environment.apiUrl}/v2/optimize`);
    expect(req.request.body.lockedBreaks).toEqual([{ startDate: '2027-05-06', endDate: '2027-05-09' }]);
    req.flush({ ...result, suggestions: [{ ...result.suggestions[0], locked: true }] });
    harness.detectChanges();
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="regenerate"]')?.click();
    const regenerate = http.expectOne(`${environment.apiUrl}/v2/optimize`);
    expect(regenerate.request.body.lockedBreaks.length).toBe(1);
    regenerate.flush(result);
  });
  it('rejects the entire interval so it cannot immediately reappear', async () => {
    const harness = await open();
    await generate(harness);
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="reject"]')?.click();
    const req = http.expectOne(`${environment.apiUrl}/v2/optimize`);
    expect(req.request.body.excludedDates).toEqual(['2027-05-06', '2027-05-07', '2027-05-08', '2027-05-09']);
    req.flush({ ...result, suggestions: [], breakCount: 0, usedDays: 0, totalDaysOff: 0 });
  });
  it('keeps Premium strategies and exports unavailable to anonymous users', async () => {
    const harness = await open();
    await generate(harness);
    const premiumOptions = harness.routeNativeElement?.querySelectorAll<HTMLOptionElement>('option[data-premium]');
    expect(premiumOptions?.length).toBe(2);
    expect(Array.from(premiumOptions ?? []).every(option => option.disabled)).toBeTrue();
    expect(harness.routeNativeElement?.querySelector('[data-action="export-leave"]')).toBeNull();
  });
  it('shows recoverable API errors without keeping stale metrics', async () => {
    const harness = await open();
    harness.routeNativeElement?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    http.expectOne(`${environment.apiUrl}/v2/optimize`).flush({ error: { code: 'HOLIDAY_DATA_UNAVAILABLE', message: 'optimizer.errorUnavailable' } }, { status: 503, statusText: 'Unavailable' });
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('optimizer.errorUnavailable');
    expect(harness.routeNativeElement?.querySelector('[data-results]')).toBeNull();
  });
  it('resets rejected dates to the original configuration', async () => {
    const harness = await open(); await generate(harness);
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="reject"]')?.click();
    http.expectOne(`${environment.apiUrl}/v2/optimize`).flush(result);
    harness.detectChanges();
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="reset"]')?.click();
    const reset = http.expectOne(`${environment.apiUrl}/v2/optimize`);
    expect(reset.request.body.excludedDates).toBeUndefined();
    expect(reset.request.body.lockedBreaks).toBeUndefined();
    reset.flush(result);
  });
  it('saves an authenticated plan, uses the saved server result and exports only after saving', async () => {
    const harness = await open(true); await generate(harness);
    expect(harness.routeNativeElement?.querySelector('[data-action="export-leave"]')).toBeNull();
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    const save = http.expectOne(`${environment.apiUrl}/v2/plans`);
    expect(save.request.body.input.country).toBe('NO');
    const saved = { _id: '0123456789abcdef01234567', version: 2, input: result.input, result: { ...result, usedDays: 2 } };
    save.flush(saved); http.expectOne(`${environment.apiUrl}/v2/plans`).flush([saved]);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('dd')?.textContent?.trim()).toBe('2 / 20');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:annual-export');
    spyOn(URL, 'revokeObjectURL'); spyOn(HTMLAnchorElement.prototype, 'click');
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="export-leave"]')?.click();
    const exported = http.expectOne(`${environment.apiUrl}/v2/plans/0123456789abcdef01234567/export`);
    expect(exported.request.body).toEqual({ mode: 'leave' });
    exported.flush('BEGIN:VCALENDAR\r\nEND:VCALENDAR');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
  it('does not let an older save response replace a regenerated plan', async () => {
    const harness = await open(true); await generate(harness);
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    const save = http.expectOne(`${environment.apiUrl}/v2/plans`);
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="regenerate"]')?.click();
    http.expectOne(`${environment.apiUrl}/v2/optimize`).flush({ ...result, usedDays: 3 });
    save.flush({ _id: '0123456789abcdef01234567', version: 2, input: result.input, result });
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('dd')?.textContent?.trim()).toBe('3 / 20');
  });
  it('clears an expired bearer session and tells the user to sign in again', async () => {
    const clear = spyOn(TestBed.inject(AuthService), 'clearSessionToken');
    const harness = await RouterTestingHarness.create('/en/optimize');
    http.expectOne(`${environment.apiUrl}/v2/session`).flush({ error: { code: 'AUTH_REQUIRED', message: 'optimizer.errorAuth' } }, { status: 401, statusText: 'Unauthorized' });
    harness.detectChanges();
    expect(clear).toHaveBeenCalled();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('optimizer.errorAuth');
  });
  it('sends only event names after explicit analytics opt-in', async () => {
    const harness = await open();
    harness.routeNativeElement?.querySelector<HTMLInputElement>('input[name="analytics"]')?.click();
    harness.detectChanges();
    await generate(harness);
    const tracked = http.expectOne(`${environment.apiUrl}/v2/events`);
    expect(tracked.request.body).toEqual({ event: 'generated' });
    tracked.flush(null, { status: 204, statusText: 'No Content' });
    harness.routeNativeElement?.querySelector<HTMLInputElement>('input[name="analytics"]')?.click();
    harness.detectChanges();
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="regenerate"]')?.click();
    http.expectOne(`${environment.apiUrl}/v2/optimize`).flush(result);
    http.expectNone(`${environment.apiUrl}/v2/events`);
  });
  it('cancels an older calculation when a new configuration is submitted', async () => {
    const harness = await open();
    harness.routeNativeElement?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const old = http.expectOne(`${environment.apiUrl}/v2/optimize`);
    harness.routeNativeElement?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(old.cancelled).toBeTrue();
    http.expectOne(`${environment.apiUrl}/v2/optimize`).flush(result);
  });

  it('restores valid same-year locks, rejected dates and advanced settings', async () => {
    localStorage.setItem('hopladay_annual_settings', JSON.stringify({ country: 'NO', year: 2027, availableDays: 20, strategy: 'balanced', lockedBreaks: [{ startDate: '2027-05-06', endDate: '2027-05-09' }], excludedText: '2027-04-01', workingDaysText: '0,1,2,3,4', companyText: '2027-12-24', maxBreakLength: 30 }));
    const harness = await open(true);
    harness.routeNativeElement?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const restored = http.expectOne(`${environment.apiUrl}/v2/optimize`);
    expect(restored.request.body.lockedBreaks).toEqual([{ startDate: '2027-05-06', endDate: '2027-05-09' }]);
    expect(restored.request.body.excludedDates).toEqual(['2027-04-01']);
    expect(restored.request.body.workingDays).toEqual([0, 1, 2, 3, 4]);
    expect(restored.request.body.maxBreakLength).toBe(30);
    restored.flush(result);
  });
  it('does not inherit private stored constraints through a shared basic-input link and waits for session verification', async () => {
    localStorage.setItem('hopladay_annual_settings', JSON.stringify({ country: 'DE', year: 2027, availableDays: 20, strategy: 'balanced', lockedBreaks: [{ startDate: '2027-05-06', endDate: '2027-05-09' }], approvedText: '2027-07-01', excludedText: '2027-04-01', companyText: '2027-12-24', workingDaysText: '0,1,2,3,4', maxBreakLength: 30 }));
    const harness = await RouterTestingHarness.create('/en/optimize?country=NO&year=2027&availableDays=20&strategy=longest_vacation');
    http.expectNone(`${environment.apiUrl}/v2/optimize`);
    http.expectOne(`${environment.apiUrl}/v2/session`).flush({ authenticated: true, premium: true });
    http.expectOne(`${environment.apiUrl}/v2/plans`).flush([]);
    const request = http.expectOne(`${environment.apiUrl}/v2/optimize`);
    expect(request.request.body.country).toBe('NO');
    expect(request.request.body.strategy).toBe('longest_vacation');
    expect(request.request.body.approvedLeave).toBeUndefined();
    expect(request.request.body.excludedDates).toBeUndefined();
    expect(request.request.body.lockedBreaks).toBeUndefined();
    expect(request.request.body.companyHolidays).toEqual([]);
    expect(request.request.body.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(request.request.body.maxBreakLength).toBe(90);
    request.flush(result); harness.detectChanges();
  });

  it('aligns partial-horizon saved dates to their actual weekdays and preserves the horizon', async () => {
    const horizon = { startDate: '2027-05-06', endDate: '2027-05-09' };
    const partial = { _id: '0123456789abcdef01234567', version: 2, title: 'May plan', input: { ...result.input, horizon }, result: { ...result, input: { ...result.input, horizon } } };
    const harness = await RouterTestingHarness.create('/en/optimize');
    http.expectOne(`${environment.apiUrl}/v2/session`).flush({ authenticated: true, premium: true });
    http.expectOne(`${environment.apiUrl}/v2/plans`).flush([partial]); harness.detectChanges();
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="load-saved"]')?.click(); harness.detectChanges();
    const may = harness.routeNativeElement?.querySelectorAll('[data-calendar-month]')[4];
    const cells = may?.querySelectorAll('.month-grid')[1]?.children;
    expect(Array.from(cells ?? []).findIndex(cell => cell.getAttribute('data-date') === '2027-05-06')).toBe(3);
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="regenerate"]')?.click();
    const regenerated = http.expectOne(`${environment.apiUrl}/v2/optimize`);
    expect(regenerated.request.body.horizon).toEqual(horizon); regenerated.flush(partial.result); harness.detectChanges();
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="reset"]')?.click();
    const reset = http.expectOne(`${environment.apiUrl}/v2/optimize`);
    expect(reset.request.body.horizon).toEqual(horizon); reset.flush(partial.result);
    const settings: unknown = JSON.parse(localStorage.getItem('hopladay_annual_settings') ?? '{}');
    expect(settings && typeof settings === 'object' && 'horizon' in settings ? settings.horizon : null).toEqual(horizon);
  });
  it('recovers valid editing controls after an invalid manual interval and can reset', async () => {
    const harness = await open(); await generate(harness);
    const component = await harness.navigateByUrl('/en/optimize', AnnualPlannerComponent);
    component.startEdit(component.result()?.suggestions[0] ?? { ...result.suggestions[0], reasonCode: 'balanced' });
    component.editStart = '2027-01-01'; component.editEnd = '2027-12-31';
    const interval = component.result()?.suggestions[0];
    expect(interval).toBeDefined();
    if (interval) component.applyEdit(interval);
    http.expectOne(`${environment.apiUrl}/v2/optimize`).flush({ error: { code: 'INVALID_INPUT', message: 'Invalid locked break' } }, { status: 400, statusText: 'Bad Request' }); harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[data-action="reset"]')).toBeTruthy();
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[data-action="reset"]')?.click();
    const reset = http.expectOne(`${environment.apiUrl}/v2/optimize`);
    expect(reset.request.body.lockedBreaks).toBeUndefined(); reset.flush(result);
  });
  it('keeps legacy root magic-link tokens on the verification route without planner requests', async () => {
    const harness = await RouterTestingHarness.create('/en/optimize?token=legacy-token&country=NO&year=2027&availableDays=20');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/en/auth/verify?token=legacy-token');
    http.expectNone(`${environment.apiUrl}/v2/session`);
    http.expectNone(`${environment.apiUrl}/v2/optimize`);
    http.expectNone(`${environment.apiUrl}/v2/events`);
  });

  it('defaults to the next year only from October onward', () => {
    jasmine.clock().install();
    try {
      const cases: [string, number][] = [['2026-09-30T12:00:00Z', 2026], ['2026-10-31T12:00:00Z', 2027], ['2026-12-31T12:00:00Z', 2027]];
      for (const [date, year] of cases) {
        jasmine.clock().mockDate(new Date(date));
        const fixture = TestBed.createComponent(AnnualPlannerComponent);
        expect(fixture.componentInstance.year).toBe(year);
        fixture.destroy();
      }
    } finally { jasmine.clock().uninstall(); }
  });

});
