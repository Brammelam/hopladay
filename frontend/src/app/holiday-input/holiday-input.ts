import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-holiday-input',
  standalone: true,
  templateUrl: './holiday-input.html',
  imports: [CommonModule, FormsModule],
})
export class HolidayInputComponent {
  @Output() fetch = new EventEmitter<{ country: string; year: number }>();
  @Output() plan = new EventEmitter<any>();

  countries = [
    { code: 'NO', name: 'Norway' },
    { code: 'SE', name: 'Sweden' },
    { code: 'DK', name: 'Denmark' },
    { code: 'NL', name: 'The Netherlands' },
  ];

  years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
  selectedCountry = 'NO';
  selectedYear = new Date().getFullYear();
  selectedPreference = 'balanced';
  availableDays = 25;
  preferences = [
    'balanced',
    'few_long_vacations',
    'many_long_weekends',
  ];

  onInputChange() {
    this.fetch.emit({ country: this.selectedCountry, year: this.selectedYear });
  }

  onPlan() {
    this.plan.emit({
      availableDays: this.availableDays,
      year: this.selectedYear,
      country: this.selectedCountry,
      preference: this.selectedPreference,
    });
  }
}
