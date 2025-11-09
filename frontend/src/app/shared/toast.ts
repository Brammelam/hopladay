import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { trigger, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="toast"
      [@fadeInOut]
      class="fixed bottom-6 right-6 z-[1000] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white cursor-pointer select-none"
      [ngClass]="{
        'bg-green-600': toast.type === 'success',
        'bg-red-600': toast.type === 'error',
        'bg-blue-600': toast.type === 'info'
      }"
      (click)="dismiss()"
    >
      <!-- Icon -->
      <svg *ngIf="toast?.type === 'success'" class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <svg *ngIf="toast?.type === 'error'" class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      <svg *ngIf="toast?.type === 'info'" class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 110-16 8 8 0 010 16z" />
      </svg>

      <!-- Message -->
      <span class="text-sm font-medium">{{ toast.text }}</span>

      <!-- Close button -->
      <button
        class="ml-3 text-white/70 hover:text-white focus:outline-none"
        (click)="dismiss($event)"
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  `,
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(20px)' })),
      ]),
    ]),
  ],
})
export class ToastComponent implements OnInit, OnDestroy {
  toast: { text: string; type: 'success' | 'error' | 'info' } | null = null;
  private sub?: Subscription;

  constructor(private toastService: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.sub = this.toastService.toast$.subscribe((msg) => {
      this.toast = msg;
      this.cdr.detectChanges();
    });
  }

  dismiss(event?: MouseEvent): void {
    if (event) event.stopPropagation(); // prevent click bubbling
    this.toastService.clear();
    this.toast = null;
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
