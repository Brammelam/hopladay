import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, take, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiService } from './api';

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
  private readonly BROWSER_ID_KEY = 'hopladay_browser_id';
  private readonly USER_KEY = 'hopladay_user';
  private baseUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(this.restoreUser());
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient, private api: ApiService) {}

  private restoreUser(): User | null {
    try {
      const stored = localStorage.getItem(this.USER_KEY);
      if (!stored) {
        return null;
      }
      const user = JSON.parse(stored) as User;
      return user;
    } catch (err) {
      console.warn('Failed to restore user from localStorage:', err);
      try {
        localStorage.removeItem(this.USER_KEY);
      } catch {}
      return null;
    }
  }

  /** PUBLIC so verify component can call it */
  getBrowserId(): string {
    try {
      let browserId = localStorage.getItem(this.BROWSER_ID_KEY);
      if (!browserId) {
        browserId = this.generateUUID();
        try {
          localStorage.setItem(this.BROWSER_ID_KEY, browserId);
        } catch (err) {
          console.warn('Failed to save browserId to localStorage:', err);
        }
      }
      return browserId;
    } catch (err) {
      console.warn('localStorage not available, generating temporary browserId:', err);
      return this.generateUUID();
    }
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  setCurrentUser(user: User): void {
    // CRITICAL: Do not store isPremium in localStorage - always fetch from backend
    // Store user without isPremium to prevent client-side manipulation
    const userToStore: Partial<User> = {
      _id: user._id,
      name: user.name,
      email: user.email,
      browserId: user.browserId,
      availableDays: user.availableDays,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Explicitly exclude isPremium from localStorage
    };

    // Always update in-memory state with full user object (including isPremium)
    this.currentUserSubject.next(user);

    // Save browserId if provided
    try {
      if (user.browserId && user.browserId !== this.getBrowserId()) {
        localStorage.setItem(this.BROWSER_ID_KEY, user.browserId);
      }
    } catch (err) {
      console.warn('Failed to sync browserId to localStorage:', err);
    }

    // Only persist authenticated users (with email) - without isPremium
    if (user.email) {
      try {
        localStorage.setItem(this.USER_KEY, JSON.stringify(userToStore));
      } catch (err) {
        console.warn('Failed to save user to localStorage:', err);
      }
    }
  }

  /**
   * Initialize user session - always returns userId
   * Calls /api/users/init with browserId (if not logged in) or email (if logged in)
   * Returns Observable<User> with userId
   */
  initUser(email?: string | null): Observable<User> {
    // If user already exists in localStorage with email, use that
    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.email && email && currentUser.email === email) {
      return new Observable(observer => {
        observer.next(currentUser);
        observer.complete();
      });
    }

    // If email provided, use email; otherwise use browserId
    const browserId = email ? null : this.getBrowserId();
    
    return this.api.initUser(browserId, email || null).pipe(
      tap((user: User) => {
        // Store user after initialization (only if different from current)
        const existingUser = this.getCurrentUser();
        if (!existingUser || existingUser._id !== user._id) {
          this.setCurrentUser(user);
        }
      })
    );
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isUserClaimed(): boolean {
    const user = this.getCurrentUser();
    return !!user?.email;
  }

  getUserEmail(): string | null {
    return this.getCurrentUser()?.email || null;
  }

  clearCurrentUser() {
    this.currentUserSubject.next(null);
    try {
      localStorage.removeItem(this.USER_KEY);
      // Generate a new browserId on logout to create a fresh anonymous session
      // This prevents restoring a user by browserId after logout
      const newBrowserId = this.generateUUID();
      localStorage.setItem(this.BROWSER_ID_KEY, newBrowserId);
    } catch (err) {
      console.warn('Failed to clear user from localStorage:', err);
    }
  }
}
