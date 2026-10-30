import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PlanPreviewComponent } from './plan-preview';
import { environment } from '../../environments/environment';

const result = {
  version: '1', tier: 'free', input: { country: 'NO', year: 2027, availableDays: 20, preference: 'balanced', lang: 'en' },
  usedDays: 1, remainingDays: 19, totalDaysOff: 4,
  suggestions: [{ startDate: '2027-05-06', endDate: '2027-05-09', vacationDaysUsed: 1, totalDaysOff: 4, leaveDates: ['2027-05-07'], description: '1 vacation day → 4 days off' }],
  source: { name: 'Nager.Date', url: 'https://date.nager.at/api/v3/PublicHolidays/2027/NO', retrievedAt: '2026-10-30T00:00:00.000Z', scope: 'nationwide-public-holidays' },
  previewUrl: 'https://www.hopladay.com/en/preview?country=NO&year=2027&availableDays=20&preference=balanced&lang=en',
};
describe('Public plan preview', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([{ path: 'en/preview', component: PlanPreviewComponent }]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('renders linked inputs and exact leave dates without initializing an account or saving a plan', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/en/preview?country=NO&year=2027&availableDays=20', PlanPreviewComponent);
    const req = http.expectOne(r => r.url === `${environment.apiUrl}/v1/plan-preview`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('country')).toBe('NO');
    req.flush(result);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('2027-05-07');
    expect(harness.routeNativeElement?.textContent).toContain('19');
    expect(harness.routeNativeElement?.querySelector('input[name="availableDays"]')?.getAttribute('type')).toBe('number');
  });
  it('does not calculate until inputs are supplied', async () => {
    const harness = await RouterTestingHarness.create('/en/preview');
    expect(harness.routeNativeElement?.textContent).toContain('Preview');
    http.expectNone(r => r.url.includes('/api/'));
  });
  it('shows upstream failures and can retry', async () => {
    const harness = await RouterTestingHarness.create('/en/preview?country=NO&year=2027&availableDays=20');
    http.expectOne(r => r.url.includes('/v1/plan-preview')).flush({ error: { message: 'Holiday data is unavailable.' } }, { status: 503, statusText: 'Unavailable' });
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('Holiday data is unavailable.');
    expect(harness.routeNativeElement?.querySelector('button[type="submit"]')).toBeTruthy();
  });
  it('shows zero-budget results without claiming annual days off', async () => {
    const harness = await RouterTestingHarness.create('/en/preview?country=NO&year=2027&availableDays=0');
    http.expectOne(r => r.url.includes('/v1/plan-preview')).flush({ ...result, input: { ...result.input, availableDays: 0 }, usedDays: 0, remainingDays: 0, totalDaysOff: 0, suggestions: [] });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('No one-day bridges');
    expect(harness.routeNativeElement?.textContent).toContain('within suggested breaks');
  });
  it('retries the same ready-filled link after a temporary failure', async () => {
    const harness = await RouterTestingHarness.create('/en/preview?country=NO&year=2027&availableDays=20&preference=balanced&lang=en');
    http.expectOne(r => r.url.includes('/v1/plan-preview')).flush({}, { status: 503, statusText: 'Unavailable' });
    harness.detectChanges();
    const form = harness.routeNativeElement?.querySelector('form');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    http.expectOne(r => r.url.includes('/v1/plan-preview')).flush(result);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')).toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('2027-05-07');
  });
  it('cancels an older request when linked inputs change', async () => {
    const harness = await RouterTestingHarness.create('/en/preview?country=NO&year=2027&availableDays=20');
    const old = http.expectOne(r => r.url.includes('/v1/plan-preview'));
    await harness.navigateByUrl('/en/preview?country=NO&year=2027&availableDays=0');
    expect(old.cancelled).toBeTrue();
    http.expectOne(r => r.url.includes('/v1/plan-preview')).flush({ ...result, usedDays: 0, remainingDays: 0, totalDaysOff: 0, suggestions: [] });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('No one-day bridges');
  });

});
