import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { PlatformService } from './platform';
import { environment } from '../../environments/environment';

describe('Optimizer bearer sessions', () => {
  let http: HttpTestingController;
  let service: AuthService;
  const token = 'a'.repeat(43);
  beforeEach(() => {
    const storage = new Map<string, string>();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), { provide: PlatformService, useValue: {
      isBrowser: () => true,
      safeGetItem: (key: string) => storage.get(key) ?? null,
      safeSetItem: (key: string, value: string) => storage.set(key, value),
      safeRemoveItem: (key: string) => storage.delete(key),
    } }] });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('retains a verified session and clears it on logout', () => {
    service.verifyMagicLink('magic').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/magic-link/verify`).flush({ verified: true, user: { _id: 'user' }, sessionToken: token });
    expect(service.getSessionToken()).toBe(token);
    service.clearSessionToken();
    expect(service.getSessionToken()).toBeNull();
  });

  it('never accepts an unverified or malformed token', () => {
    for (const result of [{ verified: false, sessionToken: token }, { verified: true, sessionToken: 'invalid' }]) {
      service.verifyMagicLink('magic').subscribe();
      http.expectOne(`${environment.apiUrl}/auth/magic-link/verify`).flush({ ...result, user: { _id: 'user' } });
      expect(service.getSessionToken()).toBeNull();
    }
  });

  it('supports legacy successful responses while clearing an earlier user session', () => {
    service.verifyMagicLink('magic').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/magic-link/verify`).flush({ verified: true, user: { _id: 'old-user' }, sessionToken: token });
    service.verifyMagicLink('second').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/magic-link/verify`).flush({ verified: true, user: { _id: 'new-user' } });
    expect(service.getSessionToken()).toBeNull();
  });
  it('sends the verified bearer when adding a passkey to an existing account', () => {
    service.verifyMagicLink('magic').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/magic-link/verify`).flush({ verified: true, user: { _id: 'user' }, sessionToken: token });
    service.registerPasskey('user@example.com', 'browser').subscribe({ error: () => {} });
    const start = http.expectOne(`${environment.apiUrl}/auth/register/start`);
    expect(start.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    start.flush({ error: 'Verify email first' }, { status: 403, statusText: 'Forbidden' });
  });

  it('does not touch browser storage during server rendering', () => {
    const platform = TestBed.inject(PlatformService);
    spyOn(platform, 'isBrowser').and.returnValue(false);
    const get = spyOn(platform, 'safeGetItem');
    expect(service.getSessionToken()).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

});
