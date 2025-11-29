import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet, Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { filter, firstValueFrom } from 'rxjs';
import { ToastComponent } from './shared/toast';
import { TranslationService } from './services/translation.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private http = inject(HttpClient);
  private translationService = inject(TranslationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  async ngOnInit(): Promise<void> {
    await this.loadTranslations();
    
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        const url = this.router.url;
        const langMatch = url.match(/^\/(en|no|nl)(\/|$)/);
        if (langMatch) {
          const lang = langMatch[1] as 'en' | 'no' | 'nl';
          this.translationService.setLanguage(lang);
        }
      });
  }

  private async loadTranslations(): Promise<void> {
    try {
      const [enTranslations, noTranslations, nlTranslations] = await Promise.all([
        firstValueFrom(this.http.get<any>('/assets/i18n/en.json')),
        firstValueFrom(this.http.get<any>('/assets/i18n/no.json')),
        firstValueFrom(this.http.get<any>('/assets/i18n/nl.json'))
      ]);

      this.translationService.loadTranslations('en', enTranslations);
      this.translationService.loadTranslations('no', noTranslations);
      this.translationService.loadTranslations('nl', nlTranslations);
    } catch (error) {
      console.error('Failed to load translations:', error);
    }
  }
}
