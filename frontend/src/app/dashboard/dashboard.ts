import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { HolidayInputComponent } from '../holiday-input/holiday-input';
import { HolidayCalendarComponent } from '../holiday-calendar/holiday-calendar';
import { HolidaySummaryComponent } from '../holiday-summary/holiday-summary';
import { ApiService } from '../services/api';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.html',
  imports: [CommonModule, HolidayInputComponent, HolidayCalendarComponent, HolidaySummaryComponent],
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

  private scrollHandler: () => void;

  constructor(private api: ApiService, private cdr: ChangeDetectorRef) {
    this.scrollHandler = () => {
      const scrolled = window.scrollY > 400;
      if (scrolled !== this.showStickyStats) {
        this.showStickyStats = scrolled;
        this.cdr.detectChanges();
      }
    };
  }

  ngOnInit(): void {
    this.prefetchHolidays();
    window.addEventListener('scroll', this.scrollHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.scrollHandler);
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

  onPlan(event: { availableDays: number; year: number; country: string; preference: string }) {
    const { availableDays, year, country, preference } = event;
    this.availableDays = availableDays;
    this.selectedYear = year;
    this.selectedCountry = country;

    if (!this.userId) {
      this.api
        .createUser({ name: 'Anonymous', email: 'anon@hopladay.app', availableDays })
        .subscribe((user: any) => {
          this.userId = user._id;
          this.requestPlan(user._id, year, country, availableDays, preference, true);
        });
    } else {
      this.requestPlan(this.userId, year, country, availableDays, preference, true);
    }
  }

  onManualPlan(event: { availableDays: number; year: number; country: string; preference: string }) {
    const { availableDays, year, country, preference } = event;
    this.availableDays = availableDays;
    this.selectedYear = year;
    this.selectedCountry = country;

    if (!this.userId) {
      this.api
        .createUser({ name: 'Anonymous', email: 'anon@hopladay.app', availableDays })
        .subscribe((user: any) => {
          this.userId = user._id;
          this.requestPlan(user._id, year, country, availableDays, preference, false);
        });
    } else {
      this.requestPlan(this.userId, year, country, availableDays, preference, false);
    }
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
}
