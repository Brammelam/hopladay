import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../services/api';
import { TranslationService } from '../services/translation.service';

@Component({
  selector: 'app-unsubscribe',
  standalone: true,
  templateUrl: './unsubscribe.html',
  imports: [CommonModule]
})
export class UnsubscribeComponent implements OnInit {
  email: string = '';
  token: string = '';
  loading: boolean = true;
  success: boolean = false;
  error: string = '';
  message: string = '';
  private translationService = inject(TranslationService);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';
      this.token = params['token'] || '';
      
      if (this.email && this.token) {
        this.verifyUnsubscribe();
      } else {
        this.error = 'Invalid unsubscribe link. Please contact hello@hopladay.com if you need help.';
        this.loading = false;
      }
    });
  }

  verifyUnsubscribe() {
    this.api.checkUnsubscribe(this.email, this.token).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.message = response.message || 'You can unsubscribe from emails below.';
        } else {
          this.error = response.message || 'Invalid unsubscribe link.';
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'An error occurred. Please contact hello@hopladay.com for assistance.';
      }
    });
  }

  confirmUnsubscribe() {
    this.loading = true;
    this.api.unsubscribe(this.email, this.token).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.success = true;
          this.message = response.message || 'You have been successfully unsubscribed from Hopladay emails.';
        } else {
          this.error = response.message || 'Failed to unsubscribe. Please contact hello@hopladay.com.';
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'An error occurred. Please contact hello@hopladay.com for assistance.';
      }
    });
  }

  goToDashboard() {
    const currentLang = this.translationService.currentLang();
    this.router.navigate([`/${currentLang}`]);
  }
}

