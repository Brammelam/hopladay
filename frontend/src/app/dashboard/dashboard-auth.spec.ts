import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { throwError } from 'rxjs';
import { DashboardComponent } from './dashboard';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { TranslationService } from '../services/translation.service';

describe('Existing-account passkey registration', () => {
  it('switches to explicit email verification after 403 and preserves the typed email', async () => {
    const register = jasmine.createSpy('registerPasskey').and.returnValue(throwError(() => new HttpErrorResponse({ status: 403, error: { error: 'Verify this email with a magic link before adding a passkey.' } })));
    const send = jasmine.createSpy('requestMagicLink');
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { isPasskeySupported: () => true, registerPasskey: register, requestMagicLink: send } }],
    }).overrideComponent(DashboardComponent, { set: { template: '' } }).compileComponents();
    const translation = TestBed.inject(TranslationService);
    translation.loadTranslations('en', { auth: { emailLinkDescription: 'Use the secure email link to verify ownership.' } });
    translation.setLanguage('en');
    const toast = spyOn(TestBed.inject(ToastService), 'show');
    spyOn(console, 'error');
    const fixture = TestBed.createComponent(DashboardComponent);
    const component = fixture.componentInstance;
    component.authMode = 'register';
    component.authMethod = 'passkey';
    component.authEmail = 'owner@example.com';
    component.showAuthModal = true;

    await component.handleAuth();

    expect(register).toHaveBeenCalled();
    expect(component.authMethod).toBe('email');
    expect(component.authEmail).toBe('owner@example.com');
    expect(component.showAuthModal).toBeTrue();
    expect(component.isLoading).toBeFalse();
    expect(toast).toHaveBeenCalledWith('Use the secure email link to verify ownership.', 'info');
    expect(send).not.toHaveBeenCalled();
  });
});
