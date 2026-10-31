import axios from 'axios';
import { PREVIEW_COUNTRIES, holidaySourceUrl } from './previewService.js';

function invalidInput(message) {
  return Object.assign(new Error(message), { status: 400, code: 'INVALID_INPUT' });
}

export function normalizeHolidayCatalog(rows, year, country) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Missing holiday data');
  const result = new Map();
  const subdivision = new RegExp(`^${country}-[A-Z0-9]{1,6}$`);
  for (const row of rows) {
    if (!row || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      || row.countryCode !== country || typeof row.global !== 'boolean'
      || typeof row.name !== 'string' || !row.name.trim()
      || !Array.isArray(row.types) || row.types.length === 0 || !row.types.every(type => typeof type === 'string' && type.length > 0)
      || (row.counties != null && (!Array.isArray(row.counties) || !row.counties.every(code => typeof code === 'string' && subdivision.test(code))))) {
      throw new Error('Invalid holiday data');
    }
    const date = new Date(`${row.date}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.date || date.getUTCFullYear() !== year) {
      throw new Error('Invalid holiday date');
    }
    const holiday = {
      date: row.date,
      name: row.name,
      localName: typeof row.localName === 'string' ? row.localName : row.name,
      countryCode: country,
      global: row.global,
      counties: [...new Set(row.counties || [])].sort(),
      types: [...new Set(row.types)].sort(),
    };
    result.set(JSON.stringify(holiday), holiday);
  }
  return [...result.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

async function fetchRows(year, country) {
  const response = await axios.get(holidaySourceUrl(country, year), { timeout: 8000, maxContentLength: 1000000, maxRedirects: 0 });
  return response.data;
}

export function createHolidayCatalog({ fetchRows: fetch = fetchRows, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function loadHolidayCatalog(year, country, region) {
    if (!Number.isInteger(year) || year < 2024 || year > 2100) throw invalidInput('year must be an integer from 2024 to 2100.');
    if (!PREVIEW_COUNTRIES.includes(country)) throw invalidInput('Unsupported country.');
    if (region != null && (typeof region !== 'string' || !new RegExp(`^${country}-[A-Z0-9]{1,6}$`).test(region))) {
      throw invalidInput('region must be a supported subdivision code for the selected country.');
    }
    const key = `${country}:${year}`;
    let entry = cache.get(key);
    if (!entry || now() - entry.time >= 86400000) {
      if (!pending.has(key)) {
        const request = Promise.resolve().then(() => fetch(year, country)).then(rows => {
          const data = { rows: normalizeHolidayCatalog(rows, year, country), time: now() };
          if (cache.size >= 128) cache.delete(cache.keys().next().value);
          cache.set(key, data);
          return data;
        }).catch(() => {
          throw Object.assign(new Error('Could not retrieve valid holiday data. Please retry later.'), { status: 503, code: 'HOLIDAY_DATA_UNAVAILABLE' });
        }).finally(() => pending.delete(key));
        pending.set(key, request);
      }
      entry = await pending.get(key);
    }
    const publicHolidays = entry.rows.filter(row => row.types.includes('Public'));
    const regions = [...new Set(publicHolidays.filter(row => !row.global).flatMap(row => row.counties))].sort();
    if (region != null && !regions.includes(region)) throw invalidInput('The holiday provider does not support that region for this country and year. Choose nationwide holidays instead.');
    return {
      holidays: publicHolidays.filter(row => row.global || (region != null && row.counties.includes(region))),
      regions,
      source: {
        name: 'Nager.Date',
        url: holidaySourceUrl(country, year),
        retrievedAt: new Date(entry.time).toISOString(),
        scope: region == null ? 'nationwide-public-holidays' : 'national-and-selected-region',
        region: region ?? null,
      },
    };
  };
}

export const loadHolidayCatalog = createHolidayCatalog();
export default loadHolidayCatalog;
