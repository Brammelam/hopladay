import {
  eachDayOfInterval,
  isWeekend,
  addDays,
  subDays,
  format,
  isSameDay,
  differenceInCalendarDays,
  startOfYear,
  endOfYear,
  isSunday,
  isAfter,
  isBefore
} from "date-fns";

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekendDay(date) {
  return isWeekend(date);
}

/**
 * Generate a list of all weekends for a given year
 */
export function getAllWeekendsForYear(year) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const days = eachDayOfInterval({ start, end });
  return days.filter(isWeekend);
}

/**
 * Check if a date matches a holiday date in an array
 */
export function isPublicHoliday(date, holidays) {
  return holidays.some((h) => isSameDay(parseISODate(h.date), date));
}

/**
 * Returns true if date is a weekend or public holiday
 */
export function isDayOff(date, holidays) {
  return isWeekendDay(date) || isPublicHoliday(date, holidays);
}

/**
 * Return all consecutive days off starting from a given date
 */
export function getConsecutiveDaysOff(startDate, holidays) {
  let current = new Date(startDate);
  const streak = [current];

  while (true) {
    const next = addDays(current, 1);
    if (!isDayOff(next, holidays)) break;
    streak.push(next);
    current = next;
  }

  return streak;
}

/**
 * Format date to human-readable (YYYY-MM-DD)
 */
export function formatDate(date) {
  return format(new Date(date), "yyyy-MM-dd");
}

/**
 * Calculate total days in a streak (start → end, inclusive)
 */
export function countDaysBetween(startDate, endDate) {
  return differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1;
}

/**
 * Generate all days in a given year
 */
export function getAllDaysOfYear(year) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  return eachDayOfInterval({ start, end });
}

/**
 * Get all days between two dates (inclusive)
 */
export function getDaysBetween(startDate, endDate) {
  return eachDayOfInterval({
    start: new Date(startDate),
    end: new Date(endDate),
  });
}

/**
 * Check if two dates are the same day (year, month, date)
 */
export function areSameDay(a, b) {
  return isSameDay(new Date(a), new Date(b));
}

/**
 * Shift a date forward or backward by a number of days
 * (thin wrappers around date-fns helpers for convenience)
 */
export function nextDay(date, n = 1) {
  return addDays(new Date(date), n);
}

export function previousDay(date, n = 1) {
  return subDays(new Date(date), n);
}

/**
 * Return start and end of a given year (Date objects)
 */
export function getYearBounds(year) {
  return {
    start: startOfYear(new Date(year, 0, 1)),
    end: endOfYear(new Date(year, 11, 31)),
  };
}

export function parseISODate(dateStr) {
  // Already a Date object → return it as-is
  if (dateStr instanceof Date) {
    return dateStr;
  }

  // Some ORMs (like Mongoose) may wrap dates in an object, e.g. { $date: '2025-05-17' }
  if (typeof dateStr === 'object' && dateStr.$date) {
    dateStr = dateStr.$date;
  }

  // Otherwise, assume it's a string "YYYY-MM-DD"
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return new Date(year, month - 1, day); // month is zero-indexed
}

export function normalizeSuggestionDates(suggestions) {
  return suggestions.map((s) => ({
    ...s,
    startDate: format(new Date(s.startDate), "yyyy-MM-dd"),
    endDate: format(new Date(s.endDate), "yyyy-MM-dd"),
  }));
}

export function extendToSunday(endDate, holidays) {
  let current = endDate;
  while (!isSunday(current) && isDayOff(addDays(current, 1), holidays)) {
    current = addDays(current, 1);
  }
  return current;
}

export function mergeAdjacentSuggestions(suggestions) {
  if (!Array.isArray(suggestions) || suggestions.length <= 1) return suggestions;

  // Sort by start date
  const sorted = [...suggestions].sort(
    (a, b) => new Date(a.startDate) - new Date(b.startDate)
  );

  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const current = sorted[i];

    const prevEnd = new Date(prev.endDate);
    const currentStart = new Date(current.startDate);

    // Check if clusters overlap or touch directly
    const areAdjacent =
      areSameDay(addDays(prevEnd, 1), currentStart) || isAfter(prevEnd, currentStart);

    if (areAdjacent) {
      // Merge by extending end date to the later one
      prev.endDate =
        isAfter(prevEnd, new Date(current.endDate)) ? prev.endDate : current.endDate;

      // Combine descriptive data
      prev.description = prev.description.includes("merged")
        ? prev.description
        : `${prev.description} + merged cluster`;

      prev.totalDaysOff = countDaysBetween(prev.startDate, prev.endDate);
      prev.vacationDaysUsed =
        (prev.vacationDaysUsed || 0) + (current.vacationDaysUsed || 0);
    } else {
      merged.push(current);
    }
  }

  return merged;
}
