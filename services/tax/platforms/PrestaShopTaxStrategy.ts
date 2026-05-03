import { ECommercePlatform } from '../../../utils/platforms';
import { BaseTaxStrategy } from '../BaseTaxStrategy';
import { ResolvedTaxDetail } from '../types';
import { LoggerFactory } from '../../logger/LoggerFactory';

const logger = LoggerFactory.getInstance().createLogger('PrestaShopTaxStrategy');

/**
 * PrestaShop Tax Strategy
 *
 * Zero-rate platform (temporary) - PrestaShop WebService returns complex nested rules.
 * Not practical for per-product resolution.
 * Spec: section 9.5, 9.6 - Returns zero for all tax codes
 */
export class PrestaShopTaxStrategy extends BaseTaxStrategy {
  constructor() {
    super(ECommercePlatform.PRESTASHOP);
  }

  /**
   * Override resolveTax to return zero rate
   * Spec requirement 9.6.1: Zero-rate platform returns 0% regardless of tax code
   *
   * TODO: Replace with proper PrestaShop tax resolution strategy once available
   */
  async resolveTax(taxCode?: string): Promise<ResolvedTaxDetail> {
    const normalised = this.normaliseTaxCode(taxCode);

    if (normalised?.type === 'exempt') {
      logger.debug({ message: 'PrestaShop product is exempt', taxCode });
      return {
        rate: 0,
        type: 'exempt',
        name: 'Exempt',
      };
    }

    // Spec requirement 9.6.3: Return "Tax Not Available" for taxable products
    logger.debug({ message: 'PrestaShop tax rate not available, returning zero', taxCode });
    return {
      rate: 0,
      type: 'exempt',
      name: 'Tax Not Available',
    };
  }
}
