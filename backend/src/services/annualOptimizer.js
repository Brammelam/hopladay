import { buildCalendar } from './calendarModel.js';

const strategies = ['maximum_time_off', 'longest_vacation', 'balanced'];
function integer(value, fallback, min, max, name) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return result;
}
function months(values, fallback) {
  const result = values ?? fallback;
  if (!Array.isArray(result) || result.length > 12 || new Set(result).size !== result.length || result.some(v => !Number.isInteger(v) || v < 1 || v > 12)) throw new Error('Month lists must contain distinct integers from 1 to 12');
  return result;
}

export function validateOptimizationInput(input) {
  if (!input || typeof input !== 'object') throw new Error('Planning input is required');
  const strategy = input.strategy ?? 'balanced';
  if (!strategies.includes(strategy)) throw new Error('Unsupported strategy');
  const availableDays = integer(input.availableDays, undefined, 0, 366, 'availableDays');
  const minLength = integer(input.minBreakLength, 3, 1, 90, 'minBreakLength');
  const maxLength = integer(input.maxBreakLength, strategy === 'balanced' ? 21 : 90, minLength, 90, 'maxBreakLength');
  const maxBreaks = integer(input.maxBreaks, strategy === 'balanced' ? 4 : 12, 1, 12, 'maxBreaks');
  const separation = integer(input.minSeparationDays, strategy === 'balanced' ? 21 : 1, 1, 365, 'minSeparationDays');
  const preferredLength = integer(input.preferredBreakLength, 9, 1, 90, 'preferredBreakLength');
  const seasonalWeight = integer(input.seasonalWeight, 1, 0, 10, 'seasonalWeight');
  const preferredMonths = months(input.preferredMonths, []);
  const summer = input.requiredSummerBreak;
  if (summer !== undefined && (!summer || typeof summer !== 'object' || Array.isArray(summer))) throw new Error('requiredSummerBreak must be an object');
  const summerMin = summer ? integer(summer.minDays, 14, 1, 90, 'requiredSummerBreak.minDays') : 0;
  const summerMonths = summer ? months(summer.months, [6,7,8]) : [];
  if (summer && !summerMonths.length) throw new Error('Required summer months cannot be empty');
  return { strategy, availableDays, minLength, maxLength, maxBreaks, separation, preferredLength, seasonalWeight, preferredMonths, summer, summerMin, summerMonths };
}

export function optimizeAnnualLeave(input, holidays = []) {
  const { strategy, availableDays, minLength, maxLength, maxBreaks, separation, preferredLength, seasonalWeight, preferredMonths, summer, summerMin, summerMonths } = validateOptimizationInput(input);
  const calendar = buildCalendar(input, holidays);
  const n = calendar.length;
  const indices = new Map(calendar.map((day,i) => [day.date,i]));
  const cost = [0], preferred = [0], approved = [0], notSummer = [0];
  calendar.forEach((day,i) => {
    cost.push(cost[i] + Number(day.requiresLeave));
    preferred.push(preferred[i] + Number(preferredMonths.includes(day.month)));
    approved.push(approved[i] + Number(day.approvedLeave));
    notSummer.push(notSummer[i] + Number(!summerMonths.includes(day.month)));
  });
  function interval(start,end) {
    const length = end-start+1;
    const preferredDays = preferred[end+1]-preferred[start];
    const midpoint = (start+end)/2;
    const seasonalBonus = Math.max(0, 14-Math.min(...[0.125,0.375,0.625,0.875].map(q => Math.abs(midpoint-n*q))));
    return { start, end, length, cost: cost[end+1]-cost[start], summer: length>=summerMin && notSummer[end+1]===notSummer[start], utility: strategy === 'balanced' ? Math.round(100*(10*Math.min(length,preferredLength)-3*Math.abs(length-preferredLength)+2*preferredDays+seasonalWeight*seasonalBonus)) : length*1000000+preferredDays*100 };
  }
  const locks = input.lockedBreaks ?? [];
  if (!Array.isArray(locks) || locks.length > 12) throw new Error('lockedBreaks must contain at most 12 intervals');
  const fixed = locks.map(lock => {
    const start = indices.get(lock?.startDate), end = indices.get(lock?.endDate);
    if (start===undefined || end===undefined || start>end || end-start+1<minLength || end-start+1>maxLength) throw new Error('A locked break falls outside the horizon or length constraints');
    if ((start>0 && !calendar[start-1].requiresLeave && !calendar[start-1].excluded) || (end+1<n && !calendar[end+1].requiresLeave && !calendar[end+1].excluded)) throw new Error('Locked break must include adjacent non-working dates');
    if (calendar.slice(start,end+1).some(day => day.excluded)) throw new Error('A locked break contains an excluded date');
    return { ...interval(start,end), locked: true };
  }).sort((a,b) => a.start-b.start);
  for (let i=1;i<fixed.length;i++) if (fixed[i].start-fixed[i-1].end<=separation) throw new Error('Locked breaks overlap or violate minimum separation');
  const fixedCost = fixed.reduce((sum,c) => sum+c.cost,0);
  const fixedLongest = Math.max(0,...fixed.map(c => c.length));
  const remaining = Math.min(availableDays-fixedCost, cost[n]);
  const slots = maxBreaks-fixed.length;
  const needsSummer = !!summer && !fixed.some(c => c.summer);
  const candidates = [];
  for (let start=0;start<n;start++) {
    if (start>0 && !calendar[start-1].requiresLeave && !calendar[start-1].excluded) continue;
    for (let end=start;end<n && end-start<maxLength;end++) {
      if (calendar[end].excluded) break;
      if (end-start+1<minLength) continue;
      if (end+1<n && !calendar[end+1].requiresLeave && !calendar[end+1].excluded) continue;
      const c = interval(start,end);
      if (c.cost>remaining || (!c.cost && approved[end+1]===approved[start])) continue;
      if (fixed.some(lock => c.start<=lock.end+separation && c.end>=lock.start-separation)) continue;
      candidates.push(c);
    }
  }
  let principal = 0;
  if (strategy === 'longest_vacation' && slots>0) {
    const before = new Float64Array(n).fill(Infinity), after = new Float64Array(n).fill(Infinity);
    for (const c of candidates) if (c.summer) { before[c.end]=Math.min(before[c.end],c.cost); after[c.start]=Math.min(after[c.start],c.cost); }
    for (let i=1;i<n;i++) before[i]=Math.min(before[i],before[i-1]);
    for (let i=n-2;i>=0;i--) after[i]=Math.min(after[i],after[i+1]);
    for (const c of candidates) {
      const extra = Math.min(c.start-separation-1>=0 ? before[c.start-separation-1] : Infinity, c.end+separation+1<n ? after[c.end+separation+1] : Infinity);
      if (!needsSummer || c.summer || (slots>=2 && c.cost+extra<=remaining)) principal=Math.max(principal,c.length);
    }
  }
  const needsPrincipal = principal>fixedLongest;
  const summerBit = needsSummer ? 1 : 0;
  const principalBit = needsPrincipal ? (needsSummer ? 2 : 1) : 0;
  const flagCount = (needsSummer?2:1)*(needsPrincipal?2:1);
  const required = summerBit|principalBit;
  let selected = [], feasible = remaining>=0 && slots>=0;
  if (feasible) {
    const width = (remaining+1)*(slots+1)*flagCount;
    const size = (n+1)*width;
    const values = new Float64Array(size).fill(-Infinity);
    const trace = new Int32Array(size).fill(-1);
    const previous = new Int32Array(size).fill(-1);
    values[0]=0;
    const endings = Array.from({length:n+1},()=>[]);
    candidates.forEach((c,id) => endings[c.end+1].push(id));
    for (let position=1;position<=n;position++) {
      const offset=position*width, last=offset-width;
      values.set(values.subarray(last,offset),offset);
      trace.set(trace.subarray(last,offset),offset);
      previous.set(previous.subarray(last,offset),offset);
      for (const id of endings[position]) {
        const c=candidates[id];
        const source=Math.max(0,c.start-separation)*width;
        const bits=(c.summer?summerBit:0)|(c.length===principal?principalBit:0);
        for (let budget=c.cost;budget<=remaining;budget++) {
          for (let count=1;count<=slots;count++) {
            const from=source+((budget-c.cost)*(slots+1)+count-1)*flagCount;
            const to=offset+(budget*(slots+1)+count)*flagCount;
            for (let flags=0;flags<flagCount;flags++) {
              const value=values[from+flags]+c.utility;
              if (value>values[to+(flags|bits)]) { values[to+(flags|bits)]=value;trace[to+(flags|bits)]=id;previous[to+(flags|bits)]=from+flags; }
            }
          }
        }
      }
    }
    let best=-1, score=-Infinity;
    for (let budget=0;budget<=remaining;budget++) for (let count=0;count<=slots;count++) {
      const index=n*width+(budget*(slots+1)+count)*flagCount+required;
      if (values[index]>score) {score=values[index];best=index;}
    }
    feasible=best>=0 && score!==-Infinity;
    while (feasible && trace[best]>=0) { selected.push(candidates[trace[best]]);best=previous[best]; }
  }
  const suggestions = feasible ? [...fixed,...selected].sort((a,b)=>a.start-b.start).map(c => {
    const days=calendar.slice(c.start,c.end+1);
    return { startDate:days[0].date,endDate:days.at(-1).date,totalDaysOff:c.length,vacationDaysUsed:c.cost,leaveDates:days.filter(d=>d.requiresLeave).map(d=>d.date),publicHolidays:days.filter(d=>d.publicHoliday).map(d=>({date:d.date,names:d.holidayNames})),approvedLeave:days.filter(d=>d.approvedLeave).map(d=>d.date),locked:!!c.locked,reasonCode:strategy,description:`${c.cost} leave days for ${c.length} consecutive calendar days`,reason:strategy==='longest_vacation'?'Longest feasible principal break, then maximum remaining time off.':strategy==='balanced'?'Length, preferred months and seasonal utility subject to separation constraints.':'Maximum distinct calendar days within the declared constraints.' };
  }) : [];
  const usedDays=suggestions.reduce((sum,s)=>sum+s.vacationDaysUsed,0);
  const leaveDates=new Set(suggestions.flatMap(s=>s.leaveDates));
  return {
    version:2,status:feasible?'ok':'infeasible',year:input.year,strategy,availableDays,usedDays,remainingDays:availableDays-usedDays,totalDaysOff:suggestions.reduce((sum,s)=>sum+s.totalDaysOff,0),longestVacation:Math.max(0,...suggestions.map(s=>s.totalDaysOff)),breakCount:suggestions.length,suggestions,
    calendar:calendar.map(day=>({...day,recommendedLeave:leaveDates.has(day.date)})),
    constraintsSatisfied:feasible,violations:feasible?[]:[fixedCost>availableDays?'locked_budget':slots<0?'locked_break_count':'required_summer_break'],
    constraints:{minBreakLength:minLength,maxBreakLength:maxLength,preferredBreakLength:preferredLength,maxBreaks,minSeparationDays:separation,preferredMonths,seasonalWeight,requiredSummerBreak:summer??null},
    optimality:{exact:true,objective:strategy==='balanced'?'Defined additive balanced utility; not a universal measure of vacation quality.':strategy==='longest_vacation'?'Longest break, then maximum covered days.':'Maximum distinct calendar days in qualifying breaks.',method:'Budgeted weighted interval dynamic programming',bounds:{maxBreakLength:90,maxBreaks:12}},
    limitations:['Only the provided holiday jurisdiction and work calendar apply.','Breaks cannot touch or overlap; exclusions block whole intervals.','Existing approved leave is not charged to the new allowance.','Only suggested breaks contribute to calendar days; unrelated weekends are excluded.'],
  };
}
