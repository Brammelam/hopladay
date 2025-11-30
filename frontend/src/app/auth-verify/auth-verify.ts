import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { TranslationService } from '../services/translation.service';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-auth-verify',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div class="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div *ngIf="isVerifying" class="text-center">
          <svg class="animate-spin h-12 w-12 mx-auto mb-4 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <h2 class="text-xl font-bold text-gray-900 mb-2">Verifying...</h2>
          <p class="text-gray-600">Please wait while we sign you in</p>
        </div>

        <div *ngIf="!isVerifying && success" class="text-center">
          <svg class="w-16 h-16 mx-auto mb-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <h2 class="text-2xl font-bold text-gray-900 mb-2">Welcome back!</h2>
          <p class="text-gray-600 mb-6">You've been successfully signed in.</p>
          <button
            (click)="goToDashboard()"
            class="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Go to Dashboard
          </button>
        </div>

        <div *ngIf="!isVerifying && !success" class="text-center">
          <svg class="w-16 h-16 mx-auto mb-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          </svg>
          <h2 class="text-2xl font-bold text-gray-900 mb-2">Link Invalid or Expired</h2>
          <p class="text-gray-600 mb-6">This magic link is no longer valid. Please request a new one.</p>
          <button
            (click)="goToDashboard()"
            class="px-6 py-3 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AuthVerifyComponent implements OnInit, OnDestroy {
  isVerifying = true;
  success = false;
  private translationService = inject(TranslationService);
  private subscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    // Use observable for better iOS compatibility (snapshot can be stale)
    this.subscription = this.route.queryParams.pipe(take(1)).subscribe(params => {
      this.verifyToken(params['token']);
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private verifyToken(tokenFromRoute?: string): void {
    // Get token from query params - try multiple methods for iOS compatibility
    let token = tokenFromRoute;
    if (token === null) return;

    // Fallback 1: Parse directly from URL (iOS Safari sometimes has issues with Angular router)
    if (!token && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      token = urlParams.get('token')!;
      
      // Fallback 2: Parse from hash (some email clients use hash)
      if (!token && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        token = hashParams.get('token')!;
      }
      
      // Fallback 3: Try to extract from full URL as last resort
      if (!token) {
        const urlMatch = window.location.href.match(/[?&]token=([^&]+)/);
        if (urlMatch) {
          token = decodeURIComponent(urlMatch[1]);
        }
      }
    
    }
    
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    console.log('🔍 Auth verification page loaded:', {
      hasToken: !!token,
      tokenLength: token?.length,
      tokenSample: token?.substring(0, 20) + '...',
      fullUrl: window.location.href,
      search: window.location.search,
      hash: window.location.hash,
      pathname: window.location.pathname,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
      isIOS,
    });
    
    if (!token) {
      console.error('❌ No token in URL');
      console.error('URL details:', {
        href: window.location.href,
        search: window.location.search,
        hash: window.location.hash,
        pathname: window.location.pathname,
        queryParams: this.route.snapshot.queryParams,
      });
      this.isVerifying = false;
      this.success = false;
      return;
    }

    // Verify the token
    console.log('📤 Sending verification request to backend...');
    this.authService.verifyMagicLink(token).subscribe({
      next: (result) => {
        console.log('📥 Verification response received:', {
          verified: result.verified,
          hasUser: !!result.user,
          userEmail: result.user?.email,
        });
        
        if (result.verified && result.user) {
          // Set user data
          try {
            this.userService.setCurrentUser(result.user as any);
            console.log('✅ User authenticated and saved:', {
              userId: result.user._id,
              email: result.user.email,
              isPremium: result.user.isPremium,
            });
            
            // Verify user was actually set
            const savedUser = this.userService.getCurrentUser();
            if (!savedUser) {
              console.warn('⚠️ User was not saved to service, but verification succeeded');
            } else {
              console.log('✅ Verified user is now in service:', {
                userId: savedUser._id,
                email: savedUser.email,
              });
            }
            
            this.success = true;
            
            // Auto-redirect after 1.5 seconds (reduced from 2 for better UX)
            // Use window.location to ensure full page reload and proper user initialization
            setTimeout(() => {
              const currentLang = this.translationService.currentLang();
              window.location.href = `/${currentLang}`;
            }, 1500);
          } catch (err) {
            console.error('❌ Error setting user data:', err);
            this.success = false;
            this.isVerifying = false;
          }
        } else {
          console.error('❌ Verification returned false or no user data');
          this.success = false;
        }
        this.isVerifying = false;
      },
      error: (err) => {
        console.error('❌ Magic link verification failed:', {
          status: err.status,
          statusText: err.statusText,
          error: err.error,
          message: err.message,
          url: err.url,
        });
        this.success = false;
        this.isVerifying = false;
      }
    });
  }

  goToDashboard(): void {
    const currentLang = this.translationService.currentLang();
    this.router.navigate([`/${currentLang}`]);
  }
}

