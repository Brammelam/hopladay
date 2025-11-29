import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { TranslationService, Language } from '../services/translation.service';
import { LucideAngularModule, Globe } from 'lucide-angular';
import { ClickOutsideDirective } from './click-outside.directive';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule, ClickOutsideDirective],
  template: `
    <div class="relative">
      <button
        type="button"
        (click)="showDropdown = !showDropdown"
        [attr.aria-expanded]="showDropdown"
        [attr.aria-haspopup]="true"
        [attr.aria-label]="'Select language'"
        class="min-h-[44px] px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 transition-colors flex items-center gap-2"
      >
        <lucide-angular name="globe" class="w-5 h-5" aria-hidden="true"></lucide-angular>
        <span class="hidden sm:inline">{{ currentLang().toUpperCase() }}</span>
      </button>

      <div
        *ngIf="showDropdown"
        class="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
        role="menu"
        [attr.aria-label]="'Language selection menu'"
        (clickOutside)="showDropdown = false"
      >
        <button
          *ngFor="let lang of languages"
          type="button"
          (click)="switchLanguage(lang)"
          [attr.aria-label]="'Switch to ' + langNames[lang]"
          [class.bg-blue-50]="currentLang() === lang"
          [class.text-blue-700]="currentLang() === lang"
          [class.font-semibold]="currentLang() === lang"
          class="w-full min-h-[44px] px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors flex items-center justify-between"
          role="menuitem"
        >
          <span>{{ langNames[lang] }}</span>
          <span *ngIf="currentLang() === lang" class="text-blue-600" aria-hidden="true">✓</span>
        </button>
      </div>
    </div>
  `
})
export class LanguageSwitcherComponent {
  private translationService = inject(TranslationService);
  private router = inject(Router);
  
  showDropdown = false;
  currentLang = this.translationService.currentLang;
  
  languages: Language[] = ['en', 'no', 'nl'];
  langNames: Record<Language, string> = {
    en: 'English',
    no: 'Norsk',
    nl: 'Nederlands'
  };

  constructor() {
    // currentLang is already a signal, no need to track it separately
  }

  switchLanguage(lang: Language): void {
    const currentPath = this.router.url;
    const pathWithoutLang = currentPath.replace(/^\/(en|no|nl)(\/|$)/, '/') || '/';
    const newPath = `/${lang}${pathWithoutLang === '/' ? '' : pathWithoutLang}`;
    
    this.translationService.setLanguage(lang);
    this.router.navigateByUrl(newPath);
    this.showDropdown = false;
  }
}

