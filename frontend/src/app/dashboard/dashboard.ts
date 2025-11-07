import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
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
export class DashboardComponent implements OnInit {
  holidays: any[] = [];
  plan: any = null;
  userId = '';

  selectedCountry = 'NO';
  selectedYear = new Date().getFullYear();

  constructor(private api: ApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.prefetchHolidays();
  }

  private prefetchHolidays(): void {
    this.api.getHolidays(this.selectedYear, this.selectedCountry).subscribe({
      next: (data) => (this.holidays = [...data]),
      error: (err) => console.error('Failed to prefetch holidays', err),
    });
  }

  onFetch({ country, year }: { country: string; year: number }) {
    this.selectedYear = year;
    this.api.getHolidays(year, country).subscribe({
      next: (data: any) => (this.holidays = [...data]),
      error: (err) => console.error('Failed to fetch holidays', err),
    });
  }

  onPlan(event: { availableDays: number; year: number; country: string; preference: string }) {
    const { availableDays, year } = event;

    if (!this.userId) {
      this.api
        .createUser({ name: 'Anonymous', email: 'anon@hopladay.app', availableDays })
        .subscribe((user: any) => {
          this.userId = user._id;
          this.requestPlan(user._id, event.year, event.country, event.availableDays, event.preference);
        });
    } else {
      this.requestPlan(this.userId, event.year, event.country, event.availableDays, event.preference);
    }
  }

  private requestPlan(
  userId: string,
  year: number,
  country: string,
  availableDays: number,
  preference: string = 'balanced'
) {
  this.api
    .createPlan(userId, year, country, availableDays, preference)
    .subscribe((plan) => {
      this.plan = { ...plan }; // ensure new reference
      this.cdr.detectChanges(); // trigger immediate UI refresh
    });
}
}
