/**
 * Pure responsive layout utilities extracted from useResponsive.
 * No React, no RN — fully testable in node.
 */

export const breakpoints = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

/**
 * Returns the number of product grid columns for the given window width.
 */
export function getProductColumns(width: number): number {
  if (width >= breakpoints.wide) return 5;
  if (width >= breakpoints.desktop) return 4;
  if (width >= breakpoints.tablet) return 3;
  return 2;
}

/**
 * Returns responsive sidebar widths for the given window width.
 */
export function getSidebarWidths(width: number): { category: number; basket: number } {
  if (width >= breakpoints.wide) {
    return { category: 300, basket: 380 };
  }
  if (width >= breakpoints.desktop) {
    return { category: 260, basket: 340 };
  }
  if (width >= breakpoints.tablet) {
    return { category: 230, basket: 300 };
  }
  return { category: 0, basket: 0 };
}
