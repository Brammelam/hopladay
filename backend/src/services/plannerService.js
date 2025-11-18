import {
  countDaysBetween,
  nextDay,
  previousDay,
  parseISODate,
  normalizeSuggestionDates,
} from "../utils/dateUtils.js";

/** ---------- small helpers ---------- */

function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}
function isHoliday(date, holidaySet) {
  return holidaySet.has(date.toDateString());
}
function isOffDay(date, holidaySet) {
  return isWeekend(date) || isHoliday(date, holidaySet);
}

/** inclusive expansion to swallow neighboring weekends/holidays */
function expandToContiguousDays(start, end, holidaySet) {
  let s = new Date(start);
  let e = new Date(end);

  // expand backwards
  for (let d = previousDay(s, 1); isOffDay(d, holidaySet); d = previousDay(d, 1)) {
    s = d;
  }
  // expand forwards
  for (let d = nextDay(e, 1); isOffDay(d, holidaySet); d = nextDay(d, 1)) {
    e = d;
  }

  const totalDaysOff = countDaysBetween(s, e);
  return { startDate: s, endDate: e, totalDaysOff };
}

function countWorkdaysInRange(startDate, endDate, holidaySet) {
  let cnt = 0;
  for (let d = new Date(startDate); d <= endDate; d = nextDay(d, 1)) {
    if (!isOffDay(d, holidaySet)) cnt++;
  }
  return cnt;
}

function rangesOverlap(a, b) {
  return !(a.endDate < b.startDate || b.endDate < a.startDate);
}
function rangesAreAdjacent(a, b) {
  const oneDayMs = 1000 * 60 * 60 * 24;
  return (
    Math.abs(a.endDate - b.startDate) <= oneDayMs ||
    Math.abs(b.endDate - a.startDate) <= oneDayMs
  );
}

function isSummerMonth(date) {
  const m = date.getMonth(); // 0=Jan
  return m >= 5 && m <= 7; // Jun–Aug
}

/** ---------- core: off blocks + candidates ---------- */

function buildOffBlocks(year, holidays) {
  const holidaySet = new Set(
    holidays.map((h) => parseISODate(h.date).toDateString())
  );
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  const blocks = [];
  let cur = new Date(start);
  let blockStart = null;

  while (cur <= end) {
    if (isOffDay(cur, holidaySet)) {
      if (!blockStart) blockStart = new Date(cur);
    } else if (blockStart) {
      blocks.push({ start: blockStart, end: previousDay(cur, 1) });
      blockStart = null;
    }
    cur = nextDay(cur, 1);
  }
  if (blockStart) blocks.push({ start: blockStart, end: end });

  return { blocks, holidaySet };
}

/** produce all k-length workday runs in [a,b] */
function workdayRunsInRange(a, b, k, holidaySet) {
  const days = [];
  for (let d = new Date(a); d <= b; d = nextDay(d, 1)) {
    if (!isOffDay(d, holidaySet)) days.push(new Date(d));
  }
  const runs = [];
  for (let i = 0; i + k - 1 < days.length; i++) {
    runs.push([days[i], days[i + k - 1]]);
  }
  return runs;
}

/** generic candidate generator
 * mode === 'gap': bridge between blocks[i] and blocks[i+1] with k workdays
 * mode === 'extend-before' / 'extend-after': extend a single block by k workdays
 */
function generateCandidates(offBlocks, holidaySet, maxK, mode) {
  const cands = [];

  if (mode === "gap") {
    for (let i = 0; i < offBlocks.length - 1; i++) {
      const A = offBlocks[i];
      const B = offBlocks[i + 1];
      const gapStart = nextDay(A.end, 1);
      const gapEnd = previousDay(B.start, 1);
      if (gapStart > gapEnd) continue;

      for (let k = 1; k <= maxK; k++) {
        for (const [runStart, runEnd] of workdayRunsInRange(gapStart, gapEnd, k, holidaySet)) {
          const expanded = expandToContiguousDays(runStart, runEnd, holidaySet);
          const used = countWorkdaysInRange(expanded.startDate, expanded.endDate, holidaySet);
          cands.push({
            startDate: expanded.startDate,
            endDate: expanded.endDate,
            vacationDaysUsed: used,
            totalDaysOff: expanded.totalDaysOff,
            meta: { kind: "gap", k },
          });
        }
      }
    }
    return dedupeCandidates(cands);
  }

  const blockHasHoliday = (blk) => {
    for (let d = new Date(blk.start); d <= blk.end; d = nextDay(d, 1)) {
      if (isHoliday(d, holidaySet)) return true;
    }
    return false;
  };

  for (const blk of offBlocks) {
    // only extend genuine holiday-containing blocks
    if (!blockHasHoliday(blk)) continue;

    for (let k = 1; k <= maxK; k++) {
      if (mode === "extend-before") {
        const runStart = previousDay(blk.start, k);
        const runEnd = previousDay(blk.start, 1);
        let ok = true;
        for (let d = new Date(runStart); d <= runEnd; d = nextDay(d, 1)) {
          if (isOffDay(d, holidaySet)) { ok = false; break; }
        }
        if (ok) {
          const expanded = expandToContiguousDays(runStart, runEnd, holidaySet);
          const used = countWorkdaysInRange(expanded.startDate, expanded.endDate, holidaySet);
          cands.push({
            startDate: expanded.startDate,
            endDate: expanded.endDate,
            vacationDaysUsed: used,
            totalDaysOff: expanded.totalDaysOff,
            meta: { kind: "extend-before", k },
          });
        }
      } else if (mode === "extend-after") {
        const runStart = nextDay(blk.end, 1);
        const runEnd = nextDay(blk.end, k);
        let ok = true;
        for (let d = new Date(runStart); d <= runEnd; d = nextDay(d, 1)) {
          if (isOffDay(d, holidaySet)) { ok = false; break; }
        }
        if (ok) {
          const expanded = expandToContiguousDays(runStart, runEnd, holidaySet);
          const used = countWorkdaysInRange(expanded.startDate, expanded.endDate, holidaySet);
          cands.push({
            startDate: expanded.startDate,
            endDate: expanded.endDate,
            vacationDaysUsed: used,
            totalDaysOff: expanded.totalDaysOff,
            meta: { kind: "extend-after", k },
          });
        }
      }
    }
  }
  return dedupeCandidates(cands);
}

/** collapse exact-duplicate (start,end) candidates that can arise from different k */
function dedupeCandidates(list) {
  const key = (c) => c.startDate.toDateString() + "|" + c.endDate.toDateString();
  const map = new Map();
  for (const c of list) {
    const k = key(c);
    if (!map.has(k)) map.set(k, c);
  }
  return [...map.values()];
}

/** mark true long vacations */
function isLongBlock(c) {
  return c.totalDaysOff >= 7;
}

/** ---------- description generation ---------- */

/**
 * Find holidays that fall within or immediately adjacent to a date range
 */
function findHolidaysInRange(startDate, endDate, holidays, holidaySet) {
  const result = [];
  const expandedStart = previousDay(startDate, 3);
  const expandedEnd = nextDay(endDate, 3);
  
  for (const h of holidays) {
    const hDate = parseISODate(h.date);
    if (hDate >= expandedStart && hDate <= expandedEnd) {
      result.push({ ...h, parsedDate: hDate });
    }
  }
  
  return result.sort((a, b) => a.parsedDate - b.parsedDate);
}

/**
 * Generate intelligent description for a vacation selection
 */
function generateDescription(selection, holidays, holidaySet, preference) {
  const { startDate, endDate, vacationDaysUsed, totalDaysOff, meta } = selection;
  const roi = totalDaysOff / vacationDaysUsed;
  
  // Find relevant holidays
  const nearbyHolidays = findHolidaysInRange(startDate, endDate, holidays, holidaySet);
  const holidaysInRange = nearbyHolidays.filter(
    h => h.parsedDate >= startDate && h.parsedDate <= endDate
  );
  
  // Build holiday names string
  const getHolidayNames = (hols) => {
    if (hols.length === 0) return "";
    if (hols.length === 1) return hols[0].name || hols[0].localName;
    if (hols.length === 2) return `${hols[0].name || hols[0].localName} and ${hols[1].name || hols[1].localName}`;
    return `${hols[0].name || hols[0].localName} and ${hols.length - 1} other holiday${hols.length > 2 ? 's' : ''}`;
  };
  
  // Determine strategy type
  let strategy = "Bridge";
  let reason = "";
  
  if (meta?.kind === "gap") {
    strategy = "Bridge";
    if (holidaysInRange.length >= 2) {
      reason = `Connects ${getHolidayNames(holidaysInRange)} into one continuous break`;
    } else if (nearbyHolidays.length >= 2) {
      const before = nearbyHolidays.filter(h => h.parsedDate < startDate);
      const after = nearbyHolidays.filter(h => h.parsedDate > endDate);
      if (before.length && after.length) {
        reason = `Bridges ${getHolidayNames([before[before.length - 1]])} to ${getHolidayNames([after[0]])}`;
      } else {
        reason = `Creates a ${totalDaysOff}-day break`;
      }
    } else {
      reason = `Turns a weekend into ${totalDaysOff} days off`;
    }
  } else if (meta?.kind === "extend-before") {
    strategy = "Extend";
    if (holidaysInRange.length > 0) {
      reason = `Adds days before ${getHolidayNames([holidaysInRange[0]])} for a longer break`;
    } else {
      reason = `Extends a holiday weekend into ${totalDaysOff} days off`;
    }
  } else if (meta?.kind === "extend-after") {
    strategy = "Extend";
    if (holidaysInRange.length > 0) {
      reason = `Adds days after ${getHolidayNames([holidaysInRange[holidaysInRange.length - 1]])} for a longer break`;
    } else {
      reason = `Extends a holiday weekend into ${totalDaysOff} days off`;
    }
  } else {
    // Filler day
    strategy = "Optimize";
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][startDate.getDay()];
    if (roi >= 4) {
      reason = `Highly efficient: Taking ${dayName} off gives you ${totalDaysOff} consecutive days`;
    } else {
      reason = `Adds a ${dayName} off for a ${totalDaysOff}-day break`;
    }
  }
  
  // Add ROI context
  let efficiency = "";
  if (roi >= 5) {
    efficiency = " (Exceptional efficiency)";
  } else if (roi >= 4) {
    efficiency = " (Great value)";
  } else if (roi >= 3) {
    efficiency = " (Good value)";
  }
  
  // Add preference-specific context
  let prefContext = "";
  if (preference === "summer_vacation" && isSummerMonth(startDate)) {
      prefContext = " Summer period";
  } else if (preference === "few_long_vacations" && totalDaysOff >= 10) {
      prefContext = " Extended vacation";
  } else if (preference === "many_long_weekends" && vacationDaysUsed <= 2 && totalDaysOff >= 3) {
      prefContext = " Long weekend";
  }
  
  return {
    title: `${strategy}: ${vacationDaysUsed} day${vacationDaysUsed > 1 ? 's' : ''} → ${totalDaysOff} days off${efficiency}`,
    reason: reason + prefContext,
    roi: roi.toFixed(1),
    efficiency: roi >= 4 ? "high" : roi >= 3 ? "good" : "normal"
  };
}

/** ---------- scoring & picking ---------- */

function scoreCandidate(c, preference, isExtension) {
  const roi = c.totalDaysOff / c.vacationDaysUsed;

  let bonus = 0;
  switch (preference) {
    case "many_long_weekends":
      if (c.vacationDaysUsed === 1) bonus += 2;
      else if (c.vacationDaysUsed === 2) bonus += 0.5;
      break;
    case "few_long_vacations":
      if (c.totalDaysOff >= 10) bonus += 3.0;
      else if (c.totalDaysOff >= 8) bonus += 2.25;
      else if (c.totalDaysOff >= 6) bonus += 1.25;
      break;
    case "summer_vacation":
      if (isSummerMonth(c.startDate)) {
        bonus += 3.0;
        if (c.totalDaysOff >= 7) bonus += 2.0;
      }
      break;
    case "spread_out":
      if (c.vacationDaysUsed <= 2) bonus += 0.5;
      break;
    case "balanced":
    default:
      break;
  }

  if (isExtension && isSummerMonth(c.startDate) && preference !== "summer_vacation") {
    bonus += 1.0;
  }

  return roi + bonus;
}

/** merge overlapping/adjacent selections and recompute counts */
function mergeSelections(list, holidaySet) {
  if (!list.length) return [];
  const sorted = [...list].sort((a, b) => a.startDate - b.startDate);
  const out = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];

    if (rangesOverlap(last, cur) || rangesAreAdjacent(last, cur)) {
      const start = last.startDate < cur.startDate ? last.startDate : cur.startDate;
      const end   = last.endDate   > cur.endDate   ? last.endDate   : cur.endDate;
      const used  = countWorkdaysInRange(start, end, holidaySet);
      const total = countDaysBetween(start, end);
      
      // Keep the meta from the selection with the higher score/ROI if available
      const lastRoi = last.totalDaysOff / last.vacationDaysUsed;
      const curRoi = cur.totalDaysOff / cur.vacationDaysUsed;
      const keepMeta = (last.score || lastRoi) >= (cur.score || curRoi) ? last.meta : cur.meta;
      
      out[out.length - 1] = {
        startDate: start,
        endDate: end,
        vacationDaysUsed: used,
        totalDaysOff: total,
        meta: keepMeta || { kind: "merged" },
      };
    } else {
      out.push(cur);
    }
  }
  return out;
}

/** spacing tuned by preference */
function spacingThreshold(preference) {
  if (preference === "few_long_vacations") return 0;
  if (preference === "many_long_weekends") return 21; // Changed from 0 to 21 for better distribution
  if (preference === "spread_out") return 35;
  if (preference === "summer_vacation") return 14;
  return 21;
}

/** adaptive spacing based on remaining days */
function adaptiveSpacingThreshold(preference, remainingDays, totalAvailableDays) {
  const base = spacingThreshold(preference);
  
  // If we have lots of days to spend (>50% remaining), allow tighter clustering
  if (remainingDays > totalAvailableDays * 0.5) {
    return Math.max(0, base - 7);
  }
  
  // If we're running low on days (<25% remaining), space them out more
  if (remainingDays < totalAvailableDays * 0.25) {
    return base + 7;
  }
  
  return base;
}

/** consider preference when spacing; whitelist ultra-high-ROI 1-day bridges */
function wellDistributed(candidate, chosen, preference, remainingDays, totalAvailableDays) {
  const roi = candidate.totalDaysOff / candidate.vacationDaysUsed;
  
  // For distribution-focused preferences, enforce spacing even for high-ROI bridges
  const enforceSpacing = preference === "many_long_weekends" || preference === "spread_out";
  
  // Only bypass spacing for exceptional bridges if NOT a distribution-focused preference
  if (!enforceSpacing && candidate.vacationDaysUsed === 1 && roi >= 4) {
    return true; // allow ultra-efficient 1→4+ bridges to bypass spacing
  }

  const minSpacingDays = adaptiveSpacingThreshold(preference, remainingDays, totalAvailableDays);
  if (minSpacingDays === 0) return true;

  for (const c of chosen) {
    const gap =
      candidate.startDate > c.endDate
        ? (candidate.startDate - c.endDate) / 86400000
        : c.startDate > candidate.endDate
        ? (c.startDate - candidate.endDate) / 86400000
        : 0;
    if (gap < minSpacingDays) return false;
  }
  return true;
}

/** greedy selector with optional long-block requirement */
function pickGreedy(candidates, availableDays, preference, already = [], isExtension = false, opts = {}) {
  const { requireLong = false, totalAvailableDays = availableDays } = opts;

  const scored = candidates.map((c) => ({
    ...c,
    score: scoreCandidate(c, preference, isExtension),
  }));

  // Special sorting for many_long_weekends: distribute across months
  if (preference === "many_long_weekends") {
    scored.sort((a, b) => {
      // First by score tier (high vs normal)
      const aScoreTier = a.score >= 4 ? 'high' : 'normal';
      const bScoreTier = b.score >= 4 ? 'high' : 'normal';
      if (aScoreTier !== bScoreTier) {
        return aScoreTier === 'high' ? -1 : 1;
      }
      
      // Within same tier, prefer chronological distribution
      // This encourages spacing throughout the year instead of clustering
      return a.startDate - b.startDate;
    });
  } else {
    // Default sorting: highest score first
    scored.sort((a, b) =>
      b.score !== a.score ? b.score - a.score :
      b.totalDaysOff !== a.totalDaysOff ? b.totalDaysOff - a.totalDaysOff :
      a.vacationDaysUsed !== b.vacationDaysUsed ? a.vacationDaysUsed - b.vacationDaysUsed :
      a.startDate - b.startDate
    );
  }

  const taken = [];
  let used = 0;

  for (const cand of scored) {
    if (requireLong && !isLongBlock(cand)) continue;
    if (used + cand.vacationDaysUsed > availableDays) continue;

    const overlaps = [...already, ...taken].some((x) => rangesOverlap(x, cand));
    if (overlaps) continue;

    // Calculate current remaining days for adaptive spacing
    const currentRemaining = availableDays - used;
    if (!wellDistributed(cand, [...already, ...taken], preference, currentRemaining, totalAvailableDays)) continue;

    taken.push(cand);
    used += cand.vacationDaysUsed;
    if (used === availableDays) break;
  }
  return taken;
}

/** helper to fetch candidates per "phase" with optional filters */
function getPhaseCandidates(offBlocks, holidaySet, phase, remainingDays) {
  // keep only candidates that truly add time off beyond the vacation days used
  const hasRealGain = (c) => c.totalDaysOff > c.vacationDaysUsed;

  if (phase.type === "gap") {
    // IMPORTANT: only exact-k gap bridges in this phase
    let list = generateCandidates(offBlocks, holidaySet, phase.k, "gap")
      .filter((c) => c.vacationDaysUsed === phase.k)
      .filter(hasRealGain);

    if (phase.minDaysOff) {
      list = list.filter((c) => c.totalDaysOff >= phase.minDaysOff);
    }
    return dedupeCandidates(list);
  }

  if (phase.type === "ext") {
    const maxK = Math.min(phase.maxK ?? remainingDays, remainingDays);
    let list = dedupeCandidates([
      ...generateCandidates(offBlocks, holidaySet, maxK, "extend-before"),
      ...generateCandidates(offBlocks, holidaySet, maxK, "extend-after"),
    ]).filter(hasRealGain);

    if (phase.minK) {
      list = list.filter((c) => c.vacationDaysUsed >= phase.minK);
    }
    if (phase.minDaysOff) {
      list = list.filter((c) => c.totalDaysOff >= phase.minDaysOff);
    }
    if (phase.summerOnly) {
      list = list.filter((c) => isSummerMonth(c.startDate));
    }
    return list;
  }

  return [];
}







/** ---------- main API ---------- */

export function generateHolidayPlan(
  holidays,
  availableDays,
  year,
  preference = "balanced"
) {
  const { blocks: offBlocks, holidaySet } = buildOffBlocks(year, holidays);
  const picked = [];
  let remaining = availableDays;
  
  // phase plan per preference
  let phases;
  if (preference === "few_long_vacations") {
    phases = [
      { type: "ext", maxK: Math.min(10, remaining), minK: 3, minDaysOff: 7 },
      { type: "gap", k: 3, minDaysOff: 7 },
      { type: "ext", maxK: Math.min(5, remaining), minK: 2 },
      { type: "gap", k: 2 },
      { type: "gap", k: 1 },
      { type: "ext", maxK: Math.min(remaining, 2) },
    ];
  } else if (preference === "many_long_weekends") {
    phases = [
      { type: "gap", k: 1, minDaysOff: 3 },
      { type: "gap", k: 2, minDaysOff: 4 },
      { type: "gap", k: 3 },
      { type: "ext", maxK: Math.min(remaining, 2), minDaysOff: 3 },
    ];
  } else if (preference === "summer_vacation") {
    phases = [
      { type: "gap", k: 1 },
      { type: "gap", k: 2 },
      { type: "ext", maxK: Math.min(remaining, 10), minK: 3, summerOnly: true },
      { type: "gap", k: 3 },
      { type: "ext", maxK: Math.min(remaining, 5) },
    ];
  } else if (preference === "spread_out") {
    phases = [
      { type: "gap", k: 1 },
      { type: "gap", k: 2 },
      { type: "gap", k: 3 },
      { type: "ext", maxK: Math.min(remaining, 3) },
    ];
  } else {
    phases = [
      { type: "gap", k: 1 },
      { type: "gap", k: 2 },
      { type: "gap", k: 3 },
      { type: "ext", maxK: Math.min(remaining, 5) },
    ];
  }

  // run phases
  for (const phase of phases) {
    if (remaining <= 0) break;
    const cands = getPhaseCandidates(offBlocks, holidaySet, phase, remaining);
    if (!cands.length) continue;

    const chosen = pickGreedy(cands, remaining, preference, picked, phase.type === "ext", { 
      totalAvailableDays: availableDays
    });
    if (chosen.length) {
      // Preserve meta for description generation
      picked.push(...chosen.map(c => ({ ...c, meta: c.meta })));
      remaining -= chosen.reduce((s, c) => s + c.vacationDaysUsed, 0);
    }
  }

  // merge & compute
  let merged = mergeSelections(picked, holidaySet).sort((a, b) => a.startDate - b.startDate);
  let usedDays = merged.reduce((s, c) => s + c.vacationDaysUsed, 0);
  let totalDaysOff = merged.reduce((s, c) => s + c.totalDaysOff, 0);

  // final fallback: spend any leftover days on high-ROI bridge opportunities
  if (remaining > 0) {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);

    // Collect all potential filler days with ROI scoring
    const fillerCandidates = [];
    for (let d = new Date(start); d <= end; d = nextDay(d, 1)) {
      if (isOffDay(d, holidaySet)) continue;
      
      const overlaps = merged.some((c) => d >= c.startDate && d <= c.endDate);
      if (overlaps) continue;

      // Check if this day bridges two off-days (any day of the week)
      const dayBefore = previousDay(d, 1);
      const dayAfter = nextDay(d, 1);
      const isBridge = isOffDay(dayBefore, holidaySet) && isOffDay(dayAfter, holidaySet);
      
      if (isBridge) {
        // Calculate the ROI if we take this day off
        const expanded = expandToContiguousDays(d, d, holidaySet);
        const roi = expanded.totalDaysOff / 1; // Always uses 1 vacation day
        
        fillerCandidates.push({
          date: new Date(d),
          expanded,
          roi,
          isMidWeek: d.getDay() !== 1 && d.getDay() !== 5, // Track mid-week bridges
        });
      } else {
        // Also consider Monday/Friday as traditional filler days (lower priority)
        const day = d.getDay();
        if (day === 1 || day === 5) {
          const expanded = expandToContiguousDays(d, d, holidaySet);
          const roi = expanded.totalDaysOff / 1;
          
          fillerCandidates.push({
            date: new Date(d),
            expanded,
            roi,
            isMidWeek: false,
          });
        }
      }
    }

    // Sort by ROI (highest first), then prioritize bridges over regular days
    fillerCandidates.sort((a, b) => {
      // First, prioritize high-ROI bridges (ROI >= 4)
      if (a.roi >= 4 && b.roi < 4) return -1;
      if (b.roi >= 4 && a.roi < 4) return 1;
      
      // Then sort by ROI
      if (b.roi !== a.roi) return b.roi - a.roi;
      
      // Then prioritize bridges over regular Mon/Fri
      if (a.isMidWeek && !b.isMidWeek) return -1;
      if (b.isMidWeek && !a.isMidWeek) return 1;
      
      return a.date - b.date;
    });

    // Apply preference-based sorting to fillerCandidates before extracting dates
    if (preference === "summer_vacation") {
      // Further prioritize summer months within same ROI tier
      fillerCandidates.sort((a, b) => {
        const aSummer = isSummerMonth(a.date) ? 1 : 0;
        const bSummer = isSummerMonth(b.date) ? 1 : 0;
        if (bSummer !== aSummer) return bSummer - aSummer;
        return b.roi - a.roi || a.date - b.date;
      });
    }
    
    const fillerDays = fillerCandidates.map(c => c.date);

    // Add filler days up to remaining budget
    const fillerMonthCounts = new Map();
    
    // Pre-populate with existing selections for many_long_weekends
    if (preference === "many_long_weekends") {
      merged.forEach(m => {
        const month = m.startDate.getMonth();
        fillerMonthCounts.set(month, (fillerMonthCounts.get(month) || 0) + 1);
      });
    }
    
    for (const d of fillerDays) {
      if (remaining <= 0) break;
      
      // For many_long_weekends, enforce monthly cap even in filler
      if (preference === "many_long_weekends") {
        const month = d.getMonth();
        const countInMonth = fillerMonthCounts.get(month) || 0;
        if (countInMonth >= 2) {
          continue; // Skip to maintain distribution
        }
        fillerMonthCounts.set(month, countInMonth + 1);
      }
      
      const expanded = expandToContiguousDays(d, d, holidaySet);
      
      merged.push({
        startDate: expanded.startDate,
        endDate: expanded.endDate,
        vacationDaysUsed: 1,
        totalDaysOff: expanded.totalDaysOff,
        meta: { kind: "filler" },
      });
      remaining--;
    }

    // re-merge after filler
    merged = mergeSelections(merged, holidaySet).sort((a, b) => a.startDate - b.startDate);
    usedDays = merged.reduce((s, c) => s + c.vacationDaysUsed, 0);
    totalDaysOff = merged.reduce((s, c) => s + c.totalDaysOff, 0);
  }

  // Generate intelligent descriptions for all selections
  const suggestionsWithDescriptions = merged.map((c) => {
    const desc = generateDescription(c, holidays, holidaySet, preference);
    return {
      ...c,
      description: desc.title,
      reason: desc.reason,
      roi: desc.roi,
      efficiency: desc.efficiency,
    };
  });

  return {
    year,
    usedDays,
    totalDaysOff,
    suggestions: normalizeSuggestionDates(suggestionsWithDescriptions),
  };
}


