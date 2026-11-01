import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, finalize, of, switchMap, takeUntil, tap } from 'rxjs';
import { AnnualBreak, AnnualDay, AnnualInput, AnnualInterval, AnnualPlan, AnnualPlannerService, AnnualStrategy, SavedAnnualPlan } from '../services/annual-planner.service';
import { SEOService } from '../services/seo.service';
import { TranslationService } from '../services/translation.service';
import { AuthService } from '../services/auth.service';
import { TranslatePipe } from '../shared/translate.pipe';

const countries = 'NO SE DK FI NL IS DE BE FR ES PT IT CH AT IE GB US CA AU NZ PL CZ SK HU SI HR EE LV LT RO BG GR TR RU UA BR MX AR CL JP CN KR ZA'.split(' ');
const strategyValues: AnnualStrategy[] = ['balanced', 'maximum_time_off', 'longest_vacation'];
function dateList(value: string): string[] { return value.split(/[\s,]+/).filter(Boolean); }
function numberList(value: string): number[] { return dateList(value).map(Number); }
function intervalKey(interval: AnnualInterval): string { return `${interval.startDate}:${interval.endDate}`; }
function storedInterval(value: unknown, year: number): AnnualInterval | null {
  if (!value || typeof value !== 'object' || !('startDate' in value) || !('endDate' in value) || typeof value.startDate !== 'string' || typeof value.endDate !== 'string') return null;
  const startDate = value.startDate, endDate = value.endDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !startDate.startsWith(`${year}-`) || !endDate.startsWith(`${year}-`) || startDate > endDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`), end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.toISOString().slice(0, 10) !== startDate || end.toISOString().slice(0, 10) !== endDate) return null;
  return { startDate, endDate };
}
function intervalDates(interval: AnnualInterval): string[] {
  const result: string[] = [];
  const end = Date.parse(`${interval.endDate}T00:00:00Z`);
  for (let time = Date.parse(`${interval.startDate}T00:00:00Z`); time <= end; time += 86400000) result.push(new Date(time).toISOString().slice(0, 10));
  return result;
}

@Component({
  selector: 'app-annual-planner', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './annual-planner.html', styleUrl: './annual-planner.css',
})
export class AnnualPlannerComponent implements OnInit {
  private api = inject(AnnualPlannerService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private platform = inject(PLATFORM_ID);
  private destroy = inject(DestroyRef);
  private seo = inject(SEOService);
  readonly translation = inject(TranslationService);
  private requests = new Subject<AnnualInput>();
  private cancel = new Subject<void>();
  private baselineRequests = new WeakSet<AnnualInput>();
  private regionRequests = new Subject<{ country: string; year: number }>();
  readonly regions = signal<string[]>([]);
  private revision = 0;
  private lockedBreaks: AnnualInterval[] = [];
  private currentInput: AnnualInput | null = null;
  initialInput: AnnualInput | null = null;
  private settingsKey = 'hopladay_annual_settings';
  readonly result = signal<AnnualPlan | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly authenticated = signal(false);
  readonly premium = signal(false);
  readonly savedPlans = signal<SavedAnnualPlan[]>([]);
  readonly savedId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly exporting = signal(false);
  readonly accepted = signal(new Set<string>());
  readonly selected = signal('');
  readonly selectedDay = signal<AnnualDay | null>(null);
  readonly editing = signal('');
  readonly calendarMonths = computed(() => {
    const calendar = this.result()?.calendar ?? [];
    const year = this.result()?.year ?? this.year;
    return Array.from({ length: 12 }, (_, index) => {
      const days = calendar.filter(day => day.month === index + 1);
      const offset = days.length ? (days[0].weekday + 6) % 7 : 0;
      return { index, name: new Intl.DateTimeFormat(this.locale(), { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, index, 1))), cells: [...Array<null>(offset).fill(null), ...days] };
    });
  });
  readonly countries = countries;
  readonly weekdayNumbers = [1, 2, 3, 4, 5, 6, 0];
  country = 'NO';
  year = new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0);
  availableDays = 20;
  strategy: AnnualStrategy = 'maximum_time_off';
  region = '';
  horizonStart = '';
  horizonEnd = '';
  approvedText = '';
  excludedText = '';
  companyText = '';
  holidayWorkingText = '';
  workingDaysText = '1,2,3,4,5';
  preferredMonthsText = '';
  readonly editedLimits = new Set<string>();
  minBreakLength = 1;
  maxBreakLength: number | null = null;
  preferredBreakLength = 9;
  maxBreaks: number | null = null;
  minSeparationDays: number | null = null;
  seasonalWeight = 1;
  summerDays = 0;
  summerMonthsText = '6,7,8';
  advancedOpen = false;
  analytics = false;
  editStart = '';
  editEnd = '';

  ngOnInit(): void {
    const lang = this.translation.getLanguageFromPath(this.router.url);
    const token = this.route.snapshot.queryParamMap.get('token');
    if (isPlatformBrowser(this.platform) && token?.trim()) {
      this.router.navigate([`/${lang}/auth/verify`], { queryParams: { token }, replaceUrl: true });
      return;
    }
    this.translation.setLanguage(lang);
    this.seo.updateSEO({ title: this.t('title') + ' – Hopladay', description: this.t('intro'), url: `https://www.hopladay.com/${lang}`, noindex: this.route.snapshot.queryParamMap.keys.length > 0 }, lang);
    this.requests.pipe(switchMap(input => {
      this.revision++;
      this.loading.set(true); this.result.set(null); this.error.set(''); this.notice.set(''); this.savedId.set(null); this.editing.set('');
      this.currentInput = structuredClone(input);
      this.lockedBreaks = structuredClone(input.lockedBreaks ?? []);
      this.horizonStart = input.horizon?.startDate ?? ''; this.horizonEnd = input.horizon?.endDate ?? '';
      this.approvedText = (input.approvedLeave ?? []).join(', '); this.excludedText = (input.excludedDates ?? []).join(', ');
      this.persistSettings();
      return this.api.optimize(input).pipe(tap(result => {
        if (result.status === 'ok' && this.baselineRequests.has(input)) this.initialInput = structuredClone(input);
      }), takeUntil(this.cancel), catchError((error: unknown) => { this.showError(error); return of(null); }), finalize(() => this.loading.set(false)));
    }), takeUntilDestroyed(this.destroy)).subscribe(result => {
      if (result) { this.result.set(result); this.api.track('generated'); }
    });
    if (!isPlatformBrowser(this.platform)) return;
    this.regionRequests.pipe(switchMap(({ country, year }) => this.api.holidays(country, year).pipe(catchError(() => of({ regions: [] as string[] })))), takeUntilDestroyed(this.destroy)).subscribe(catalog => {
      this.regions.set(catalog.regions);
      if (this.region && !catalog.regions.includes(this.region)) this.region = '';
    });
    this.restoreSettings();
    this.loadRegions();
    this.analytics = this.api.analyticsEnabled();
    this.api.track('opened');
    this.api.session().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: session => {
        this.authenticated.set(session.authenticated); this.premium.set(session.premium);
        if (session.authenticated) this.refreshSaved();
        this.observeLinkedInputs(true);
      }, error: (error: unknown) => { this.authenticated.set(false); this.premium.set(false); this.showError(error); this.observeLinkedInputs(false); },
    });
  }

  private observeLinkedInputs(automatic: boolean): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(params => {
      if (!params.keys.length) return;
      this.clearSelections();
      this.applyForm({ country: 'NO', year: new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0), availableDays: 20, strategy: 'maximum_time_off', lang: this.translation.currentLang() });
      this.country = params.get('country') ?? this.country;
      this.year = Number(params.get('year') ?? this.year);
      this.availableDays = Number(params.get('availableDays') ?? this.availableDays);
      this.region = params.get('region') ?? '';
      const strategy = params.get('strategy') ?? 'maximum_time_off';
      const validStrategy = strategyValues.find(value => value === strategy);
      if (!validStrategy) { this.error.set(this.t('errorInput')); return; }
      this.strategy = validStrategy;
      this.strategyChanged();
      this.loadRegions();
      if (automatic) this.generate();
    });
  }

  t(key: string): string { return this.translation.translate(`optimizer.${key}`); }
  locale(): string { return this.translation.currentLang() === 'no' ? 'nb' : this.translation.currentLang(); }
  countryName(code: string): string { return new Intl.DisplayNames([this.locale()], { type: 'region' }).of(code) ?? code; }
  formatDate(date: string): string {
    const value = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(value.getTime()) ? new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(value) : date;
  }
  formatRetrieved(value: string): string { return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)); }
  weekdayLabel(weekday: number): string { return new Intl.DateTimeFormat(this.locale(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2027, 0, 3 + weekday))); }
  key(interval: AnnualInterval): string { return intervalKey(interval); }
  dayNumber(date: string): string { return String(Number(date.slice(8, 10))); }
  dayMarker(day: AnnualDay): string {
    return day.excluded ? 'X' : day.approvedLeave ? 'A' : day.recommendedLeave ? 'L' : day.companyHoliday ? 'C' : day.publicHoliday ? 'H' : day.regularNonWorking ? 'N' : '';
  }
  dayLabel(day: AnnualDay): string {
    const flags: string[] = [];
    if (day.publicHoliday) flags.push(this.t('publicHoliday'), ...day.holidayNames);
    if (day.companyHoliday) flags.push(this.t('companyHoliday'));
    if (day.approvedLeave) flags.push(this.t('approved'));
    if (day.recommendedLeave) flags.push(this.t('proposed'));
    if (day.excluded) flags.push(this.t('excluded'));
    if (day.regularNonWorking) flags.push(this.t('nonWorking'));
    if (!flags.length) flags.push(this.t('working'));
    return [this.formatDate(day.date), ...flags].join(', ');
  }
  inSelected(day: AnnualDay): boolean {
    const selected = this.result()?.suggestions.find(interval => intervalKey(interval) === this.selected());
    return !!selected && day.date >= selected.startDate && day.date <= selected.endDate;
  }
  chooseBreak(interval: AnnualBreak): void {
    this.selected.set(intervalKey(interval));
    this.document.getElementById(`annual-day-${interval.startDate}`)?.scrollIntoView({ block: 'nearest' });
  }
  chooseDay(day: AnnualDay): void {
    this.selectedDay.set(day);
    const interval = this.result()?.suggestions.find(item => day.date >= item.startDate && day.date <= item.endDate);
    this.selected.set(interval ? intervalKey(interval) : '');
  }
  navigateDay(event: KeyboardEvent, day: AnnualDay): void {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 7 : event.key === 'ArrowUp' ? -7 : event.key === 'Home' ? -((day.weekday + 6) % 7) : event.key === 'End' ? 6 - ((day.weekday + 6) % 7) : null;
    if (offset === null) return;
    event.preventDefault();
    const date = new Date(`${day.date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    this.document.getElementById(`annual-day-${date.toISOString().slice(0, 10)}`)?.focus();
  }

  generate(): void {
    const input: AnnualInput = { country: this.country, year: this.year, availableDays: this.availableDays, strategy: this.strategy, lang: this.translation.currentLang() };
    if (this.region) input.region = this.region;
    if (this.horizonStart || this.horizonEnd) input.horizon = { startDate: this.horizonStart, endDate: this.horizonEnd };
    if (this.lockedBreaks.length) input.lockedBreaks = structuredClone(this.lockedBreaks);
    if (this.approvedText.trim()) input.approvedLeave = dateList(this.approvedText);
    if (this.excludedText.trim()) input.excludedDates = dateList(this.excludedText);
    if (this.premium()) {
      input.workingDays = numberList(this.workingDaysText);
      input.companyHolidays = dateList(this.companyText);
      input.holidayWorkingDates = dateList(this.holidayWorkingText);
      input.preferredMonths = numberList(this.preferredMonthsText);
      input.minBreakLength = this.minBreakLength; input.preferredBreakLength = this.preferredBreakLength;
      if (this.maxBreakLength !== null) input.maxBreakLength = this.maxBreakLength;
      if (this.maxBreaks !== null) input.maxBreaks = this.maxBreaks;
      if (this.minSeparationDays !== null) input.minSeparationDays = this.minSeparationDays;
      input.seasonalWeight = this.seasonalWeight;
      if (this.summerDays > 0) input.requiredSummerBreak = { minDays: this.summerDays, months: numberList(this.summerMonthsText) };
    }
    this.baselineRequests.add(input); this.selected.set('');
    this.persistSettings(); this.requests.next(input);
  }
  strategyChanged(): void {
    if (!this.editedLimits.has('minBreakLength')) this.minBreakLength = this.strategy === 'balanced' ? 3 : 1;
    if (!this.editedLimits.has('maxBreakLength')) this.maxBreakLength = this.strategy === 'balanced' ? 21 : null;
    if (!this.editedLimits.has('maxBreaks')) this.maxBreaks = this.strategy === 'balanced' ? 4 : null;
    if (!this.editedLimits.has('minSeparationDays')) this.minSeparationDays = this.strategy === 'balanced' ? 21 : null;
    this.api.track('strategy_selected');
  }
  regenerate(): void { if (this.currentInput) { this.api.track('regenerated'); this.requests.next(structuredClone(this.currentInput)); } }
  yearChanged(): void {
    this.clearCurrentPlan();
    this.horizonStart = ''; this.horizonEnd = '';
    this.approvedText = ''; this.excludedText = ''; this.companyText = ''; this.holidayWorkingText = '';
    this.persistSettings(); this.loadRegions();
  }
  countryChanged(): void { this.region = ''; this.clearCurrentPlan(); this.persistSettings(); this.loadRegions(); }
  private clearCurrentPlan(): void {
    this.cancel.next(); this.revision++; this.currentInput = null; this.result.set(null); this.savedId.set(null);
    this.clearSelections(); this.selectedDay.set(null); this.editing.set(''); this.editStart = ''; this.editEnd = ''; this.error.set('');
  }
  private loadRegions(): void {
    this.regions.set([]);
    if (countries.includes(this.country) && Number.isInteger(this.year) && this.year >= 2024 && this.year <= 2100) this.regionRequests.next({ country: this.country, year: this.year });
  }
  regionName(code: string): string {
    const german: Record<string, string> = { 'DE-BW': 'Baden-Württemberg', 'DE-BY': 'Bayern', 'DE-BE': 'Berlin', 'DE-BB': 'Brandenburg', 'DE-HB': 'Bremen', 'DE-HH': 'Hamburg', 'DE-HE': 'Hessen', 'DE-MV': 'Mecklenburg-Vorpommern', 'DE-NI': 'Niedersachsen', 'DE-NW': 'Nordrhein-Westfalen', 'DE-RP': 'Rheinland-Pfalz', 'DE-SL': 'Saarland', 'DE-SN': 'Sachsen', 'DE-ST': 'Sachsen-Anhalt', 'DE-SH': 'Schleswig-Holstein', 'DE-TH': 'Thüringen' };
    return german[code] ? `${german[code]} (${code})` : code;
  }
  clearSelections(): void { this.lockedBreaks = []; this.accepted.set(new Set()); this.selected.set(''); }
  reset(): void {
    if (!this.initialInput) return;
    this.accepted.set(new Set()); this.selected.set(''); this.applyForm(this.initialInput); this.loadRegions(); this.requests.next(structuredClone(this.initialInput));
  }
  accept(interval: AnnualBreak): void {
    const accepted = new Set(this.accepted()); accepted.add(intervalKey(interval)); this.accepted.set(accepted); this.persistSettings(); this.api.track('recommendation_accepted');
  }
  lock(interval: AnnualBreak): void {
    if (!this.currentInput) return;
    const lockedBreaks = (this.currentInput.lockedBreaks ?? []).filter(item => intervalKey(item) !== intervalKey(interval));
    if (!interval.locked) lockedBreaks.push({ startDate: interval.startDate, endDate: interval.endDate });
    this.requests.next({ ...this.currentInput, lockedBreaks });
  }
  reject(interval: AnnualBreak): void {
    if (!this.currentInput || interval.locked) return;
    const excludedDates = [...new Set([...(this.currentInput.excludedDates ?? []), ...intervalDates(interval)])].sort();
    this.excludedText = excludedDates.join(', '); this.requests.next({ ...this.currentInput, excludedDates });
  }
  startEdit(interval: AnnualBreak): void { this.editing.set(intervalKey(interval)); this.editStart = interval.startDate; this.editEnd = interval.endDate; }
  applyEdit(interval: AnnualBreak): void {
    if (!this.currentInput) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.editStart) || !/^\d{4}-\d{2}-\d{2}$/.test(this.editEnd) || this.editStart > this.editEnd) { this.error.set(this.t('errorInput')); return; }
    const edited = { startDate: this.editStart, endDate: this.editEnd };
    const lockedBreaks = [...(this.currentInput.lockedBreaks ?? []).filter(item => intervalKey(item) !== intervalKey(interval)), edited];
    const removed = intervalDates(interval).filter(date => date < edited.startDate || date > edited.endDate);
    const excludedDates = [...new Set([...(this.currentInput.excludedDates ?? []), ...removed])].sort();
    this.requests.next({ ...this.currentInput, lockedBreaks, excludedDates });
  }
  save(): void {
    if (!this.currentInput || !this.authenticated() || this.saving()) return;
    const revision = this.revision;
    this.saving.set(true); this.error.set('');
    this.api.save(this.currentInput).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.saving.set(false))).subscribe({
      next: saved => { if (this.revision !== revision) return; this.savedId.set(saved._id); this.result.set(saved.result); this.currentInput = structuredClone(saved.input); this.notice.set(this.t('saved')); this.api.track('saved'); this.refreshSaved(); }, error: (error: unknown) => this.showError(error),
    });
  }
  load(saved: SavedAnnualPlan): void {
    this.cancel.next(); this.revision++; this.loading.set(false);
    this.currentInput = structuredClone(saved.input); this.lockedBreaks = structuredClone(saved.input.lockedBreaks ?? []); this.initialInput = structuredClone(saved.input); this.applyForm(saved.input); this.loadRegions();
    this.result.set(saved.result); this.savedId.set(saved._id); this.accepted.set(new Set()); this.selected.set(''); this.error.set(''); this.notice.set(this.t('loaded')); this.persistSettings();
  }
  export(mode: 'leave' | 'breaks'): void {
    const id = this.savedId();
    if (!id || !this.premium() || this.exporting()) return;
    this.exporting.set(true); this.error.set(''); this.api.track('export_requested');
    this.api.export(id, mode).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.exporting.set(false))).subscribe({
      next: text => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
        const link = this.document.createElement('a'); link.href = url; link.download = `hopladay-${this.result()?.year}-${mode}.ics`; link.click(); URL.revokeObjectURL(url);
      }, error: (error: unknown) => this.showError(error),
    });
  }
  analyticsChanged(): void { this.api.setAnalytics(this.analytics); }
  private refreshSaved(): void {
    this.api.plans().pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: plans => this.savedPlans.set(plans), error: (error: unknown) => this.showError(error) });
  }
  private showError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const payload: unknown = error instanceof HttpErrorResponse ? error.error : null;
    if (status === 503 && payload && typeof payload === 'object' && 'error' in payload && payload.error && typeof payload.error === 'object' && 'code' in payload.error && payload.error.code === 'OPTIMIZATION_CAPACITY_EXCEEDED') {
      this.error.set(this.t('errorCapacity')); return;
    }
    if (status === 401) { this.auth.clearSessionToken(); this.authenticated.set(false); this.premium.set(false); this.savedPlans.set([]); this.savedId.set(null); }
    this.error.set(this.t(status === 400 ? 'errorInput' : status === 401 ? 'errorAuth' : status === 403 ? 'errorPremium' : status === 429 ? 'errorRate' : status === 503 ? 'errorUnavailable' : 'errorGeneric'));
  }
  private applyForm(input: AnnualInput): void {
    this.editedLimits.clear();
    for (const key of ['minBreakLength', 'maxBreakLength', 'maxBreaks', 'minSeparationDays'] as const) if (input[key] !== undefined) this.editedLimits.add(key);
    this.horizonStart = input.horizon?.startDate ?? ''; this.horizonEnd = input.horizon?.endDate ?? '';
    this.country = input.country; this.year = input.year; this.availableDays = input.availableDays; this.strategy = input.strategy; this.region = input.region ?? '';
    this.approvedText = (input.approvedLeave ?? []).join(', '); this.excludedText = (input.excludedDates ?? []).join(', ');
    this.companyText = (input.companyHolidays ?? []).join(', '); this.holidayWorkingText = (input.holidayWorkingDates ?? []).join(', ');
    this.workingDaysText = (input.workingDays ?? [1, 2, 3, 4, 5]).join(','); this.preferredMonthsText = (input.preferredMonths ?? []).join(',');
    this.minBreakLength = input.minBreakLength ?? (input.strategy === 'balanced' ? 3 : 1); this.maxBreakLength = input.maxBreakLength ?? (input.strategy === 'balanced' ? 21 : null); this.preferredBreakLength = input.preferredBreakLength ?? 9;
    this.maxBreaks = input.maxBreaks ?? (input.strategy === 'balanced' ? 4 : null); this.minSeparationDays = input.minSeparationDays ?? (input.strategy === 'balanced' ? 21 : null); this.seasonalWeight = input.seasonalWeight ?? 1;
    this.summerDays = input.requiredSummerBreak?.minDays ?? 0; this.summerMonthsText = (input.requiredSummerBreak?.months ?? [6, 7, 8]).join(',');
  }
  private persistSettings(): void {
    if (!isPlatformBrowser(this.platform)) return;
    try { localStorage.setItem(this.settingsKey, JSON.stringify({ country: this.country, year: this.year, availableDays: this.availableDays, strategy: this.strategy, region: this.region, approvedText: this.approvedText, excludedText: this.excludedText, companyText: this.companyText, holidayWorkingText: this.holidayWorkingText, workingDaysText: this.workingDaysText, preferredMonthsText: this.preferredMonthsText, minBreakLength: this.minBreakLength, maxBreakLength: this.maxBreakLength, preferredBreakLength: this.preferredBreakLength, maxBreaks: this.maxBreaks, minSeparationDays: this.minSeparationDays, seasonalWeight: this.seasonalWeight, editedLimits: [...this.editedLimits], summerDays: this.summerDays, summerMonthsText: this.summerMonthsText, lockedBreaks: this.lockedBreaks, accepted: [...this.accepted()], horizon: this.horizonStart && this.horizonEnd ? { startDate: this.horizonStart, endDate: this.horizonEnd } : null })); } catch { /* Planning works when storage is unavailable. */ }
  }
  private restoreSettings(): void {
    try {
      const raw = localStorage.getItem(this.settingsKey); if (!raw) return;
      const settings: unknown = JSON.parse(raw);
      if (!settings || typeof settings !== 'object') return;
      if ('country' in settings && typeof settings.country === 'string' && countries.includes(settings.country)) this.country = settings.country;
      if ('year' in settings && typeof settings.year === 'number' && Number.isInteger(settings.year) && settings.year >= 2024 && settings.year <= 2100) this.year = settings.year;
      if ('availableDays' in settings && typeof settings.availableDays === 'number' && Number.isInteger(settings.availableDays) && settings.availableDays >= 0 && settings.availableDays <= 366) this.availableDays = settings.availableDays;
      if ('strategy' in settings) this.strategy = strategyValues.find(value => value === settings.strategy) ?? 'maximum_time_off';
      this.applyForm({ country: this.country, year: this.year, availableDays: this.availableDays, strategy: this.strategy, lang: this.translation.currentLang() });
      if ('horizon' in settings) {
        const horizon = storedInterval(settings.horizon, this.year);
        if (horizon) { this.horizonStart = horizon.startDate; this.horizonEnd = horizon.endDate; }
      }
      if ('lockedBreaks' in settings && Array.isArray(settings.lockedBreaks) && settings.lockedBreaks.length <= 366) {
        const locked: AnnualInterval[] = [];
        for (const raw of settings.lockedBreaks) {
          const value: unknown = raw;
          const interval = storedInterval(value, this.year);
          if (!interval) { locked.length = 0; break; }
          locked.push(interval);
        }
        this.lockedBreaks = locked;
      }
      if ('accepted' in settings && Array.isArray(settings.accepted) && settings.accepted.length <= 366) {
        const accepted = new Set<string>();
        for (const raw of settings.accepted) {
          const value: unknown = raw;
          if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(value)) accepted.add(value);
        }
        this.accepted.set(accepted);
      }
      const texts: ('region' | 'approvedText' | 'excludedText' | 'companyText' | 'holidayWorkingText' | 'workingDaysText' | 'preferredMonthsText' | 'summerMonthsText')[] = ['region', 'approvedText', 'excludedText', 'companyText', 'holidayWorkingText', 'workingDaysText', 'preferredMonthsText', 'summerMonthsText'];
      for (const key of texts) {
        const value: unknown = Object.getOwnPropertyDescriptor(settings, key)?.value;
        if (typeof value === 'string' && value.length <= 5000) this[key] = value;
      }
      const numbers: ['minBreakLength' | 'maxBreakLength' | 'preferredBreakLength' | 'maxBreaks' | 'minSeparationDays' | 'seasonalWeight' | 'summerDays', number, number][] = [['minBreakLength', 1, 366], ['maxBreakLength', 1, 366], ['preferredBreakLength', 1, 90], ['maxBreaks', 1, 366], ['minSeparationDays', 1, 365], ['seasonalWeight', 0, 10], ['summerDays', 0, 90]];
      for (const [key, min, max] of numbers) {
        const value: unknown = Object.getOwnPropertyDescriptor(settings, key)?.value;
        if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) { this[key] = value; this.editedLimits.add(key); }
      }
      if ('editedLimits' in settings && Array.isArray(settings.editedLimits)) {
        this.editedLimits.clear();
        for (const key of settings.editedLimits) if (typeof key === 'string' && ['minBreakLength', 'maxBreakLength', 'maxBreaks', 'minSeparationDays'].includes(key)) this.editedLimits.add(key);
      }
      const legacyLimits = { minBreakLength: 3, maxBreakLength: 21, maxBreaks: 4, minSeparationDays: 21 };
      if (!('editedLimits' in settings) && this.strategy === 'balanced' && Object.entries(legacyLimits).every(([key, value]) => Object.getOwnPropertyDescriptor(settings, key)?.value === value)) {
        this.strategy = 'maximum_time_off'; this.minBreakLength = 1;
        this.maxBreakLength = null; this.maxBreaks = null; this.minSeparationDays = null;
        for (const key of Object.keys(legacyLimits)) this.editedLimits.delete(key);
        this.persistSettings();
      }
    } catch { /* Ignore damaged or inaccessible local settings. */ }
  }
}
