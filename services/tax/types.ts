/**
 * Tax Service Types
 *
 * Defines the core types for the tax calculation system.
 */

/**
 * Tax calculation type determines how tax is applied
 */
export type TaxCalculationType = 'inclusive' | 'exclusive' | 'exempt';

/**
 * Normalised tax code with canonical form
 */
export interface NormalisedTaxCode {
  /** Canonical form: 'standard', 'reduced', 'zero', 'exempt' */
  canonical: string;
  /** Calculation type */
  type: TaxCalculationType;
  /** Human-readable label */
  label: string;
}

/**
 * Resolved tax detail from a platform strategy
 */
export interface ResolvedTaxDetail {
  /** Tax rate (0-1, e.g. 0.2 for 20%) */
  rate: number;
  /** Calculation type */
  type: TaxCalculationType;
  /** Tax profile ID (if resolved from local profile) */
  profileId?: string;
  /** Tax profile name */
  name: string;
  /** Region/jurisdiction (optional) */
  region?: string;
}

/**
 * Tax calculation request
 */
export interface TaxCalculationRequest {
  /** Unit price (in cents) */
  price: number;
  /** Quantity */
  quantity: number;
  /** Platform tax code (optional) */
  taxCode?: string;
  /** Local tax profile ID (optional) */
  profileId?: string;
}

/**
 * Tax calculation response with breakdown
 */
export interface TaxCalculationResponse {
  /** Unit subtotal (before tax, in cents) */
  unitSubtotal: number;
  /** Unit tax amount (in cents) */
  unitTax: number;
  /** Unit total (after tax, in cents) */
  unitTotal: number;
  /** Line subtotal (unitSubtotal × quantity, in cents) */
  lineSubtotal: number;
  /** Line tax (unitTax × quantity, in cents) */
  lineTax: number;
  /** Line total (unitTotal × quantity, in cents) */
  lineTotal: number;
  /** Resolved tax detail */
  detail: ResolvedTaxDetail;
}

/**
 * Platform configuration for tax strategies
 */
export interface TaxStrategyConfig {
  /** Platform API base URL */
  apiUrl?: string;
  /** Platform API key */
  apiKey?: string;
  /** Platform API secret */
  apiSecret?: string;
  /** Additional platform-specific config */
  [key: string]: unknown;
}
