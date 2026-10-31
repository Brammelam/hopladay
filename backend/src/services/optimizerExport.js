import { createHash } from 'node:crypto';
import { addCalendarDays } from './calendarModel.js';
const escape = value => String(value).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const labels={
  en:['Vacation leave request','Vacation break','Planning event only. This does not submit or approve leave with an employer.'],
  no:['Ferieønske','Ferieperiode','Kun en kalenderhendelse. Dette sender eller godkjenner ikke ferie hos arbeidsgiveren.'],
  nl:['Verlofaanvraag','Vakantieperiode','Alleen een agenda-item. Dit dient geen verlofaanvraag in en geeft geen goedkeuring van de werkgever.'],
  de:['Urlaubswunsch','Urlaubszeitraum','Nur ein Kalendertermin. Dies beantragt oder genehmigt keinen Urlaub beim Arbeitgeber.'],
  fr:['Demande de congé','Période de vacances',"Événement de planification uniquement. Cela ne soumet ni ne valide de congé auprès de l’employeur."],
  es:['Solicitud de vacaciones','Periodo de vacaciones','Solo un evento de calendario. No presenta ni aprueba vacaciones ante el empleador.'],
  sv:['Semesterönskemål','Semesterperiod','Endast en kalenderhändelse. Detta ansöker inte om eller godkänner ledighet hos arbetsgivaren.'],
  da:['Ferieønske','Ferieperiode','Kun en kalenderbegivenhed. Dette anmoder ikke om eller godkender ferie hos arbejdsgiveren.'],
};
function fold(line) {
  let result='',width=0;
  for(const character of line){const size=Buffer.byteLength(character,'utf8');if(width+size>75){result+='\r\n ';width=1;}result+=character;width+=size;}
  return result;
}
const stamp = date => date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');

export function optimizerICS(result, mode, identity, now = new Date()) {
  if (!['leave','breaks'].includes(mode)) throw new Error('Export mode must be leave or breaks');
  const lang=result.input?.lang;
  const text=typeof lang==='string' && Object.hasOwn(labels,lang)?labels[lang]:labels.en;
  const periods = mode==='leave' ? result.suggestions.flatMap(s=>s.leaveDates.map(date=>({startDate:date,endDate:date}))) : result.suggestions;
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Hopladay//Annual Leave//EN','CALSCALE:GREGORIAN'];
  for (const period of periods) {
    const uid=createHash('sha256').update(`${identity}:${mode}:${period.startDate}:${period.endDate}`).digest('hex');
    lines.push('BEGIN:VEVENT',`UID:${uid}@hopladay.com`,`DTSTAMP:${stamp(now)}`,`DTSTART;VALUE=DATE:${period.startDate.replaceAll('-','')}`,`DTEND;VALUE=DATE:${addCalendarDays(period.endDate,1).replaceAll('-','')}`,`SUMMARY:${escape(mode==='leave'?text[0]:text[1])}`,`DESCRIPTION:${escape(text[2])}`,'STATUS:TENTATIVE','TRANSP:TRANSPARENT','END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n')+'\r\n';
}
