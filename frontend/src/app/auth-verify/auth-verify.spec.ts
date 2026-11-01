import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AuthVerifyComponent } from './auth-verify';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { ApiService } from '../services/api';
import { PlatformService } from '../services/platform';
import { TranslationService } from '../services/translation.service';
import { SEOService } from '../services/seo.service';
import { environment } from '../../environments/environment';

describe('Magic-link completion session', () => {
  it('replaces the anonymous identity while retaining the new bearer for protected requests', async () => {
    const storage = new Map<string, string>();
    const params = convertToParamMap({ lang: 'en' });
    await TestBed.configureTestingModule({
      imports: [AuthVerifyComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: params }, paramMap: of(params), queryParams: of({ token: 'magic' }) } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: TranslationService, useValue: { currentLang: () => 'en', translate: (key: string) => key } },
        { provide: SEOService, useValue: { updateSEO: () => {} } },
        { provide: PlatformService, useValue: {
          isBrowser: () => true, safeGetItem: (key: string) => storage.get(key) ?? null,
          safeSetItem: (key: string, value: string) => storage.set(key, value), safeRemoveItem: (key: string) => storage.delete(key),
        } },
      ],
    }).compileComponents();
    const auth = TestBed.inject(AuthService);
    const users = TestBed.inject(UserService);
    const http = TestBed.inject(HttpTestingController);
    const anonymousToken = 'a'.repeat(43), signedInToken = 'b'.repeat(43);
    auth.rememberSessionToken(anonymousToken);
    users.setCurrentUser({ _id: 'anonymous', name: 'Anonymous', availableDays: 25 });
    const fixture = TestBed.createComponent(AuthVerifyComponent);
    fixture.detectChanges();
    const verify = http.expectOne(`${environment.apiUrl}/auth/magic-link/verify`);
    expect(verify.request.headers.get('Authorization')).toBe(`Bearer ${anonymousToken}`);
    verify.flush({ verified: true, sessionToken: signedInToken, user: { _id: 'signed-in', name: 'Owner', email: 'owner@example.test', availableDays: 25 } });
    expect(fixture.componentInstance.success).toBeTrue();
    expect(users.getCurrentUser()?._id).toBe('signed-in');
    expect(auth.getSessionToken()).toBe(signedInToken);
    TestBed.inject(ApiService).getAllPlans('signed-in').subscribe();
    const plans = http.expectOne(`${environment.apiUrl}/plans/signed-in`);
    expect(plans.request.headers.get('Authorization')).toBe(`Bearer ${signedInToken}`);
    plans.flush([]);
    users.clearCurrentUser();
    expect(auth.getSessionToken()).toBeNull();
    http.verify();
    fixture.destroy();
  });
});
