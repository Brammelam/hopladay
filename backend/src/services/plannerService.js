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
    case "balanced":
    default:
      break;
  }

  if (isExtension && isSummerMonth(c.startDate)) bonus += 1.0;

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
      out[out.length - 1] = {
        startDate: start,
        endDate: end,
        vacationDaysUsed: used,
        totalDaysOff: total,
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
  if (preference === "many_long_weekends") return 0;
  return 21; // balanced
}

/** consider preference when spacing; whitelist ultra-high-ROI 1-day bridges */
function wellDistributed(candidate, chosen, preference) {
  const roi = candidate.totalDaysOff / candidate.vacationDaysUsed;
  if (candidate.vacationDaysUsed === 1 && roi >= 4) return true; // never block the classic 1→4+ bridges

  const minSpacingDays = spacingThreshold(preference);
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
  const { requireLong = false } = opts;

  const scored = candidates.map((c) => ({
    ...c,
    score: scoreCandidate(c, preference, isExtension),
  }));

  scored.sort((a, b) =>
    b.score !== a.score ? b.score - a.score :
    b.totalDaysOff !== a.totalDaysOff ? b.totalDaysOff - a.totalDaysOff :
    a.vacationDaysUsed !== b.vacationDaysUsed ? a.vacationDaysUsed - b.vacationDaysUsed :
    a.startDate - b.startDate
  );

  const taken = [];
  let used = 0;

  for (const cand of scored) {
    if (requireLong && !isLongBlock(cand)) continue;
    if (used + cand.vacationDaysUsed > availableDays) continue;

    const overlaps = [...already, ...taken].some((x) => rangesOverlap(x, cand));
    if (overlaps) continue;

    if (!wellDistributed(cand, [...already, ...taken], preference)) continue;

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
    return list;
  }

  return [];
}







/** ---------- main API ---------- */

export function generateHolidayPlan(
  holidays,
  availableDays,
  year,
  preference = "balanced" // "balanced" | "many_long_weekends" | "few_long_vacations"
) {
  const { blocks: offBlocks, holidaySet } = buildOffBlocks(year, holidays);
  const picked = [];
  let remaining = availableDays;

  // phase plan per preference — now truly different
  let phases;
  if (preference === "few_long_vacations") {
    // go big first: secure a long block (extensions with 3+ workdays or 7+ total days off)
    phases = [
      { type: "ext", maxK: Math.min(10, remaining), minK: 3, minDaysOff: 7 },
      // then try longer bridges and medium add-ons
      { type: "gap", k: 3, minDaysOff: 7 },
      { type: "ext", maxK: Math.min(5, remaining), minK: 2 },
      // finally small bridges/extensions if budget remains
      { type: "gap", k: 2 },
      { type: "gap", k: 1 },
      { type: "ext", maxK: Math.min(remaining, 2) },
    ];
  } else if (preference === "many_long_weekends") {
    // prioritize lots of classic long weekends; avoid big extensions
    phases = [
      { type: "gap", k: 1, minDaysOff: 3 }, // Fri–Sun or holiday-adjacent 1→3/4
      { type: "gap", k: 2, minDaysOff: 4 },
      { type: "gap", k: 3 },
      { type: "ext", maxK: Math.min(remaining, 2), minDaysOff: 3 },
    ];
  } else {
    // balanced: ROI-first with modest breadth
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

    const chosen = pickGreedy(cands, remaining, preference, picked, phase.type === "ext");
    if (chosen.length) {
      picked.push(...chosen);
      remaining -= chosen.reduce((s, c) => s + c.vacationDaysUsed, 0);
    }
  }

  // merge & compute
  let merged = mergeSelections(picked, holidaySet).sort((a, b) => a.startDate - b.startDate);
  let usedDays = merged.reduce((s, c) => s + c.vacationDaysUsed, 0);
  let totalDaysOff = merged.reduce((s, c) => s + c.totalDaysOff, 0);

  // final fallback: spend any leftover days on Mon/Fri that doesn't overlap
  if (remaining > 0) {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);

    for (let d = new Date(start); d <= end && remaining > 0; d = nextDay(d, 1)) {
      const day = d.getDay();
      if (!isOffDay(d, holidaySet) && (day === 1 || day === 5)) {
        const overlaps = merged.some((c) => d >= c.startDate && d <= c.endDate);
        if (overlaps) continue;

        const expanded = expandToContiguousDays(d, d, holidaySet);
        merged.push({
          startDate: expanded.startDate,
          endDate: expanded.endDate,
          vacationDaysUsed: 1,
          totalDaysOff: expanded.totalDaysOff,
          description: `Use 1 vacation day for ${expanded.totalDaysOff} days off (filler)`,
        });
        remaining--;
      }
    }

    // re-merge after filler
    merged = mergeSelections(merged, holidaySet).sort((a, b) => a.startDate - b.startDate);
    usedDays = merged.reduce((s, c) => s + c.vacationDaysUsed, 0);
    totalDaysOff = merged.reduce((s, c) => s + c.totalDaysOff, 0);
  }

  return {
    year,
    usedDays,
    totalDaysOff,
    suggestions: normalizeSuggestionDates(
      merged.map((c) => ({
        ...c,
        description: `Use ${c.vacationDaysUsed} vacation day${
          c.vacationDaysUsed > 1 ? "s" : ""
        } for ${c.totalDaysOff} days off`,
      }))
    ),
  };
}


