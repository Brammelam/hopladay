import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HolidaySummaryComponent } from './holiday-summary';

describe('HolidaySummaryComponent', () => {
  let component: HolidaySummaryComponent;
  let fixture: ComponentFixture<HolidaySummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      imports: [HolidaySummaryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HolidaySummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
