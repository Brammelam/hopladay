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

  /** 
   * DEPRECATED: Anonymous users are no longer tracked
   * Plans are created with browserId directly, no user record needed
   * Users are only created when they log in via magic link
   */
  initializeUser(availableDays: number = 25): Observable<User | null> {
    // Just return null - we don't create anonymous users anymore
    return of(null);
  }

  setCurrentUser(user: User): void {
    this.saveUser(user);

    try {
      if (user.browserId && user.browserId !== this.getBrowserId()) {
        localStorage.setItem(this.BROWSER_ID_KEY, user.browserId);
      }
    } catch (err) {
      console.warn('Failed to sync browserId to localStorage:', err);
    }
  }

  private saveUser(user: User) {
    // Always update in-memory state
    this.currentUserSubject.next(user);

    // Only persist authenticated users
    if (!user.email) {
      return;
    }

    try {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    } catch (err) {
      console.warn('Failed to save user to localStorage:', err);
    }
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
    } catch (err) {
      console.warn('Failed to clear user from localStorage:', err);
    }
  }
}
