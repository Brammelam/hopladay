import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { SEOService } from '../services/seo.service';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../shared/translate.pipe';

@Component({
  selector: 'app-stripe-info',
  standalone: true,
  templateUrl: './stripe-info.html',
  imports: [CommonModule, RouterModule, TranslatePipe]
})
export class StripeInfoComponent implements OnInit {
  private translationService = inject(TranslationService);

  constructor(
    private router: Router,
    private seoService: SEOService
  ) {}

  ngOnInit(): void {
    const currentLang = this.translationService.currentLang();
    const ts = this.translationService;
    this.seoService.updateSEO(
      {
        title: ts.translate('seo.paymentTitle'),
        description: ts.translate('seo.paymentDescription'),
        keywords: ts.translate('seo.paymentKeywords'),
        url: `https://hopladay.com/${currentLang}/payment/info`,
      },
      currentLang,
    );
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

