import express from "express";
import HolidayPlan from "../models/HolidayPlan.js";
import User from "../models/User.js";
import { getHolidaysForYear } from '../services/holidayService.js';
import { generateHolidayPlan } from "../services/plannerService.js";

const router = express.Router();

/**
 * POST /api/plans
 * Generate a holiday plan for a user
 * Body: { userId, year }
 */
router.post('/', async (req, res) => {
  try {
    const { userId, year, country = 'NO', availableDays, preference = 'balanced' } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Use either provided days or user's saved days
    const vacationDays = availableDays ?? user.availableDays;

    // Ensure we have holidays cached for this country+year
    const holidays = await getHolidaysForYear(year, country);

    // Generate optimized plan
    const planData = generateHolidayPlan(holidays, vacationDays, year, preference);

    // Save plan
    const plan = new HolidayPlan({
      userId,
      year,
      countryCode: country,
      suggestions: planData.suggestions,
      totalDaysOff: planData.totalDaysOff,
      usedDays: planData.usedDays,
    });
    // await plan.save();

    res.json(plan);
  } catch (err) {
    console.error('❌ Error creating plan:', err);
    res.status(500).json({ message: 'Failed to create plan' });
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
    console.error("❌ Error fetching plans:", err);
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

router.get("/details/:planId", async (req, res) => {
  const { planId } = req.params;
  const plan = await HolidayPlan.findById(planId).populate("userId", "name email");
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  res.json(plan);
});


export default router;
