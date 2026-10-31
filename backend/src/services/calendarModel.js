const DAY_MS = 86400000;
const dateFields = ['companyHolidays', 'approvedLeave', 'excludedDates', 'holidayWorkingDates'];

export function calendarOrdinal(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Dates must use YYYY-MM-DD.');
  }
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid calendar date: ${date}.`);
  }
  return time / DAY_MS;
}

export function addCalendarDays(date, count) {
  if (!Number.isSafeInteger(count)) throw new Error('Calendar day offsets must be integers.');
  const result = new Date((calendarOrdinal(date) + count) * DAY_MS).toISOString().slice(0, 10);
  calendarOrdinal(result);
  return result;
}

function validateYear(year) {
  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    throw new Error('year must be an integer from 2024 to 2100.');
  }
}

export function enumerateDates(year) {
  validateYear(year);
  const first = calendarOrdinal(`${year}-01-01`);
  const last = calendarOrdinal(`${year}-12-31`);
  return Array.from({ length: last - first + 1 }, (_, index) => new Date((first + index) * DAY_MS).toISOString().slice(0, 10));
}

export function validateCalendarInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Calendar input must be an object.');
  validateYear(input.year);
  const { year } = input;
  const horizon = input.horizon === undefined ? { startDate: `${year}-01-01`, endDate: `${year}-12-31` } : input.horizon;
  if (!horizon || typeof horizon !== 'object' || Array.isArray(horizon)) throw new Error('horizon must contain startDate and endDate.');
  const start = calendarOrdinal(horizon.startDate);
  const end = calendarOrdinal(horizon.endDate);
  if (horizon.startDate.slice(0, 4) !== String(year) || horizon.endDate.slice(0, 4) !== String(year) || start > end) {
    throw new Error('The planning horizon must be an ordered range within the configured year.');
  }
  const workingDays = input.workingDays === undefined ? [1, 2, 3, 4, 5] : input.workingDays;
  if (!Array.isArray(workingDays) || workingDays.length > 7 || new Set(workingDays).size !== workingDays.length || workingDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('workingDays must contain unique weekday numbers from 0 (Sunday) to 6 (Saturday).');
  }
  const normalized = { year, horizon: { startDate: horizon.startDate, endDate: horizon.endDate }, workingDays: [...workingDays] };
  for (const field of dateFields) {
    const dates = input[field] === undefined ? [] : input[field];
    if (!Array.isArray(dates) || dates.length > 366 || new Set(dates).size !== dates.length) {
      throw new Error(`${field} must contain at most 366 unique calendar dates.`);
    }
    for (const date of dates) {
      const ordinal = calendarOrdinal(date);
      if (ordinal < start || ordinal > end) throw new Error(`${field} dates must fall within the planning horizon.`);
    }
    normalized[field] = [...dates];
  }
  return normalized;
}

export function buildCalendar(input, holidays = []) {
  const config = validateCalendarInput(input);
  if (!Array.isArray(holidays) || holidays.length > 366) throw new Error('holidays must be an array of at most 366 dates.');
  const holidayNames = new Map();
  for (const holiday of holidays) {
    if (!holiday || typeof holiday !== 'object' || Array.isArray(holiday)) throw new Error('Invalid holiday row.');
    calendarOrdinal(holiday.date);
    if (holiday.date.slice(0, 4) !== String(config.year)) throw new Error('Public holidays must belong to the configured year.');
    if ((holiday.name !== undefined && typeof holiday.name !== 'string') || (holiday.localName !== undefined && typeof holiday.localName !== 'string')) {
      throw new Error('Holiday names must be strings.');
    }
    const names = holidayNames.get(holiday.date) ?? new Set();
    if (holiday.name) names.add(holiday.name);
    if (holiday.localName) names.add(holiday.localName);
    holidayNames.set(holiday.date, names);
  }
  const working = new Set(config.workingDays);
  const company = new Set(config.companyHolidays);
  const approved = new Set(config.approvedLeave);
  const excluded = new Set(config.excludedDates);
  const holidayWorking = new Set(config.holidayWorkingDates);
  return enumerateDates(config.year).filter(date => date >= config.horizon.startDate && date <= config.horizon.endDate).map(date => {
    const ordinal = calendarOrdinal(date);
    const weekday = new Date(ordinal * DAY_MS).getUTCDay();
    const publicHoliday = holidayNames.has(date);
    const companyHoliday = company.has(date);
    const approvedLeave = approved.has(date);
    const regularNonWorking = !working.has(weekday);
    return {
      date, ordinal, weekday, month: Number(date.slice(5, 7)), publicHoliday, companyHoliday,
      approvedLeave, excluded: excluded.has(date), regularNonWorking,
      requiresLeave: !regularNonWorking && !companyHoliday && !approvedLeave && (!publicHoliday || holidayWorking.has(date)),
      holidayNames: [...(holidayNames.get(date) ?? [])],
    };
  });
}
