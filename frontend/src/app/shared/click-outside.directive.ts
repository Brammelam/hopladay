import { Directive, ElementRef, EventEmitter, OnDestroy, Output, inject } from '@angular/core';

@Directive({
  selector: '[clickOutside]',
  standalone: true
})
export class ClickOutsideDirective implements OnDestroy {
  @Output() clickOutside = new EventEmitter<void>();
  private elementRef = inject(ElementRef);

  constructor() {
    document.addEventListener('click', this.handleClick.bind(this));
  }

  private handleClick(event: MouseEvent): void {
    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside) {
      this.clickOutside.emit();
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.handleClick.bind(this));
  }
}

