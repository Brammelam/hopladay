import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HolidayInputComponent } from './holiday-input';

describe('HolidayInputComponent', () => {
  let component: HolidayInputComponent;
  let fixture: ComponentFixture<HolidayInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      imports: [HolidayInputComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HolidayInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
