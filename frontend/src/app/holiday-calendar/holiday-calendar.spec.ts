import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HolidayCalendar } from './holiday-calendar';

describe('HolidayCalendar', () => {
  let component: HolidayCalendar;
  let fixture: ComponentFixture<HolidayCalendar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HolidayCalendar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HolidayCalendar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
