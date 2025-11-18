import express from "express";
import { getHolidaysForYear, clearCachedHolidays } from "../services/holidayService.js";

const router = express.Router();

/**
 * GET /api/holidays/:year
 * Returns cached holidays for the given year or fetches from API if missing.
 */
router.get('/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const { country = 'NO' } = req.query; // default to NO
    const holidays = await getHolidaysForYear(year, country);
    res.json(holidays);
  } catch (err) {
    console.error(' Failed to fetch holidays route:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/holidays/:year
 * Clears cached holidays for a year (for admin/debugging)
 */
router.delete("/:year", async (req, res) => {
  try {
    const { year } = req.params;
    const count = await clearCachedHolidays(year);
    res.json({ message: `Cleared ${count} holidays for ${year}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear holidays" });
  }
});

export default router;
