import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ToastMessage {
  text: string;
  type: 'success' | 'error' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toast$ = new BehaviorSubject<ToastMessage | null>(null);
  toast$ = this._toast$.asObservable();

  show(text: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000): void {
    this._toast$.next({ text, type });
    setTimeout(() => this.clear(), duration);
  }

  clear(): void {
    this._toast$.next(null);
  }
}
