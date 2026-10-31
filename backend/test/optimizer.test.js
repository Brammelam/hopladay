import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeAnnualLeave } from '../src/services/annualOptimizer.js';
const base = { year: 2027, availableDays: 3, strategy: 'maximum_time_off', horizon: { startDate: '2027-01-01', endDate: '2027-01-14' }, minBreakLength: 3, maxBreakLength: 14, maxBreaks: 4, minSeparationDays: 1 };

function bruteForce(input, holidays) {
  // Independent tiny-calendar oracle: enumerate every possible subset of workdays.
  const start = Date.parse(input.horizon.startDate), end = Date.parse(input.horizon.endDate);
  const days = [];
  for (let t = start; t <= end; t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  const fixed = new Set([...(input.approvedLeave || []), ...(input.companyHolidays || []), ...holidays.map(h => h.date)]);
  const excluded = new Set(input.excludedDates || []);
  const work = days.filter(d => ![0,6].includes(new Date(d).getUTCDay()) && !fixed.has(d) && !excluded.has(d));
  let best = 0;
  for (let mask = 0; mask < 2 ** work.length; mask++) {
    const leave = new Set(work.filter((_, i) => mask & 2 ** i));
    if (leave.size > input.availableDays) continue;
    let total = 0, breaks = 0;
    for (let i = 0; i < days.length;) {
      const d = days[i];
      const off = x => !excluded.has(x) && (fixed.has(x) || leave.has(x) || [0,6].includes(new Date(x).getUTCDay()));
      if (!off(d)) { i++; continue; }
      const begin = i;
      while (i < days.length && off(days[i])) i++;
      const length = i - begin;
      const period = days.slice(begin, i);
      if (length >= input.minBreakLength && length <= input.maxBreakLength && period.some(x => leave.has(x) || input.approvedLeave?.includes(x))) { total += length; breaks++; }
    }
    if (breaks <= input.maxBreaks) best = Math.max(best, total);
  }
  return best;
}

test('maximum-time objective matches exhaustive leave allocation on tiny calendars', () => {
  for (let allowance = 0; allowance <= 4; allowance++) {
    for (const holidays of [[], [{ date: '2027-01-06', name: 'Holiday' }]]) {
      const input = { ...base, availableDays: allowance };
      const plan = optimizeAnnualLeave(input, holidays);
      assert.equal(plan.totalDaysOff, bruteForce(input, holidays));
      assert.equal(plan.optimality.exact, true);
    }
  }
});

test('approved leave is free, company holidays/custom workweeks are honored, and exclusions block periods', () => {
  const input = { ...base, approvedLeave: ['2027-01-04'], companyHolidays: ['2027-01-05'], workingDays: [1,2,3,4], excludedDates: ['2027-01-10'] };
  const plan = optimizeAnnualLeave(input, []);
  assert.ok(plan.usedDays <= 3);
  assert.ok(!plan.suggestions.flatMap(s => s.leaveDates).some(d => ['2027-01-04','2027-01-05','2027-01-10'].includes(d)));
  assert.ok(plan.suggestions.every(s => !(s.startDate <= '2027-01-10' && s.endDate >= '2027-01-10')));
});

test('longest vacation differs from total time off and remains deterministic', () => {
  const input = { ...base, horizon: { startDate: '2027-01-01', endDate: '2027-02-28' }, availableDays: 5, maxBreakLength: 30 };
  const max = optimizeAnnualLeave(input, []);
  const long = optimizeAnnualLeave({ ...input, strategy: 'longest_vacation' }, []);
  assert.ok(long.longestVacation > max.longestVacation);
  assert.deepEqual(long, optimizeAnnualLeave({ ...input, strategy: 'longest_vacation' }, []));
  assert.notDeepEqual(optimizeAnnualLeave({ ...input, strategy: 'balanced', minSeparationDays: 14, maxBreaks: 3 }, []).suggestions, max.suggestions);
});

test('locks survive optimization and are charged once; infeasible requirements are explicit', () => {
  const lock = { startDate: '2027-01-08', endDate: '2027-01-10' };
  const plan = optimizeAnnualLeave({ ...base, lockedBreaks: [lock] }, []);
  assert.ok(plan.suggestions.some(s => s.startDate === lock.startDate && s.endDate === lock.endDate && s.locked));
  assert.equal(plan.usedDays, plan.suggestions.reduce((n,s) => n+s.leaveDates.length,0));
  const impossible = optimizeAnnualLeave({ ...base, requiredSummerBreak: { minDays: 14, months: [6,7,8] } }, []);
  assert.equal(impossible.status, 'infeasible');
  assert.equal(impossible.constraintsSatisfied, false);
  assert.deepEqual(impossible.suggestions, []);
});

test('zero allowance, leap boundaries and no feasible candidates have valid results', () => {
  assert.deepEqual(optimizeAnnualLeave({ ...base, availableDays: 0 }, []).suggestions, []);
  const approved = optimizeAnnualLeave({ ...base, availableDays: 0, approvedLeave: ['2027-01-04'] }, []);
  assert.ok(approved.totalDaysOff >= 3);
  assert.equal(approved.usedDays, 0);
  assert.deepEqual(optimizeAnnualLeave({ ...base, minBreakLength: 14, maxBreakLength: 14, availableDays: 1 }, []).suggestions, []);
});

test('generated calendars satisfy budget, disjoint intervals, counts and reproducibility', () => {
  let seed = 37;
  const random = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 35; trial++) {
    const input = { ...base, year: 2028, horizon: { startDate: '2028-02-01', endDate: '2028-03-15' }, availableDays: random(12), strategy: ['maximum_time_off','longest_vacation','balanced'][random(3)], maxBreakLength: 20 };
    const plan = optimizeAnnualLeave(input, [{ date: '2028-02-29', name: 'Leap holiday' }]);
    assert.deepEqual(plan, optimizeAnnualLeave(input, [{ date: '2028-02-29', name: 'Leap holiday' }]));
    const leave = plan.suggestions.flatMap(s => s.leaveDates);
    assert.equal(new Set(leave).size, leave.length);
    assert.equal(leave.length, plan.usedDays);
    assert.ok(plan.usedDays <= input.availableDays);
    let total = 0;
    const all = new Set();
    for (const s of plan.suggestions) {
      assert.ok(s.startDate >= input.horizon.startDate && s.endDate <= input.horizon.endDate);
      for (let t = Date.parse(s.startDate); t <= Date.parse(s.endDate); t += 86400000) { assert.ok(!all.has(t)); all.add(t); }
      total += s.totalDaysOff;
    }
    assert.equal(plan.totalDaysOff, total);
    assert.equal(plan.totalDaysOff, all.size);
  }
});

test('length bounds do not split an uninterrupted holiday into artificial shorter breaks', () => {
  const input={...base,maxBreakLength:3,availableDays:2,horizon:{startDate:'2027-01-01',endDate:'2027-01-10'}};
  const plan=optimizeAnnualLeave(input,[{date:'2027-01-04',name:'Holiday'}]);
  for(const s of plan.suggestions){
    const index=plan.calendar.findIndex(d=>d.date===s.startDate), end=plan.calendar.findIndex(d=>d.date===s.endDate);
    if(index>0)assert.ok(plan.calendar[index-1].requiresLeave || plan.calendar[index-1].excluded);
    if(end+1<plan.calendar.length)assert.ok(plan.calendar[end+1].requiresLeave || plan.calendar[end+1].excluded);
  }
});
