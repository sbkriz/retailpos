/**
 * useResponsive — pure function tests
 *
 * getProductColumns() and getSidebarWidths() are exported pure functions
 * with no React or RN dependencies — tested directly.
 */

import { getProductColumns, getSidebarWidths, breakpoints } from './responsive.utils';

// ── getProductColumns ─────────────────────────────────────────────────────

describe('getProductColumns', () => {
  it('returns 2 columns on mobile (< 768)', () => {
    expect(getProductColumns(320)).toBe(2);
    expect(getProductColumns(767)).toBe(2);
  });

  it('returns 3 columns on tablet (768–1023)', () => {
    expect(getProductColumns(768)).toBe(3);
    expect(getProductColumns(1023)).toBe(3);
  });

  it('returns 4 columns on desktop (1024–1439)', () => {
    expect(getProductColumns(1024)).toBe(4);
    expect(getProductColumns(1439)).toBe(4);
  });

  it('returns 5 columns on wide screens (>= 1440)', () => {
    expect(getProductColumns(1440)).toBe(5);
    expect(getProductColumns(2560)).toBe(5);
  });

  it('returns 2 columns at width 0', () => {
    expect(getProductColumns(0)).toBe(2);
  });

  it('returns correct columns at exact breakpoint boundaries', () => {
    expect(getProductColumns(breakpoints.tablet)).toBe(3);
    expect(getProductColumns(breakpoints.desktop)).toBe(4);
    expect(getProductColumns(breakpoints.wide)).toBe(5);
  });
});

// ── getSidebarWidths ──────────────────────────────────────────────────────

describe('getSidebarWidths', () => {
  it('returns zero widths on mobile', () => {
    const { category, basket } = getSidebarWidths(320);
    expect(category).toBe(0);
    expect(basket).toBe(0);
  });

  it('returns zero widths just below tablet breakpoint', () => {
    const { category, basket } = getSidebarWidths(767);
    expect(category).toBe(0);
    expect(basket).toBe(0);
  });

  it('returns tablet widths at the tablet breakpoint', () => {
    const { category, basket } = getSidebarWidths(768);
    expect(category).toBeGreaterThan(0);
    expect(basket).toBeGreaterThan(0);
  });

  it('returns larger widths on desktop than on tablet', () => {
    const tablet = getSidebarWidths(800);
    const desktop = getSidebarWidths(1200);
    expect(desktop.category).toBeGreaterThan(tablet.category);
    expect(desktop.basket).toBeGreaterThan(tablet.basket);
  });

  it('returns the largest widths on wide screens', () => {
    const desktop = getSidebarWidths(1200);
    const wide = getSidebarWidths(1440);
    expect(wide.category).toBeGreaterThan(desktop.category);
    expect(wide.basket).toBeGreaterThan(desktop.basket);
  });

  it('category width is always less than basket width', () => {
    [320, 768, 1024, 1440].forEach(w => {
      const { category, basket } = getSidebarWidths(w);
      if (category > 0) {
        expect(basket).toBeGreaterThan(category);
      }
    });
  });
});
