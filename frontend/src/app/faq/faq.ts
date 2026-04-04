import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { SEOService } from '../services/seo.service';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../shared/translate.pipe';

@Component({
  selector: 'app-faq',
  standalone: true,
  templateUrl: './faq.html',
  imports: [CommonModule, RouterModule, TranslatePipe],
})
export class FAQComponent implements OnInit, OnDestroy {
  private translationService = inject(TranslationService);

  constructor(
    private router: Router,
    private seoService: SEOService,
  ) {}

  ngOnInit(): void {
    const currentLang = this.translationService.currentLang();
    const ts = this.translationService;
    this.seoService.updateSEO(
      {
        title: ts.translate('seo.faqTitle'),
        description: ts.translate('seo.faqDescription'),
        keywords: ts.translate('seo.faqKeywords'),
        url: `https://hopladay.com/${currentLang}/faq`,
      },
      currentLang,
    );

    const mainEntity: Record<string, unknown>[] = [];
    for (let i = 1; i <= 8; i++) {
      mainEntity.push({
        '@type': 'Question',
        name: ts.translate(`app.faq${i}Question`),
        acceptedAnswer: {
          '@type': 'Answer',
          text: ts.translate(`app.faq${i}Answer`),
        },
      });
    }
    this.seoService.setJsonLd('hopladay-faq', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity,
    });
  }

  ngOnDestroy(): void {
    this.seoService.removeJsonLd('hopladay-faq');
  }

  goBack(): void {
    const currentLang = this.translationService.currentLang();
    this.router.navigate([`/${currentLang}`]);
  }

  getLocalizedRoute(route: string): string[] {
    const currentLang = this.translationService.currentLang();
    return [`/${currentLang}${route}`];
  }
}
