import axios from "axios";
import Holiday from "../models/Holiday.js";
import { parseISODate, formatDate } from "../utils/dateUtils.js";

/**
 * Fetch public holidays for a given year and country.
 * Always compares Nager.Date API to Mongo cache and refreshes when date sets differ
 * (fixes partial/stale caches, e.g. incomplete 2027 Norway after a failed insert).
 *
 * @param {number} year
 * @param {string} countryCode
 * @returns {Promise<Array>}
 */
export async function getHolidaysForYear(year, countryCode = "NO") {
  let apiRows = null;
  try {
    const response = await axios.get(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`
    );
    apiRows = response.data;
  } catch (err) {
    console.error(" Error fetching holidays from API:", err.message);
  }

  const existing = await Holiday.find({ year, countryCode });

  if (!Array.isArray(apiRows) || apiRows.length === 0) {
    if (existing.length > 0) {
      console.log(
        ` API unavailable or empty; using ${existing.length} cached holidays for ${countryCode} ${year}`
      );
      return existing.map((h) => ({
        ...h.toObject(),
        date: formatDate(parseISODate(h.date)),
        localName: h.localName || h.name,
        name: h.name,
      }));
    }
    throw new Error(
      apiRows && apiRows.length === 0
        ? "No holiday data returned from API"
        : "Failed to fetch holidays"
    );
  }

  const normalizedFromApi = apiRows.map((h) => ({
    date: h.date.split("T")[0],
    localName: h.localName || h.name,
    name: h.name,
    countryCode,
    year: Number(year),
  }));

  const apiKeyStr = normalizedFromApi
    .map((h) => h.date)
    .sort()
    .join("|");
  const cacheKeyStr = existing
    .map((h) => formatDate(parseISODate(h.date)))
    .sort()
    .join("|");

  if (
    apiKeyStr === cacheKeyStr &&
    existing.length === normalizedFromApi.length
  ) {
    return existing.map((h) => ({
      ...h.toObject(),
      date: formatDate(parseISODate(h.date)),
      localName: h.localName || h.name,
      name: h.name,
    }));
  }

  await Holiday.deleteMany({ year, countryCode });
  await Holiday.insertMany(normalizedFromApi);
  console.log(
    `💾 Synced ${normalizedFromApi.length} holidays for ${countryCode} ${year} (cache replaced; was ${existing.length} rows).`
  );

  return normalizedFromApi.map((h) => ({
    ...h,
    localName: h.localName || h.name,
    name: h.name,
  }));
}

/**
 * Clear cached holidays. Pass countryCode to clear one country only; omit to clear all countries for that year.
 *
 * @param {number} year
 * @param {string|null} countryCode
 */
export async function clearCachedHolidays(year, countryCode = null) {
  try {
    const filter = countryCode ? { year, countryCode } : { year };
    const result = await Holiday.deleteMany(filter);
    console.log(
      `🧹 Cleared ${result.deletedCount} holidays for ${year}${
        countryCode ? ` (${countryCode})` : " (all countries)"
      }`
    );
    return result.deletedCount;
  } catch (err) {
    console.error(" Failed to clear holidays:", err.message);
    throw err;
  }
}
