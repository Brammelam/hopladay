import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class PlatformService {
  private platformId = inject(PLATFORM_ID);

  isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  safeGetItem(key: string): string | null {
    if (this.isBrowser()) {
      return localStorage.getItem(key);
    }
    return null;
  }

  safeSetItem(key: string, value: string): void {
    if (this.isBrowser()) {
      localStorage.setItem(key, value);
    }
  }

  safeRemoveItem(key: string): void {
    if (this.isBrowser()) {
      localStorage.removeItem(key);
    }
  }

  safeRedirect(url: string) {
    if (this.isBrowser()) {
      window.location.href = url;
    }
  }

  get windowRef(): Window | null {
    return this.isBrowser() ? window : null;
  }

  get locationRef(): Location | null {
    return this.isBrowser() ? window.location : null;
  }

  get navigatorRef(): Navigator | null {
    return this.isBrowser() ? window.navigator : null;
  }

  isMobile(): boolean {
    if (!this.isBrowser()) {
      return false;
    }
    
    // Check for mobile user agent
    const userAgent = this.navigatorRef?.userAgent || '';
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    
    // Check for touch capability
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Check screen width (mobile-first approach)
    const isSmallScreen = window.innerWidth < 600;
    
    return mobileRegex.test(userAgent) || (hasTouch && isSmallScreen);
  }

  isIOS(): boolean {
    if (!this.isBrowser()) {
      return false;
    }
    
    const userAgent = this.navigatorRef?.userAgent || '';
    return /iPad|iPhone|iPod/.test(userAgent);
  }

  isAndroid(): boolean {
    if (!this.isBrowser()) {
      return false;
    }
    
    const userAgent = this.navigatorRef?.userAgent || '';
    return /Android/.test(userAgent);
  }
}