import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HolidayInput } from './holiday-input';

describe('HolidayInput', () => {
  let component: HolidayInput;
  let fixture: ComponentFixture<HolidayInput>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HolidayInput]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HolidayInput);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
