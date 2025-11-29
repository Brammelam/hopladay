import {
  ApplicationConfig,
  APP_INITIALIZER,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  importProvidersFrom
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { translationInitializer } from './services/translation-initializer';
import {
  LucideAngularModule,
  Check,
  Folder,
  ChevronRight,
  ChevronDown,
  Globe,
  Calendar,
  Zap,
  Pencil,
  Download,
  FileText,
  Info,
  Clipboard,
  X,
  Loader,
  AlertTriangle,
  Sparkles
} from 'lucide-angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideAnimations(), //  enable animations for standalone apps
    {
      provide: APP_INITIALIZER,
      useFactory: translationInitializer,
      multi: true
    },
    importProvidersFrom(
      LucideAngularModule.pick({
        Check,
        Folder,
        ChevronRight,
        ChevronDown,
        Globe,
        Calendar,
        Zap,
        Pencil,
        Download,
        FileText,
        Info,
        Clipboard,
        X,
        Loader,
        AlertTriangle,
        Sparkles
      })
    )
  ]
};
