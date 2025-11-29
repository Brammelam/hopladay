/**
 * Translation service for backend plan descriptions
 * Supports: en (English), no (Norwegian), nl (Dutch)
 */

const translations = {
  en: {
    connects: (holidays) => `Connects ${holidays} into one continuous break`,
    bridges: (before, after) => `Bridges ${before} to ${after}`,
    createsBreak: (days) => `Creates a ${days}-day break`,
    turnsWeekend: (days) => `Turns a weekend into ${days} days off`,
    addsDaysBefore: (holiday) => `Adds days before ${holiday} for a longer break`,
    addsDaysAfter: (holiday) => `Adds days after ${holiday} for a longer break`,
    extendsHolidayWeekend: (days) => `Extends a holiday weekend into ${days} days off`,
    highlyEfficient: (dayName, days) => `Highly efficient: Taking ${dayName} off gives you ${days} consecutive days`,
    addsDayOff: (dayName, days) => `Adds a ${dayName} off for a ${days}-day break`,
    otherHoliday: (count) => count === 1 ? 'other holiday' : 'other holidays',
    and: 'and',
    strategyBridge: 'Bridge',
    strategyExtend: 'Extend',
    strategyOptimize: 'Optimize',
    strategyVacation: 'Vacation',
    day: 'day',
    days: 'days',
    daysOff: 'days off',
    exceptionalEfficiency: ' (Exceptional efficiency)',
    greatValue: ' (Great value)',
    goodValue: ' (Good value)',
    summerPeriod: ' Summer period',
    extendedVacation: ' Extended vacation',
    longWeekend: ' Long weekend',
  },
  no: {
    connects: (holidays) => `Kobler sammen ${holidays} til én sammenhengende ferie`,
    bridges: (before, after) => `Bygger bro mellom ${before} og ${after}`,
    createsBreak: (days) => `Skaper en ${days} dagers pause`,
    turnsWeekend: (days) => `Gjør en helg om til ${days} fridager`,
    addsDaysBefore: (holiday) => `Legger til dager før ${holiday} for en lengre ferie`,
    addsDaysAfter: (holiday) => `Legger til dager etter ${holiday} for en lengre ferie`,
    extendsHolidayWeekend: (days) => `Utvider en hellighelg til ${days} fridager`,
    highlyEfficient: (dayName, days) => `Svært effektivt: Å ta ${dayName} fri gir deg ${days} sammenhengende dager`,
    addsDayOff: (dayName, days) => `Legger til en ${dayName} fri for en ${days} dagers ferie`,
    otherHoliday: (count) => count === 1 ? 'annen helligdag' : 'andre helligdager',
    and: 'og',
    strategyBridge: 'Bro',
    strategyExtend: 'Utvid',
    strategyOptimize: 'Optimaliser',
    strategyVacation: 'Ferie',
    day: 'dag',
    days: 'dager',
    daysOff: 'fridager',
    exceptionalEfficiency: ' (Eksepsjonell effektivitet)',
    greatValue: ' (Utmerket verdi)',
    goodValue: ' (God verdi)',
    summerPeriod: ' Sommerperiode',
    extendedVacation: ' Utvidet ferie',
    longWeekend: ' Lang helg',
  },
  nl: {
    connects: (holidays) => `Verbindt ${holidays} tot één aaneengesloten vakantie`,
    bridges: (before, after) => `Brugt tussen ${before} en ${after}`,
    createsBreak: (days) => `Creëert een ${days} dagen durende pauze`,
    turnsWeekend: (days) => `Verandert een weekend in ${days} vrije dagen`,
    addsDaysBefore: (holiday) => `Voegt dagen toe voor ${holiday} voor een langere vakantie`,
    addsDaysAfter: (holiday) => `Voegt dagen toe na ${holiday} voor een langere vakantie`,
    extendsHolidayWeekend: (days) => `Verlengt een feestweekend tot ${days} vrije dagen`,
    highlyEfficient: (dayName, days) => `Zeer efficiënt: ${dayName} vrij nemen geeft je ${days} opeenvolgende dagen`,
    addsDayOff: (dayName, days) => `Voegt een ${dayName} vrij toe voor een ${days} dagen durende vakantie`,
    otherHoliday: (count) => count === 1 ? 'andere feestdag' : 'andere feestdagen',
    and: 'en',
    strategyBridge: 'Brug',
    strategyExtend: 'Verleng',
    strategyOptimize: 'Optimaliseer',
    strategyVacation: 'Vakantie',
    day: 'dag',
    days: 'dagen',
    daysOff: 'vrije dagen',
    exceptionalEfficiency: ' (Uitzonderlijke efficiëntie)',
    greatValue: ' (Uitstekende waarde)',
    goodValue: ' (Goede waarde)',
    summerPeriod: ' Zomerperiode',
    extendedVacation: ' Uitgebreide vakantie',
    longWeekend: ' Lang weekend',
  },
};

/**
 * Get translation function for a given language
 * @param {string} lang - Language code ('en', 'no', 'nl')
 * @returns {object} Translation functions
 */
export function getTranslations(lang = 'en') {
  return translations[lang] || translations.en;
}

/**
 * Translate a key with parameters
 * @param {string} lang - Language code
 * @param {string} key - Translation key
 * @param {...any} args - Arguments for the translation function
 * @returns {string} Translated string
 */
export function translate(lang, key, ...args) {
  const t = getTranslations(lang);
  const fn = t[key];
  if (!fn) {
    console.warn(`Translation missing for key: ${key} in language: ${lang}`);
    return translations.en[key] ? translations.en[key](...args) : key;
  }
  return fn(...args);
}

