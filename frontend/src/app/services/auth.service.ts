import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { environment } from '../../environments/environment';

export interface AuthUser {
  _id: string;
  email: string;
  name: string;
  availableDays: number;
  browserId?: string;
  isPremium?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Register a new passkey for an email (claim anonymous plans)
   */
  registerPasskey(email: string, browserId: string): Observable<{ verified: boolean; user: AuthUser }> {
    // Step 1: Get registration options from server
    return this.http.post<any>(`${this.baseUrl}/auth/register/start`, { email, browserId })
      .pipe(
        switchMap(options => {
          // Step 2: Show browser passkey prompt
          return from(startRegistration({ optionsJSON: options }));
        }),
        switchMap(credential => {
          // Step 3: Send credential to server for verification
          return this.http.post<{ verified: boolean; user: AuthUser }>(
            `${this.baseUrl}/auth/register/finish`,
            { email, credential }
          );
        })
      );
  }

  /**
   * Authenticate with existing passkey
   */
  loginWithPasskey(email: string): Observable<{ verified: boolean; user: AuthUser }> {
    // Step 1: Get authentication options from server
    return this.http.post<any>(`${this.baseUrl}/auth/login/start`, { email })
      .pipe(
        switchMap(options => {
          // Step 2: Show browser passkey prompt
          return from(startAuthentication({ optionsJSON: options }));
        }),
        switchMap(credential => {
          // Step 3: Send credential to server for verification
          return this.http.post<{ verified: boolean; user: AuthUser }>(
            `${this.baseUrl}/auth/login/finish`,
            { email, credential }
          );
        })
      );
  }

  /**
   * Check if passkeys are supported in this browser
   */
  isPasskeySupported(): boolean {
    return window.PublicKeyCredential !== undefined && 
           navigator.credentials !== undefined;
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
   */
  verifyMagicLink(token: string): Observable<{ verified: boolean; user: AuthUser }> {
    return this.http.post<{ verified: boolean; user: AuthUser }>(
      `${this.baseUrl}/auth/magic-link/verify`,
      { token }
    );
  }
}

