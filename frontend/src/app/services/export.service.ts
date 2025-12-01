import { Injectable, inject } from '@angular/core';
import { TranslationService } from './translation.service';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private translationService = inject(TranslationService);
  /**
   * Export plan as iCalendar (.ics) file - compatible with Google Calendar, Outlook, Apple Calendar
   */
  exportToICS(plan: any, countryName: string): void {
    if (!plan || !plan.suggestions || plan.suggestions.length === 0) {
      return;
    }

    const now = new Date();
    const uidDomain = 'hopladay.onrender.com';
    
    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Hopladay//Vacation Plan//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    plan.suggestions.forEach((suggestion: any, index: number) => {
      const startDate = new Date(suggestion.startDate);
      const endDate = new Date(suggestion.endDate);
      
      // iCalendar uses UTC, format: YYYYMMDD for all-day events
      const formatICSDate = (date: Date): string => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}${month}${day}`;
      };

      const dtstart = formatICSDate(startDate);
      // For all-day events, DTEND is exclusive, so add 1 day
      const endDatePlusOne = new Date(endDate);
      endDatePlusOne.setUTCDate(endDatePlusOne.getUTCDate() + 1);
      const dtend = formatICSDate(endDatePlusOne);
      
      const summary = this.getEventTitle(suggestion, countryName);
      const description = this.getEventDescription(suggestion, plan);
      
      icsContent.push(
        'BEGIN:VEVENT',
        `UID:${plan._id}-${index}@${uidDomain}`,
        `DTSTAMP:${formatICSDate(now)}T000000Z`,
        `DTSTART;VALUE=DATE:${dtstart}`,
        `DTEND;VALUE=DATE:${dtend}`,
        `SUMMARY:${this.escapeICS(summary)}`,
        `DESCRIPTION:${this.escapeICS(description)}`,
        `LOCATION:${countryName}`,
        'STATUS:CONFIRMED',
        'TRANSP:TRANSPARENT',
        'END:VEVENT'
      );
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vacation-plan-${plan.year}-${countryName}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Export plan as PDF report - opens print dialog for user to save as PDF
   */
  exportToPDF(plan: any, countryName: string, holidays: any[]): void {
    if (!plan) {
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    const html = this.generatePrintHTML(plan, countryName, holidays);
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Wait for images to load, then trigger print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 250);
    };
  }

  private getEventTitle(suggestion: any, countryName: string): string {
    if (suggestion.isManual) {
      return `${this.translationService.translate('export.vacationLabel')} - ${countryName}`;
    }
    if (suggestion.description) {
      return suggestion.description;
    }
    const daysOff = suggestion.totalDaysOff;
    const vacationDays = suggestion.vacationDaysUsed;
    const dayLabel = vacationDays === 1 
      ? this.translationService.translate('common.day')
      : this.translationService.translate('common.days');
    return `${this.translationService.translate('export.vacationLabel')} - ${daysOff} ${this.translationService.translate('common.off')} (${vacationDays} ${this.translationService.translate('plan.vacationDays')})`;
  }

  private getEventDescription(suggestion: any, plan: any): string {
    const lang = this.translationService.currentLang();
    const parts: string[] = [];
    
    if (suggestion.description) {
      parts.push(suggestion.description);
    }
    
    if (suggestion.reason) {
      parts.push(`\n${this.translationService.translate('export.reasonLabel')}: ${suggestion.reason}`);
    }
    
    parts.push(`\n${this.translationService.translate('export.vacationDaysUsed')}: ${suggestion.vacationDaysUsed}`);
    parts.push(`${this.translationService.translate('plan.totalDaysOff')}: ${suggestion.totalDaysOff}`);
    
    if (suggestion.roi) {
      parts.push(`${this.translationService.translate('plan.roi')}: ${suggestion.roi}x`);
    }
    
    if (suggestion.isMerged) {
      parts.push(`\n${this.translationService.translate('export.includesManualAndAI')}`);
    } else if (suggestion.isManual) {
      parts.push(`\n${this.translationService.translate('export.manuallyAdded')}`);
    }
    
    parts.push(`\n${this.translationService.translate('export.strategyLabel')}: ${this.formatPreference(plan.preference || 'balanced', lang)}`);
    
    return parts.join('');
  }

  private escapeICS(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  private formatPreference(pref: string, lang: string = 'en'): string {
    const strategyLabels: Record<string, string> = {
      balanced: this.translationService.translate('strategy.balanced'),
      many_long_weekends: this.translationService.translate('strategy.longWeekends'),
      few_long_vacations: this.translationService.translate('strategy.longVacations'),
      summer_vacation: this.translationService.translate('strategy.summerFocus'),
      spread_out: this.translationService.translate('strategy.spreadOut'),
    };
    return strategyLabels[pref] || pref;
  }

  private generatePrintHTML(plan: any, countryName: string, holidays: any[]): string {
    const lang = this.translationService.currentLang();
    const locale = lang === 'en' ? 'en-US' : lang === 'no' ? 'nb-NO' : lang === 'nl' ? 'nl-NL' : lang === 'de' ? 'de-DE' : lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : lang === 'sv' ? 'sv-SE' : lang === 'da' ? 'da-DK' : 'en-US';
    
    const formatDate = (date: Date): string => {
      return new Date(date).toLocaleDateString(locale, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    };

    const formatDateRange = (start: Date, end: Date): string => {
      const startStr = new Date(start).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
      });
      const endStr = new Date(end).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${startStr} - ${endStr}`;
    };

    const suggestions = plan.suggestions || [];
    const sortedSuggestions = [...suggestions].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    const html = `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${this.translationService.translate('export.pdfTitle')} ${plan.year} - ${countryName}</title>
  <style>
    @media print {
      @page {
        size: A4;
        margin: 1.5cm;
      }
      body {
        margin: 0;
      }
      .no-print {
        display: none;
      }
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: white;
      padding: 2rem;
      max-width: 800px;
      margin: 0 auto;
    }
    
    .header {
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 1rem;
      margin-bottom: 2rem;
    }
    
    .header h1 {
      font-size: 2rem;
      color: #1e40af;
      margin-bottom: 0.5rem;
    }
    
    .header .subtitle {
      color: #6b7280;
      font-size: 0.95rem;
    }
    
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.2rem;
      margin-bottom: 1rem;
      padding: 1rem;
      background: #f3f4f6;
      border-radius: 0.5rem;
    }
    
    .stat-item {
      text-align: center;
    }
    
    .stat-value {
      font-size: 1.75rem;
      font-weight: bold;
      color: #1e40af;
    }
    
    .stat-label {
      font-size: 0.875rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }
    
    .section {
      margin-bottom: 1rem;
    }
    
    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .vacation-block {
      margin-bottom: 1.5rem;
      padding: 1rem;
      border-left: 4px solid #3b82f6;
      background: #f9fafb;
      border-radius: 0.375rem;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    
    .vacation-block.manual {
      border-left-color: #10b981;
    }
    
    .vacation-block.merged {
      border-left-color: #8b5cf6;
    }
    
    .block-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    
    .block-title {
      font-weight: 600;
      font-size: 1.1rem;
      color: #1f2937;
    }
    
    .block-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .badge-ai {
      background: #dbeafe;
      color: #1e40af;
    }
    
    .badge-manual {
      background: #d1fae5;
      color: #065f46;
    }
    
    .badge-merged {
      background: #ede9fe;
      color: #6d28d9;
    }
    
    .block-dates {
      font-size: 0.95rem;
      color: #4b5563;
      margin-bottom: 0.5rem;
    }
    
    .block-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 0.75rem;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e5e7eb;
    }
    
    .detail-item {
      font-size: 0.875rem;
    }
    
    .detail-label {
      color: #6b7280;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .detail-value {
      color: #1f2937;
      font-weight: 600;
      margin-top: 0.25rem;
    }
    
    .block-reason {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e5e7eb;
      font-size: 0.9rem;
      color: #4b5563;
      font-style: italic;
    }
    
    .footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 0.875rem;
    }
    
    .no-vacations {
      text-align: center;
      padding: 2rem;
      color: #6b7280;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${this.translationService.translate('export.pdfTitle')} ${plan.year}</h1>
    <div class="subtitle">${countryName} • ${this.translationService.translate('export.strategyLabel')}: ${this.formatPreference(plan.preference || 'balanced', lang)}</div>
  </div>
  
  <div class="stats">
    <div class="stat-item">
      <div class="stat-value">${plan.usedDays || 0}</div>
      <div class="stat-label">${this.translationService.translate('export.vacationDaysUsed')}</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">${plan.availableDays || 0}</div>
      <div class="stat-label">${this.translationService.translate('export.availableDays')}</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">${plan.totalDaysOff || 0}</div>
      <div class="stat-label">${this.translationService.translate('plan.totalDaysOff')}</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">${sortedSuggestions.length}</div>
      <div class="stat-label">${this.translationService.translate('export.vacationBlocks')}</div>
    </div>
  </div>
  
  <div class="section">
    <h2 class="section-title">${this.translationService.translate('export.vacationSchedule')}</h2>
    ${
      sortedSuggestions.length === 0
        ? `<div class="no-vacations">${this.translationService.translate('export.noVacationDaysPlanned')}</div>`
        : sortedSuggestions
            .map((s: any) => {
              const badgeClass = s.isMerged ? 'badge-merged' : s.isManual ? 'badge-manual' : 'badge-ai';
              const badgeText = s.isMerged 
                ? this.translationService.translate('plan.mixed')
                : s.isManual 
                  ? this.translationService.translate('export.manual')
                  : this.translationService.translate('export.suggested');
              const blockClass = s.isMerged ? 'merged' : s.isManual ? 'manual' : '';
              
              return `
                <div class="vacation-block ${blockClass}">
                  <div class="block-header">
                    <div class="block-title">${s.description || this.translationService.translate('export.vacationLabel')}</div>
                    <span class="block-badge ${badgeClass}">${badgeText}</span>
                  </div>
                  <div class="block-dates">${formatDateRange(new Date(s.startDate), new Date(s.endDate))}</div>
                  ${
                    s.reason
                      ? `<div class="block-reason">${this.escapeHTML(s.reason)}</div>`
                      : ''
                  }
                  <div class="block-details">
                    <div class="detail-item">
                      <div class="detail-label">${this.translationService.translate('plan.vacationDays')}</div>
                      <div class="detail-value">${s.vacationDaysUsed}</div>
                    </div>
                    <div class="detail-item">
                      <div class="detail-label">${this.translationService.translate('plan.totalDaysOff')}</div>
                      <div class="detail-value">${s.totalDaysOff}</div>
                    </div>
                    ${
                      s.roi
                        ? `
                      <div class="detail-item">
                        <div class="detail-label">${this.translationService.translate('plan.roi')}</div>
                        <div class="detail-value">${s.roi}x</div>
                      </div>
                    `
                        : ''
                    }
                  </div>
                </div>
              `;
            })
            .join('')
    }
  </div>
  
  <div class="footer">
    <div>${this.translationService.translate('export.generatedBy')} Hopladay • ${new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    <div style="margin-top: 0.5rem;">${this.translationService.translate('export.printOrSavePDF')}</div>
  </div>
</body>
</html>
    `;

    return html;
  }

  private escapeHTML(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

