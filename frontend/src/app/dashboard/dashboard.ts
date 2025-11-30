import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { catchError, finalize, of, Subscription, switchMap } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { HolidayInputComponent } from '../holiday-input/holiday-input';
import { HolidayCalendarComponent } from '../holiday-calendar/holiday-calendar';
import { HolidaySummaryComponent } from '../holiday-summary/holiday-summary';
import { ApiService } from '../services/api';
import { UserService } from '../services/user.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { AuthModalComponent } from '../auth-modal/auth-modal';
import { ExportService } from '../services/export.service';
import { SEOService } from '../services/seo.service';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../shared/translate.pipe';
import { LanguageSwitcherComponent } from '../shared/language-switcher';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.html',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    HolidayInputComponent,
    HolidayCalendarComponent,
    HolidaySummaryComponent,
    AuthModalComponent,
    LucideAngularModule,
    TranslatePipe,
    LanguageSwitcherComponent,
  ]
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
    { value: 'balanced', labelKey: 'strategy.balanced', descriptionKey: 'strategy.balancedDesc', premium: false },
    { value: 'many_long_weekends', labelKey: 'strategy.longWeekends', descriptionKey: 'strategy.longWeekendsDesc', premium: true },
    { value: 'few_long_vacations', labelKey: 'strategy.longVacations', descriptionKey: 'strategy.longVacationsDesc', premium: true },
    { value: 'summer_vacation', labelKey: 'strategy.summerFocus', descriptionKey: 'strategy.summerFocusDesc', premium: true },
    { value: 'spread_out', labelKey: 'strategy.spreadOut', descriptionKey: 'strategy.spreadOutDesc', premium: true },
  ];

  getAvailablePreferences() {
    // Always show all preferences, premium ones will be tagged and require upgrade
    return this.preferences;
  }

  authMode: 'signin' | 'register' = 'signin';
  authMethod: 'passkey' | 'email' = 'passkey';
  authEmail = '';
  magicLinkSent = false;
  magicLinkUrl = '';

  showPlansDropdown = false;
  savedPlans: any[] = [];
  showExportMenu = false;
  isPremium = false;
  showPremiumModal = false;
  isProcessingPayment = false;
  premiumModalOpenedFromStrategySelector = false;
  
  // Tab state for plan view
  activeTab: 'calendar' | 'suggestions' = 'calendar';
  
  switchTab(tab: 'calendar' | 'suggestions'): void {
    this.activeTab = tab;
    // Scroll to top of plan section when switching tabs
    const planSection = document.querySelector('[aria-labelledby="plan-heading"]');
    if (planSection) {
      planSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  private scrollHandler: () => void;
  private userSubscription?: Subscription;

  constructor(
    private api: ApiService,
    private userService: UserService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private toastService: ToastService,
    private exportService: ExportService,
    private router: Router,
    private route: ActivatedRoute,
    private seoService: SEOService,
    public translationService: TranslationService
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
    // Check if there's a token in query params (from magic link)
    // If so, redirect to auth verify route
    // Use multiple methods for iOS compatibility
    let token = this.route.snapshot.queryParamMap.get('token');
    
    // Fallback: Parse directly from URL (iOS Safari sometimes has issues with Angular router)
    if (!token && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      token = urlParams.get('token');
    }
    
    if (token) {
      const currentLang = this.translationService.currentLang();
      // Use window.location for iOS compatibility instead of router.navigate
      // This ensures the token is preserved during redirect
      const verifyUrl = `/${currentLang}/auth/verify?token=${encodeURIComponent(token)}`;
      window.location.href = verifyUrl;
      return;
    }

    this.seoService.updateSEO({
      url: `https://hopladay.com/${this.translationService.currentLang()}`,
      title: 'Hopladay - Maximize your days off',
      description: 'Hopladay finds the most efficient way to book time off by combining national holidays and weekends. Turn 3 vacation days into 8–10 days off. Free vacation optimizer, multi-country support',
      keywords: 'holiday planner, vacation app, vacation planner, maximize vacation days, optimize holidays, vacation scheduler, holiday calendar, time off planner, vacation planning tool, holiday optimizer, vacation days calculator, AI vacation planner'
    }, this.translationService.currentLang());
    this.initializeUser();
    this.prefetchHolidays();
    window.addEventListener('scroll', this.scrollHandler);
    this.checkPaymentStatus();

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
        this.isPremium = user.isPremium || false;
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
      console.log('✅ Using existing user:', {
        userId: currentUser._id,
        email: currentUser.email,
        isPremium: currentUser.isPremium,
      });
      this.userId = currentUser._id;
      this.isUserReady = true;

      if (currentUser.email) {
        this.loadUserPlans(currentUser._id);
        this.loadSavedPlans();
      }
      
      this.isPremium = currentUser.isPremium || false;
      this.cdr.detectChanges();
      return;
    }

    // Check if we're coming from auth verify (don't create anonymous user if we just authenticated)
    const isFromAuthVerify = this.router.url.includes('/auth/verify');
    if (isFromAuthVerify) {
      console.log('⚠️ Coming from auth verify but no user found. Waiting for user to be set...');
      // Wait a bit for user to be set from auth verify
      setTimeout(() => {
        const user = this.userService.getCurrentUser();
        if (user) {
          console.log('✅ User found after delay:', user.email);
          this.userId = user._id;
          this.isUserReady = true;
          if (user.email) {
            this.loadUserPlans(user._id);
            this.loadSavedPlans();
          }
          this.isPremium = user.isPremium || false;
          this.cdr.detectChanges();
        } else {
          console.warn('⚠️ Still no user after delay, initializing anonymous session');
          this.initializeAnonymousUser();
        }
      }, 500);
      return;
    }

    // Before creating anonymous user, check if there's an authenticated user in localStorage
    // that might not have been restored yet (iOS Safari timing issue or auth in progress)
    try {
      const storedUserStr = localStorage.getItem('hopladay_user');
      if (storedUserStr) {
        const storedUser = JSON.parse(storedUserStr);
        // If there's an authenticated user (with email) in storage, use it instead of creating anonymous
        if (storedUser && storedUser.email) {
          console.log('✅ Found authenticated user in localStorage, restoring:', storedUser.email);
          this.userService.setCurrentUser(storedUser);
          this.userId = storedUser._id;
          this.isUserReady = true;
          this.loadUserPlans(storedUser._id);
          this.loadSavedPlans();
          this.isPremium = storedUser.isPremium || false;
          this.cdr.detectChanges();
          return;
        }
      }

      // Also check if authentication is in progress (magic link just verified)
      const authInProgress = localStorage.getItem('hopladay_auth_in_progress');
      if (authInProgress === 'true') {
        console.log('⏳ Authentication in progress, waiting for user to be set...');
        // Wait a bit longer for the user to be saved
        setTimeout(() => {
          const user = this.userService.getCurrentUser();
          if (user && user.email) {
            console.log('✅ Authenticated user found after auth in progress:', user.email);
            this.userId = user._id;
            this.isUserReady = true;
            this.loadUserPlans(user._id);
            this.loadSavedPlans();
            this.isPremium = user.isPremium || false;
            this.cdr.detectChanges();
          } else {
            console.warn('⚠️ No authenticated user found after auth in progress, initializing anonymous');
            this.initializeAnonymousUser();
          }
        }, 1000);
        return;
      }
    } catch (err) {
      console.warn('Failed to check localStorage for user:', err);
    }

    // Anonymous session init (only if no authenticated user exists)
    this.initializeAnonymousUser();
  }

  private initializeAnonymousUser(): void {
    this.userService.initializeUser(this.availableDays).subscribe({
      next: (user) => {
        this.userId = user._id;
        this.isUserReady = true;

        if (user.email) {
          this.loadUserPlans(user._id);
          this.loadSavedPlans();
        }
        
        this.isPremium = user.isPremium || false;
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
    this.selectedPreference = 'balanced';
    this.preferenceSelectionFor = 'ai';
    this.showPreferenceSelector = true;
    this.cdr.markForCheck();
  }
  
  // Check if a preference requires premium
  isPremiumPreference(value: string): boolean {
    const pref = this.preferences.find(p => p.value === value);
    return pref?.premium || false;
  }
  
  // Handle premium preference selection attempt
  selectPreference(value: string) {
    if (this.isPremiumPreference(value) && !this.isPremium) {
      // Close preference selector and open premium modal
      // Track that we came from strategy selector so we can return to it
      this.premiumModalOpenedFromStrategySelector = true;
      this.showPreferenceSelector = false;
      this.openPremiumModal();
      return;
    }
    console.log(`User selected preference: ${value}`);
    this.selectedPreference = value;
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
    // Prevent free users from confirming premium strategies
    if (this.isPremiumPreference(this.selectedPreference) && !this.isPremium) {
      // Track that we came from strategy selector so we can return to it
      this.premiumModalOpenedFromStrategySelector = true;
      this.showPreferenceSelector = false;
      this.openPremiumModal();
      return;
    }
    
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
    this.cdr.markForCheck();

    console.log(`Regenerating with strategy: ${this.selectedPreference}`);

    // Use regenerate endpoint which keeps manual days and regenerates AI suggestions
    this.api.regeneratePlanWithStrategy(this.plan._id, this.selectedPreference, this.translationService.currentLang())
      .pipe(
        finalize(() => {
          // Ensure isLoading is always reset, even if observable doesn't complete normally
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (updatedPlan) => {
          console.log(`Plan regenerated from API, preference: ${updatedPlan.preference}`);
          this.plan = { ...updatedPlan };
          this.toast(this.translationService.translate('toast.planRegenerated', { strategy: this.getPreferenceLabel(updatedPlan.preference) }));
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to regenerate plan:', err);
          this.toast('Failed to regenerate plan. Please try again.');
          this.cdr.detectChanges();
        },
      });
  }

  // Get human-readable preference label
  getPreferenceLabel(value: string): string {
    const keyMap: Record<string, string> = {
      'balanced': 'strategy.balanced',
      'many_long_weekends': 'strategy.longWeekends',
      'few_long_vacations': 'strategy.longVacations',
      'summer_vacation': 'strategy.summerFocus',
      'spread_out': 'strategy.spreadOut'
    };
    const key = keyMap[value];
    return key ? this.translationService.translate(key) : value.replace(/_/g, ' ');
  }

  private validateInputs(): boolean {
    if (!this.isUserReady) {
      this.toast(this.translationService.translate('toast.initializing'));
      return false;
    }
    if (!this.selectedCountry || !this.selectedYear || !this.availableDays) {
      this.toast(this.translationService.translate('toast.selectDetails'));
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
        return this.api.createPlan(userId, year, country, availableDays, preference, generateAI, this.translationService.currentLang());
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

      this.toast(this.translationService.translate('toast.planGenerated', { strategy: this.getPreferenceLabel(plan.preference) }), 'success');
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
      this.toast(this.translationService.translate('planning.noRemainingDays'));
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

    this.api.optimizeRemainingDays(this.plan._id, this.selectedPreference, this.translationService.currentLang()).subscribe({
      next: (updatedPlan) => {
        console.log(`Plan updated from API, preference: ${updatedPlan.preference}`);
        this.plan = { ...updatedPlan };
        this.isLoading = false;
        this.editMode = false;
        this.toast(this.translationService.translate('toast.optimized', { strategy: this.getPreferenceLabel(updatedPlan.preference) }));
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
    if (!this.isPremium) {
      this.toast(this.translationService.translate('toast.exportPremiumOnly'), 'info');
      this.showExportMenu = false;
      return;
    }
    if (!this.plan) {
      this.toast('No plan to export');
      return;
    }
    const countryName = this.getCountryName(this.selectedCountry);
    this.exportService.exportToICS(this.plan, countryName);
      this.toast(this.translationService.translate('export.exportDownloaded'));
    this.showExportMenu = false;
  }

  exportToPDF(): void {
    if (!this.isPremium) {
      this.toast(this.translationService.translate('toast.exportPremiumPDF'), 'info');
      this.showExportMenu = false;
      return;
    }
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
      this.toast(this.translationService.translate('toast.loggedOut'));

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

  /** ────────────────────────────────
   *  PREMIUM / PAYMENT
   *  ─────────────────────────────── */
  
  openPremiumModal(): void {
    if (!this.isUserReady || !this.userId) {
      this.toast('Please wait for session to initialize', 'info');
      return;
    }
    // Only set flag if not already set (preserves state when called from strategy selector)
    // If called from elsewhere, don't set the flag
    this.showPremiumModal = true;
  }

  closePremiumModal(): void {
    const shouldReturnToStrategySelector = this.premiumModalOpenedFromStrategySelector;
    
    this.showPremiumModal = false;
    this.premiumModalOpenedFromStrategySelector = false;
    
    // If we came from the strategy selector, reopen it
    if (shouldReturnToStrategySelector) {
      this.showPreferenceSelector = true;
      this.cdr.markForCheck();
    }
  }

  async upgradeToPremium(): Promise<void> {
    if (!this.userId) {
      this.toast('User session not ready. Please try again.', 'error');
      return;
    }

    if (this.isPremium) {
      this.toast('You are already a Premium user!', 'info');
      this.closePremiumModal();
      return;
    }

    this.isProcessingPayment = true;

    try {
      const baseUrl = window.location.origin;
      const currentLang = this.translationService.currentLang();
      const successUrl = `${baseUrl}/${currentLang}/payment/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${baseUrl}/${currentLang}/payment/cancel`;

      this.api.createCheckoutSession(this.userId, successUrl, cancelUrl).subscribe({
        next: (response: any) => {
          if (response.url) {
            // Redirect to Stripe Checkout
            window.location.href = response.url;
          } else {
            this.toast('Failed to create checkout session', 'error');
            this.isProcessingPayment = false;
          }
        },
        error: (err) => {
          console.error('Error creating checkout session:', err);
          this.toast('Failed to start payment process. Please try again.', 'error');
          this.isProcessingPayment = false;
        }
      });
    } catch (err) {
      console.error('Payment error:', err);
      this.toast('An error occurred. Please try again.', 'error');
      this.isProcessingPayment = false;
    }
  }

  checkPaymentStatus(): void {
    this.route.queryParams.subscribe(params => {
      const sessionId = params['session_id'];
      if (sessionId) {
        console.log('Checking payment status for session:', sessionId);
        // Check if payment was successful
        this.api.checkSession(sessionId).subscribe({
          next: (response: any) => {
            console.log('Payment check response:', response);
            if (response.success && response.premium) {
              // Update user premium status
              if (response.user) {
                this.userService.setCurrentUser(response.user);
                this.isPremium = true;
                this.toast(this.translationService.translate('premium.welcomePremium'), 'success');
                // Clear query params and navigate to current language route
                const currentLang = this.translationService.currentLang();
                this.router.navigate([`/${currentLang}`], { queryParams: {} });
                this.cdr.detectChanges();
              } else {
                console.warn('Payment successful but no user data returned');
                this.toast('Payment successful! Refreshing your account...', 'info');
                // Reload user data
                this.initializeUser();
              }
            } else {
              console.log('Payment not completed yet:', response);
              if (response.payment_status === 'unpaid') {
                this.toast('Payment is still processing. Please wait...', 'info');
              }
            }
          },
          error: (err) => {
            console.error('Error checking payment status:', err);
            this.toast('Error verifying payment. Please contact support if payment was completed.', 'error');
          }
        });
      }
    });
  }

  trackByPlanId(index: number, plan: any): string {
    return plan._id || index;
  }

  trackByPreference(index: number, pref: any): string {
    return pref.value || index;
  }

  getLocalizedRoute(route: string): string[] {
    const currentLang = this.translationService.currentLang();
    return [`/${currentLang}${route}`];
  }
}
