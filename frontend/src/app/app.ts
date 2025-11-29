import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet, Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { ToastComponent } from './shared/toast';
import { TranslationService } from './services/translation.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private translationService = inject(TranslationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  ngOnInit(): void {
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
    
    // Also check initial route
    const url = this.router.url;
    const langMatch = url.match(/^\/(en|no|nl)(\/|$)/);
    if (langMatch) {
      const lang = langMatch[1] as 'en' | 'no' | 'nl';
      this.translationService.setLanguage(lang);
    }
  }
}
