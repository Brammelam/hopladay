import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HolidaySummary } from './holiday-summary';

describe('HolidaySummary', () => {
  let component: HolidaySummary;
  let fixture: ComponentFixture<HolidaySummary>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HolidaySummary]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HolidaySummary);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
