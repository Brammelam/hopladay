import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { SEOService } from '../services/seo.service';

@Component({
  selector: 'app-refund-policy',
  standalone: true,
  templateUrl: './refund-policy.html',
  imports: [CommonModule, RouterModule]
})
export class RefundPolicyComponent implements OnInit {
  lastUpdated: string;

  constructor(
    private router: Router,
    private seoService: SEOService
  ) {
    this.lastUpdated = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  ngOnInit(): void {
    this.seoService.updateSEO({
      title: 'Refund Policy - Hopladay Premium',
      description: 'Read Hopladay\'s refund policy for Premium subscriptions. Learn about our cancellation and refund terms.',
      url: 'https://hopladay.com/refunds'
    });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}

