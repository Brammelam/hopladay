import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
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

  months: { name: string; days: Date[] }[] = [];
  currentYear = new Date().getFullYear();
  today = new Date();

  constructor(private platformService: PlatformService) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.currentYear = this.year || this.plan?.year || new Date().getFullYear();
    this.generateMonths();
  }

  isMobile(): boolean {
    return this.platformService.isMobile();
  }

  tipAlignClass(day: Date): string {
    const dow = day.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
    if ([0, 6].includes(dow)) {
      // Sunday: push left (anchor right edge)
      return 'right-0 translate-x-0 origin-right text-right';
    }
    if ([1, 2].includes(dow)) {
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
      return 'bg-red-500 text-white border-red-500 hover:bg-red-600';
    }

    // Allocated vacation day (user-used day)
    if (isVacationDay) {
      return 'bg-blue-700 text-white border-blue-700 hover:bg-blue-800';
    }

    // Within vacation block (weekend/holiday inside vacation)
    if (isInVacationBlock) {
      return 'bg-blue-400 text-white border-blue-400 hover:bg-blue-500';
    }

    // Weekend
    if (isWeekend(date)) {
      return 'bg-gray-200 text-gray-700 border-gray-300';
    }

    // Regular day
    return 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50';
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
    const block = this.plan?.suggestions?.find((s: any) => {
      const start = new Date(s.startDate);
      const end = new Date(s.endDate);
      return (
        (isAfter(date, start) || isSameDay(date, start)) &&
        (isBefore(date, end) || isSameDay(date, end))
      );
    });
    return block ? block.description : null;
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
}
