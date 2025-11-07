import axios from "axios";
import Holiday from "../models/Holiday.js";
import { parseISODate, formatDate } from "../utils/dateUtils.js";

/**
 * Fetch public holidays for a given year and cache them in MongoDB.
 * Always normalizes date strings to prevent timezone drift.
 *
 * @param {number} year - Year to fetch holidays for (e.g. 2025)
 * @returns {Promise<Array>} List of holiday documents
 */
export async function getHolidaysForYear(year, countryCode = 'NO') {
  try {
    // 1️⃣ Check cache first
    const existing = await Holiday.find({ year });
    if (existing.length > 0) {
      console.log(
        `📦 Returning ${existing.length} cached holidays for ${year}`
      );
      // Normalize old data in case it was saved before date normalization was implemented
      return existing.map((h) => ({
        ...h.toObject(),
        date: formatDate(parseISODate(h.date)),
      }));
    }

    // 2️⃣ Fetch from Nager.Date API
    console.log(`🌐 Fetching holidays from Nager.Date API for ${year}...`);
    const response = await axios.get(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/NO`
    );
    const data = response.data;

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("No holiday data returned from API");
    }

    // 3️⃣ Normalize and prepare for DB
    const holidays = data.map((h) => ({
      date: h.date.split("T")[0], // safely extract YYYY-MM-DD
      localName: h.localName,
      name: h.name,
      countryCode,
      year: Number(year),
    }));

    // 4️⃣ Save to MongoDB
    await Holiday.insertMany(holidays);
    console.log(`💾 Saved ${holidays.length} holidays for ${year} to DB.`);

    return holidays;
  } catch (err) {
    console.error("❌ Error fetching holidays:", err.message);
    throw new Error("Failed to fetch holidays");
  }
}

/**
 * Clear cached holidays for a given year.
 * Useful if API data changes or for debugging.
 *
 * @param {number} year
 */
export async function clearCachedHolidays(year) {
  try {
    const result = await Holiday.deleteMany({ year });
    console.log(`🧹 Cleared ${result.deletedCount} holidays for ${year}`);
    return result.deletedCount;
  } catch (err) {
    console.error("❌ Failed to clear holidays:", err.message);
    throw err;
  }
}
