import { getCurrencyInfo } from './currency';

/** Convert dollars to integer cents, rounding to the nearest cent. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Convert integer cents back to a dollar amount (2 decimal places). */
export function toDollars(cents: number): number {
  return Math.round(cents) / 100;
}

/** Round a dollar amount to 2 decimal places. */
export function roundMoney(amount: number): number {
  return toDollars(toCents(amount));
}

/** Multiply a dollar price by an integer quantity, returning dollars. */
export function multiplyMoney(price: number, quantity: number): number {
  return toDollars(toCents(price) * quantity);
}

/** Add two dollar amounts, returning dollars. */
export function addMoney(a: number, b: number): number {
  return toDollars(toCents(a) + toCents(b));
}

/** Subtract b from a in dollars, returning dollars. */
export function subtractMoney(a: number, b: number): number {
  return toDollars(toCents(a) - toCents(b));
}

/** Sum an array of dollar amounts, returning dollars. */
export function sumMoney(amounts: number[]): number {
  const totalCents = amounts.reduce((sum, amt) => sum + toCents(amt), 0);
  return toDollars(totalCents);
}

/**
 * Format a dollar amount for display (e.g. "$19.99" or "19.99₽").
 * Always shows exactly 2 decimal places.
 * Symbol placement depends on the currency (before or after).
 */
export function formatMoney(amount: number, currencyCode: string = 'GBP'): string {
  const currencyInfo = getCurrencyInfo(currencyCode);
  const symbol = currencyInfo?.symbol || currencyCode;
  const placement = currencyInfo?.symbolPlacement || 'before';
  const formattedAmount = roundMoney(amount).toFixed(2);

  if (placement === 'after') {
    return `${formattedAmount}${symbol}`;
  }
  return `${symbol}${formattedAmount}`;
}
