import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { SEOService } from '../services/seo.service';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../shared/translate.pipe';

@Component({
  selector: 'app-faq',
  standalone: true,
  templateUrl: './faq.html',
  imports: [CommonModule, RouterModule, TranslatePipe]
})
export class FAQComponent implements OnInit {
  private translationService = inject(TranslationService);

  constructor(
    private router: Router,
    private seoService: SEOService
  ) {}

  ngOnInit(): void {
    const currentLang = this.translationService.currentLang();
    this.seoService.updateSEO({
      title: 'Frequently Asked Questions - Hopladay',
      description: 'Frequently asked questions about Hopladay vacation planner. Learn how to maximize vacation days, combine public holidays with weekends, and use Hopladay for Norwegian and European holidays.',
      url: `https://hopladay.com/${currentLang}/faq`
    }, currentLang);
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

