import axios from 'axios';
import { generateHolidayPlan } from './plannerService.js';
import { formatDate, nextDay, parseISODate } from '../utils/dateUtils.js';

export const PREVIEW_COUNTRIES = 'NO SE DK FI NL IS DE BE FR ES PT IT CH AT IE GB US CA AU NZ PL CZ SK HU SI HR EE LV LT RO BG GR TR RU UA BR MX AR CL JP CN KR ZA'.split(' ');
const languages = ['en', 'no', 'nl', 'de', 'fr', 'es', 'sv', 'da'];
const fields = ['country', 'year', 'availableDays', 'preference', 'lang'];

export function parsePreviewInput(query) {
  if (Object.keys(query).some(key => !fields.includes(key)) || Object.values(query).some(value => typeof value !== 'string')) {
    throw new Error('Use only the documented scalar query parameters, once each.');
  }
  const { country, year, availableDays, preference = 'balanced', lang = 'en' } = query;
  if (!PREVIEW_COUNTRIES.includes(country)) throw new Error('Unsupported country. See /api-docs.html for supported country codes.');
  if (!/^\d{4}$/.test(year) || Number(year) < 2024 || Number(year) > 2030) throw new Error('year must be an integer from 2024 to 2030.');
  if (!/^\d{1,3}$/.test(availableDays) || Number(availableDays) > 365) throw new Error('availableDays must be an integer from 0 to 365.');
  if (preference !== 'balanced') throw new Error('Public previews support only balanced. Advanced strategies require Premium on the website.');
  if (!languages.includes(lang)) throw new Error('Unsupported language.');
  return { country, year: Number(year), availableDays: Number(availableDays), preference, lang };
}

export function holidaySourceUrl(country, year) {
  return `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;
}

export async function fetchPreviewHolidays(country, year) {
  const { data } = await axios.get(holidaySourceUrl(country, year), { timeout: 8000, maxContentLength: 1000000, maxRedirects: 0 });
  return data;
}

export function normalizePublicHolidays(rows, country, year) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Missing holiday data');
  const holidays = new Map();
  for (const row of rows) {
    if (!row || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.countryCode !== country || typeof row.global !== 'boolean' || !Array.isArray(row.types) || typeof row.name !== 'string') {
      throw new Error('Invalid holiday data');
    }
    const date = parseISODate(row.date);
    if (formatDate(date) !== row.date || date.getFullYear() !== year) throw new Error('Invalid holiday date');
    if (row.global && row.types.includes('Public')) {
      holidays.set(row.date, { date: row.date, name: row.name, localName: typeof row.localName === 'string' ? row.localName : row.name, countryCode: country, year });
    }
  }
  if (!holidays.size) throw new Error('No nationwide Public holidays available');
  return [...holidays.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildPreview(input, holidays, retrievedAt) {
  const plan = generateHolidayPlan(holidays, input.availableDays, input.year, 'balanced', { isPremium: false, lang: input.lang });
  const holidayDates = new Set(holidays.map(h => h.date));
  const suggestions = plan.suggestions.map(s => {
    const leaveDates = [];
    for (let d = parseISODate(s.startDate); formatDate(d) <= s.endDate; d = nextDay(d)) {
      if (d.getDay() !== 0 && d.getDay() !== 6 && !holidayDates.has(formatDate(d))) leaveDates.push(formatDate(d));
    }
    return { startDate: s.startDate, endDate: s.endDate, vacationDaysUsed: s.vacationDaysUsed, totalDaysOff: s.totalDaysOff, leaveDates, description: s.description };
  });
  const params = new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)]));
  return {
    version: '1', tier: 'free', input,
    usedDays: plan.usedDays, remainingDays: input.availableDays - plan.usedDays,
    totalDaysOff: plan.totalDaysOff, suggestions,
    holidays,
    source: { name: 'Nager.Date', url: holidaySourceUrl(input.country, input.year), retrievedAt, scope: 'nationwide-public-holidays' },
    assumptions: {
      workweek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      dateFormat: 'YYYY-MM-DD', rangeEndsInclusive: true,
      totalDaysOff: 'Sum of calendar days in suggested breaks, including their weekends and public holidays; not all days off in the year.',
      strategy: 'Free balanced planner: one-workday bridges. May leave allowance unused; heuristic suggestions, not a guaranteed global optimum.',
      coverage: 'Nationwide Public holidays only. Regional, employer-specific and nonstandard work schedules are not included. Verify holiday entitlement with your employer.',
    },
    previewUrl: `https://www.hopladay.com/${input.lang}/preview?${params}`,
  };
}
