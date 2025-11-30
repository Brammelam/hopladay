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
  
  private currentUserSubject = new BehaviorSubject<User | null>(this.restoreUser());
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  private restoreUser(): User | null {
    try {
      const stored = localStorage.getItem(this.USER_KEY);
      if (!stored) return null;

      return JSON.parse(stored);
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
   * Get or generate browser ID
   */
  private getBrowserId(): string {
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
   */
  initializeUser(availableDays: number = 25): Observable<User> {
    const browserId = this.getBrowserId();
    
    return this.http.post<User>(`${this.baseUrl}/users/init`, {
      browserId,
      availableDays
    }).pipe(
      tap(user => {
        this.currentUserSubject.next(user);
        console.log(' User initialized:', user);
      }),
      catchError(err => {
        console.error(' Failed to initialize user:', err);
        throw err;
      })
    );
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
    this.saveUser(user);

    // Ensure correct browserId stays synced
    if (user.browserId && user.browserId !== this.getBrowserId()) {
      localStorage.setItem(this.BROWSER_ID_KEY, user.browserId);
    }
  }

  private saveUser(user: User) {
    this.currentUserSubject.next(user);
    try {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    } catch (err) {
      // iOS Safari can block localStorage in private mode or when storage is full
      console.warn('Failed to save user to localStorage:', err);
      // User is still set in memory, so authentication will work for this session
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

