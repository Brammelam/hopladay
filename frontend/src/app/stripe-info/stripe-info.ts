import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-stripe-info',
  standalone: true,
  templateUrl: './stripe-info.html',
  imports: [CommonModule, RouterModule]
})
export class StripeInfoComponent {
  constructor(private router: Router) {}

  goBack(): void {
    this.router.navigate(['/']);
  }
}

