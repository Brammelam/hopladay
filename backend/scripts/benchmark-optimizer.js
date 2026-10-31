import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { cpus, loadavg, platform } from 'node:os';
import { optimizeAnnualLeave } from '../src/services/annualOptimizer.js';

// Measures the complete pure engine, including calendar, candidates, DP and explanations.
const cases = [
  { name:'balanced-25',year:2027,availableDays:25,strategy:'balanced' },
  { name:'maximum-25',year:2027,availableDays:25,strategy:'maximum_time_off' },
  { name:'longest-summer-25',year:2027,availableDays:25,strategy:'longest_vacation',requiredSummerBreak:{minDays:14,months:[6,7,8]} },
  { name:'seven-day-longest-summer-366',year:2028,availableDays:366,strategy:'longest_vacation',workingDays:[0,1,2,3,4,5,6],requiredSummerBreak:{minDays:14,months:[6,7,8]},maxBreakLength:90,maxBreaks:12 },
  { name:'bounded-maximum-366',year:2028,availableDays:366,strategy:'maximum_time_off',maxBreakLength:90,maxBreaks:12 },
];
const holidays = [{ date:'2027-01-01',name:'New Year' },{date:'2027-05-06',name:'Holiday'},{date:'2027-12-25',name:'Christmas'}];
console.log(JSON.stringify({node:process.version,platform:platform(),cores:cpus().length,load:loadavg(),scope:'local pure engine; excludes provider, network and Mongo; no production latency claim'}));
for (const {name,...input} of cases) {
  const rows=holidays.map(h=>({...h,date:h.date.replace('2027',String(input.year))}));
  optimizeAnnualLeave(input,rows);
  const samples=[];
  for(let i=0;i<5;i++) {
    const start=performance.now();const result=optimizeAnnualLeave(input,rows);samples.push(performance.now()-start);
    assert.equal(result.status,'ok');assert.ok(result.usedDays<=input.availableDays);assert.equal(new Set(result.suggestions.flatMap(s=>s.leaveDates)).size,result.usedDays);
  }
  samples.sort((a,b)=>a-b);
  console.log(JSON.stringify({name,medianMs:+samples[2].toFixed(2),maxMs:+samples[4].toFixed(2),samples:5}));
}
