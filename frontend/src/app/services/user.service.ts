import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface User {
  _id: string;
  name: string;
  email?: string;
  browserId?: string;
  availableDays: number;
  isPremium?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private baseUrl = environment.apiUrl;
  private readonly BROWSER_ID_KEY = 'hopladay_browser_id';
  private readonly USER_KEY = 'hopladay_user';
  private readonly AUTH_IN_PROGRESS_KEY = 'hopladay_auth_in_progress';

  private currentUserSubject = new BehaviorSubject<User | null>(this.restoreUser());
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  private restoreUser(): User | null {
    try {
      const stored = localStorage.getItem(this.USER_KEY);
      if (!stored) return null;

      const user = JSON.parse(stored);
      // Only restore authenticated users (with email)
      // Anonymous users should not be persisted
      if (user && user.email) {
        console.log('✅ Restored authenticated user from localStorage:', user.email);
        return user;
      } else {
        // Clear invalid/anonymous user from storage
        console.log('🧹 Clearing invalid/anonymous user from localStorage');
        localStorage.removeItem(this.USER_KEY);
        return null;
      }
    } catch (err) {
      // iOS Safari can block localStorage in private mode
      console.warn('Failed to restore user from localStorage:', err);
      try {
        localStorage.removeItem(this.USER_KEY);
      } catch {
        // Ignore if removal also fails
      }
      return null;
    }
  }

  /**
   * Get or generate browser ID (public method for anonymous sessions)
   */
  getBrowserId(): string {
    try {
      let browserId = localStorage.getItem(this.BROWSER_ID_KEY);
      
      if (!browserId) {
        browserId = this.generateUUID();
        try {
          localStorage.setItem(this.BROWSER_ID_KEY, browserId);
        } catch (err) {
          console.warn('Failed to save browserId to localStorage:', err);
          // Return the generated ID anyway - it will work for this session
        }
      }
      
      return browserId;
    } catch (err) {
      // iOS Safari private mode or localStorage blocked
      console.warn('localStorage not available, generating temporary browserId:', err);
      return this.generateUUID();
    }
  }

  /**
   * Generate UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Initialize user session
   * Only returns authenticated users - no anonymous user creation
   */
  initializeUser(availableDays: number = 25): Observable<User | null> {
    // Check if authentication is in progress (user just logged in via magic link)
    if (typeof localStorage !== 'undefined') {
      try {
        const authInProgress = localStorage.getItem(this.AUTH_IN_PROGRESS_KEY);
        if (authInProgress === 'true') {
          console.log('⏳ Authentication in progress, checking for authenticated user...');
          // Wait a bit for the authenticated user to be available
          const currentUser = this.getCurrentUser();
          if (currentUser && currentUser.email) {
            console.log('✅ Authenticated user found during auth in progress:', currentUser.email);
            localStorage.removeItem(this.AUTH_IN_PROGRESS_KEY);
            return of(currentUser);
          }
          // If no user yet, wait a bit more
          return new Observable<User | null>(observer => {
            setTimeout(() => {
              const user = this.getCurrentUser();
              if (user && user.email) {
                console.log('✅ Authenticated user found after delay:', user.email);
                try {
                  localStorage.removeItem(this.AUTH_IN_PROGRESS_KEY);
                } catch (e) {
                  // Ignore
                }
                observer.next(user);
                observer.complete();
              } else {
                console.log('ℹ️ No authenticated user found - user must sign in to save plans');
                try {
                  localStorage.removeItem(this.AUTH_IN_PROGRESS_KEY);
                } catch (e) {
                  // Ignore
                }
                observer.next(null);
                observer.complete();
              }
            }, 1000);
          });
        }
      } catch (e) {
        // Ignore localStorage errors
      }
    }

    // Check if we already have an authenticated user (with email)
    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.email) {
      console.log('✅ Authenticated user already exists:', currentUser.email);
      return of(currentUser);
    }

    // No authenticated user - return null (no anonymous user creation)
    console.log('ℹ️ No authenticated user - plans will be transient until user signs in');
    return of(null);
  }

  /**
   * Claim plans with email (deprecated - use passkey registration instead)
   * @deprecated Use AuthService.registerPasskey() for secure claiming
   */
  claimWithEmail(email: string): Observable<User> {
    const browserId = this.getBrowserId();
    
    return this.http.post<User>(`${this.baseUrl}/users/claim`, {
      browserId,
      email
    }).pipe(
      tap(user => {
        this.currentUserSubject.next(user);
        console.log(' Plans claimed with email:', email);
      })
    );
  }

  setCurrentUser(user: User): void {
    // 🔥 CRITICAL: Only store authenticated users (with email) as currentUser
    // Anonymous users should NOT be stored as currentUser
    if (!user.email) {
      console.log('⚠️ Anonymous user - NOT storing as currentUser (only browserId is used)');
      return; // Don't store anonymous users
    }

    // This is an authenticated user - store it
    console.log('✅ Storing authenticated user as currentUser:', user.email);
    this.saveUser(user);

    // Ensure correct browserId stays synced
    if (user.browserId && typeof localStorage !== 'undefined') {
      try {
        if (user.browserId !== this.getBrowserId()) {
          localStorage.setItem(this.BROWSER_ID_KEY, user.browserId);
        }
      } catch (e) {
        console.error('Error setting browser ID in localStorage (setCurrentUser):', e);
      }
    }

    // Mark authentication as in progress to prevent anonymous user creation
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.AUTH_IN_PROGRESS_KEY, 'true');
        // Clear the flag after a short delay (in case redirect fails)
        setTimeout(() => {
          try {
            localStorage.removeItem(this.AUTH_IN_PROGRESS_KEY);
          } catch (e) {
            // Ignore errors
          }
        }, 5000);
      } catch (e) {
        // Ignore localStorage errors
      }
    }
  }

  private saveUser(user: User) {
    this.currentUserSubject.next(user);
    // Only persist authenticated users (with email) to localStorage
    // Anonymous users are not persisted to prevent hijacking magic links
    if (user.email && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        console.log('💾 Authenticated user saved to localStorage:', user.email);
      } catch (err) {
        // iOS Safari can block localStorage in private mode or when storage is full
        console.warn('Failed to save user to localStorage:', err);
        // User is still set in memory, so authentication will work for this session
      }
    } else {
      console.log('ℹ️ Not persisting anonymous user to localStorage (transient session)');
    }
  }

  /**
   * Get current user (from memory)
   */
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Get user ID (prioritize current user, fallback to localStorage hint)
   */
  getUserId(): string | null {
    const user = this.getCurrentUser();
    return user ? user._id : null;
  }

  /**
   * Check if user has email (is claimed)
   * Always returns a boolean to avoid change detection issues
   */
  isUserClaimed(): boolean {
    const user = this.getCurrentUser();
    return Boolean(user?.email);
  }

  /**
   * Get user's email
   */
  getUserEmail(): string | null {
    const user = this.getCurrentUser();
    return user?.email || null;
  }

  /**
   * Legacy method for backwards compatibility
   */
  createUser(data: { name: string; email: string; availableDays: number }): Observable<User> {
    const browserId = this.getBrowserId();
    
    return this.http.post<User>(`${this.baseUrl}/users`, {
      ...data,
      browserId
    }).pipe(
      tap(user => this.currentUserSubject.next(user))
    );
  }

  clearCurrentUser() {
  this.currentUserSubject.next(null);
  localStorage.removeItem(this.USER_KEY);
}

}

