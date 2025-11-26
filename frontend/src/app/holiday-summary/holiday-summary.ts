import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { DatePipe, NgFor, NgIf } from '@angular/common';

@Component({
  selector: 'app-holiday-summary',
  templateUrl: './holiday-summary.html',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe]
})
export class HolidaySummaryComponent implements OnChanges {
  /**
   * The holiday plan returned by the backend, e.g.:
   * {
   *   year: 2025,
   *   suggestions: [
   *     { startDate: '2025-05-01', endDate: '2025-05-04', vacationDaysUsed: 1, totalDaysOff: 4, description: '...' }
   *   ],
   *   usedDays: 5,
   *   totalDaysOff: 18
   * }
   */
  @Input() plan: any = null;
  @Input() isPremium = false;
  @Input() onUpgradeClick?: () => void;

  totalSuggestions = 0;
  longestBreak: number | null = null;
  averageEfficiency: number | null = null;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['plan'] && this.plan?.suggestions) {
      this.calculateSummaryStats();
    }
  }

  /**
   * Calculates some useful metrics to display or use later.
   */
  private calculateSummaryStats(): void {
    const suggestions = this.plan.suggestions || [];
    this.totalSuggestions = suggestions.filter((s: any) => !s.isManual).length;

    if (suggestions.length > 0) {
      this.longestBreak = Math.max(...suggestions.map((s: any) => s.totalDaysOff));
      this.averageEfficiency = Number(
        (
          suggestions.reduce((acc: number, s: any) => acc + s.totalDaysOff / (s.vacationDaysUsed || 1), 0) /
          suggestions.length
        ).toFixed(2)
      );
    }
  }

  /**
   * Get AI-generated suggestions
   */
  getAISuggestions(): any[] {
    if (!this.plan?.suggestions) return [];
    return this.plan.suggestions.filter((s: any) => !s.isManual);
  }

  /**
   * Get manual suggestions
   */
  getManualSuggestions(): any[] {
    if (!this.plan?.suggestions) return [];
    return this.plan.suggestions.filter((s: any) => s.isManual);
  }

  /**
   * Format a description string for better readability.
   */
  getDescriptionText(s: any): string {
    return s.description
      ? s.description.charAt(0).toUpperCase() + s.description.slice(1)
      : 'Holiday break';
  }

  /**
   * (Optional) Used later if you add an export button.
   */
  exportPlan(): void {
    const data = JSON.stringify(this.plan, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `holiday-plan-${this.plan.year}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
