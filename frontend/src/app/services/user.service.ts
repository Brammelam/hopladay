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
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private baseUrl = environment.apiUrl;
  private readonly BROWSER_ID_KEY = 'hopladay_browser_id';
  
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Get or generate browser ID
   */
  private getBrowserId(): string {
    let browserId = localStorage.getItem(this.BROWSER_ID_KEY);
    
    if (!browserId) {
      browserId = this.generateUUID();
      localStorage.setItem(this.BROWSER_ID_KEY, browserId);
    }
    
    return browserId;
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
        console.log('✅ User initialized:', user);
      }),
      catchError(err => {
        console.error('❌ Failed to initialize user:', err);
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
        console.log('✅ Plans claimed with email:', email);
      })
    );
  }

  /**
   * Set current user (after auth)
   * Also syncs the browserId to prevent creating duplicate users
   */
  setCurrentUser(user: User): void {
    this.currentUserSubject.next(user);
    
    // If the authenticated user has a different browserId, sync it
    if (user.browserId && user.browserId !== this.getBrowserId()) {
      localStorage.setItem(this.BROWSER_ID_KEY, user.browserId);
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
   */
  isUserClaimed(): boolean {
    const user = this.getCurrentUser();
    return !!(user?.email);
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
  localStorage.removeItem(this.BROWSER_ID_KEY);
  this.currentUserSubject.next(null);
}

}

