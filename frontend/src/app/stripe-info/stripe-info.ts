import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { SEOService } from '../services/seo.service';

@Component({
  selector: 'app-stripe-info',
  standalone: true,
  templateUrl: './stripe-info.html',
  imports: [CommonModule, RouterModule]
})
export class StripeInfoComponent implements OnInit {
  constructor(
    private router: Router,
    private seoService: SEOService
  ) {}

  ngOnInit(): void {
    this.seoService.updateSEO({
      title: 'Payment Information - Secure Checkout',
      description: 'Hopladay uses Stripe for secure payment processing. Your payment information is encrypted and secure.',
      url: 'https://hopladay.com/payment/info'
    });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}

