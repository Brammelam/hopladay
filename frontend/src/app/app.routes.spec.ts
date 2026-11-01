import { provideZonelessChangeDetection } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { routes } from './app.routes';

describe('Country guide static-host fallback', () => {
  it('opens the generated Norway document instead of the homepage', () => {
    const replace = jasmine.createSpy('replace');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: DOCUMENT, useValue: { location: { replace, search: '?from=guide', hash: '#holidays' } } }] });
    const guide = routes.find(route => route.path === 'en/norway/2027');
    expect(guide).toBeDefined();
    if (!guide?.canActivate?.[0] || typeof guide.canActivate[0] !== 'function') return;
    const guard = guide.canActivate[0];
    TestBed.runInInjectionContext(() => (guard as () => unknown)());
    expect(replace).toHaveBeenCalledWith('/en/norway/2027/index.html?from=guide#holidays');
  });
  it('does not turn arbitrary country-like URLs into document redirects', () => {
    expect(routes.some(route => route.path === 'en/unknown/2027')).toBeFalse();
  });
});
