import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { HolidayInputComponent } from '../holiday-input/holiday-input';
import { HolidayCalendarComponent } from '../holiday-calendar/holiday-calendar';
import { HolidaySummaryComponent } from '../holiday-summary/holiday-summary';
import { ApiService } from '../services/api';
import { UserService } from '../services/user.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.html',
  imports: [CommonModule, FormsModule, HolidayInputComponent, HolidayCalendarComponent, HolidaySummaryComponent],
})
export class DashboardComponent implements OnInit, OnDestroy {
  holidays: any[] = [];
  plan: any = null;
  userId = '';

  selectedCountry = 'NO';
  selectedYear = new Date().getFullYear();
  availableDays = 25;
  selectedPreference = 'balanced';
  editMode = false;
  isLoading = false;
  showStickyStats = false;
  claimEmail = '';
  showAuthModal = false;
  authMode: 'signin' | 'register' = 'signin';
  authMethod: 'passkey' | 'email' = 'passkey';
  authEmail = '';
  magicLinkSent = false;
  magicLinkUrl = '';
  showPlansDropdown = false;
  savedPlans: any[] = [];

  private scrollHandler: () => void;
  private userSubscription?: Subscription;

  constructor(
    private api: ApiService,
    private userService: UserService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.scrollHandler = () => {
      const scrolled = window.scrollY > 400;
      if (scrolled !== this.showStickyStats) {
        this.showStickyStats = scrolled;
        this.cdr.detectChanges();
      }
    };
  }

  ngOnInit(): void {
    this.initializeUser();
    this.prefetchHolidays();
    window.addEventListener('scroll', this.scrollHandler);
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (this.showPlansDropdown && !target.closest('.relative')) {
        this.showPlansDropdown = false;
        this.cdr.detectChanges();
      }
    });
    
    // Subscribe to user changes to update UI when auth state changes
    this.userSubscription = this.userService.currentUser$.subscribe((user) => {
      if (user) {
        console.log('👤 User state changed:', { email: user.email, id: user._id });
        this.cdr.detectChanges();
      }
    });
  }

  private initializeUser(): void {
    // Check if user is already authenticated (e.g., from magic link)
    const currentUser = this.userService.getCurrentUser();
    
    if (currentUser) {
      console.log('✅ User already authenticated, skipping initialization:', currentUser);
      this.userId = currentUser._id;
      
      if (currentUser.email) {
        this.loadUserPlans(currentUser._id);
        this.loadSavedPlans(); // Preload saved plans for dropdown
      }
      
      this.cdr.detectChanges();
      return;
    }

    // Initialize new session (anonymous user)
    console.log('🆕 No authenticated user, initializing new session...');
    this.userService.initializeUser(this.availableDays).subscribe({
      next: (user) => {
        this.userId = user._id;
        console.log('✅ User session initialized:', user);
        
        // If user has email (is authenticated), try to load their existing plan
        if (user.email) {
          console.log('🔍 Authenticated user, loading existing plan...');
          this.loadUserPlans(user._id);
          this.loadSavedPlans(); // Preload saved plans for dropdown
        }
        
        // Force UI update
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('❌ Failed to initialize user:', err);
      }
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.scrollHandler);
    this.userSubscription?.unsubscribe();
  }

  private prefetchHolidays(): void {
    this.api.getHolidays(this.selectedYear, this.selectedCountry).subscribe({
      next: (data) => {
        this.holidays = [...data];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to prefetch holidays', err),
    });
  }

  onFetch({ country, year }: { country: string; year: number }) {
    this.selectedYear = year;
    this.selectedCountry = country;
    
    this.api.getHolidays(year, country).subscribe({
      next: (data: any) => {
        this.holidays = [...data];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to fetch holidays', err),
    });
  }

  onSettingsChange({ country, year, availableDays, preference }: { country: string; year: number; availableDays: number; preference: string }) {
    this.selectedCountry = country;
    this.selectedYear = year;
    this.availableDays = availableDays;
    this.selectedPreference = preference;
  }

  startNewPlan(): void {
    if (!this.userId) return;
    
    console.log('🆕 Starting new plan for:', { 
      country: this.selectedCountry, 
      year: this.selectedYear 
    });
    
    this.plan = null;
    this.editMode = false;
    this.cdr.detectChanges();
  }

  togglePlansDropdown(): void {
    this.showPlansDropdown = !this.showPlansDropdown;
    
    // Only load if opening and plans haven't been loaded yet
    if (this.showPlansDropdown && this.userId && this.savedPlans.length === 0) {
      this.loadSavedPlans();
    }
  }

  loadSavedPlans(): void {
    if (!this.userId) return;
    
    this.api.getAllPlans(this.userId).subscribe({
      next: (plans) => {
        this.savedPlans = plans.sort((a, b) => b.year - a.year || a.countryCode.localeCompare(b.countryCode));
        console.log('📚 Loaded saved plans:', this.savedPlans.length);
        this.cdr.detectChanges(); // Trigger UI update after async load
      },
      error: (err) => {
        console.error('❌ Failed to load saved plans:', err);
        this.savedPlans = [];
        this.cdr.detectChanges();
      }
    });
  }

  loadPlan(plan: any): void {
    console.log('📂 Loading plan:', { year: plan.year, country: plan.countryCode });
    
    this.selectedYear = plan.year;
    this.selectedCountry = plan.countryCode;
    this.availableDays = plan.availableDays;
    this.selectedPreference = plan.preference;
    
    // Load holidays first
    this.api.getHolidays(plan.year, plan.countryCode).subscribe({
      next: (holidayData) => {
        this.holidays = [...holidayData];
        this.plan = { ...plan };
        this.showPlansDropdown = false;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to load holidays:', err)
    });
  }

  onPlan(event: { availableDays: number; year: number; country: string; preference: string }) {
    const { availableDays, year, country, preference } = event;
    this.availableDays = availableDays;
    this.selectedYear = year;
    this.selectedCountry = country;

    if (!this.userId) {
      console.warn('⚠️ User not initialized yet, waiting...');
      return;
    }

    this.requestPlan(this.userId, year, country, availableDays, preference, true);
  }

  onManualPlan(event: { availableDays: number; year: number; country: string; preference: string }) {
    const { availableDays, year, country, preference } = event;
    this.availableDays = availableDays;
    this.selectedYear = year;
    this.selectedCountry = country;

    if (!this.userId) {
      console.warn('⚠️ User not initialized yet, waiting...');
      return;
    }

    this.requestPlan(this.userId, year, country, availableDays, preference, false);
  }

  private requestPlan(
    userId: string,
    year: number,
    country: string,
    availableDays: number,
    preference: string = 'balanced',
    generateAI: boolean = true
  ) {
    this.isLoading = true;
    
    // Ensure holidays are loaded for the requested year/country
    this.api.getHolidays(year, country).subscribe({
      next: (holidayData) => {
        this.holidays = [...holidayData];
        
        // Now create the plan
        this.api
          .createPlan(userId, year, country, availableDays, preference, generateAI)
          .subscribe({
            next: (plan) => {
              this.plan = { ...plan };
              this.isLoading = false;
              // Enable edit mode by default for manual planning
              this.editMode = !generateAI;
              // Refresh saved plans list for dropdown
              if (this.isUserClaimed()) {
                this.loadSavedPlans();
              }
              this.cdr.detectChanges();
            },
            error: (err) => {
              console.error('Failed to create plan:', err);
              this.isLoading = false;
              this.cdr.detectChanges();
            }
          });
      },
      error: (err) => {
        console.error('Failed to load holidays:', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onPlanUpdated(updatedPlan: any): void {
    this.plan = { ...updatedPlan };
    this.cdr.detectChanges();
  }

  toggleEditMode(): void {
    this.editMode = !this.editMode;
  }

  regeneratePlan(): void {
    if (!this.userId || !this.plan) {
      alert('Please create a plan first');
      return;
    }
    
    const confirm = window.confirm(
      'This will regenerate your plan with AI and remove all manual changes. Continue?'
    );
    
    if (!confirm) return;

    this.requestPlan(
      this.userId,
      this.plan.year,
      this.plan.countryCode || this.selectedCountry,
      this.plan.availableDays || this.availableDays,
      this.plan.preference || 'balanced',
      true
    );
  }

  optimizeRemaining(): void {
    if (!this.plan?._id) return;

    const remaining = this.getRemainingDays();
    if (remaining <= 0) {
      alert('No remaining vacation days to optimize');
      return;
    }

    const confirm = window.confirm(
      `Optimize ${remaining} remaining vacation day${remaining > 1 ? 's' : ''}? This will keep your existing vacation days and add AI suggestions for the rest.`
    );

    if (!confirm) return;

    this.isLoading = true;
    const preference = this.plan.preference || 'balanced';
    
    this.api.optimizeRemainingDays(this.plan._id, preference).subscribe({
      next: (updatedPlan) => {
        this.plan = { ...updatedPlan };
        this.isLoading = false;
        this.editMode = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to optimize remaining days:', err);
        this.isLoading = false;
        alert('Failed to optimize remaining days');
        this.cdr.detectChanges();
      }
    });
  }

  getRemainingDays(): number {
    if (!this.plan) return this.availableDays;
    const available = this.plan.availableDays || this.availableDays;
    const used = this.plan.usedDays || 0;
    return Math.max(0, available - used);
  }

  getCountryName(code: string): string {
    const countries: Record<string, string> = {
      'NO': 'Norway', 'SE': 'Sweden', 'DK': 'Denmark', 'FI': 'Finland',
      'NL': 'Netherlands', 'IS': 'Iceland', 'DE': 'Germany', 'BE': 'Belgium',
      'FR': 'France', 'ES': 'Spain', 'PT': 'Portugal', 'IT': 'Italy',
      'CH': 'Switzerland', 'AT': 'Austria', 'IE': 'Ireland', 'GB': 'United Kingdom',
      'US': 'United States', 'CA': 'Canada', 'AU': 'Australia', 'NZ': 'New Zealand',
    };
    return countries[code] || code;
  }

  claimPlans(): void {
    if (!this.claimEmail || !this.claimEmail.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    this.isLoading = true;
    this.userService.claimWithEmail(this.claimEmail).subscribe({
      next: (user) => {
        this.userId = user._id;
        this.isLoading = false;
        this.cdr.detectChanges();
        alert(`Success! Your plans are now saved to ${this.claimEmail}`);
      },
      error: (err) => {
        console.error('❌ Failed to claim plans:', err);
        this.isLoading = false;
        this.cdr.detectChanges();
        alert('Failed to save your plan. Please try again.');
      }
    });
  }

  isUserClaimed(): boolean {
    return this.userService.isUserClaimed();
  }

  getUserEmail(): string | null {
    return this.userService.getUserEmail();
  }

  openAuthModal(mode: 'signin' | 'register' = 'signin'): void {
    this.authMode = mode;
    this.showAuthModal = true;
    this.authEmail = '';
  }

  closeAuthModal(): void {
    this.showAuthModal = false;
    this.authEmail = '';
    this.magicLinkSent = false;
    this.magicLinkUrl = '';
  }

  switchAuthMode(): void {
    this.authMode = this.authMode === 'signin' ? 'register' : 'signin';
    this.magicLinkSent = false;
  }

  switchAuthMethod(method: 'passkey' | 'email'): void {
    this.authMethod = method;
    this.magicLinkSent = false;
  }

  async handleAuth(): Promise<void> {
    if (!this.authEmail || !this.authEmail.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    const email = this.authEmail; // Store email before any async operations

    // Magic link flow
    if (this.authMethod === 'email') {
      this.sendMagicLink(email);
      return;
    }

    // Passkey flow
    if (!this.authService.isPasskeySupported()) {
      alert('Passkeys are not supported in your browser. Please use the email link option instead.');
      this.switchAuthMethod('email');
      return;
    }

    this.isLoading = true;
    
    try {
      if (this.authMode === 'register') {
        // Register new passkey (claim anonymous plans)
        const browserId = this.userService['getBrowserId'](); // Access private method
        const result = await this.authService.registerPasskey(email, browserId).toPromise();
        
        if (result && result.verified) {
          this.userService.setCurrentUser(result.user as any);
          this.userId = result.user._id;
          this.closeAuthModal();
          alert(`Success! Your plans are now secured with a passkey for ${result.user.email}`);
        }
      } else {
        // Sign in with existing passkey
        const result = await this.authService.loginWithPasskey(email).toPromise();
        
        if (result && result.verified) {
          this.userService.setCurrentUser(result.user as any);
          this.userId = result.user._id;
          this.closeAuthModal();
          
          // Load user's plans for the current year
          this.loadUserPlans(result.user._id);
          
          alert(`Welcome back, ${result.user.email || result.user.name}!`);
        }
      }
    } catch (err: any) {
      console.error('❌ Auth error:', err);
      
      if (err.error?.error?.includes('already has a passkey')) {
        alert('This email already has a passkey. Please sign in instead.');
        this.authMode = 'signin';
      } else if (err.error?.error?.includes('No passkey found')) {
        alert('No passkey found for this email. Try using email link instead.');
        this.switchAuthMethod('email');
      } else {
        alert('Authentication failed. Please try again.');
      }
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  sendMagicLink(email: string): void {
    this.isLoading = true;
    const browserId = this.userService['getBrowserId']();
    
    console.log('📤 Requesting magic link:', { email, browserId });
    
    this.authService.requestMagicLink(email, browserId).subscribe({
      next: (response) => {
        console.log('📥 Magic link response:', {
          success: response.success,
          hasDevLink: !!response.devLink,
          emailError: response.emailError,
          message: response.message,
        });
        
        this.magicLinkSent = true;
        this.magicLinkUrl = response.devLink || '';
        this.isLoading = false;
        
        if (response.emailError) {
          console.warn('⚠️ Email sending failed, but magic link was generated');
          alert('Email sending failed. Check console for dev link, or contact support.');
        }
        
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('❌ Failed to send magic link:', {
          status: err.status,
          statusText: err.statusText,
          error: err.error,
          message: err.message,
        });
        this.isLoading = false;
        alert(`Failed to generate magic link: ${err.error?.error || err.message}`);
        this.cdr.detectChanges();
      }
    });
  }

  private loadUserPlans(userId: string): void {
    this.loadUserPlanForYearCountry(userId, this.selectedYear, this.selectedCountry);
  }

  private loadUserPlanForYearCountry(userId: string, year: number, country: string): void {
    this.isLoading = true;
    
    console.log('🔍 Loading plan for:', { userId, year, country });
    
    this.api.getPlanByYear(userId, year, country).subscribe({
      next: (plan) => {
        // Backend returns plan only if year/country match
        this.plan = { ...plan };
        
        // Update only non-year/country state from loaded plan
        // (year/country are already set by user's selection)
        this.availableDays = plan.availableDays || this.availableDays;
        this.selectedPreference = plan.preference || this.selectedPreference;
        
        // Ensure holidays are loaded for this plan
        if (!this.holidays.length || this.holidays[0]?.countryCode !== plan.countryCode) {
          this.api.getHolidays(plan.year, plan.countryCode).subscribe({
            next: (holidayData) => {
              this.holidays = [...holidayData];
              this.cdr.detectChanges();
            },
            error: (err) => console.error('Failed to load holidays for plan:', err)
          });
        }
        
        console.log('✅ Plan loaded:', { year: plan.year, country: plan.countryCode, usedDays: plan.usedDays });
        
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        if (err.status === 404) {
          // No plan found for this year/country combination
          console.log('ℹ️ No existing plan for', { year, country });
          
          if (err.error?.existingCountry) {
            console.log(`ℹ️ Note: Plan exists for ${year} but for ${err.error.existingCountry}`);
          }
          
          // Reset plan to show planning method selection
          this.plan = null;
        } else {
          console.error('❌ Failed to load plan:', err);
        }
        
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }
}
