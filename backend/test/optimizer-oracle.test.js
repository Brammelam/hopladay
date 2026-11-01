import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeAnnualLeave } from '../src/services/annualOptimizer.js';

// Enumerate actual leave-date subsets, then derive complete uninterrupted breaks.
// This deliberately does not use the optimizer's candidate generator or recurrence.
function exhaustive(input, holidays = []) {
  const start = Date.parse(input.horizon.startDate);
  const end = Date.parse(input.horizon.endDate);
  const dates = [];
  for (let time = start; time <= end; time += 86400000) dates.push(new Date(time).toISOString().slice(0, 10));
  const working = new Set(input.workingDays ?? [1, 2, 3, 4, 5]);
  const approved = new Set(input.approvedLeave ?? []);
  const company = new Set(input.companyHolidays ?? []);
  const excluded = new Set(input.excludedDates ?? []);
  const holidayDates = new Set(holidays.map(h => h.date));
  const workedHolidays = new Set(input.holidayWorkingDates ?? []);
  const payable = dates.map(date => working.has(new Date(`${date}T12:00:00Z`).getUTCDay()) && !company.has(date) && !approved.has(date) && (!holidayDates.has(date) || workedHolidays.has(date)));
  const work = dates.map((date, index) => ({ date, index })).filter(({ date, index }) => payable[index] && !excluded.has(date));
  assert.ok(work.length <= 15, 'The oracle must stay exhaustively bounded');
  const locks = input.lockedBreaks ?? [];
  let best = null;
  for (let mask = 0; mask < 2 ** work.length; mask++) {
    const booked = new Set(work.filter((_, i) => (mask & (1 << i)) !== 0).map(d => d.date));
    if (booked.size > input.availableDays) continue;
    const runs = [];
    for (let index = 0; index < dates.length;) {
      if (excluded.has(dates[index]) || (payable[index] && !booked.has(dates[index]))) { index++; continue; }
      const first = index;
      while (index < dates.length && !excluded.has(dates[index]) && (!payable[index] || booked.has(dates[index]))) index++;
      const last = index - 1;
      const days = dates.slice(first, index);
      const isLock = locks.some(lock => lock.startDate === days[0] && lock.endDate === days.at(-1));
      const required = days.filter(date => booked.has(date));
      if (days.length < input.minBreakLength || days.length > input.maxBreakLength) {
        if (required.length) { runs.length = 0; break; }
        continue;
      }
      if (required.length || days.some(date => approved.has(date)) || isLock) runs.push({ first, last, days, required, isLock });
    }
    for (let subset = 0; subset < 2 ** runs.length; subset++) {
      const selected = runs.filter((_, index) => (subset & (1 << index)) !== 0);
      if (selected.length > input.maxBreaks) continue;
      if (selected.reduce((n, run) => n + run.required.length, 0) !== booked.size) continue;
      if (locks.some(lock => !selected.some(run => run.days[0] === lock.startDate && run.days.at(-1) === lock.endDate))) continue;
      if (selected.some((run, index) => index > 0 && run.first - selected[index - 1].last <= input.minSeparationDays)) continue;
      if (input.requiredSummerBreak && !selected.some(run => run.days.length >= input.requiredSummerBreak.minDays && run.days.every(date => input.requiredSummerBreak.months.includes(Number(date.slice(5, 7)))))) continue;
      const total = selected.reduce((n, run) => n + run.days.length, 0);
      const longest = Math.max(0, ...selected.map(run => run.days.length));
      const preferred = selected.reduce((n, run) => n + run.days.filter(date => input.preferredMonths?.includes(Number(date.slice(5, 7)))).length, 0);
      const balanced = selected.reduce((n, run) => {
        const length = run.days.length;
        const preferredDays = run.days.filter(date => input.preferredMonths?.includes(Number(date.slice(5, 7)))).length;
        const midpoint = (run.first + run.last) / 2;
        const seasonal = Math.max(0, 14 - Math.min(...[0.125, 0.375, 0.625, 0.875].map(q => Math.abs(midpoint - dates.length * q))));
        const preferredLength = input.preferredBreakLength ?? 9;
        return n + Math.round(100 * (10 * Math.min(length, preferredLength) - 3 * Math.abs(length - preferredLength) + 2 * preferredDays + (input.seasonalWeight ?? 1) * seasonal));
      }, 0);
      const objective = input.strategy === 'balanced' ? [balanced, -booked.size, -selected.length] : input.strategy === 'longest_vacation' ? [longest, total, preferred, -booked.size, -selected.length] : [total, booked.size, preferred, -selected.length];
      const candidate = { total, longest, preferred, used: booked.size, count: selected.length, balanced, objective, selected };
      if (!best || compare(objective, best.objective) > 0) best = candidate;
    }
  }
  return best;
}
function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function check(input, holidays = []) {
  const normalized = {strategy:'maximum_time_off',minBreakLength:1,maxBreakLength:366,maxBreaks:366,minSeparationDays:1,...input};
  const expected = exhaustive(normalized, holidays);
  const actual = optimizeAnnualLeave(input, holidays);
  assert.equal(actual.status, expected ? 'ok' : 'infeasible', JSON.stringify(input));
  if (!expected) return;
  if (input.strategy === 'balanced') {
    const n = (Date.parse(input.horizon.endDate) - Date.parse(input.horizon.startDate)) / 86400000 + 1;
    const score = actual.suggestions.reduce((sum, suggestion) => {
      const length = suggestion.totalDaysOff;
      let preferred = 0;
      for (let time = Date.parse(suggestion.startDate); time <= Date.parse(suggestion.endDate); time += 86400000) {
        if (input.preferredMonths?.includes(new Date(time).getUTCMonth() + 1)) preferred++;
      }
      const midpoint = ((Date.parse(suggestion.startDate) + Date.parse(suggestion.endDate)) / 2 - Date.parse(input.horizon.startDate)) / 86400000;
      const seasonal = Math.max(0, 14 - Math.min(...[0.125, 0.375, 0.625, 0.875].map(q => Math.abs(midpoint - n * q))));
      const preferredLength = input.preferredBreakLength ?? 9;
      return sum + Math.round(100 * (10 * Math.min(length, preferredLength) - 3 * Math.abs(length - preferredLength) + 2 * preferred + (input.seasonalWeight ?? 1) * seasonal));
    }, 0);
    assert.equal(score, expected.balanced, JSON.stringify(input));
  } else {
    assert.equal(actual.totalDaysOff, expected.total, JSON.stringify(input));
    let preferred = 0;
    for (const suggestion of actual.suggestions) for (let time = Date.parse(suggestion.startDate); time <= Date.parse(suggestion.endDate); time += 86400000) {
      if (input.preferredMonths?.includes(new Date(time).getUTCMonth() + 1)) preferred++;
    }
    assert.equal(preferred, expected.preferred, JSON.stringify(input));
  }
  if (input.strategy === 'longest_vacation') assert.equal(actual.longestVacation, expected.longest, JSON.stringify(input));
  assert.equal(actual.usedDays, expected.used, JSON.stringify(input));
  assert.equal(actual.breakCount, expected.count, JSON.stringify(input));
  assert.deepEqual(actual, optimizeAnnualLeave(input, holidays), 'Identical inputs must reproduce the whole result');
}
const base = {
  year: 2027,
  horizon: { startDate: '2027-01-25', endDate: '2027-02-07' },
  availableDays: 4,
  minBreakLength: 3,
  maxBreakLength: 8,
  minSeparationDays: 1,
  maxBreaks: 3,
};

test('exact maximum and longest objectives agree with exhaustive leave-subset enumeration', () => {
  for (const strategy of ['maximum_time_off', 'longest_vacation']) {
    for (const availableDays of [0, 1, 2, 3, 4, 6]) {
      check({ ...base, strategy, availableDays });
      check({ ...base, strategy, availableDays, preferredMonths: [2], excludedDates: ['2027-02-02'], approvedLeave: ['2027-01-29'] }, [{ date: '2027-02-01', name: 'Fixture holiday' }]);
    }
  }
});

test('hard summer requirements and fixed locked breaks agree with exhaustive enumeration', () => {
  for (const strategy of ['maximum_time_off', 'longest_vacation']) {
    for (const availableDays of [0, 1, 2, 3, 5]) {
      check({ ...base, strategy, availableDays, requiredSummerBreak: { minDays: 4, months: [2] } });
      check({ ...base, strategy, availableDays, lockedBreaks: [{ startDate: '2027-01-29', endDate: '2027-01-31' }] });
      check({ ...base, strategy, availableDays, lockedBreaks: [{ startDate: '2027-01-29', endDate: '2027-01-31' }], requiredSummerBreak: { minDays: 4, months: [2] } });
    }
  }
});

test('seeded small reference calendars exercise budgets, workweeks, exclusions and approved leave', () => {
  let seed = 29173;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 16) % n; };
  const cases = new Set();
  for (let trial = 0; trial < 120; trial++) {
    const input = {
      year: 2028,
      horizon: { startDate: '2028-06-24', endDate: '2028-07-05' },
      strategy: ['maximum_time_off', 'longest_vacation', 'balanced'][trial % 3],
      availableDays: random(5), minBreakLength: 1 + random(3), maxBreakLength: 4 + random(5),
      maxBreaks: 1 + random(3), minSeparationDays: 1 + random(3),
      preferredBreakLength: 3 + random(4), seasonalWeight: random(3), preferredMonths: random(2) ? [7] : [],
      workingDays: random(2) ? [1, 2, 3, 4, 5] : [0, 2, 3, 5],
      approvedLeave: random(2) ? ['2028-06-28'] : [],
      companyHolidays: random(2) ? ['2028-07-03'] : [],
      excludedDates: random(2) ? ['2028-06-26'] : [],
      ...(random(3) === 0 ? { requiredSummerBreak: { minDays: 3 + random(3), months: [6, 7] } } : {}),
    };
    cases.add(JSON.stringify(input));
    check(input, [{ date: '2028-07-04', name: 'Fixture holiday' }]);
  }
  assert.ok(cases.size > 100, 'Seeded calendar coverage must contain distinct configurations');
});


test('a summer lock can satisfy the hard requirement with no remaining break slots', () => {
  for (const strategy of ['maximum_time_off', 'longest_vacation', 'balanced']) {
    check({ ...base, strategy, availableDays: 1, maxBreaks: 1, lockedBreaks: [{ startDate: '2027-02-05', endDate: '2027-02-07' }], requiredSummerBreak: { minDays: 3, months: [2] } });
  }
});

 test('unrestricted free defaults match exhaustive subsets across all small budgets', () => {
  for (let allowance=0;allowance<=12;allowance++) {
    check({year:2027,horizon:base.horizon,availableDays:allowance});
    check({year:2027,horizon:base.horizon,availableDays:allowance,excludedDates:['2027-02-02'],approvedLeave:['2027-01-29']},[{date:'2027-02-01'}]);
  }
});
