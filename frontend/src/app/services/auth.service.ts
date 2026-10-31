import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap, tap } from 'rxjs';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { environment } from '../../environments/environment';
import { PlatformService } from './platform';

export interface AuthUser {
  _id: string;
  email: string;
  name: string;
  availableDays: number;
  browserId?: string;
  isPremium?: boolean;
}

export interface AuthResult {
  verified: boolean;
  user: AuthUser;
  sessionToken?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private baseUrl = environment.apiUrl;

  private sessionToken: string | null = null;
  private readonly sessionKey = 'hopladay_session';

  constructor(private http: HttpClient, private platform: PlatformService) {}

  getSessionToken(): string | null {
    if (!this.platform.isBrowser()) return null;
    try {
      const stored = this.platform.safeGetItem(this.sessionKey);
      return stored && /^[A-Za-z0-9_-]{43}$/.test(stored) ? stored : this.sessionToken;
    } catch {
      return this.sessionToken;
    }
  }

  clearSessionToken(): void {
    this.sessionToken = null;
    try {
      this.platform.safeRemoveItem(this.sessionKey);
    } catch {
      // Storage may be disabled; the in-memory session is still cleared.
    }
  }

  private rememberSession(result: AuthResult): void {
    if (!result.verified) return;
    this.clearSessionToken();
    if (!this.platform.isBrowser() || typeof result.sessionToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.sessionToken)) return;
    this.sessionToken = result.sessionToken;
    try {
      this.platform.safeSetItem(this.sessionKey, result.sessionToken);
    } catch {
      // Keep login usable for this tab when browser storage is disabled.
    }
  }

  /**
   * Register a new passkey for an email (claim anonymous plans)
   */
  registerPasskey(email: string, browserId: string): Observable<AuthResult> {
    const token = this.getSessionToken();
    const requestOptions = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    // Step 1: Get registration options from server
    return this.http.post<any>(`${this.baseUrl}/auth/register/start`, { email, browserId }, requestOptions)
      .pipe(
        switchMap(options => {
          // Step 2: Show browser passkey prompt
          return from(startRegistration({ optionsJSON: options }));
        }),
        switchMap(credential => {
          // Step 3: Send credential to server for verification
          return this.http.post<AuthResult>(
            `${this.baseUrl}/auth/register/finish`,
            { email, credential },
            requestOptions
          );
        }),
        tap(result => this.rememberSession(result))
      );
  }

  /**
   * Authenticate with existing passkey
   */
  loginWithPasskey(email: string): Observable<AuthResult> {
    // Step 1: Get authentication options from server
    return this.http.post<any>(`${this.baseUrl}/auth/login/start`, { email })
      .pipe(
        switchMap(options => {
          // Step 2: Show browser passkey prompt
          return from(startAuthentication({ optionsJSON: options }));
        }),
        switchMap(credential => {
          // Step 3: Send credential to server for verification
          return this.http.post<AuthResult>(
            `${this.baseUrl}/auth/login/finish`,
            { email, credential }
          );
        }),
        tap(result => this.rememberSession(result))
      );
  }

  /**
   * Check if passkeys are supported in this browser
   */
  isPasskeySupported(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }
    return (
      window.PublicKeyCredential !== undefined && navigator.credentials !== undefined
    );
  }

  /**
   * Request a magic link for email authentication (backup method)
   */
  requestMagicLink(email: string, browserId?: string): Observable<{ success: boolean; message: string; devLink?: string; emailError?: boolean }> {
    return this.http.post<{ success: boolean; message: string; devLink?: string; emailError?: boolean }>(
      `${this.baseUrl}/auth/magic-link/send`,
      { email, browserId }
    );
  }

  /**
   * Verify a magic link token
   * @param token - Magic link token
   * @param browserId - Optional browserId for migrating anonymous plans
   */
  verifyMagicLink(token: string, browserId?: string) {
    return this.http.post<AuthResult>(
      `${this.baseUrl}/auth/magic-link/verify`,
      { token, browserId }
    ).pipe(tap(result => this.rememberSession(result)));
  }
}

