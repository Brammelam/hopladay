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
          <svg
            class="animate-spin h-12 w-12 mx-auto mb-4 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <h2 class="text-xl font-bold text-gray-900 mb-2">Verifying...</h2>
          <p class="text-gray-600">Please wait while we sign you in</p>
        </div>

        <div *ngIf="!isVerifying && success" class="text-center">
          <svg
            class="w-16 h-16 mx-auto mb-4 text-green-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
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
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            />
          </svg>
          <h2 class="text-2xl font-bold text-gray-900 mb-2">Link Invalid or Expired</h2>
          <p class="text-gray-600 mb-6">
            This magic link is no longer valid. Please request a new one.
          </p>
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
    // Get both route params (lang) and query params (token) together
    this.subscription = this.route.paramMap.pipe(take(1)).subscribe((routeParams) => {
      const lang = routeParams.get('lang') || 'en';
      
      this.route.queryParams.pipe(take(1)).subscribe((queryParams) => {
        const token = queryParams['token'];
        this.verifyToken(token, lang);
      });
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private verifyToken(tokenFromRoute?: string, lang: string = 'en'): void {
    // Get token from query params
    let token = tokenFromRoute;

    // Fallback: Parse directly from URL if not in route params
    if (!token && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      token = urlParams.get('token') || undefined;
    }

    if (!token) {
      this.isVerifying = false;
      this.success = false;
      return;
    }

    // Get browserId for plan migration
    const browserId = this.userService.getBrowserId();

    this.authService.verifyMagicLink(token, browserId).subscribe({
      next: (result) => {
        if (result.verified && result.user) {
          // Clear any anonymous user data
          this.userService.clearCurrentUser();
          
          // Set authenticated user
          this.userService.setCurrentUser(result.user as any);
          
          // Verify user was saved
          const savedUser = this.userService.getCurrentUser();
          
          if (!savedUser || !savedUser.email) {
            this.success = false;
            this.isVerifying = false;
            return;
          }
          
          this.success = true;
          this.isVerifying = false;

          // Small delay to ensure user is saved to localStorage before redirect
          setTimeout(() => {
            this.router.navigate([`/${lang}`], { replaceUrl: true });
          }, 200);
        } else {
          this.success = false;
          this.isVerifying = false;
        }
      },
      error: (err) => {
        console.error('Magic link verification failed:', err);
        this.success = false;
        this.isVerifying = false;
      },
    });
  }

  goToDashboard(): void {
    const lang = this.route.snapshot.paramMap.get('lang') || this.translationService.currentLang();
    this.router.navigate([`/${lang}`]);
  }
}
