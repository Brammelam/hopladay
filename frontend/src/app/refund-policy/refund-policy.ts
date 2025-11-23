import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-refund-policy',
  standalone: true,
  templateUrl: './refund-policy.html',
  imports: [CommonModule, RouterModule]
})
export class RefundPolicyComponent {
  lastUpdated: string;

  constructor(private router: Router) {
    this.lastUpdated = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}

