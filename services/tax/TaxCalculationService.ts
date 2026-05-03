import { ECommercePlatform } from '../../utils/platforms';
import { TaxServiceFactory } from './TaxServiceFactory';
import { taxProfileService } from './TaxProfileService';
import { TaxCalculationRequest, TaxCalculationResponse, ResolvedTaxDetail } from './types';
import { roundMoney, multiplyMoney } from '../../utils/money';
import { LoggerFactory } from '../logger/LoggerFactory';

const logger = LoggerFactory.getInstance().createLogger('TaxCalculationService');

/**
 * Tax Calculation Service
 *
 * Calculates tax for basket items using platform-specific strategies.
 * Spec: docs/specs/catalog/products.md section 9.3
 */
export class TaxCalculationService {
  /**
   * Calculate tax for a line item
   * Spec requirements 9.3.1 - 9.3.7
   *
   * @param request - Tax calculation request
   * @param platform - E-commerce platform
   * @returns Tax calculation response with breakdown
   */
  async calculate(request: TaxCalculationRequest, platform: ECommercePlatform): Promise<TaxCalculationResponse> {
    const { price, quantity, taxCode, profileId } = request;

    // Resolve tax detail
    let detail: ResolvedTaxDetail;

    if (profileId) {
      // Spec requirement 9.3.2: Use profileId directly
      const profile = await taxProfileService.getProfileById(profileId);

      if (!profile) {
        logger.warn({ message: 'Tax profile not found, falling back to tax code resolution', profileId });
        // Fallback to tax code resolution
        const strategy = TaxServiceFactory.getInstance().getService(platform);
        detail = await strategy.resolveTax(taxCode);
      } else {
        const strategy = TaxServiceFactory.getInstance().getService(platform);
        detail = {
          rate: profile.rate,
          type: strategy.getDefaultType(),
          profileId: profile.id,
          name: profile.name,
          region: profile.region ?? undefined,
        };
      }
    } else if (taxCode) {
      // Spec requirement 9.3.1: Use taxCode
      const strategy = TaxServiceFactory.getInstance().getService(platform);
      detail = await strategy.resolveTax(taxCode);
    } else {
      // Spec requirement 9.3.3: No taxCode or profileId, use platform default
      const strategy = TaxServiceFactory.getInstance().getService(platform);
      detail = await strategy.resolveTax(undefined);
    }

    // Spec requirement 9.3.8: Handle zero price
    if (price === 0) {
      return {
        unitSubtotal: 0,
        unitTax: 0,
        unitTotal: 0,
        lineSubtotal: 0,
        lineTax: 0,
        lineTotal: 0,
        detail,
      };
    }

    // Calculate based on tax type
    let unitSubtotal: number;
    let unitTax: number;
    let unitTotal: number;

    if (detail.type === 'inclusive') {
      // Spec requirement 9.3.4: Inclusive tax
      unitSubtotal = roundMoney(price / (1 + detail.rate));
      unitTax = roundMoney(price - unitSubtotal);
      unitTotal = price;
    } else if (detail.type === 'exclusive') {
      // Spec requirement 9.3.5: Exclusive tax
      unitSubtotal = price;
      unitTax = roundMoney(multiplyMoney(price, detail.rate));
      unitTotal = roundMoney(price + unitTax);
    } else {
      // Spec requirement 9.3.6: Exempt
      unitSubtotal = price;
      unitTax = 0;
      unitTotal = price;
    }

    // Calculate line totals
    const lineSubtotal = roundMoney(multiplyMoney(unitSubtotal, quantity));
    const lineTax = roundMoney(multiplyMoney(unitTax, quantity));
    const lineTotal = roundMoney(multiplyMoney(unitTotal, quantity));

    // Spec requirement 9.3.7: All values rounded to 2 decimal places (handled by roundMoney)
    return {
      unitSubtotal,
      unitTax,
      unitTotal,
      lineSubtotal,
      lineTax,
      lineTotal,
      detail,
    };
  }

  /**
   * Resolve tax detail without calculating prices
   * Spec requirement 9.3.8: For display-only contexts
   *
   * @param request - Partial tax calculation request (only taxCode or profileId needed)
   * @param platform - E-commerce platform
   * @returns Resolved tax detail
   */
  async resolveDetail(
    request: Pick<TaxCalculationRequest, 'taxCode' | 'profileId'>,
    platform: ECommercePlatform
  ): Promise<ResolvedTaxDetail> {
    const { taxCode, profileId } = request;

    if (profileId) {
      const profile = await taxProfileService.getProfileById(profileId);

      if (!profile) {
        logger.warn({ message: 'Tax profile not found for detail resolution', profileId });
        const strategy = TaxServiceFactory.getInstance().getService(platform);
        return strategy.resolveTax(taxCode);
      }

      const strategy = TaxServiceFactory.getInstance().getService(platform);
      return {
        rate: profile.rate,
        type: strategy.getDefaultType(),
        profileId: profile.id,
        name: profile.name,
        region: profile.region ?? undefined,
      };
    }

    const strategy = TaxServiceFactory.getInstance().getService(platform);
    return strategy.resolveTax(taxCode);
  }
}

// Singleton instance
export const taxCalculationService = new TaxCalculationService();
