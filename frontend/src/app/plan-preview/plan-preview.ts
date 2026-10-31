import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, map, merge, of, Subject, switchMap } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, PlanPreview } from '../services/api';
import { SEOService, SITE_LANGS, SiteLang } from '../services/seo.service';

@Component({
  selector: 'app-plan-preview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './plan-preview.html',
})
export class PlanPreviewComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private seo = inject(SEOService);
  private destroyRef = inject(DestroyRef);
  private retry = new Subject<void>();
  readonly result = signal<PlanPreview | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  country = 'NO';
  year = new Date().getFullYear();
  availableDays = 20;
  lang: SiteLang = 'en';

  ngOnInit(): void {
    const segment = this.router.url.split('/')[1];
    this.lang = SITE_LANGS.find(lang => lang === segment) ?? 'en';
    merge(this.route.queryParamMap, this.retry.pipe(map(() => this.route.snapshot.queryParamMap))).pipe(
      switchMap(params => {
        this.result.set(null);
        this.error.set('');
        this.seo.updateSEO({ title: 'Free vacation plan preview – Hopladay', description: 'Preview one-day holiday bridges with your country, year and vacation allowance. No account needed. Advanced strategies and exports require Premium.', url: `https://www.hopladay.com/${this.lang}/preview`, noindex: true }, this.lang);
        if (!params.keys.length) return of(null);
        this.country = params.get('country') ?? 'NO';
        this.year = Number(params.get('year') ?? new Date().getFullYear());
        this.availableDays = Number(params.get('availableDays') ?? 20);
        const query: Record<string, string | string[]> = {};
        for (const key of params.keys) query[key] = params.getAll(key);
        query['lang'] = this.lang;
        this.loading.set(true);
        return this.api.getPlanPreview(query).pipe(
          catchError((err: HttpErrorResponse) => {
            const message = err.error?.error?.message;
            this.error.set(typeof message === 'string' ? message : 'Could not load this preview. Please try again.');
            return of(null);
          }),
          finalize(() => this.loading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => this.result.set(result));
  }

  calculate(): void {
    const queryParams = { country: this.country.trim().toUpperCase(), year: this.year, availableDays: this.availableDays, preference: 'balanced', lang: this.lang };
    const target = this.router.createUrlTree([], { relativeTo: this.route, queryParams });
    // Refresh a failed or expired preview even when the form inputs have not changed.
    if (this.router.serializeUrl(target) === this.router.url) {
      this.retry.next();
    } else {
      this.router.navigateByUrl(target);
    }
  }
}
