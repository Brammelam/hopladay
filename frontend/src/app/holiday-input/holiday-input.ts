import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-holiday-input',
  standalone: true,
  templateUrl: './holiday-input.html',
  imports: [CommonModule, FormsModule],
})
export class HolidayInputComponent implements OnInit, OnChanges {
  @Input() country?: string;
  @Input() year?: number;
  @Input() days?: number;
  @Input() preference?: string;
  
  @Output() fetch = new EventEmitter<{ country: string; year: number }>();
  @Output() plan = new EventEmitter<any>();
  @Output() manualPlan = new EventEmitter<any>();
  @Output() settingsChange = new EventEmitter<{ country: string; year: number; availableDays: number; preference: string }>();

  countries = [
    { code: 'NO', name: 'Norway' },
    { code: 'SE', name: 'Sweden' },
    { code: 'DK', name: 'Denmark' },
    { code: 'FI', name: 'Finland' },
    { code: 'NL', name: 'The Netherlands' },
    { code: 'IS', name: 'Iceland' },
    { code: 'DE', name: 'Germany' },
    { code: 'BE', name: 'Belgium' },
    { code: 'FR', name: 'France' },
    { code: 'ES', name: 'Spain' },
    { code: 'PT', name: 'Portugal' },
    { code: 'IT', name: 'Italy' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'AT', name: 'Austria' },
    { code: 'IE', name: 'Ireland' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'PL', name: 'Poland' },
    { code: 'CZ', name: 'Czech Republic' },
    { code: 'SK', name: 'Slovakia' },
    { code: 'HU', name: 'Hungary' },
    { code: 'SI', name: 'Slovenia' },
    { code: 'HR', name: 'Croatia' },
    { code: 'EE', name: 'Estonia' },
    { code: 'LV', name: 'Latvia' },
    { code: 'LT', name: 'Lithuania' },
    { code: 'RO', name: 'Romania' },
    { code: 'BG', name: 'Bulgaria' },
    { code: 'GR', name: 'Greece' },
    { code: 'TR', name: 'Turkey' },
    { code: 'RU', name: 'Russia' },
    { code: 'UA', name: 'Ukraine' },
    { code: 'BR', name: 'Brazil' },
    { code: 'MX', name: 'Mexico' },
    { code: 'AR', name: 'Argentina' },
    { code: 'CL', name: 'Chile' },
    { code: 'JP', name: 'Japan' },
    { code: 'CN', name: 'China' },
    { code: 'KR', name: 'South Korea' },
    { code: 'IN', name: 'India' },
    { code: 'ZA', name: 'South Africa' },
  ];

  years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
  selectedCountry = 'NO';
  selectedYear = new Date().getFullYear();
  availableDays = 20;
  preferences = [
    { value: 'balanced', label: 'Balanced' },
    { value: 'many_long_weekends', label: 'Many long weekends' },
    { value: 'few_long_vacations', label: 'Few long vacations' },
    { value: 'summer_vacation', label: 'Summer vacation focus' },
    { value: 'spread_out', label: 'Spread throughout year' },
  ];
  selectedPreference = this.preferences[0]

  ngOnInit() {
    // Initialize from inputs if provided
    this.syncFromInputs();
    
    // Emit initial settings
    this.settingsChange.emit({
      country: this.selectedCountry,
      year: this.selectedYear,
      availableDays: this.availableDays,
      preference: this.selectedPreference.value
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    // Update internal state when parent changes inputs
    if (changes['country'] || changes['year'] || changes['days'] || changes['preference']) {
      console.log('🔄 Input component received updates from parent:', {
        country: changes['country']?.currentValue,
        year: changes['year']?.currentValue,
        days: changes['days']?.currentValue,
        preference: changes['preference']?.currentValue,
      });
      this.syncFromInputs();
    }
  }

  private syncFromInputs() {
    if (this.country) this.selectedCountry = this.country;
    if (this.year) this.selectedYear = this.year;
    if (this.days) this.availableDays = this.days;
    if (this.preference) {
      const pref = this.preferences.find(p => p.value === this.preference);
      if (pref) this.selectedPreference = pref;
    }
  }

  onInputChange() {
    this.fetch.emit({ country: this.selectedCountry, year: this.selectedYear });
    this.settingsChange.emit({
      country: this.selectedCountry,
      year: this.selectedYear,
      availableDays: this.availableDays,
      preference: this.selectedPreference.value
    });
  }

  onPlan() {
    this.plan.emit({
      availableDays: this.availableDays,
      year: this.selectedYear,
      country: this.selectedCountry,
      preference: this.selectedPreference.value,
    });
  }

  onManualPlan() {
    this.manualPlan.emit({
      availableDays: this.availableDays,
      year: this.selectedYear,
      country: this.selectedCountry,
      preference: this.selectedPreference.value,
    });
  }
}
