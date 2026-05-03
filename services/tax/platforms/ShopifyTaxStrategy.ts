import { ECommercePlatform } from '../../../utils/platforms';
import { BaseTaxStrategy } from '../BaseTaxStrategy';
import { ResolvedTaxDetail, NormalisedTaxCode } from '../types';
import { LoggerFactory } from '../../logger/LoggerFactory';

const logger = LoggerFactory.getInstance().createLogger('ShopifyTaxStrategy');

/**
 * Shopify Tax Strategy
 *
 * Zero-rate platform (temporary) - Shopify has no public Tax Rates API.
 * Tax is location-based and calculated server-side only.
 * Spec: section 9.5, 9.6 - Returns zero for all tax codes
 */
export class ShopifyTaxStrategy extends BaseTaxStrategy {
  constructor() {
    super(ECommercePlatform.SHOPIFY);
  }

  protected normaliseTaxCode(taxCode?: string): NormalisedTaxCode | null {
    if (!taxCode) return null;

    const code = taxCode.toLowerCase().trim();

    // Shopify-specific: taxable field maps to 'exempt' when false
    if (code === 'exempt' || code === 'false') {
      return { canonical: 'exempt', type: 'exempt', label: 'Exempt' };
    }

    // Fallback to base normalisation
    return super.normaliseTaxCode(taxCode);
  }

  /**
   * Override resolveTax to return zero rate
   * Spec requirement 9.6.1: Zero-rate platform returns 0% regardless of tax code
   *
   * TODO: Replace with proper Shopify tax resolution strategy once available
   */
  async resolveTax(taxCode?: string): Promise<ResolvedTaxDetail> {
    const normalised = this.normaliseTaxCode(taxCode);

    if (normalised?.type === 'exempt') {
      logger.debug({ message: 'Shopify product is exempt', taxCode });
      return {
        rate: 0,
        type: 'exempt',
        name: 'Exempt',
      };
    }

    // Spec requirement 9.6.3: Return "Tax Not Available" for taxable products
    logger.debug({ message: 'Shopify tax rate not available, returning zero', taxCode });
    return {
      rate: 0,
      type: 'exempt',
      name: 'Tax Not Available',
    };
  }
}
