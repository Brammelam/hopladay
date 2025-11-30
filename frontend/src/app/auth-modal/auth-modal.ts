import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../shared/translate.pipe';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <div
      *ngIf="show"
      class="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 p-4"
      (click)="close.emit()"
    >
      <div
        class="bg-white rounded-lg shadow-lg max-w-md w-full border border-gray-200"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ mode === 'signin' ? ('auth.signIn' | translate) : ('auth.saveYourPlan' | translate) }}
          </h2>
          <button
            type="button"
            (click)="close.emit()"
            class="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 rounded p-1 transition-colors"
            [attr.aria-label]="'common.close' | translate"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div class="p-6">
          <!-- Tabs -->
          <div class="flex gap-2 p-1 bg-gray-100 rounded-md mb-6">
            <button
              type="button"
              (click)="switchMethod.emit('passkey')"
              [class.bg-white]="method === 'passkey'"
              [class.text-gray-900]="method === 'passkey'"
              [class.text-gray-600]="method !== 'passkey'"
              [class.shadow-sm]="method === 'passkey'"
              class="flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
            >
              {{ 'auth.passkey' | translate }}
            </button>
            <button
              type="button"
              (click)="switchMethod.emit('email')"
              [class.bg-white]="method === 'email'"
              [class.text-gray-900]="method === 'email'"
              [class.text-gray-600]="method !== 'email'"
              [class.shadow-sm]="method === 'email'"
              class="flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
            >
              {{ 'auth.emailLink' | translate }}
            </button>
          </div>

          <!-- Method Info -->
          <div class="mb-6">
            <ng-container *ngIf="method === 'passkey'">
              <div
                class="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-md mb-4"
              >
                <svg
                  class="w-5 h-5 text-gray-700 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <div class="flex-1">
                  <h3 class="text-sm font-semibold text-gray-900 mb-1">{{ 'auth.fastSecure' | translate }}</h3>
                  <p class="text-sm text-gray-600 leading-relaxed">
                    {{ 'auth.passkeyDescription' | translate }}
                  </p>
                </div>
              </div>
            </ng-container>

            <ng-container *ngIf="method === 'email' && !magicLinkSent">
              <div
                class="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-md mb-4"
              >
                <svg
                  class="w-5 h-5 text-gray-700 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <div class="flex-1">
                  <h3 class="text-sm font-semibold text-gray-900 mb-1">{{ 'auth.accessAnyDevice' | translate }}</h3>
                  <p class="text-sm text-gray-600 leading-relaxed">
                    {{ 'auth.emailLinkDescription' | translate }}
                  </p>
                </div>
              </div>
            </ng-container>

            <ng-container *ngIf="magicLinkSent">
              <div class="p-4 bg-white border border-gray-200 rounded-md">
                <div class="flex items-start gap-3">
                  <svg
                    class="w-5 h-5 text-gray-700 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <div class="flex-1">
                    <h3 class="text-sm font-semibold text-gray-900 mb-1">{{ 'auth.checkYourEmail' | translate }}</h3>
                    <p class="text-sm text-gray-600 leading-relaxed">
                      {{ 'auth.magicLinkSentDesc' | translate }} <strong class="font-medium">{{ email }}</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </ng-container>

            <!-- Email Field -->
            <label class="block text-sm font-medium text-gray-900 mb-2 mt-4">{{ 'auth.email' | translate }}</label>
            <input
              type="email"
              [(ngModel)]="email"
              (ngModelChange)="emailChange.emit($event)"
              [attr.placeholder]="'auth.emailPlaceholder' | translate"
              [disabled]="magicLinkSent"
              class="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 disabled:bg-gray-50 disabled:cursor-not-allowed transition-colors"
              (keyup.enter)="submit.emit()"
              autofocus
            />
          </div>

          <!-- Submit -->
          <button
            *ngIf="!magicLinkSent"
            type="button"
            (click)="submit.emit()"
            [disabled]="!email || isLoading"
            class="w-full py-2.5 text-sm bg-gray-900 text-white font-medium rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span *ngIf="!isLoading">
              {{
                method === 'passkey'
                  ? mode === 'signin'
                    ? ('auth.signInWithPasskey' | translate)
                    : ('auth.createPasskey' | translate)
                  : ('auth.sendMagicLink' | translate)
              }}
            </span>
            <span *ngIf="isLoading" class="flex items-center justify-center gap-2">
              <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              {{ 'auth.processing' | translate }}
            </span>
          </button>

          <!-- Reset -->
          <button
            *ngIf="magicLinkSent"
            type="button"
            (click)="reset.emit()"
            class="w-full py-2.5 text-sm text-gray-700 bg-white border border-gray-300 font-medium rounded-md hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 transition-colors mt-3"
          >
            {{ 'auth.sendToDifferentEmail' | translate }}
          </button>

          <!-- Switch -->
          <div *ngIf="method === 'passkey' && !magicLinkSent" class="mt-4 text-center">
            <button
              type="button"
              (click)="switchMode.emit()"
              class="text-sm text-gray-600 hover:text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 rounded transition-colors"
            >
              {{
                mode === 'signin'
                  ? ('auth.noAccountSavePlan' | translate)
                  : ('auth.haveAccountSignIn' | translate)
              }}
            </button>
          </div>

          <!-- Footer -->
          <div class="mt-6 pt-4 border-t border-gray-200">
            <p class="text-xs text-gray-500 text-center leading-relaxed">
              {{
                method === 'passkey'
                  ? ('auth.passkeyFooter' | translate)
                  : ('auth.magicLinkFooter' | translate)
              }}
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AuthModalComponent {
  @Input() show = false;
  @Input() mode: 'signin' | 'register' = 'signin';
  @Input() method: 'passkey' | 'email' = 'passkey';
  @Input() email = '';
  @Input() isLoading = false;
  @Input() magicLinkSent = false;
  @Input() magicLinkUrl = '';

  @Output() submit = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  @Output() switchMode = new EventEmitter<void>();
  @Output() switchMethod = new EventEmitter<'passkey' | 'email'>();
  @Output() reset = new EventEmitter<void>();
  @Output() emailChange = new EventEmitter<string>();
}
