import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { catchError, of, Subscription, switchMap } from 'rxjs';
import { HolidayInputComponent } from '../holiday-input/holiday-input';
import { HolidayCalendarComponent } from '../holiday-calendar/holiday-calendar';
import { HolidaySummaryComponent } from '../holiday-summary/holiday-summary';
import { ApiService } from '../services/api';
import { UserService } from '../services/user.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { AuthModalComponent } from '../auth-modal/auth-modal';
import { ExportService } from '../services/export.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.html',
  imports: [
    CommonModule,
    FormsModule,
    HolidayInputComponent,
    HolidayCalendarComponent,
    HolidaySummaryComponent,
    AuthModalComponent,
  ],
})
export class DashboardComponent implements OnInit, OnDestroy {
  holidays: any[] = [];
  plan: any = null;
  userId = '';
  isUserReady = false;

  selectedCountry = 'NO';
  selectedYear = new Date().getFullYear();
  availableDays = 20;

  editMode = false;
  isLoading = false;
  showStickyStats = false;
  showAuthModal = false;

  // Preference selection flow
  showPreferenceSelector = false;
  preferenceSelectionFor: 'ai' | 'optimize' | 'regenerate' = 'ai';
  selectedPreference = 'balanced';
  preferences = [
    { value: 'balanced', label: 'Balanced', description: 'Mix of short and long breaks' },
    { value: 'many_long_weekends', label: 'Long weekends', description: '3-4 day breaks throughout the year' },
    { value: 'few_long_vacations', label: 'Long vacations', description: 'Extended 7-14 day vacations' },
    { value: 'summer_vacation', label: 'Summer focus', description: 'Maximize summer time off' },
    { value: 'spread_out', label: 'Spread out', description: 'Evenly distributed throughout year' },
  ];

  authMode: 'signin' | 'register' = 'signin';
  authMethod: 'passkey' | 'email' = 'passkey';
  authEmail = '';
  magicLinkSent = false;
  magicLinkUrl = '';

  showPlansDropdown = false;
  savedPlans: any[] = [];
  showExportMenu = false;

  private scrollHandler: () => void;
  private userSubscription?: Subscription;

  constructor(
    private api: ApiService,
    private userService: UserService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private toastService: ToastService,
    private exportService: ExportService
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
      if (this.showExportMenu && !target.closest('.relative')) {
        this.showExportMenu = false;
        this.cdr.detectChanges();
      }
    });

    // Subscribe to auth state changes
    this.userSubscription = this.userService.currentUser$.subscribe((user) => {
      if (user) {
        this.userId = user._id;
        this.isUserReady = true;
        this.cdr.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.scrollHandler);
    this.userSubscription?.unsubscribe();
  }

  /** ────────────────────────────────
   *  INITIALIZATION
   *  ─────────────────────────────── */
  private initializeUser(): void {
    const currentUser = this.userService.getCurrentUser();

    if (currentUser) {
      this.userId = currentUser._id;
      this.isUserReady = true;

      if (currentUser.email) {
        this.loadUserPlans(currentUser._id);
        this.loadSavedPlans();
      }

      this.cdr.detectChanges();
      return;
    }

    // Anonymous session init
    this.userService.initializeUser(this.availableDays).subscribe({
      next: (user) => {
        this.userId = user._id;
        this.isUserReady = true;

        if (user.email) {
          this.loadUserPlans(user._id);
          this.loadSavedPlans();
        }

        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to initialize user:', err),
    });
  }

  private prefetchHolidays(): void {
    this.api.getHolidays(this.selectedYear, this.selectedCountry).subscribe({
      next: (data) => (this.holidays = [...data]),
      error: (err) => console.error('Failed to prefetch holidays', err),
    });
  }

  /** ────────────────────────────────
   *  INPUT / SETTINGS
   *  ─────────────────────────────── */
  onFetch({ country, year }: { country: string; year: number }) {
    this.selectedYear = year;
    this.selectedCountry = country;
    this.api.getHolidays(year, country).subscribe({
      next: (data) => (this.holidays = [...data]),
      error: (err) => console.error('Failed to fetch holidays', err),
    });
  }

  onSettingsChange({
    country,
    year,
    availableDays,
  }: {
    country: string;
    year: number;
    availableDays: number;
  }) {
    this.selectedCountry = country;
    this.selectedYear = year;
    this.availableDays = availableDays;
  }

  /** ────────────────────────────────
   *  PLANNING LOGIC
   *  ─────────────────────────────── */
  // Show preference selector for AI plan
  onPlan() {
    if (!this.validateInputs()) return;
    // Reset to default preference for new AI plan
    this.selectedPreference = 'balanced';
    this.preferenceSelectionFor = 'ai';
    this.showPreferenceSelector = true;
    this.cdr.markForCheck();
  }

  // Create manual plan directly (no AI preference needed yet)
  onManualPlan() {
    if (!this.validateInputs()) return;
    // Create empty plan for manual planning - no AI preference needed
    this.requestPlan(this.userId, this.selectedYear, this.selectedCountry, this.availableDays, 'balanced', false);
  }

  // Execute plan generation with selected preference
  confirmPreferenceSelection() {
    console.log(`Confirming preference selection: ${this.selectedPreference} for ${this.preferenceSelectionFor}`);
    this.showPreferenceSelector = false;
    this.cdr.markForCheck();
    
    if (this.preferenceSelectionFor === 'ai') {
      this.requestPlan(this.userId, this.selectedYear, this.selectedCountry, this.availableDays, this.selectedPreference, true);
    } else if (this.preferenceSelectionFor === 'optimize') {
      this.executeOptimizeRemaining();
    } else if (this.preferenceSelectionFor === 'regenerate') {
      this.regenerateWithNewStrategy();
    }
  }

  // Select a preference in the modal
  selectPreference(value: string) {
    console.log(`User selected preference: ${value}`);
    this.selectedPreference = value;
    this.cdr.markForCheck();
  }

  cancelPreferenceSelection() {
    this.showPreferenceSelector = false;
  }

  // Open regenerate modal with current preference pre-selected
  openRegenerateModal() {
    if (!this.plan) return;
    this.selectedPreference = this.plan.preference || 'balanced';
    this.preferenceSelectionFor = 'regenerate';
    this.showPreferenceSelector = true;
    this.cdr.markForCheck();
  }

  // Regenerate plan with new strategy (preserves manual days)
  regenerateWithNewStrategy() {
    if (!this.plan?._id) return;

    this.isLoading = true;

    console.log(`Regenerating with strategy: ${this.selectedPreference}`);

    // Use regenerate endpoint which keeps manual days and regenerates AI suggestions
    this.api.regeneratePlanWithStrategy(this.plan._id, this.selectedPreference).subscribe({
      next: (updatedPlan) => {
        console.log(`Plan regenerated from API, preference: ${updatedPlan.preference}`);
        this.plan = { ...updatedPlan };
        this.isLoading = false;
        this.toast(`Plan regenerated with ${this.getPreferenceLabel(updatedPlan.preference)} strategy!`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to regenerate plan:', err);
        this.isLoading = false;
        this.toast('Failed to regenerate plan. Please try again.');
      },
    });
  }

  // Get human-readable preference label
  getPreferenceLabel(value: string): string {
    const pref = this.preferences.find(p => p.value === value);
    return pref ? pref.label : value.replace(/_/g, ' ');
  }

  private validateInputs(): boolean {
    if (!this.isUserReady) {
      this.toast('Initializing session, please wait...');
      return false;
    }
    if (!this.selectedCountry || !this.selectedYear || !this.availableDays) {
      this.toast('Please select year, country, and available days first.');
      return false;
    }
    return true;
  }

  private requestPlan(
  userId: string,
  year: number,
  country: string,
  availableDays: number,
  preference: string = 'balanced',
  generateAI = true
) {
  console.log(`Generating ${generateAI ? 'AI' : 'manual'} plan for`, { userId, year, country, preference, availableDays });
  this.isLoading = true;

  this.api
    .getHolidays(year, country)
    .pipe(
      switchMap((holidayData) => {
        this.holidays = [...holidayData];
        console.log(`Calling API createPlan with preference: ${preference}`);
        return this.api.createPlan(userId, year, country, availableDays, preference, generateAI);
      }),
      catchError((err) => {
        console.error('Failed during plan generation pipeline:', err);
        this.toast('Could not load holidays or generate plan.');
        this.isLoading = false;
        this.cdr.detectChanges();
        return of(null);
      })
    )
    .subscribe((plan) => {
      if (!plan) return; // handled in catchError

      console.log('Plan successfully generated:', { 
        preference: plan.preference, 
        suggestions: plan.suggestions?.length,
        usedDays: plan.usedDays 
      });
      this.plan = { ...plan };
      this.editMode = !generateAI;
      this.isLoading = false;

      if (this.isUserClaimed()) this.loadSavedPlans();

      this.toast(`Plan generated with ${this.getPreferenceLabel(plan.preference)} strategy!`, 'success');
      this.cdr.detectChanges();
    });
}

  onPlanUpdated(updatedPlan: any): void {
    this.plan = { ...updatedPlan };
    this.cdr.detectChanges();
  }

  // Show preference selector for optimize
  optimizeRemaining(): void {
    if (!this.plan?._id) return;

    const remaining = this.getRemainingDays();
    if (remaining <= 0) {
      this.toast('No remaining vacation days to optimize.');
      return;
    }

    // Pre-select current plan's preference
    this.selectedPreference = this.plan.preference || 'balanced';
    this.preferenceSelectionFor = 'optimize';
    this.showPreferenceSelector = true;
    this.cdr.markForCheck();
  }

  // Execute optimization with selected preference
  private executeOptimizeRemaining(): void {
    if (!this.plan?._id) return;

    const remaining = this.getRemainingDays();
    this.isLoading = true;

    console.log(`Optimizing with preference: ${this.selectedPreference}`);

    this.api.optimizeRemainingDays(this.plan._id, this.selectedPreference).subscribe({
      next: (updatedPlan) => {
        console.log(`Plan updated from API, preference: ${updatedPlan.preference}`);
        this.plan = { ...updatedPlan };
        this.isLoading = false;
        this.editMode = false;
        this.toast(`Optimized with ${this.getPreferenceLabel(updatedPlan.preference)} strategy!`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to optimize remaining days:', err);
        this.isLoading = false;
        this.toast('Failed to optimize remaining days.');
        this.cdr.detectChanges();
      },
    });
  }

  /** ────────────────────────────────
   *  PLAN MANAGEMENT
   *  ─────────────────────────────── */
  loadUserPlans(userId: string): void {
    this.loadUserPlanForYearCountry(userId, this.selectedYear, this.selectedCountry);
  }

  private loadUserPlanForYearCountry(userId: string, year: number, country: string): void {
    this.isLoading = true;
    this.api.getPlanByYear(userId, year, country).subscribe({
      next: (plan) => {
        this.plan = { ...plan };
        this.availableDays = plan.availableDays || this.availableDays;
        this.selectedPreference = plan.preference || this.selectedPreference;

        if (!this.holidays.length || this.holidays[0]?.countryCode !== plan.countryCode) {
          this.api.getHolidays(plan.year, plan.countryCode).subscribe({
            next: (holidayData) => (this.holidays = [...holidayData]),
            error: (err) => console.error('Failed to load holidays for plan:', err),
          });
        }

        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        if (err.status === 404) this.plan = null;
        else console.error('Failed to load plan:', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  loadSavedPlans(): void {
    if (!this.userId) return;

    this.api.getAllPlans(this.userId).subscribe({
      next: (plans) => {
        this.savedPlans = plans.sort(
          (a, b) => b.year - a.year || a.countryCode.localeCompare(b.countryCode)
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load saved plans:', err);
        this.savedPlans = [];
        this.cdr.detectChanges();
      },
    });
  }

   togglePlansDropdown(): void {
    this.showPlansDropdown = !this.showPlansDropdown;
    
    // Only load if opening and plans haven't been loaded yet
    if (this.showPlansDropdown && this.userId && this.savedPlans.length === 0) {
      this.loadSavedPlans();
    }
  }

  startNewPlan(): void {
    if (!this.userId) return;
    
    this.plan = null;
    this.editMode = false;
    this.cdr.detectChanges();
  }

  exportToICS(): void {
    if (!this.plan) {
      this.toast('No plan to export');
      return;
    }
    const countryName = this.getCountryName(this.selectedCountry);
    this.exportService.exportToICS(this.plan, countryName);
    this.toast('Calendar file downloaded! Import it into Google Calendar, Outlook, or Apple Calendar.');
    this.showExportMenu = false;
  }

  exportToPDF(): void {
    if (!this.plan) {
      this.toast('No plan to export');
      return;
    }
    const countryName = this.getCountryName(this.selectedCountry);
    this.exportService.exportToPDF(this.plan, countryName, this.holidays);
    this.showExportMenu = false;
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

  loadPlan(plan: any): void {    
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

  /** ────────────────────────────────
   *  AUTHENTICATION
   *  ─────────────────────────────── */
  async handleAuth(): Promise<void> {
    console.log('🟢 submit emitted, auth method: ' + this.authMethod);
    if (!this.authEmail || !this.authEmail.includes('@')) {
      console.log("invalid: " + this.authEmail)
      this.toast('Please enter a valid email address.');
      return;
    }

    const email = this.authEmail;

    if (this.authMethod === 'email') {
      this.sendMagicLink(email);
      return;
    }

    if (!this.authService.isPasskeySupported()) {
      this.toast('Passkeys not supported in this browser. Use email link instead.');
      this.switchAuthMethod('email');
      return;
    }

    this.isLoading = true;
    try {
      if (this.authMode === 'register') {
        const browserId = this.userService['getBrowserId']();
        const result = await this.authService.registerPasskey(email, browserId).toPromise();
        if (result?.verified) {
          this.userService.setCurrentUser(result.user as any);
          this.userId = result.user._id;
          this.closeAuthModal();
          this.toast(`Plans secured for ${result.user.email}`);
        }
      } else {
        const result = await this.authService.loginWithPasskey(email).toPromise();
        if (result?.verified) {
          this.userService.setCurrentUser(result.user as any);
          this.userId = result.user._id;
          this.loadUserPlans(result.user._id);
          this.closeAuthModal();
          this.toast(`Welcome back, ${result.user.email || result.user.name}`);
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.error?.error?.includes('already has a passkey')) {
        this.toast('This email already has a passkey. Please sign in.');
        this.authMode = 'signin';
      } else if (err.error?.error?.includes('No passkey found')) {
        this.toast('No passkey found for this email. Use email link instead.');
        this.switchAuthMethod('email');
      } else {
        this.toast('Authentication failed. Try again.');
      }
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  sendMagicLink(email: string): void {
    console.log("sending magic link");
    this.isLoading = true;
    const browserId = this.userService['getBrowserId']();

    this.authService.requestMagicLink(email, browserId).subscribe({
      next: (response) => {
        if (!response.success || response.emailError){
          this.toast('Failed to send magic link. Please check your email address.');
          this.isLoading = false;
          this.cdr.detectChanges();
          return;
        }
        this.magicLinkSent = true;
        this.magicLinkUrl = response.devLink || '';
        this.isLoading = false;
        if (response.emailError) {
          this.toast('Email failed, check console for dev link.');
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Magic link error:', err);
        this.toast('Failed to generate magic link.');
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  switchAuthMode(): void {
    this.authMode = this.authMode === 'signin' ? 'register' : 'signin';
    this.magicLinkSent = false;
  }

  switchAuthMethod(method: 'passkey' | 'email'): void {
    console.log("Method is: " + method);
    this.authMethod = method;
    this.magicLinkSent = false;
    this.cdr.detectChanges();
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

  logout(): void {
  console.log('Logging out user');

  // Clear authentication info
  this.userService.clearCurrentUser(); // if your service has a method for this

  // Reset local state
  this.userId = '';
  this.plan = null;
  this.savedPlans = [];
  this.showAuthModal = false;
  this.magicLinkSent = false;
  this.authEmail = '';
  this.authMode = 'signin';
  this.authMethod = 'passkey';

  // Let the user know
  this.toast('You have been logged out.');

  // Trigger UI refresh
  this.cdr.detectChanges();
}


  /** ────────────────────────────────
   *  UTILITIES / UI
   *  ─────────────────────────────── */
  isUserClaimed(): boolean {
    return this.userService.isUserClaimed();
  }

  getUserEmail(): string | null {
    return this.userService.getUserEmail();
  }

  getRemainingDays(): number {
    if (!this.plan) return this.availableDays;
    const available = this.plan.availableDays || this.availableDays;
    const used = this.plan.usedDays || 0;
    return Math.max(0, available - used);
  }

  toggleEditMode(): void {
    this.editMode = !this.editMode;
  }

  toast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
    this.toastService.show(message, type);
}
}
