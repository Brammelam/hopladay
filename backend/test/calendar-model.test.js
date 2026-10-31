import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { enumerateDates, addCalendarDays, calendarOrdinal, buildCalendar } from '../src/services/calendarModel.js';

const day = (calendar, date) => calendar.find(item => item.date === date);

test('enumerates whole common and leap years, including the century rule', () => {
  assert.equal(enumerateDates(2027).length, 365);
  assert.equal(enumerateDates(2028).length, 366);
  assert.equal(enumerateDates(2100).length, 365);
  assert.equal(enumerateDates(2028)[59], '2028-02-29');
  assert.equal(enumerateDates(2028).at(-1), '2028-12-31');
});

test('calendar arithmetic crosses daylight-saving and year boundaries without timezone shifts', () => {
  assert.equal(addCalendarDays('2027-03-27', 1), '2027-03-28');
  assert.equal(addCalendarDays('2027-10-31', 1), '2027-11-01');
  assert.equal(addCalendarDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addCalendarDays('2028-01-01', -1), '2027-12-31');
  assert.equal(calendarOrdinal('2027-03-29') - calendarOrdinal('2027-03-27'), 2);
  const moduleUrl = new URL('../src/services/calendarModel.js', import.meta.url).href;
  const code = `import {buildCalendar,addCalendarDays} from ${JSON.stringify(moduleUrl)};console.log(JSON.stringify([addCalendarDays('2027-03-28',1),buildCalendar({year:2027,horizon:{startDate:'2027-10-30',endDate:'2027-11-01'}})]));`;
  const outputs = ['UTC', 'Europe/Oslo', 'America/Los_Angeles', 'Pacific/Auckland'].map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ }, encoding: 'utf8' }));
  assert.equal(new Set(outputs).size, 1);
});

test('rejects rollover dates, timestamp strings and malformed calendar input', () => {
  for (const date of ['2027-02-29', '2028-02-30', '2027-13-01', '2027-00-01', '2027-04-31', '2027-1-01', '2027-01-01T00:00:00Z', '', null, 20270101]) {
    assert.throws(() => calendarOrdinal(date), String(date));
  }
  assert.throws(() => addCalendarDays('2027-01-01', 0.5));
  for (const year of [2023, 2101, 2027.5, '2027', null, NaN]) assert.throws(() => enumerateDates(year));
  assert.throws(() => buildCalendar(null));
  assert.throws(() => buildCalendar({ year: 2027, horizon: null }));
  assert.throws(() => buildCalendar({ year: 2027, horizon: { startDate: '2027-02-01', endDate: '2027-01-01' } }));
  assert.throws(() => buildCalendar({ year: 2027, horizon: { startDate: '2026-12-31', endDate: '2027-01-01' } }));
});

test('uses configured working weekdays instead of assuming Saturday and Sunday off', () => {
  const calendar = buildCalendar({ year: 2027, workingDays: [0, 1, 2, 3, 4] });
  assert.equal(day(calendar, '2027-01-01').regularNonWorking, true);
  assert.equal(day(calendar, '2027-01-03').regularNonWorking, false);
  assert.equal(day(calendar, '2027-01-03').requiresLeave, true);
  assert.equal(day(calendar, '2027-01-04').weekday, 1);
  assert.equal(day(calendar, '2027-01-04').month, 1);
  assert.equal(day(calendar, '2027-01-04').ordinal, calendarOrdinal('2027-01-04'));
});

test('keeps overlapping classifications without charging leave twice', () => {
  const calendar = buildCalendar({ year: 2027, companyHolidays: ['2027-05-17'], approvedLeave: ['2027-05-17'], excludedDates: ['2027-05-17'] }, [{ date: '2027-05-17', name: 'Constitution Day' }, { date: '2027-05-16', name: 'Pentecost' }]);
  assert.deepEqual(day(calendar, '2027-05-17'), {
    date: '2027-05-17', ordinal: calendarOrdinal('2027-05-17'), weekday: 1, month: 5,
    publicHoliday: true, companyHoliday: true, approvedLeave: true, excluded: true,
    regularNonWorking: false, requiresLeave: false, holidayNames: ['Constitution Day'],
  });
  assert.equal(day(calendar, '2027-05-16').publicHoliday, true);
  assert.equal(day(calendar, '2027-05-16').regularNonWorking, true);
  assert.equal(day(calendar, '2027-05-16').requiresLeave, false);
  assert.equal(day(calendar, '2027-05-18').requiresLeave, true);
});

test('distinguishes holiday classification from whether the holiday is worked', () => {
  const calendar = buildCalendar({ year: 2027, holidayWorkingDates: ['2027-05-17'] }, [{ date: '2027-05-17', name: 'Constitution Day' }]);
  assert.equal(day(calendar, '2027-05-17').publicHoliday, true);
  assert.equal(day(calendar, '2027-05-17').requiresLeave, true);
});

test('approved leave and company holidays cost no new allowance', () => {
  const calendar = buildCalendar({ year: 2027, approvedLeave: ['2027-05-18'], companyHolidays: ['2027-05-19'] });
  assert.equal(day(calendar, '2027-05-18').requiresLeave, false);
  assert.equal(day(calendar, '2027-05-19').requiresLeave, false);
  assert.equal(day(calendar, '2027-05-20').requiresLeave, true);
});

test('supports an empty workweek without creating working days', () => {
  const calendar = buildCalendar({ year: 2027, workingDays: [] });
  assert.ok(calendar.every(date => date.regularNonWorking && !date.requiresLeave));
});

test('personal dates must be unique, bounded and within the planning horizon', () => {
  for (const field of ['companyHolidays', 'approvedLeave', 'excludedDates', 'holidayWorkingDates']) {
    for (const value of [null, '2027-05-17', [null], ['2027-05-17', '2027-05-17'], ['2026-12-31'], Array.from({ length: 367 }, () => '2027-01-01')]) {
      assert.throws(() => buildCalendar({ year: 2027, [field]: value }), `${field}: ${value}`);
    }
    assert.throws(() => buildCalendar({ year: 2027, horizon: { startDate: '2027-01-01', endDate: '2027-01-31' }, [field]: ['2027-02-01'] }));
  }
  for (const workingDays of [null, [1, 1], [-1], [7], [1.5], ['1'], 'weekdays', Array(8).fill(0)]) {
    assert.throws(() => buildCalendar({ year: 2027, workingDays }));
  }
});

test('merges same-date holiday names, filtering full-year provider data to the horizon', () => {
  const input = { year: 2027, horizon: { startDate: '2027-05-17', endDate: '2027-05-18' }, approvedLeave: ['2027-05-18'] };
  const holidays = [{ date: '2027-01-01', name: 'New Year' }, { date: '2027-05-17', name: 'Constitution Day' }, { date: '2027-05-17', localName: 'Grunnlovsdag', name: 'Constitution Day' }];
  const before = JSON.stringify({ input, holidays });
  const calendar = buildCalendar(input, holidays);
  assert.equal(calendar.length, 2);
  assert.deepEqual(calendar[0].holidayNames, ['Constitution Day', 'Grunnlovsdag']);
  assert.equal(JSON.stringify({ input, holidays }), before);
});

test('rejects malformed public holiday dates and untrusted name shapes', () => {
  for (const holidays of [null, {}, [null], [{ date: '2027-02-30' }], [{ date: '2028-01-01' }], [{ date: '2027-05-17', name: { x: 1 } }]]) {
    assert.throws(() => buildCalendar({ year: 2027 }, holidays));
  }
});
