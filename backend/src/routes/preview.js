import express from 'express';
import { buildPreview, fetchPreviewHolidays, normalizePublicHolidays, parsePreviewInput } from '../services/previewService.js';

export function createPreviewRouter({ fetchHolidays = fetchPreviewHolidays, now = Date.now } = {}) {
  const router = express.Router();
  const cache = new Map();
  const pending = new Map();
  const clients = new Map();
  let windowStart = now(), requests = 0;

  router.get('/plan-preview', async (req, res) => {
    res.set('X-Robots-Tag', 'noindex');
    res.set('Cache-Control', 'no-store');
    const time = now();
    if (time - windowStart >= 60000) {
      windowStart = time;
      requests = 0;
      clients.clear();
    }
    const client = req.ip;
    const count = clients.get(client) || 0;
    if (count >= 30 || requests >= 300) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((60000 - (time - windowStart)) / 1000))));
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many preview requests. Retry after the indicated delay.' } });
    }
    clients.set(client, count + 1);
    requests++;
    let input;
    try {
      input = parsePreviewInput(req.query);
    } catch (error) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: error.message } });
    }
    try {
      const key = `${input.country}:${input.year}`;
      let data = cache.get(key);
      if (!data || time - data.time >= 86400000) {
        if (!pending.has(key)) {
          const request = Promise.resolve().then(() => fetchHolidays(input.country, input.year)).then(rows => {
            const entry = { holidays: normalizePublicHolidays(rows, input.country, input.year), time: now() };
            if (cache.size >= 128) cache.delete(cache.keys().next().value);
            cache.set(key, entry);
            return entry;
          }).finally(() => pending.delete(key));
          pending.set(key, request);
        }
        data = await pending.get(key);
      }
      return res.json(buildPreview(input, data.holidays, new Date(data.time).toISOString()));
    } catch {
      res.set('Retry-After', '60');
      return res.status(503).json({ error: { code: 'HOLIDAY_DATA_UNAVAILABLE', message: 'Could not retrieve valid nationwide holiday data. Please retry later.' } });
    }
  });
  return router;
}

export default createPreviewRouter();
