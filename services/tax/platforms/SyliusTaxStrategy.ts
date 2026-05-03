import { ECommercePlatform } from '../../../utils/platforms';
import { BaseTaxStrategy } from '../BaseTaxStrategy';
import { LoggerFactory } from '../../logger/LoggerFactory';

const logger = LoggerFactory.getInstance().createLogger('SyliusTaxStrategy');

/**
 * Sylius Tax Strategy
 *
 * Supports live rate fetching via Sylius Shop API.
 * Spec: section 9.5 - Live rate source
 */
export class SyliusTaxStrategy extends BaseTaxStrategy {
  constructor() {
    super(ECommercePlatform.SYLIUS);
  }

  protected async fetchPlatformRate(taxCode: string): Promise<number | null> {
    const { apiUrl, apiKey } = this.config;

    if (!apiUrl || !apiKey) {
      logger.debug({ message: 'Sylius API credentials not configured, skipping live rate fetch' });
      return null;
    }

    try {
      const url = `${apiUrl}/api/v2/shop/tax-rates?taxCategory.code=${encodeURIComponent(taxCode)}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        logger.warn({ message: 'Sylius tax rate fetch failed', status: response.status, taxCode });
        return null;
      }

      const result = (await response.json()) as { 'hydra:member': Array<{ amount: number }> };

      if (!result['hydra:member'] || result['hydra:member'].length === 0) {
        logger.debug({ message: 'No Sylius tax rates found for category code', taxCode });
        return null;
      }

      // Use the first matching rate (Sylius amount is already a decimal, e.g. 0.2 for 20%)
      const rate = result['hydra:member'][0].amount;
      logger.debug({ message: 'Fetched Sylius tax rate', taxCode, rate });
      return rate;
    } catch (error) {
      logger.error({ message: 'Error fetching Sylius tax rate', taxCode }, error as Error);
      return null;
    }
  }
}
