import express from "express";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import HolidayPlan from "../models/HolidayPlan.js";
import User from "../models/User.js";
import { getHolidaysForYear } from '../services/holidayService.js';
import { generateHolidayPlan } from "../services/plannerService.js";
import { parseISODate } from "../utils/dateUtils.js";

const router = express.Router();

/** Local calendar day yyyy-MM-dd (aligned with parseISODate / API holiday dates) */
function calendarKey(d) {
  return format(new Date(d), "yyyy-MM-dd");
}

function startOfLocalDay(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

function buildHolidaySet(holidays) {
  return new Set(holidays.map((h) => calendarKey(parseISODate(h.date))));
}

function calculatePlanUsage(suggestions, holidays) {
  let vacationDaysUsed = 0;
  let totalDaysOff = 0;

  for (const suggestion of suggestions) {
    vacationDaysUsed += suggestion.vacationDaysUsed || 0;
    totalDaysOff += suggestion.totalDaysOff || 0;
  }

  return { usedDays: vacationDaysUsed, totalDaysOff };
}

function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isOffDay(d, holidaySet) {
  return isWeekend(d) || holidaySet.has(calendarKey(d));
}

function expandManualDay(date, holidaySet, endDateParam, existingBlocks = []) {
  let startDate = startOfLocalDay(date);
  let endDate = endDateParam ? startOfLocalDay(endDateParam) : startOfLocalDay(date);

  const isInExistingBlock = (d) => {
    const k = calendarKey(d);
    return existingBlocks.some((block) => {
      const a = calendarKey(block.startDate);
      const b = calendarKey(block.endDate);
      return k >= a && k <= b;
    });
  };

  console.log(`Expanding from ${calendarKey(startDate)} to ${calendarKey(endDate)}`);

  let prev = addDays(startDate, -1);
  let backwardCount = 0;
  while (isOffDay(prev, holidaySet) && !isInExistingBlock(prev)) {
    console.log(`  Expanding backward: ${calendarKey(prev)} is off day`);
    startDate = startOfLocalDay(prev);
    prev = addDays(startDate, -1);
    backwardCount++;
    if (backwardCount > 10) break;
  }
  if (isInExistingBlock(prev)) {
    console.log(`  Stopped backward expansion: ${calendarKey(prev)} is in existing block`);
  }

  let next = addDays(endDate, 1);
  let forwardCount = 0;
  while (isOffDay(next, holidaySet) && !isInExistingBlock(next)) {
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][next.getDay()];
    const isWeekendDay = isWeekend(next);
    const isHolidayDay = holidaySet.has(calendarKey(next));
    console.log(`  Expanding forward: ${calendarKey(next)} (${dayName}) - Weekend: ${isWeekendDay}, Holiday: ${isHolidayDay}`);
    endDate = startOfLocalDay(next);
    next = addDays(endDate, 1);
    forwardCount++;
    if (forwardCount > 10) {
      console.log('  Breaking expansion - safety limit reached');
      break;
    }
  }
  if (isInExistingBlock(next)) {
    console.log(`  Stopped forward expansion: ${calendarKey(next)} is in existing block`);
  }

  console.log(`Expanded to ${calendarKey(startDate)} to ${calendarKey(endDate)}`);

  let vacationDaysUsed = 0;
  let current = new Date(startDate);
  while (calendarKey(current) <= calendarKey(endDate)) {
    if (!isOffDay(current, holidaySet)) {
      vacationDaysUsed++;
    }
    current = addDays(current, 1);
  }

  const totalDaysOff = differenceInCalendarDays(endDate, startDate) + 1;

  console.log(`Result: ${vacationDaysUsed} vacation days, ${totalDaysOff} total days off`);

  return {
    startDate,
    endDate,
    vacationDaysUsed,
    totalDaysOff,
    isManual: true
  };
}

function mergeAdjacentBlocks(suggestions, holidaySet) {
  if (suggestions.length === 0) return suggestions;

  console.log(`\n=== MERGE ADJACENT BLOCKS ===`);
  console.log(`Input: ${suggestions.length} suggestions`);

  // Convert Mongoose documents to plain objects and sort
  const plainSuggestions = suggestions.map(s => ({
    ...s.toObject ? s.toObject() : s,
    startDate: new Date(s.startDate),
    endDate: new Date(s.endDate)
  }));
  
  const sorted = plainSuggestions.sort((a, b) => a.startDate - b.startDate);

  const merged = [];
  let current = {
    ...sorted[0],
    startDate: new Date(sorted[0].startDate),
    endDate: new Date(sorted[0].endDate)
  };

  for (let i = 1; i < sorted.length; i++) {
    const next = {
      ...sorted[i],
      startDate: new Date(sorted[i].startDate),
      endDate: new Date(sorted[i].endDate)
    };
    
    console.log(`\nComparing:`);
    console.log(`  Current: ${current.startDate.toDateString()} - ${current.endDate.toDateString()} (${current.isManual ? 'MANUAL' : 'AI'})`);
    console.log(`  Next: ${next.startDate.toDateString()} - ${next.endDate.toDateString()} (${next.isManual ? 'MANUAL' : 'AI'})`);

    const cs = startOfLocalDay(current.startDate);
    const ce = startOfLocalDay(current.endDate);
    const ns = startOfLocalDay(next.startDate);
    const ne = startOfLocalDay(next.endDate);

    const overlaps = ns.getTime() <= ce.getTime() && ne.getTime() >= cs.getTime();

    const directlyAdjacent = !overlaps && differenceInCalendarDays(ns, ce) === 1;

    let onlyOffDaysBetween = false;
    if (!overlaps && !directlyAdjacent && differenceInCalendarDays(ns, ce) > 1) {
      onlyOffDaysBetween = true;
      let checkDay = addDays(ce, 1);
      while (calendarKey(checkDay) < calendarKey(ns)) {
        if (!isOffDay(checkDay, holidaySet)) {
          onlyOffDaysBetween = false;
          break;
        }
        checkDay = addDays(checkDay, 1);
      }
    }

    console.log(`  Overlaps: ${overlaps}, DirectlyAdjacent: ${directlyAdjacent}, OnlyOffDaysBetween: ${onlyOffDaysBetween}`);

    if (overlaps || directlyAdjacent || onlyOffDaysBetween) {
      console.log(`  → MERGING (overlaps: ${overlaps}, onlyOffDaysBetween: ${onlyOffDaysBetween})`);
      
      const combinedStart = cs.getTime() <= ns.getTime() ? cs : ns;
      const combinedEnd = ce.getTime() >= ne.getTime() ? ce : ne;

      let vacationDaysUsed = 0;
      let d = new Date(combinedStart);
      while (calendarKey(d) <= calendarKey(combinedEnd)) {
        if (!isOffDay(d, holidaySet)) {
          vacationDaysUsed++;
        }
        d = addDays(d, 1);
      }

      const totalDaysOff = differenceInCalendarDays(combinedEnd, combinedStart) + 1;
      
      // Mark as manual if either was manual
      const isManualMerge = current.isManual || next.isManual;
      
      // Smart efficiency calculation: If merging manual + AI, show actual AI contribution
      let description, reason, roi, efficiency;
      
      if (current.isManual && !next.isManual) {
        // Manual block merged with AI - show AI's actual contribution
        const aiContribution = next.vacationDaysUsed;
        const aiGain = totalDaysOff - current.totalDaysOff;
        const actualRoi = aiGain / aiContribution;
        
        roi = actualRoi.toFixed(1);
        efficiency = actualRoi >= 4 ? 'high' : actualRoi >= 3 ? 'good' : 'normal';
        description = `Extended: +${aiContribution} day${aiContribution > 1 ? 's' : ''} → ${totalDaysOff} days total`;
        reason = `We added ${aiContribution} vacation day${aiContribution > 1 ? 's' : ''} to extend your manual selection (${aiGain} extra days)`;
      } else if (!current.isManual && next.isManual) {
        // AI block merged with manual - show AI's actual contribution
        const aiContribution = current.vacationDaysUsed;
        const aiGain = totalDaysOff - next.totalDaysOff;
        const actualRoi = aiGain / aiContribution;
        
        roi = actualRoi.toFixed(1);
        efficiency = actualRoi >= 4 ? 'high' : actualRoi >= 3 ? 'good' : 'normal';
        description = `Extended: +${aiContribution} day${aiContribution > 1 ? 's' : ''} → ${totalDaysOff} days total`;
        reason = `We added ${aiContribution} vacation day${aiContribution > 1 ? 's' : ''} to extend your manual selection (${aiGain} extra days)`;
      } else {
        // Both manual or both AI: always describe the merged range (never keep a
        // single-segment description like "1 day → 3 days off" after combining blocks).
        const simpleRoi =
          vacationDaysUsed > 0 ? totalDaysOff / vacationDaysUsed : 0;
        roi = vacationDaysUsed > 0 ? simpleRoi.toFixed(1) : '0.0';
        efficiency =
          simpleRoi >= 4 ? 'high' : simpleRoi >= 3 ? 'good' : 'normal';

        if (current.isManual && next.isManual) {
          description = `Manual: ${vacationDaysUsed} day${
            vacationDaysUsed > 1 ? 's' : ''
          } → ${totalDaysOff} days off`;
          reason = 'Manually selected vacation period';
        } else {
          description = `Use ${vacationDaysUsed} vacation day${
            vacationDaysUsed > 1 ? 's' : ''
          } for ${totalDaysOff} days off`;
          reason = `Combined vacation block for ${totalDaysOff} days off`;
        }
      }
      
      current = {
        ...current,
        startDate: combinedStart,
        endDate: combinedEnd,
        vacationDaysUsed,
        totalDaysOff,
        description,
        reason,
        roi,
        efficiency,
        isManual: isManualMerge,
        isMerged: current.isManual !== next.isManual // Mark as merged only if manual+AI
      };
      
      console.log(`  Merged result: ${combinedStart.toDateString()} - ${combinedEnd.toDateString()}`);
    } else {
      console.log(`  → NOT MERGING (keeping separate)`);
      // No merge, push current and move to next
      merged.push(current);
      current = next; // next already has proper Date objects
    }
  }
  
  // Push the last one
  merged.push(current);

  console.log(`\nMerge complete: ${merged.length} suggestions (started with ${suggestions.length})`);
  
  if (merged.length < suggestions.length) {
    console.log(`WARNING: Lost ${suggestions.length - merged.length} suggestions during merge!`);
  }

  return merged;
}

/**
 * POST /api/plans
 * Generate or regenerate a holiday plan for a user, or create an empty plan for manual planning
 * Body: { userId, year, country, availableDays?, preference?, generateAI? }
 * - generateAI (default true): if false, creates an empty plan with no suggestions
 */
router.post('/', async (req, res) => {
  try {
    const { userId, year, country = 'NO', availableDays, preference = 'balanced', generateAI = true, lang = 'en' } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const vacationDays = availableDays ?? user.availableDays;
    const isPremium = user.isPremium || false;

    // Generate plan data
    let planData = { suggestions: [], totalDaysOff: 0, usedDays: 0 };
    
    if (generateAI) {
      const holidays = await getHolidaysForYear(year, country);
      planData = generateHolidayPlan(holidays, vacationDays, year, preference, { isPremium, lang });
    }

    // Simple query - always use userId
    const query = { userId, year };
    
    const updateDoc = {
      $set: {
        suggestions: planData.suggestions,
        totalDaysOff: planData.totalDaysOff,
        usedDays: planData.usedDays,
        availableDays: vacationDays,
        countryCode: country,
        preference: preference,
      },
      $setOnInsert: {
        userId,
        year
      }
    };
    
    // Only reset modification flag on AI regeneration
    if (generateAI) {
      updateDoc.$set.isModifiedByUser = false;
    }
    
    const plan = await HolidayPlan.findOneAndUpdate(
      query,
      updateDoc,
      { 
        new: true,
        upsert: true,
        runValidators: true
      }
    );
    
    console.log(`Plan ${plan._id} ${plan.createdAt?.getTime() === plan.updatedAt?.getTime() ? 'created' : 'updated'}`);
    res.json(plan);
  } catch (err) {
    console.error('Error creating/updating plan:', err);
    console.error('Request details:', { userId: req.body?.userId, year: req.body?.year, country: req.body?.country });
    res.status(500).json({ message: 'Failed to create plan', error: err.message });
  }
});

/**
 * GET /api/plans/:userId
 * Fetch all plans for a specific user
 */
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const plans = await HolidayPlan.find({ userId }).sort({ year: -1 });
    res.json(plans);
  } catch (err) {
    console.error("Error fetching plans:", err);
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

router.get("/details/:planId", async (req, res) => {
  const { planId } = req.params;
  const plan = await HolidayPlan.findById(planId).populate("userId", "name email");
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  res.json(plan);
});

/**
 * POST /api/plans/:planId/manual-days
 * Add manual vacation days to a plan (creates expanded suggestions)
 * Body: { dates: [{ date: "2026-06-15", note?: "Beach trip" }] }
 */
router.post("/:planId/manual-days", async (req, res) => {
  try {
    const { planId } = req.params;
    const { dates } = req.body;

    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: "dates must be a non-empty array" });
    }

    const plan = await HolidayPlan.findById(planId);
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    // Find user for the plan
    const user = await User.findById(plan.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const holidays = await getHolidaysForYear(plan.year, plan.countryCode);
    const holidaySet = buildHolidaySet(holidays);

    // Create expanded suggestions from manual days
    const newManualBlocks = [];
    const skippedDays = [];
    
    console.log('=== ADDING MANUAL DAYS ===');
    console.log(`Existing suggestions (${plan.suggestions.length}):`);
    plan.suggestions.forEach((s, i) => {
      const type = s.isManual ? 'MANUAL' : 'AI';
      console.log(`  ${i}: ${type} ${new Date(s.startDate).toDateString()} - ${new Date(s.endDate).toDateString()} (${s.vacationDaysUsed} days)`);
    });
    console.log(`Holidays in set: ${holidaySet.size}`);
    
    for (const { date, note } of dates) {
      // Parse date properly to avoid timezone issues
      const dayDate = parseISODate(date);
      
      console.log(`\nProcessing manual day: ${date}, parsed as: ${dayDate.toDateString()} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayDate.getDay()]})`);
      
      // Check if day is a weekend or holiday (can't use vacation on these)
      if (isOffDay(dayDate, holidaySet)) {
        console.log(`Skipping ${date} - it's a weekend or holiday`);
        skippedDays.push({ date, reason: 'Weekend or holiday' });
        continue;
      }
      
      // Check if this exact WORKDAY is already allocated in any suggestion
      const dayAlreadyAllocated = plan.suggestions.find((s) => {
        const start = new Date(s.startDate);
        const end = new Date(s.endDate);
        
        // Check all workdays in the suggestion
        let checkDate = new Date(start);
        while (calendarKey(checkDate) <= calendarKey(end)) {
          if (!isOffDay(checkDate, holidaySet) && calendarKey(checkDate) === calendarKey(dayDate)) {
            console.log(`  ${calendarKey(dayDate)} workday is already in ${s.isManual ? 'MANUAL' : 'AI'} block ${calendarKey(start)}-${calendarKey(end)}`);
            return true;
          }
          checkDate = addDays(checkDate, 1);
        }
        return false;
      });

      if (dayAlreadyAllocated) {
        const blockType = dayAlreadyAllocated.isManual ? 'manual' : 'AI';
        console.log(`Skipping ${date} - workday already allocated in ${blockType} block`);
        skippedDays.push({ 
          date, 
          reason: `Workday already allocated in ${blockType} vacation block` 
        });
        continue;
      }

      // Create expanded block for this manual day (stop at existing blocks)
      const expanded = expandManualDay(dayDate, holidaySet, null, plan.suggestions);
      
      console.log(`Expanded ${date} to ${expanded.startDate.toDateString()} - ${expanded.endDate.toDateString()} (${expanded.vacationDaysUsed} vacation days, ${expanded.totalDaysOff} total days)`);

      // Add as new block (merge will happen later if adjacent)
      const manualRoi = (expanded.totalDaysOff / expanded.vacationDaysUsed).toFixed(1);
      newManualBlocks.push({
        startDate: expanded.startDate,
        endDate: expanded.endDate,
        vacationDaysUsed: expanded.vacationDaysUsed,
        totalDaysOff: expanded.totalDaysOff,
        description: note || `Manual: ${expanded.vacationDaysUsed} day${expanded.vacationDaysUsed > 1 ? 's' : ''} → ${expanded.totalDaysOff} days off`,
        reason: note || `Manually selected vacation period`,
        roi: manualRoi,
        efficiency: expanded.totalDaysOff / expanded.vacationDaysUsed >= 4 ? 'high' : expanded.totalDaysOff / expanded.vacationDaysUsed >= 3 ? 'good' : 'normal',
        isManual: true
      });
      
      console.log(`Added manual block: ${expanded.startDate.toDateString()} to ${expanded.endDate.toDateString()}`);
    }

    // Add temp blocks and merge
    if (newManualBlocks.length > 0) {
      console.log(`Adding ${newManualBlocks.length} new manual block(s)`);
      plan.suggestions.push(...newManualBlocks);
    }

    console.log(`Before merge: ${plan.suggestions.length} suggestions`);
    console.log('Suggestions before merge:');
    plan.suggestions.forEach((s, i) => {
      const type = s.isManual ? 'MANUAL' : 'AI';
      console.log(`  ${i}: ${type} ${new Date(s.startDate).toDateString()} - ${new Date(s.endDate).toDateString()}`);
    });

    // Merge adjacent blocks (manual + AI if touching)
    plan.suggestions = mergeAdjacentBlocks(plan.suggestions, holidaySet);

    console.log(`After merge: ${plan.suggestions.length} suggestions`);
    console.log('Suggestions after merge:');
    plan.suggestions.forEach((s, i) => {
      const type = s.isManual ? 'MANUAL' : 'AI';
      console.log(`  ${i}: ${type} ${new Date(s.startDate).toDateString()} - ${new Date(s.endDate).toDateString()}`);
    });

    const usage = calculatePlanUsage(plan.suggestions, holidays);
    
    // Use plan.availableDays if set, otherwise fall back to user.availableDays
    const availableDays = plan.availableDays || user.availableDays;
    if (usage.usedDays > availableDays) {
      // Rollback - remove the suggestions we just added
      plan.suggestions = plan.suggestions.filter(s => !s.isManual || s._id);
      return res.status(400).json({ 
        error: `Cannot add vacation days. Would exceed available days (${availableDays}).`,
        usedDays: usage.usedDays,
        availableDays,
      });
    }

    plan.usedDays = usage.usedDays;
    plan.totalDaysOff = usage.totalDaysOff;
    plan.isModifiedByUser = true;
    plan.markModified('suggestions');

    await plan.save();
    
    // Include info about skipped days in response and logs
    if (skippedDays.length > 0) {
      console.log('Some days were skipped:', skippedDays);
      
      // If ALL days were skipped, return error with details
      if (newManualBlocks.length === 0) {
        const reasons = skippedDays.map(sd => `${sd.date}: ${sd.reason}`).join(', ');
        return res.status(400).json({
          error: 'Cannot add vacation days',
          details: reasons,
          skippedDays
        });
      }
    }
    
    console.log(`Manual days processed. Added ${newManualBlocks.length} new blocks, skipped ${skippedDays.length} days.`);
    
    res.json(plan);
  } catch (err) {
    console.error("Error adding manual days:", err);
    res.status(500).json({ error: "Failed to add manual days", message: err.message });
  }
});

/**
 * DELETE /api/plans/:planId/suggestions/:suggestionId
 * Remove a suggestion from the plan
 */
router.delete("/:planId/suggestions/:suggestionId", async (req, res) => {
  try {
    const { planId, suggestionId } = req.params;

    const plan = await HolidayPlan.findById(planId);
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    plan.suggestions = plan.suggestions.filter((s) => s._id.toString() !== suggestionId);

    const holidays = await getHolidaysForYear(plan.year, plan.countryCode);
    const holidaySet = buildHolidaySet(holidays);
    
    // Merge adjacent blocks after removal
    plan.suggestions = mergeAdjacentBlocks(plan.suggestions, holidaySet);
    
    const usage = calculatePlanUsage(plan.suggestions, holidays);
    plan.usedDays = usage.usedDays;
    plan.totalDaysOff = usage.totalDaysOff;
    plan.isModifiedByUser = true;
    plan.markModified('suggestions');

    await plan.save();
    res.json(plan);
  } catch (err) {
    console.error("Error removing suggestion:", err);
    res.status(500).json({ error: "Failed to remove suggestion", message: err.message });
  }
});

/**
 * DELETE /api/plans/:planId/suggestions/:suggestionId/days/:date
 * Remove a specific vacation day from a suggestion (isolated to this bridge only)
 */
router.delete("/:planId/suggestions/:suggestionId/days/:date", async (req, res) => {
  try {
    const { planId, suggestionId, date } = req.params;

    const plan = await HolidayPlan.findById(planId);
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const suggestionIndex = plan.suggestions.findIndex((s) => s._id.toString() === suggestionId);
    if (suggestionIndex === -1) {
      return res.status(404).json({ error: "Suggestion not found" });
    }

    const suggestion = plan.suggestions[suggestionIndex];
    const targetDate = parseISODate(date);

    const holidays = await getHolidaysForYear(plan.year, plan.countryCode);
    const holidaySet = buildHolidaySet(holidays);

    console.log(`\n=== REMOVING DAY FROM BRIDGE ===`);
    console.log(`Target: ${targetDate.toDateString()}`);
    console.log(`Bridge: ${new Date(suggestion.startDate).toDateString()} - ${new Date(suggestion.endDate).toDateString()}`);

    // Check if target date is a workday in the suggestion
    if (isOffDay(targetDate, holidaySet)) {
      return res.status(400).json({ error: "Cannot remove weekends or holidays" });
    }

    // Collect all remaining workdays (excluding target)
    const start = new Date(suggestion.startDate);
    const end = new Date(suggestion.endDate);
    const remainingWorkdays = [];
    
    let current = new Date(start);
    while (calendarKey(current) <= calendarKey(end)) {
      if (!isOffDay(current, holidaySet) && calendarKey(current) !== calendarKey(targetDate)) {
        remainingWorkdays.push(new Date(current));
      }
      current = addDays(current, 1);
    }

    console.log(`Remaining workdays: ${remainingWorkdays.length}`);

    // If no workdays left, remove the suggestion
    if (remainingWorkdays.length === 0) {
      console.log(`No workdays left - removing entire bridge`);
      plan.suggestions = plan.suggestions.filter((s) => s._id.toString() !== suggestionId);
    } else {
      // Find contiguous groups of workdays
      remainingWorkdays.sort((a, b) => a - b);
      
      const groups = [];
      let currentGroup = [remainingWorkdays[0]];
      
      for (let i = 1; i < remainingWorkdays.length; i++) {
        const prevDay = remainingWorkdays[i - 1];
        const currDay = remainingWorkdays[i];
        
        // Check if only off days between previous and current
        let onlyOffDays = true;
        let checkDay = addDays(prevDay, 1);
        while (calendarKey(checkDay) < calendarKey(currDay)) {
          if (!isOffDay(checkDay, holidaySet)) {
            onlyOffDays = false;
            break;
          }
          checkDay = addDays(checkDay, 1);
        }
        
        if (onlyOffDays) {
          // Same group
          currentGroup.push(currDay);
        } else {
          // New group - gap found
          groups.push(currentGroup);
          currentGroup = [currDay];
        }
      }
      groups.push(currentGroup);
      
      console.log(`Found ${groups.length} contiguous group(s)`);

      // Filter out groups that are just weekends
      const validGroups = groups.filter(group => {
        const groupStart = group[0];
        const groupEnd = group[group.length - 1];
        const otherBlocks = plan.suggestions.filter((s) => s._id.toString() !== suggestionId);
        const expanded = expandManualDay(groupStart, holidaySet, groupEnd, otherBlocks);
        
        // Keep if it has actual vacation days (not just weekend)
        return expanded.vacationDaysUsed > 0;
      });

      console.log(`Valid groups (with vacation days): ${validGroups.length}`);

      if (validGroups.length === 0) {
        // Remove entire bridge - no valid groups left
        console.log(`No valid groups - removing entire bridge`);
        plan.suggestions = plan.suggestions.filter((s) => s._id.toString() !== suggestionId);
      } else if (validGroups.length === 1) {
        // Update the existing suggestion in place
        const group = validGroups[0];
        const groupStart = group[0];
        const groupEnd = group[group.length - 1];
        const otherBlocks = plan.suggestions.filter((s) => s._id.toString() !== suggestionId);
        const expanded = expandManualDay(groupStart, holidaySet, groupEnd, otherBlocks);
        
        // Update in place - preserve _id and position
        const updatedBridge = plan.suggestions[suggestionIndex];
        updatedBridge.startDate = expanded.startDate;
        updatedBridge.endDate = expanded.endDate;
        updatedBridge.vacationDaysUsed = expanded.vacationDaysUsed;
        updatedBridge.totalDaysOff = expanded.totalDaysOff;
        updatedBridge.description = `Use ${expanded.vacationDaysUsed} vacation day${expanded.vacationDaysUsed > 1 ? 's' : ''} for ${expanded.totalDaysOff} days off`;
        
        console.log(`Updated bridge in place (keeping _id): ${expanded.startDate.toDateString()} - ${expanded.endDate.toDateString()}`);
      } else {
        // Split into multiple bridges - remove old and add new ones
        console.log(`Splitting bridge into ${validGroups.length} new bridges`);
        plan.suggestions = plan.suggestions.filter((s) => s._id.toString() !== suggestionId);

        for (const group of validGroups) {
          const groupStart = group[0];
          const groupEnd = group[group.length - 1];
          const otherBlocks = plan.suggestions;
          const expanded = expandManualDay(groupStart, holidaySet, groupEnd, otherBlocks);
          
          plan.suggestions.push({
            startDate: expanded.startDate,
            endDate: expanded.endDate,
            vacationDaysUsed: expanded.vacationDaysUsed,
            totalDaysOff: expanded.totalDaysOff,
            description: `Use ${expanded.vacationDaysUsed} vacation day${expanded.vacationDaysUsed > 1 ? 's' : ''} for ${expanded.totalDaysOff} days off`,
            isManual: suggestion.isManual
          });
          
          console.log(`Created new bridge: ${expanded.startDate.toDateString()} - ${expanded.endDate.toDateString()}`);
        }
      }
    }

    const usage = calculatePlanUsage(plan.suggestions, holidays);
    plan.usedDays = usage.usedDays;
    plan.totalDaysOff = usage.totalDaysOff;
    plan.isModifiedByUser = true;
    plan.markModified('suggestions');
    
    console.log(`Final state: ${plan.suggestions.length} suggestions, ${plan.usedDays} used days\n`);

    await plan.save();
    res.json(plan);
  } catch (err) {
    console.error("Error removing day from suggestion:", err);
    res.status(500).json({ error: "Failed to remove day", message: err.message });
  }
});

/**
 * POST /api/plans/:planId/optimize-remaining
 * Optimize remaining vacation days without touching existing suggestions
 * Body: { preference?: "balanced" }
 */
/**
 * POST /api/plans/:planId/regenerate
 * Regenerate plan with new strategy, preserving manual days
 */
router.post("/:planId/regenerate", async (req, res) => {
  try {
    const { planId } = req.params;
    const { preference = "balanced", lang = 'en' } = req.body;

    const plan = await HolidayPlan.findById(planId);
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    // Find user for the plan
    const user = await User.findById(plan.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    
    const isPremium = user.isPremium || false;
    
    // Validate strategy: free users can only use "balanced"
    if (!isPremium && preference !== 'balanced') {
      return res.status(403).json({ 
        error: 'Premium feature', 
        message: 'This strategy is only available for premium users. Free users can use the "balanced" strategy.' 
      });
    }

    const holidays = await getHolidaysForYear(plan.year, plan.countryCode);
    // Use plan.availableDays if set, otherwise fall back to user.availableDays
    const availableDays = plan.availableDays || user.availableDays;

    console.log(`\n=== REGENERATE WITH NEW STRATEGY ===`);
    console.log(`New strategy: ${preference}`);

    // Keep only manual suggestions
    const manualSuggestions = (plan.suggestions || []).filter(s => s.isManual);
    const manualDaysUsed = manualSuggestions.reduce((sum, s) => sum + s.vacationDaysUsed, 0);
    const remaining = availableDays - manualDaysUsed;

    console.log(`Manual suggestions: ${manualSuggestions.length}, using ${manualDaysUsed} days`);
    console.log(`Remaining days to allocate: ${remaining}`);

    if (remaining <= 0) {
      // Just keep manual days, no AI suggestions needed
      plan.suggestions = manualSuggestions;
      plan.preference = preference;
      plan.usedDays = manualDaysUsed;
      
      const holidaySet = buildHolidaySet(holidays);
      const usage = calculatePlanUsage(plan.suggestions, holidays);
      plan.totalDaysOff = usage.totalDaysOff;
      
      await plan.save();
      return res.json(plan);
    }

    const holidaySet = buildHolidaySet(holidays);
    
    // Collect already-allocated workdays from manual selections
    const allocatedWorkdays = new Set();
    manualSuggestions.forEach(existing => {
      const existStart = new Date(existing.startDate);
      const existEnd = new Date(existing.endDate);
      let checkDate = new Date(existStart);
      
      while (calendarKey(checkDate) <= calendarKey(existEnd)) {
        if (!isOffDay(checkDate, holidaySet)) {
          allocatedWorkdays.add(calendarKey(checkDate));
        }
        checkDate = addDays(checkDate, 1);
      }
    });

    // Create fake "holidays" for allocated workdays
    const blockedDays = Array.from(allocatedWorkdays).map((key) => ({
      date: key,
      name: 'Blocked (manual day)',
      countryCode: plan.countryCode,
      year: plan.year
    }));

    const holidaysWithBlocked = [...holidays, ...blockedDays];

    // Generate new AI suggestions with new strategy
      const aiPlan = generateHolidayPlan(holidaysWithBlocked, remaining, plan.year, preference, { isPremium, lang });

    // Combine manual suggestions with new AI suggestions
    const combinedSuggestions = [
      ...manualSuggestions,
      ...aiPlan.suggestions.map(s => ({
        startDate: parseISODate(s.startDate),
        endDate: parseISODate(s.endDate),
        vacationDaysUsed: s.vacationDaysUsed,
        totalDaysOff: s.totalDaysOff,
        description: s.description,
        reason: s.reason,
        roi: s.roi,
        efficiency: s.efficiency,
        isManual: false
      }))
    ];

    // Merge adjacent blocks
    plan.suggestions = mergeAdjacentBlocks(combinedSuggestions, holidaySet);
    plan.preference = preference;

    const usage = calculatePlanUsage(plan.suggestions, holidays);
    plan.usedDays = usage.usedDays;
    plan.totalDaysOff = usage.totalDaysOff;
    plan.markModified('suggestions');

    await plan.save();

    console.log(`Plan regenerated: ${plan.usedDays}/${availableDays} days, ${plan.totalDaysOff} days off`);

    res.json(plan);
  } catch (err) {
    console.error('Error regenerating plan:', err);
    res.status(500).json({ error: "Failed to regenerate plan", details: err.message });
  }
});

router.post("/:planId/optimize-remaining", async (req, res) => {
  try {
    const { planId } = req.params;
    const { preference = "balanced", lang = 'en' } = req.body;

    const plan = await HolidayPlan.findById(planId);
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    // Find user for the plan
    const user = await User.findById(plan.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const holidays = await getHolidaysForYear(plan.year, plan.countryCode);
    // Use plan.availableDays if set, otherwise fall back to user.availableDays
    const availableDays = plan.availableDays || user.availableDays;
    const currentlyUsed = plan.usedDays || 0;
    const remaining = availableDays - currentlyUsed;

    console.log(`\n=== OPTIMIZE REMAINING DAYS ===`);
    console.log(`Total available: ${availableDays}, Currently used: ${currentlyUsed}, Remaining: ${remaining}`);

    if (remaining <= 0) {
      return res.status(400).json({ error: "No remaining vacation days to optimize" });
    }

    const existingSuggestions = plan.suggestions || [];
    const holidaySet = buildHolidaySet(holidays);
    
    // Collect all already-allocated workdays and treat them as "blocked days"
    const allocatedWorkdays = new Set();
    existingSuggestions.forEach(existing => {
      const existStart = new Date(existing.startDate);
      const existEnd = new Date(existing.endDate);
      let checkDate = new Date(existStart);
      
      while (calendarKey(checkDate) <= calendarKey(existEnd)) {
        if (!isOffDay(checkDate, holidaySet)) {
          allocatedWorkdays.add(calendarKey(checkDate));
        }
        checkDate = addDays(checkDate, 1);
      }
    });

    console.log(`Already allocated workdays: ${allocatedWorkdays.size}`);

    // Create fake "holidays" for allocated workdays so planner avoids them
    const blockedDays = Array.from(allocatedWorkdays).map((key) => ({
      date: key,
      name: 'Blocked (already allocated)',
      countryCode: plan.countryCode,
      year: plan.year
    }));

    // Combine real holidays with blocked days
    const holidaysWithBlocked = [...holidays, ...blockedDays];

    console.log(`Passing ${holidays.length} real holidays + ${blockedDays.length} blocked days to planner`);

    // Generate plan for remaining days (planner will avoid blocked days)
    const isPremium = user.isPremium || false;
    const optimizedPlan = generateHolidayPlan(holidaysWithBlocked, remaining, plan.year, preference, { isPremium, lang });

    optimizedPlan.suggestions.forEach((s, i) => {
      console.log(`  ${i}: ${parseISODate(s.startDate).toDateString()} - ${parseISODate(s.endDate).toDateString()} (${s.vacationDaysUsed} vacation days)`);
    });

    // Add new suggestions to existing ones
    const combinedSuggestions = [
      ...existingSuggestions,
      ...optimizedPlan.suggestions.map(s => ({
        startDate: parseISODate(s.startDate),
        endDate: parseISODate(s.endDate),
        vacationDaysUsed: s.vacationDaysUsed,
        totalDaysOff: s.totalDaysOff,
        description: s.description,
        reason: s.reason,
        roi: s.roi,
        efficiency: s.efficiency,
        isManual: false
      }))
    ];

    console.log(`Combined: ${existingSuggestions.length} existing + ${optimizedPlan.suggestions.length} new = ${combinedSuggestions.length} total`);

    // Merge adjacent blocks
    plan.suggestions = mergeAdjacentBlocks(combinedSuggestions, holidaySet);

    const usage = calculatePlanUsage(plan.suggestions, holidays);
    plan.usedDays = usage.usedDays;
    plan.totalDaysOff = usage.totalDaysOff;
    plan.preference = preference; // Update the plan's preference
    plan.markModified('suggestions');

    await plan.save();

    console.log(`Final: ${plan.suggestions.length} suggestions, ${plan.usedDays} vacation days used with ${preference} strategy\n`);

    res.json(plan);
  } catch (err) {
    console.error("Error optimizing remaining days:", err);
    res.status(500).json({ error: "Failed to optimize remaining days", message: err.message });
  }
});

/**
 * GET /api/plans/:userId/:year
 * Get plan for specific user and year (optionally filtered by country)
 * Query params: ?country=XX (optional - returns 404 if country doesn't match)
 */
router.get("/:userId/:year", async (req, res) => {
  try {
    const { userId, year } = req.params;
    const { country } = req.query;
    
    const plan = await HolidayPlan.findOne({ userId, year });
    
    if (!plan) {
      return res.status(404).json({ error: "Plan not found for this year" });
    }

    // If country filter is provided, check if it matches
    if (country && plan.countryCode !== country) {
      console.log(`Plan exists for ${year} but for ${plan.countryCode}, not ${country}`);
      return res.status(404).json({ 
        error: "Plan not found for this year/country combination",
        existingCountry: plan.countryCode 
      });
    }

    res.json(plan);
  } catch (err) {
    console.error("Error fetching plan:", err);
    res.status(500).json({ error: "Failed to fetch plan", message: err.message });
  }
});


export default router;
