import { ECommercePlatform } from '../../utils/platforms';
import { TaxServiceInterface } from './TaxServiceInterface';
import { ResolvedTaxDetail, TaxStrategyConfig, NormalisedTaxCode } from './types';
import { taxProfileService } from './TaxProfileService';
import { LoggerFactory } from '../logger/LoggerFactory';

const logger = LoggerFactory.getInstance().createLogger('BaseTaxStrategy');

/**
 * Base Tax Strategy
 *
 * Implements the rate resolution pipeline (spec section 9.4):
 * 1. Normalise tax code
 * 2. Exempt fast-path
 * 3. Live platform rate (if implemented)
 * 4. Local profile fallback
 * 5. Default profile
 */
export abstract class BaseTaxStrategy implements TaxServiceInterface {
  protected config: TaxStrategyConfig = {};

  constructor(public readonly platform: ECommercePlatform) {}

  configure(config: TaxStrategyConfig): void {
    this.config = config;
  }

  /**
   * Get the default tax calculation type for this platform
   * Override in subclasses if needed
   */
  getDefaultType(): 'inclusive' | 'exclusive' {
    return 'exclusive'; // Most platforms use exclusive by default
  }

  /**
   * Normalise platform-specific tax code to canonical form
   * Override in subclasses for platform-specific mapping
   *
   * @param taxCode - Platform-specific tax code
   * @returns Normalised tax code or null if unrecognised
   */
  protected normaliseTaxCode(taxCode?: string): NormalisedTaxCode | null {
    if (!taxCode) return null;

    const code = taxCode.toLowerCase().trim();

    // Common mappings
    if (code === 'standard' || code === 'standard-rate' || code === 'standard_rate') {
      return { canonical: 'standard', type: 'exclusive', label: 'Standard Rate' };
    }
    if (code === 'reduced' || code === 'reduced-rate' || code === 'reduced_rate') {
      return { canonical: 'reduced', type: 'exclusive', label: 'Reduced Rate' };
    }
    if (code === 'zero' || code === 'zero-rate' || code === 'zero_rate') {
      return { canonical: 'zero', type: 'exempt', label: 'Zero Rate' };
    }
    if (code === 'exempt' || code === 'none' || code === 'tax-exempt') {
      return { canonical: 'exempt', type: 'exempt', label: 'Exempt' };
    }

    return null;
  }

  /**
   * Fetch live tax rate from platform API
   * Override in subclasses that support live rate fetching
   *
   * @param _taxCode - Platform-specific tax code
   * @returns Tax rate (0-1) or null if not available
   */
  protected async fetchPlatformRate(_taxCode: string): Promise<number | null> {
    // Default: no live rate fetching
    return null;
  }

  /**
   * Resolve default tax detail for this platform
   */
  protected async resolveDefault(): Promise<ResolvedTaxDetail> {
    const defaultProfile = await taxProfileService.getDefaultProfile();

    if (defaultProfile) {
      return {
        rate: defaultProfile.rate,
        type: this.getDefaultType(),
        profileId: defaultProfile.id,
        name: defaultProfile.name,
        region: defaultProfile.region ?? undefined,
      };
    }

    // Emergency fallback: 0% tax
    logger.warn({ message: 'No default tax profile found, using 0% fallback', platform: this.platform });
    return {
      rate: 0,
      type: 'exempt',
      name: 'No Tax Configuration',
    };
  }

  /**
   * Resolve tax detail for a given tax code
   * Implements the rate resolution pipeline (spec section 9.4)
   */
  async resolveTax(taxCode?: string): Promise<ResolvedTaxDetail> {
    // Step 1: Normalise tax code
    const normalised = this.normaliseTaxCode(taxCode);

    // Step 2: Exempt fast-path
    if (normalised?.type === 'exempt') {
      logger.debug({ message: 'Tax code is exempt', taxCode, platform: this.platform });
      return {
        rate: 0,
        type: 'exempt',
        name: normalised.label,
      };
    }

    // Step 3: Try to fetch live platform rate
    if (taxCode && normalised) {
      try {
        const platformRate = await this.fetchPlatformRate(taxCode);

        if (platformRate !== null) {
          logger.debug({ message: 'Using live platform rate', taxCode, rate: platformRate, platform: this.platform });

          // Still match local profile for profileId reference, but use platform rate
          const profile = await taxProfileService.resolveRateForTaxCode(normalised.canonical);

          return {
            rate: platformRate,
            type: normalised.type,
            profileId: profile?.id,
            name: profile?.name ?? normalised.label,
            region: profile?.region ?? undefined,
          };
        }
      } catch (error) {
        logger.warn({ message: 'Failed to fetch platform rate, falling back to local profile', taxCode, error: (error as Error).message });
      }
    }

    // Step 4: Local profile fallback
    if (normalised) {
      const profile = await taxProfileService.resolveRateForTaxCode(normalised.canonical);

      if (profile) {
        logger.debug({ message: 'Using local profile rate', taxCode, profileId: profile.id, rate: profile.rate, platform: this.platform });
        return {
          rate: profile.rate,
          type: normalised.type,
          profileId: profile.id,
          name: profile.name,
          region: profile.region ?? undefined,
        };
      }
    }

    // Step 5: Default profile
    logger.debug({ message: 'Using default profile', taxCode, platform: this.platform });
    return this.resolveDefault();
  }
}
