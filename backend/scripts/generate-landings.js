import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { optimizeAnnualLeave } from '../src/services/annualOptimizer.js';
import { normalizeHolidayCatalog } from '../src/services/holidayCatalog.js';

const publicRoot = new URL('../../frontend/public/', import.meta.url);
const routes = [
  { path: '/en/norway/2027', file: 'en/norway/2027/index.html', country: 'NO', year: 2027, lang: 'en' },
  { path: '/en/sweden/2027', file: 'en/sweden/2027/index.html', country: 'SE', year: 2027, lang: 'en' },
  { path: '/nl/nederland/2027', file: 'nl/nederland/2027/index.html', country: 'NL', year: 2027, lang: 'nl' },
];
const copy = {
  en: {
    countries: { NO: 'Norway', SE: 'Sweden' },
    title: country => `Vacation planning in ${country} in 2027`,
    description: country => `Plan vacation dates in ${country} in 2027 using public holidays, weekends and a 20-day allowance. See a calculated example, exact leave dates and a full-year calendar.`,
    back: 'Hopladay planner', cta: 'Find my best vacation dates',
    introduction: country => `How can you get the most out of your vacation days in ${country}? This example uses the nationwide public holidays for 2027 and a 20-day vacation allowance. Change your country, year and allowance in the planner to get your own result.`,
    example: 'A calculated example, ready to adjust', used: 'Vacation days used', days: 'Calendar days in breaks', remaining: 'Remaining leave', longest: 'Longest vacation', breaks: 'Recommended breaks',
    metricsNote: 'Vacation days used are newly requested workdays. Calendar days in breaks include only the recommended periods, including their weekends and public holidays; they are not your total annual days off.',
    opportunities: 'Suggested vacation opportunities', dates: 'Workdays to request off', cost: 'Vacation days required', duration: 'Consecutive calendar days', holidaysInBreak: 'Public holidays in this break', calendarLink: 'See this month in the calendar',
    holidayHeading: 'Nationwide public holidays in 2027', holidayNote: 'These are the provider’s nationwide holidays of type Public. A holiday on a weekend is shown on its supplied date; no replacement workday is invented.',
    calendar: 'Your full-year calendar', legend: 'Calendar legend', working: 'Working day', weekend: 'Weekend', holiday: 'Public holiday', leave: 'Proposed vacation day', inBreak: 'Part of a suggested break',
    holidayMark: 'P', leaveMark: 'L', breakMark: 'B', weekendMark: 'W',
    method: 'How this example is calculated',
    criteria: constraints => `The free maximum-time-off strategy maximizes calendar days in leave-containing breaks, then used allowance, then preferred-month days, then prefers fewer breaks with stable date ties. Default limits span the full year: ${constraints.minBreakLength}–${constraints.maxBreakLength} days per break, up to ${constraints.maxBreaks} breaks, and ${constraints.minSeparationDays} unselected day between breaks. No preferred months, company holidays or approved leave were supplied for this example.`,
    methodNote: 'The deterministic engine optimizes that declared objective under the calendar and allowance constraints. Unrelated weekends and holidays are not counted. Any remaining allowance cannot improve those priorities within the constraints.',
    assumptions: 'Assumptions and holiday data',
    workweek: 'This example assumes a Monday–Friday workweek and nationwide public holidays only. Regional holidays, custom work schedules and employer-specific entitlement can change the result. A public holiday does not guarantee a day off for every worker; verify your entitlement with your employer.',
    source: 'Source', retrieved: 'Snapshot retrieved', refresh: 'This page is generated offline from the stored provider snapshot. The interactive planner fetches current data, so its result can change after a provider update.',
    footer: 'Already have a different allowance or a booked break? Adjust the example in the planner. The basic preview needs no sign-in; Premium restrictions on advanced features remain unchanged.', api: 'Public API documentation',
  },
  nl: {
    countries: { NL: 'Nederland' },
    title: country => `Vakantie plannen in ${country} in 2027`,
    description: country => `Plan je vakantie in ${country} in 2027 met feestdagen, weekenden en een budget van 20 vakantiedagen. Bekijk een berekend voorbeeld, de aan te vragen dagen en de jaarkalender.`,
    back: 'Hopladay-planner', cta: 'Vind mijn beste vakantiedata',
    introduction: country => `Hoe haal je meer uit je vakantiedagen in ${country}? Dit voorbeeld gebruikt de landelijke feestdagen van 2027 en een budget van 20 vakantiedagen. Pas het land, jaar en aantal dagen aan in de planner voor je eigen resultaat.`,
    example: 'Een berekend voorbeeld dat je kunt aanpassen', used: 'Gebruikte vakantiedagen', days: 'Kalenderdagen in vakantieblokken', remaining: 'Resterende vakantiedagen', longest: 'Langste vakantie', breaks: 'Voorgestelde vakantieblokken',
    metricsNote: 'Gebruikte vakantiedagen zijn werkdagen waarvoor je nieuw verlof aanvraagt. Kalenderdagen in vakantieblokken omvatten alleen de voorgestelde periodes, inclusief bijbehorende weekenden en feestdagen. Dit is niet het totale aantal vrije dagen in het jaar.',
    opportunities: 'Voorgestelde vakantieperiodes', dates: 'Werkdagen om vrij te vragen', cost: 'Benodigde vakantiedagen', duration: 'Aaneengesloten kalenderdagen', holidaysInBreak: 'Feestdagen in deze periode', calendarLink: 'Bekijk deze maand in de kalender',
    holidayHeading: 'Landelijke feestdagen in 2027', holidayNote: 'Dit zijn de landelijke feestdagen van het type Public bij de gegevensbron. Een feestdag in het weekend blijft op de aangeleverde datum staan; er wordt geen vervangende werkdag verzonnen.',
    calendar: 'Je volledige jaarkalender', legend: 'Legenda van de kalender', working: 'Werkdag', weekend: 'Weekend', holiday: 'Feestdag', leave: 'Voorgestelde vakantiedag', inBreak: 'Onderdeel van een voorgesteld vakantieblok',
    holidayMark: 'F', leaveMark: 'V', breakMark: 'B', weekendMark: 'W',
    method: 'Zo wordt dit voorbeeld berekend',
    criteria: constraints => `De gratis strategie voor maximale vrije tijd maximaliseert eerst kalenderdagen in periodes met verlof, daarna gebruikte vakantiedagen en dagen in voorkeursmaanden, en kiest vervolgens minder periodes met een vaste datumvolgorde. De standaardgrenzen omvatten het hele jaar: ${constraints.minBreakLength}–${constraints.maxBreakLength} dagen per periode, maximaal ${constraints.maxBreaks} periodes en ${constraints.minSeparationDays} niet-geselecteerde dag tussen periodes. Voor dit voorbeeld zijn geen voorkeursmaanden, bedrijfsvrije dagen of eerder goedgekeurd verlof opgegeven.`,
    methodNote: 'De deterministische berekening optimaliseert dat doel binnen de kalender en het dagbudget. Losstaande weekenden en feestdagen tellen niet mee. Resterende vakantiedagen kunnen deze prioriteiten niet verbeteren binnen de opgegeven grenzen.',
    assumptions: 'Uitgangspunten en feestdaggegevens',
    workweek: 'Dit voorbeeld gaat uit van een werkweek van maandag tot en met vrijdag en uitsluitend landelijke feestdagen. Regionale feestdagen, andere werkroosters en werkgeversafspraken kunnen het resultaat veranderen. Een feestdag betekent niet automatisch dat iedere werknemer vrij is. Controleer je aanspraak bij je werkgever.',
    source: 'Gegevensbron', retrieved: 'Gegevens opgehaald op', refresh: 'Deze pagina wordt offline opgebouwd uit de opgeslagen gegevens van de bron. De interactieve planner haalt actuele gegevens op; een bronwijziging kan daarom een ander resultaat geven.',
    footer: 'Heb je een ander dagbudget of al een vakantie geboekt? Pas het voorbeeld aan in de planner. Voor het basisvoorbeeld hoef je niet in te loggen; bestaande Premium-beperkingen voor geavanceerde functies blijven gelden.', api: 'Documentatie van de openbare API',
  },
};
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const time = date => `<time datetime="${escape(date)}">${escape(date)}</time>`;
const styles = `body{margin:0;background:#f9fafb;color:#111827;font:1rem/1.6 system-ui,sans-serif}main{max-width:76rem;margin:auto;padding:2rem 1rem 4rem}header,.reading{max-width:74ch}h1{font-size:clamp(1.8rem,4vw,2.7rem);line-height:1.15;letter-spacing:-.02em}h2{font-size:1.6rem;margin:2.5rem 0 1rem;line-height:1.3}h3{font-size:1.15rem;line-height:1.3}a{color:#1d4ed8;text-underline-offset:.2em}a:focus-visible{outline:2px solid;outline-offset:4px}.cta{display:inline-block;background:#111827;color:white;padding:.75rem 1rem;border-radius:.35rem;text-decoration:none;min-height:1.5rem}.metrics{display:flex;flex-wrap:wrap;gap:1.5rem;margin:1.5rem 0}.metrics div{flex:1 1 9rem}.metrics dt{font-size:.9rem;color:#4b5563}.metrics dd{font-weight:650;font-size:1.6rem;margin:0}.breaks{padding-left:1.5rem}.breaks li{padding:.25rem 0 1rem}.calendar{display:grid;grid-template-columns:repeat(auto-fit,minmax(17rem,1fr));gap:1.5rem}.month{min-width:0;scroll-margin-top:1rem}.month table{border-collapse:collapse;table-layout:fixed;width:100%;font-variant-numeric:tabular-nums}.month th{font-size:.8rem;font-weight:500;color:#4b5563;padding:.3rem}.month td{height:3rem;border:1px solid #e5e7eb;text-align:center;vertical-align:top;font-size:.9rem;padding:.15rem}.month td.nonworking{background:#e5e7eb}.month td.inbreak{background:#dbeafe}.month td.leave{background:#bfdbfe;font-weight:650}.month td.holiday{border-bottom:2px solid #9f1239}.marks{display:block;font-size:.6rem;line-height:1rem;letter-spacing:.05em}.legend{display:flex;flex-wrap:wrap;gap:.5rem 1rem;font-size:.9rem;padding:0;list-style:none}.source,footer{font-size:.9rem;color:#4b5563;margin-top:2rem}footer{border-top:1px solid #d1d5db;padding-top:1.5rem}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}dd,li{overflow-wrap:anywhere}`;

function renderCalendar(result, lang, text, holidays) {
  const monthName = new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' });
  const dayName = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' });
  const dateName = new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeZone: 'UTC' });
  const weekdays = Array.from({ length: 7 }, (_, i) => dayName.format(new Date(Date.UTC(2027, 0, 4 + i))));
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const days = result.calendar.filter(day => day.month === month);
    const name = monthName.format(new Date(`${days[0].date}T00:00:00Z`));
    const leading = (days[0].weekday + 6) % 7;
    const cells = [...Array(leading).fill(null), ...days];
    while (cells.length % 7) cells.push(null);
    const rows = [];
    for (let start = 0; start < cells.length; start += 7) {
      rows.push(`<tr>${cells.slice(start, start + 7).map(day => {
        if (!day) return '<td aria-hidden="true"></td>';
        const inBreak = result.suggestions.some(s => s.startDate <= day.date && s.endDate >= day.date);
        const labels = [day.regularNonWorking ? text.weekend : text.working];
        const marks = [];
        if (day.regularNonWorking) marks.push(text.weekendMark);
        if (day.publicHoliday) { labels.push(text.holiday, ...holidays.filter(holiday => holiday.date === day.date).map(holiday => lang === 'nl' ? holiday.localName : holiday.name)); marks.push(text.holidayMark); }
        if (day.recommendedLeave) { labels.push(text.leave); marks.push(text.leaveMark); }
        if (inBreak) { labels.push(text.inBreak); marks.push(text.breakMark); }
        const classes = [day.regularNonWorking ? 'nonworking' : '', inBreak ? 'inbreak' : '', day.recommendedLeave ? 'leave' : '', day.publicHoliday ? 'holiday' : ''].filter(Boolean).join(' ');
        const label = `${dateName.format(new Date(`${day.date}T00:00:00Z`))}: ${labels.join('; ')}`;
        return `<td data-date="${day.date}" class="${classes}"><time datetime="${day.date}" aria-label="${escape(label)}">${Number(day.date.slice(-2))}</time><span class="marks" aria-hidden="true">${escape(marks.join(' '))}</span></td>`;
      }).join('')}</tr>`);
    }
    return `<section class="month" id="month-${String(month).padStart(2, '0')}" aria-labelledby="month-title-${month}"><h3 id="month-title-${month}">${escape(name)} 2027</h3><table aria-label="${escape(name)} 2027"><thead><tr>${weekdays.map(name => `<th scope="col">${escape(name)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></section>`;
  }).join('\n');
}

export function renderLandingPage(route, snapshot) {
  if (snapshot.year !== route.year || snapshot.country !== route.country || !Number.isFinite(Date.parse(snapshot.retrievedAt)) || snapshot.sourceUrl !== `https://date.nager.at/api/v3/PublicHolidays/${route.year}/${route.country}`) throw new Error('Invalid landing-page holiday snapshot');
  const holidays = normalizeHolidayCatalog(snapshot.rows, route.year, route.country).filter(holiday => holiday.global && holiday.types.includes('Public'));
  const result = optimizeAnnualLeave({ year: route.year, availableDays: 20, strategy: 'maximum_time_off' }, holidays);
  if (result.status !== 'ok') throw new Error(`Could not generate a valid example for ${route.path}`);
  const text = copy[route.lang];
  const country = text.countries[route.country];
  const title = text.title(country);
  const canonical = `https://www.hopladay.com/${route.file}`;
  const planner = `/${route.lang}/optimize?country=${route.country}&year=${route.year}&availableDays=20`;
  const holidayName = holiday => route.lang === 'nl' ? holiday.localName : holiday.name;
  const structuredData = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: text.description(country), url: canonical, inLanguage: route.lang }).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="${route.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} — Hopladay</title><meta name="description" content="${escape(text.description(country))}">
<link rel="canonical" href="${escape(canonical)}"><meta name="robots" content="index,follow">
<meta property="og:type" content="website"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(text.description(country))}"><meta property="og:url" content="${escape(canonical)}">
<script type="application/ld+json">${structuredData}</script><style>${styles}</style></head><body>
<main data-used-days="${result.usedDays}" data-calendar-days="${result.totalDaysOff}" data-longest-vacation="${result.longestVacation}" data-break-count="${result.breakCount}">
<header><a href="/${route.lang}/optimize">${escape(text.back)}</a><h1>${escape(title)}</h1><p>${escape(text.introduction(country))}</p><a class="cta" href="${escape(planner)}">${escape(text.cta)}</a></header>
<section aria-labelledby="example-heading"><h2 id="example-heading">${escape(text.example)}</h2><dl class="metrics">${[[text.used, result.usedDays], [text.days, result.totalDaysOff], [text.remaining, result.remainingDays], [text.longest, result.longestVacation], [text.breaks, result.breakCount]].map(([label, count]) => `<div><dt>${escape(label)}</dt><dd>${count}</dd></div>`).join('')}</dl><p class="reading">${escape(text.metricsNote)}</p></section>
<section aria-labelledby="opportunities-heading" class="reading"><h2 id="opportunities-heading">${escape(text.opportunities)}</h2><ol class="breaks">${result.suggestions.map(suggestion => `<li data-break-start="${suggestion.startDate}" data-break-end="${suggestion.endDate}"><h3>${time(suggestion.startDate)} — ${time(suggestion.endDate)}</h3><p>${escape(text.cost)}: ${suggestion.vacationDaysUsed}. ${escape(text.duration)}: ${suggestion.totalDaysOff}.</p><p><strong>${escape(text.dates)}:</strong> ${suggestion.leaveDates.map(time).join(', ')}</p>${suggestion.publicHolidays.length ? `<p>${escape(text.holidaysInBreak)}: ${suggestion.publicHolidays.map(holiday => `${time(holiday.date)} (${escape(holidays.filter(h => h.date === holiday.date).map(holidayName).join(' / '))})`).join(', ')}</p>` : ''}<a href="#month-${suggestion.startDate.slice(5, 7)}">${escape(text.calendarLink)}</a></li>`).join('')}</ol></section>
<section aria-labelledby="calendar-heading"><h2 id="calendar-heading">${escape(text.calendar)}</h2><ul class="legend" aria-label="${escape(text.legend)}">${[[text.weekendMark, text.weekend], [text.holidayMark, text.holiday], [text.leaveMark, text.leave], [text.breakMark, text.inBreak]].map(([mark, label]) => `<li><strong>${escape(mark)}</strong> — ${escape(label)}</li>`).join('')}</ul><div class="calendar">${renderCalendar(result, route.lang, text, holidays)}</div></section>
<section aria-labelledby="holiday-heading" class="reading"><h2 id="holiday-heading">${escape(text.holidayHeading)}</h2><p>${escape(text.holidayNote)}</p><ul>${holidays.map(holiday => `<li>${time(holiday.date)} — ${escape(holidayName(holiday))}</li>`).join('')}</ul></section>
<section aria-labelledby="method-heading" class="reading"><h2 id="method-heading">${escape(text.method)}</h2><p>${escape(text.criteria(result.constraints))}</p><p>${escape(text.methodNote)}</p></section>
<section aria-labelledby="source-heading" class="reading"><h2 id="source-heading">${escape(text.assumptions)}</h2><p>${escape(text.workweek)}</p><p class="source">${escape(text.source)}: <a href="${escape(snapshot.sourceUrl)}">Nager.Date</a>. ${escape(text.retrieved)}: <time datetime="${escape(snapshot.retrievedAt)}">${escape(snapshot.retrievedAt)}</time>.</p><p>${escape(text.refresh)}</p></section>
<footer class="reading"><p>${escape(text.footer)}</p><a class="cta" href="${escape(planner)}">${escape(text.cta)}</a><p><a href="/optimizer-api.html">${escape(text.api)}</a></p></footer>
</main></body></html>
`;
  return { route, snapshot, result, html };
}

export async function generateLandingPages({ write = true } = {}) {
  const pages = [];
  for (const route of routes) {
    const snapshot = JSON.parse(await readFile(new URL(`../test/fixtures/holiday-${route.country}-${route.year}.json`, import.meta.url), 'utf8'));
    const page = renderLandingPage(route, snapshot);
    pages.push(page);
    if (write) {
      const destination = new URL(route.file, publicRoot);
      await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
      await writeFile(destination, page.html);
    }
  }
  if (write) await writeFile(new URL('landing-routes.json', publicRoot), JSON.stringify(routes, null, 2) + '\n');
  return pages;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const pages = await generateLandingPages();
  console.log(`Generated ${pages.length} fixture-backed country/year landing pages.`);
}
