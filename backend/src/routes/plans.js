import express from "express";
import HolidayPlan from "../models/HolidayPlan.js";
import User from "../models/User.js";
import { getHolidaysForYear } from '../services/holidayService.js';
import { generateHolidayPlan } from "../services/plannerService.js";
import { parseISODate } from "../utils/dateUtils.js";

const router = express.Router();

function calculatePlanUsage(suggestions, holidays) {
  let vacationDaysUsed = 0;
  let totalDaysOff = 0;

  for (const suggestion of suggestions) {
    vacationDaysUsed += suggestion.vacationDaysUsed || 0;
    totalDaysOff += suggestion.totalDaysOff || 0;
  }

  return { usedDays: vacationDaysUsed, totalDaysOff };
}

function addDays(d, days) {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isOffDay(d, holidaySet) {
  return isWeekend(d) || holidaySet.has(d.toDateString());
}

function expandManualDay(date, holidaySet, endDateParam, existingBlocks = []) {
  // Ensure dates are normalized to UTC midnight
  const toUTCMidnight = (d) => {
    const date = new Date(d);
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  };
  
  const isInExistingBlock = (d) => {
    return existingBlocks.some(block => {
      const start = new Date(block.startDate);
      const end = new Date(block.endDate);
      return d >= start && d <= end;
    });
  };
  
  let startDate = toUTCMidnight(date);
  let endDate = endDateParam ? toUTCMidnight(endDateParam) : toUTCMidnight(date);

  console.log(`Expanding from ${startDate.toISOString()} (${startDate.toDateString()}) to ${endDate.toISOString()} (${endDate.toDateString()})`);

  // Expand backwards from startDate (only through weekends/holidays, not other blocks)
  let prev = addDays(startDate, -1);
  let backwardCount = 0;
  while (isOffDay(prev, holidaySet) && !isInExistingBlock(prev)) {
    console.log(`  Expanding backward: ${prev.toDateString()} is off day`);
    startDate = toUTCMidnight(prev);
    prev = addDays(prev, -1);
    backwardCount++;
    if (backwardCount > 10) break;
  }
  if (isInExistingBlock(prev)) {
    console.log(`  Stopped backward expansion: ${prev.toDateString()} is in existing block`);
  }

  // Expand forwards from endDate (only through weekends/holidays, not other blocks)
  let next = addDays(endDate, 1);
  let forwardCount = 0;
  while (isOffDay(next, holidaySet) && !isInExistingBlock(next)) {
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][next.getDay()];
    const isWeekendDay = isWeekend(next);
    const isHolidayDay = holidaySet.has(next.toDateString());
    console.log(`  Expanding forward: ${next.toDateString()} (${dayName}) - Weekend: ${isWeekendDay}, Holiday: ${isHolidayDay}`);
    endDate = toUTCMidnight(next);
    next = addDays(next, 1);
    forwardCount++;
    if (forwardCount > 10) {
      console.log('  Breaking expansion - safety limit reached');
      break;
    }
  }
  if (isInExistingBlock(next)) {
    console.log(`  Stopped forward expansion: ${next.toDateString()} is in existing block`);
  }

  console.log(`Expanded to ${startDate.toDateString()} to ${endDate.toDateString()}`);

  // Count workdays in the expanded range
  let vacationDaysUsed = 0;
  let current = new Date(startDate);
  while (current <= endDate) {
    if (!isOffDay(current, holidaySet)) {
      vacationDaysUsed++;
    }
    current = addDays(current, 1);
  }

  // Count total days
  const totalDaysOff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

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

    const currentStart = current.startDate;
    const currentEnd = current.endDate;
    const nextStart = next.startDate;
    const nextEnd = next.endDate;

    // Check if blocks overlap
    const overlaps = !(currentEnd < nextStart || nextEnd < currentStart);
    
    // Check if blocks are directly adjacent (next day)
    const dayAfterCurrent = addDays(currentEnd, 1);
    const directlyAdjacent = dayAfterCurrent.toDateString() === nextStart.toDateString();
    
    // Check if only off days (weekends/holidays) between blocks
    let onlyOffDaysBetween = false;
    if (!overlaps && !directlyAdjacent) {
      onlyOffDaysBetween = true;
      if (dayAfterCurrent < nextStart) {
        let checkDay = new Date(dayAfterCurrent);
        while (checkDay < nextStart) {
          if (!isOffDay(checkDay, holidaySet)) {
            onlyOffDaysBetween = false;
            break;
          }
          checkDay = addDays(checkDay, 1);
        }
      }
    }

    console.log(`  Overlaps: ${overlaps}, DirectlyAdjacent: ${directlyAdjacent}, OnlyOffDaysBetween: ${onlyOffDaysBetween}`);

    if (overlaps || directlyAdjacent || onlyOffDaysBetween) {
      console.log(`  → MERGING (overlaps: ${overlaps}, onlyOffDaysBetween: ${onlyOffDaysBetween})`);
      
      // Merge blocks - ensure proper Date objects
      const currentStart = new Date(current.startDate);
      const combinedStart = currentStart < nextStart ? currentStart : nextStart;
      const combinedEnd = currentEnd > nextEnd ? currentEnd : nextEnd;

      // Count workdays and total days in the merged range
      let vacationDaysUsed = 0;
      let d = new Date(combinedStart);
      while (d <= combinedEnd) {
        if (!isOffDay(d, holidaySet)) {
          vacationDaysUsed++;
        }
        d = addDays(d, 1);
      }

      const totalDaysOff = Math.floor((combinedEnd - combinedStart) / (1000 * 60 * 60 * 24)) + 1;
      
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
        // Both manual or both AI - use simple ROI
        const simpleRoi = totalDaysOff / vacationDaysUsed;
        roi = simpleRoi.toFixed(1);
        efficiency = simpleRoi >= 4 ? 'high' : simpleRoi >= 3 ? 'good' : 'normal';
        
        // Preserve description from higher ROI block
        const currentRoi = parseFloat(current.roi) || (current.totalDaysOff / current.vacationDaysUsed);
        const nextRoi = parseFloat(next.roi) || (next.totalDaysOff / next.vacationDaysUsed);
        const keepFrom = currentRoi >= nextRoi ? current : next;
        
        description = keepFrom.description || `Use ${vacationDaysUsed} vacation day${vacationDaysUsed > 1 ? 's' : ''} for ${totalDaysOff} days off`;
        reason = keepFrom.reason || `Combined vacation block for ${totalDaysOff} days off`;
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
    let { userId, browserId, year, country = 'NO', availableDays, preference = 'balanced', generateAI = true, lang = 'en' } = req.body;

    // Validate and sanitize identifiers
    // Convert empty strings/falsy values to null for consistency
    // CRITICAL: Never allow null values to be used in queries or documents
    const normalizeId = (id) => {
      if (!id) return null;
      const str = String(id).trim();
      return str !== '' && str !== 'null' && str !== 'undefined' ? str : null;
    };
    userId = normalizeId(userId);
    browserId = normalizeId(browserId);

    // Must have either userId (logged in) or browserId (anonymous)
    if (!userId && !browserId) {
      return res.status(400).json({ error: 'Either userId or browserId is required' });
    }

    let user = null;
    let vacationDays = availableDays || 25;
    let isPremium = false;

    if (userId) {
      // Logged in user
      user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      vacationDays = availableDays ?? user.availableDays;
      isPremium = user.isPremium || false;
    }

    // Generate plan data
    let planData = { suggestions: [], totalDaysOff: 0, usedDays: 0 };
    
    if (generateAI) {
      const holidays = await getHolidaysForYear(year, country);
      planData = generateHolidayPlan(holidays, vacationDays, year, preference, { isPremium, lang });
    }

    // Build query - CRITICAL: Only include fields with actual values, never null
    // This prevents MongoDB from trying to match/upsert with null values which conflict with unique indexes
    const query = { year };
    if (userId) {
      query.userId = userId;
    } else if (browserId) {
      // Only add browserId to query if it has a value
      query.browserId = browserId;
    } else {
      // This should never happen due to validation above, but double-check
      return res.status(400).json({ error: 'Either userId or browserId must be provided' });
    }
    
    console.log(`Looking for plan with query:`, query);
    
    const updateDoc = {
      $set: {
        suggestions: planData.suggestions,
        totalDaysOff: planData.totalDaysOff,
        usedDays: planData.usedDays,
        availableDays: vacationDays,
        countryCode: country,
        preference: preference,
      }
    };
    
    // Only reset modification flag on AI regeneration
    if (generateAI) {
      updateDoc.$set.isModifiedByUser = false;
    }
    
    // Set userId or browserId on creation (via setOnInsert)
    // CRITICAL: Never set userId: null or browserId: null - only include fields with actual values
    const setOnInsert = { year };
    if (userId) {
      setOnInsert.userId = userId;
      // Ensure browserId is unset if we're using userId (in case of migration)
      if (!updateDoc.$unset) updateDoc.$unset = {};
      updateDoc.$unset.browserId = '';
    } else if (browserId) {
      // Only set browserId if it has a value
      setOnInsert.browserId = browserId;
      // Ensure userId is unset if we're using browserId (never set userId: null)
      if (!updateDoc.$unset) updateDoc.$unset = {};
      updateDoc.$unset.userId = '';
    } else {
      // This should never happen due to validation above
      return res.status(400).json({ error: 'Either userId or browserId must be provided' });
    }
    updateDoc.$setOnInsert = setOnInsert;
    
    // Handle migration from browserId to userId if user just logged in
    if (userId && browserId) {
      // Check if there's an anonymous plan to migrate
      const anonymousPlan = await HolidayPlan.findOne({ browserId, year });
      if (anonymousPlan) {
        console.log(`Migrating anonymous plan to user ${userId}`);
        anonymousPlan.userId = userId;
        anonymousPlan.browserId = undefined;
        anonymousPlan.suggestions = planData.suggestions;
        anonymousPlan.totalDaysOff = planData.totalDaysOff;
        anonymousPlan.usedDays = planData.usedDays;
        anonymousPlan.availableDays = vacationDays;
        anonymousPlan.countryCode = country;
        anonymousPlan.preference = preference;
        if (generateAI) {
          anonymousPlan.isModifiedByUser = false;
        }
        await anonymousPlan.save();
        return res.json(anonymousPlan);
      }
    }
    
    // CRITICAL: Before upserting, check for orphaned documents with userId: null
    // This can happen if documents were created before the fix
    if (!userId && browserId) {
      const orphanedPlan = await HolidayPlan.findOne({ 
        year, 
        $or: [
          { userId: null },
          { userId: { $exists: false } }
        ]
      });
      if (orphanedPlan) {
        console.log(`Found orphaned plan ${orphanedPlan._id} with userId: null, updating to use browserId`);
        // Update the orphaned plan to use browserId instead
        orphanedPlan.browserId = browserId;
        orphanedPlan.userId = undefined; // Remove userId field entirely
        orphanedPlan.suggestions = planData.suggestions;
        orphanedPlan.totalDaysOff = planData.totalDaysOff;
        orphanedPlan.usedDays = planData.usedDays;
        orphanedPlan.availableDays = vacationDays;
        orphanedPlan.countryCode = country;
        orphanedPlan.preference = preference;
        if (generateAI) {
          orphanedPlan.isModifiedByUser = false;
        }
        await orphanedPlan.save();
        return res.json(orphanedPlan);
      }
    }
    
    const plan = await HolidayPlan.findOneAndUpdate(
      query,
      updateDoc,
      { 
        new: true,           // Return updated document
        upsert: true,        // Create if doesn't exist
        runValidators: true  // Run schema validators
      }
    );
    
    console.log(`Plan ${plan._id} ${plan.createdAt === plan.updatedAt ? 'created' : 'updated'}`);
    res.json(plan);
  } catch (err) {
    console.error('Error creating/updating plan:', err);
    // Capture variables before they might be out of scope
    const errorDetails = { 
      userId: req.body?.userId || null, 
      browserId: req.body?.browserId || null, 
      year: req.body?.year || null, 
      country: req.body?.country || null 
    };
    console.error('Request details:', errorDetails);
    
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

    const user = await User.findById(plan.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const holidays = await getHolidaysForYear(plan.year, plan.countryCode);
    const holidaySet = new Set(
      holidays.map((h) => parseISODate(h.date).toDateString())
    );

    const addDays = (d, days) => {
      const result = new Date(d);
      result.setDate(result.getDate() + days);
      return result;
    };

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
        while (checkDate <= end) {
          if (!isOffDay(checkDate, holidaySet) && checkDate.toDateString() === dayDate.toDateString()) {
            console.log(`  ${dayDate.toDateString()} workday is already in ${s.isManual ? 'MANUAL' : 'AI'} block ${start.toDateString()}-${end.toDateString()}`);
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
    const holidaySet = new Set(
      holidays.map((h) => parseISODate(h.date).toDateString())
    );
    
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
    const holidaySet = new Set(
      holidays.map((h) => parseISODate(h.date).toDateString())
    );

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
    while (current <= end) {
      if (!isOffDay(current, holidaySet) && current.toDateString() !== targetDate.toDateString()) {
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
        while (checkDay < currDay) {
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
      
      const holidaySet = new Set(holidays.map(h => parseISODate(h.date).toDateString()));
      const usage = calculatePlanUsage(plan.suggestions, holidays);
      plan.totalDaysOff = usage.totalDaysOff;
      
      await plan.save();
      return res.json(plan);
    }

    const holidaySet = new Set(holidays.map(h => parseISODate(h.date).toDateString()));
    
    // Collect already-allocated workdays from manual selections
    const allocatedWorkdays = new Set();
    manualSuggestions.forEach(existing => {
      const existStart = new Date(existing.startDate);
      const existEnd = new Date(existing.endDate);
      let checkDate = new Date(existStart);
      
      while (checkDate <= existEnd) {
        if (!isOffDay(checkDate, holidaySet)) {
          allocatedWorkdays.add(checkDate.toDateString());
        }
        checkDate = addDays(checkDate, 1);
      }
    });

    // Create fake "holidays" for allocated workdays
    const blockedDays = Array.from(allocatedWorkdays).map(dateStr => {
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      return {
        date: `${year}-${month}-${day}`,
        name: 'Blocked (manual day)',
        countryCode: plan.countryCode,
        year: plan.year
      };
    });

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

    const user = await User.findById(plan.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const holidays = await getHolidaysForYear(plan.year, plan.countryCode);
    const availableDays = plan.availableDays || user.availableDays;
    const currentlyUsed = plan.usedDays || 0;
    const remaining = availableDays - currentlyUsed;

    console.log(`\n=== OPTIMIZE REMAINING DAYS ===`);
    console.log(`Total available: ${availableDays}, Currently used: ${currentlyUsed}, Remaining: ${remaining}`);

    if (remaining <= 0) {
      return res.status(400).json({ error: "No remaining vacation days to optimize" });
    }

    const existingSuggestions = plan.suggestions || [];
    const holidaySet = new Set(
      holidays.map((h) => parseISODate(h.date).toDateString())
    );
    
    // Collect all already-allocated workdays and treat them as "blocked days"
    const allocatedWorkdays = new Set();
    existingSuggestions.forEach(existing => {
      const existStart = new Date(existing.startDate);
      const existEnd = new Date(existing.endDate);
      let checkDate = new Date(existStart);
      
      while (checkDate <= existEnd) {
        if (!isOffDay(checkDate, holidaySet)) {
          allocatedWorkdays.add(checkDate.toDateString());
        }
        checkDate = addDays(checkDate, 1);
      }
    });

    console.log(`Already allocated workdays: ${allocatedWorkdays.size}`);

    // Create fake "holidays" for allocated workdays so planner avoids them
    const blockedDays = Array.from(allocatedWorkdays).map(dateStr => {
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      return {
        date: `${year}-${month}-${day}`,
        name: 'Blocked (already allocated)',
        countryCode: plan.countryCode,
        year: plan.year
      };
    });

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
