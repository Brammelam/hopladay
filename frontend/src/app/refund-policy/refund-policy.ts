import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { SEOService } from '../services/seo.service';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../shared/translate.pipe';

@Component({
  selector: 'app-refund-policy',
  standalone: true,
  templateUrl: './refund-policy.html',
  imports: [CommonModule, RouterModule, TranslatePipe]
})
export class RefundPolicyComponent implements OnInit {
  lastUpdated: string;
  private translationService = inject(TranslationService);

  constructor(
    private router: Router,
    private seoService: SEOService
  ) {
    const lang = this.translationService.currentLang();
    const localeMap: Record<string, string> = {
      'en': 'en-US',
      'no': 'nb-NO',
      'nl': 'nl-NL'
    };
    this.lastUpdated = new Date().toLocaleDateString(localeMap[lang] || 'en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  ngOnInit(): void {
    this.seoService.updateSEO({
      title: 'Refund Policy - Hopladay Premium',
      description: 'Read Hopladay\'s refund policy for Premium subscriptions. Learn about our cancellation and refund terms.',
      url: 'https://hopladay.com/refunds'
    });
  }

  goBack(): void {
    const currentLang = this.translationService.currentLang();
    this.router.navigate([`/${currentLang}`]);
  }
}

