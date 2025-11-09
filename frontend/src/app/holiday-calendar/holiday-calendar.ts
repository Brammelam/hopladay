import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { DatePipe, CommonModule } from '@angular/common';
import {
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
  isWeekend,
  isAfter,
  isBefore,
  isSameDay,
  isSameWeek,
  getWeek,
} from 'date-fns';
import { PlatformService } from '../services/platform';
import { ApiService } from '../services/api';

@Component({
  selector: 'app-holiday-calendar',
  standalone: true,
  templateUrl: './holiday-calendar.html',
  imports: [CommonModule, DatePipe],
})
export class HolidayCalendarComponent implements OnChanges {
  @Input() year: number = new Date().getFullYear();
  @Input() holidays: any[] = [];
  @Input() plan: any = null;
  @Input() editable: boolean = false;
  @Input() availableDays: number = 25;
  
  @Output() planUpdated = new EventEmitter<any>();

  months: { name: string; days: Date[] }[] = [];
  currentYear = new Date().getFullYear();
  today = new Date();
  isProcessing = false;

  constructor(
    private platformService: PlatformService,
    private apiService: ApiService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.currentYear = this.year || this.plan?.year || new Date().getFullYear();
    this.generateMonths();
  }

  isMobile(): boolean {
    return this.platformService.isMobile();
  }

  tipAlignClass(day: Date): string {
    const dow = day.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
    if (dow === 0) {
      // Sunday: push left (anchor right edge)
      return 'right-0 translate-x-0 origin-right text-right';
    }
    if (dow === 6) {
      // Sunday: push left (anchor right edge)
      return 'right-[-20px] translate-x-0 origin-right text-right';
    }
    if (dow === 1) {
      // Monday: push right (anchor left edge)
      return 'left-0 translate-x-0 origin-left';
    }
    // Middle of the week: center
    return 'left-1/2 -translate-x-1/2 origin-center';
  }

  /**
   * Generates all months of the year, aligned to Monday–Sunday weeks.
   */
  private generateMonths(): void {
    const months: { name: string; days: Date[] }[] = [];

    for (let m = 0; m < 12; m++) {
      const start = startOfWeek(startOfMonth(new Date(this.currentYear, m, 1)), {
        weekStartsOn: 1,
      });
      const end = endOfWeek(endOfMonth(new Date(this.currentYear, m, 1)), { weekStartsOn: 1 });
      const days = eachDayOfInterval({ start, end });
      const monthName = format(new Date(this.currentYear, m, 1), 'MMMM');

      months.push({ name: monthName, days });
    }

    this.months = months;
  }

  /**
   * Returns Tailwind classes for each calendar date.
   */
  getDateClass(date: Date): string {
    const isHoliday = this.isHoliday(date);
    const isManualDay = this.isManualDay(date);
    const isVacationDay = this.isVacationDay(date);
    const isInVacationBlock = this.isInVacationBlock(date);

    // Today
    if (isSameDay(date, this.today)) {
      return 'border-blue-600 bg-blue-50 text-blue-800 font-semibold';
    }

    // Current week
    if (isSameWeek(date, this.today, { weekStartsOn: 1 })) {
      return 'bg-blue-100 border-blue-200';
    }
    
    // Public holiday
    if (isHoliday) {
      const clickable = this.editable ? 'cursor-pointer' : '';
      return `bg-red-500 text-white border-red-500 hover:bg-red-600 ${clickable}`;
    }

    // Manual vacation day
    if (isManualDay) {
      const clickable = this.editable ? 'cursor-pointer ring-2 ring-green-400' : '';
      return `bg-green-600 text-white border-green-600 hover:bg-green-700 ${clickable}`;
    }

    // Allocated vacation day (from suggestions)
    if (isVacationDay) {
      const clickable = this.editable ? 'cursor-pointer' : '';
      return `bg-blue-700 text-white border-blue-700 hover:bg-blue-800 ${clickable}`;
    }

    // Within vacation block (weekend/holiday inside vacation)
    if (isInVacationBlock) {
      return 'bg-blue-400 text-white border-blue-400 hover:bg-blue-500';
    }

    // Weekend
    if (isWeekend(date)) {
      return 'bg-gray-200 text-gray-700 border-gray-300';
    }

    // Regular day - clickable if editable and has remaining days
    const clickable = this.editable && this.getRemainingDays() > 0 ? 'cursor-pointer hover:bg-green-50 hover:border-green-300' : '';
    return `bg-white text-gray-700 border-gray-200 hover:bg-gray-50 ${clickable}`;
  }

  /**
   * Checks if a date is a public holiday (Nager API).
   */
  private isHoliday(date: Date): boolean {
    return this.holidays.some((h) => {
      const [year, month, day] = h.date.split('-').map(Number);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    });
  }

  /**
   * Checks if a date is part of a vacation block (any plan suggestion).
   */
  private isInVacationBlock(date: Date): boolean {
    if (!this.plan?.suggestions) return false;
    return this.plan.suggestions.some((s: any) => {
      const start = new Date(s.startDate);
      const end = new Date(s.endDate);
      return (
        (isAfter(date, start) || isSameDay(date, start)) &&
        (isBefore(date, end) || isSameDay(date, end))
      );
    });
  }

  /**
   * Checks if the day is a *personal* vacation day — i.e. non-weekend/non-holiday inside a vacation block.
   */
  private isVacationDay(date: Date): boolean {
    return this.isInVacationBlock(date) && !isWeekend(date) && !this.isHoliday(date);
  }

  /**
   * Returns holiday object for a given date.
   */
  getHoliday(date: Date) {
    return this.holidays.find((h) => {
      const [year, month, day] = h.date.split('-').map(Number);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    });
  }

  /**
   * Returns plan description (if date falls within a vacation suggestion).
   */
  getPlanDescription(date: Date): string | null {
    const block = this.getPlanSuggestion(date);
    return block ? block.description : null;
  }

  /**
   * Returns the full suggestion object for a date (if within a vacation suggestion).
   */
  getPlanSuggestion(date: Date): any | null {
    return this.plan?.suggestions?.find((s: any) => {
      const start = new Date(s.startDate);
      const end = new Date(s.endDate);
      return (
        (isAfter(date, start) || isSameDay(date, start)) &&
        (isBefore(date, end) || isSameDay(date, end))
      );
    }) || null;
  }

  /**
   * Returns ISO week number.
   */
  getWeekNumber(date: Date): number {
    return getWeek(date, { weekStartsOn: 1 });
  }

  /**
   * Determines if a date belongs to the visible month (for opacity handling).
   */
  isCurrentMonth(date: Date, monthIndex: number): boolean {
    return date.getMonth() === monthIndex;
  }
  selectedKey: string | null = null;

  private dayKey(d: Date): string {
    return new Date(d).toISOString().slice(0, 10);
  }

  toggleTooltip(day: Date): void {
    if (!this.isMobile()) return;

    const key = this.dayKey(day);
    this.selectedKey = this.selectedKey === key ? null : key;
  }

  isOpen(day: Date): boolean {
    return this.selectedKey === this.dayKey(day);
  }

  /**
   * Check if a day is a manually added vacation day
   */
  isManualDay(date: Date): boolean {
    if (!this.plan?.suggestions) return false;
    return this.plan.suggestions.some((s: any) => {
      if (!s.isManual) return false;
      const start = new Date(s.startDate);
      const end = new Date(s.endDate);
      return (
        (isAfter(date, start) || isSameDay(date, start)) &&
        (isBefore(date, end) || isSameDay(date, end)) &&
        !isWeekend(date) &&
        !this.isHoliday(date)
      );
    });
  }

  /**
   * Get the manual suggestion containing a date
   */
  getManualSuggestion(date: Date): any {
    if (!this.plan?.suggestions) return null;
    return this.plan.suggestions.find((s: any) => {
      if (!s.isManual) return false;
      const start = new Date(s.startDate);
      const end = new Date(s.endDate);
      return (
        (isAfter(date, start) || isSameDay(date, start)) &&
        (isBefore(date, end) || isSameDay(date, end))
      );
    });
  }

  /**
   * Calculate remaining vacation days
   */
  getRemainingDays(): number {
    if (!this.plan) return this.availableDays;
    const available = this.plan.availableDays || this.availableDays;
    const used = this.plan.usedDays || 0;
    return Math.max(0, available - used);
  }

  /**
   * Handle click on a calendar day
   */
  onDayClick(event: Event, date: Date): void {
    if (!this.editable || this.isProcessing) return;

    event.stopPropagation();
    this.selectedKey = null;

    const isHoliday = this.isHoliday(date);
    const isWeekendDay = isWeekend(date);
    const isManual = this.isManualDay(date);
    const isVacation = this.isVacationDay(date);

    // Can't interact with holidays or weekends
    if (isHoliday || isWeekendDay) return;

    if (isManual) {
      // Remove manual day
      this.removeManualVacationDay(date);
    } else if (isVacation) {
      // Remove from suggestion
      this.removeSuggestionDay(date);
    } else {
      // Add manual day
      if (this.getRemainingDays() > 0) {
        this.addManualVacationDay(date);
      }
    }
  }

  /**
   * Remove a vacation day from a suggestion
   */
  private removeSuggestionDay(date: Date): void {
    if (!this.plan?._id) return;

    const suggestion = this.plan.suggestions?.find((s: any) => {
      const start = new Date(s.startDate);
      const end = new Date(s.endDate);
      return (
        (isAfter(date, start) || isSameDay(date, start)) &&
        (isBefore(date, end) || isSameDay(date, end))
      );
    });

    if (!suggestion?._id) return;

    const dateStr = format(date, 'yyyy-MM-dd');

    this.isProcessing = true;
    this.apiService.removeDayFromSuggestion(this.plan._id, suggestion._id, dateStr).subscribe({
      next: (updatedPlan) => {
        this.isProcessing = false;
        this.planUpdated.emit(updatedPlan);
      },
      error: (err) => {
        console.error('Failed to remove day:', err);
        this.isProcessing = false;
        const message = err.error?.error || 'Failed to remove vacation day';
        alert(message);
      }
    });
  }

  /**
   * Add a manual vacation day
   */
  private addManualVacationDay(date: Date): void {
    if (!this.plan?._id) return;

    const dateStr = format(date, 'yyyy-MM-dd');
    const beforeCount = this.plan.suggestions?.length || 0;
    
    this.isProcessing = true;

    this.apiService.addManualDays(this.plan._id, [{ date: dateStr }]).subscribe({
      next: (updatedPlan) => {
        this.isProcessing = false;
        this.planUpdated.emit(updatedPlan);
      },
      error: (err) => {
        console.error('Failed to add manual day:', err);
        this.isProcessing = false;
        const errorMsg = err.error?.error || 'Failed to add vacation day';
        const details = err.error?.details || '';
        const fullMessage = details ? `${errorMsg}\n\nReason: ${details}` : errorMsg;
        alert(fullMessage);
      }
    });
  }

  /**
   * Remove a manual vacation day (same as removing a suggestion)
   */
  private removeManualVacationDay(date: Date): void {
    this.removeSuggestionDay(date);
  }
}
