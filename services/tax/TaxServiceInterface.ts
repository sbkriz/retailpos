import { ECommercePlatform } from '../../utils/platforms';
import { ResolvedTaxDetail, TaxStrategyConfig } from './types';

/**
 * Tax Service Interface
 *
 * Platform-specific tax strategies implement this interface.
 */
export interface TaxServiceInterface {
  /** Platform identifier */
  readonly platform: ECommercePlatform;

  /**
   * Configure the strategy with platform credentials
   */
  configure(config: TaxStrategyConfig): void;

  /**
   * Resolve tax detail for a given tax code
   *
   * @param taxCode - Platform-specific tax code (optional)
   * @returns Resolved tax detail with rate and type
   */
  resolveTax(taxCode?: string): Promise<ResolvedTaxDetail>;

  /**
   * Get the default tax calculation type for this platform
   */
  getDefaultType(): 'inclusive' | 'exclusive';
}
