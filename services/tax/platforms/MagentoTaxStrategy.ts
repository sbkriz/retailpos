import { ECommercePlatform } from '../../../utils/platforms';
import { BaseTaxStrategy } from '../BaseTaxStrategy';
import { LoggerFactory } from '../../logger/LoggerFactory';

const logger = LoggerFactory.getInstance().createLogger('MagentoTaxStrategy');

/**
 * Magento Tax Strategy
 *
 * Supports live rate fetching via Magento REST API.
 * Spec: section 9.5 - Live rate source
 */
export class MagentoTaxStrategy extends BaseTaxStrategy {
  constructor() {
    super(ECommercePlatform.MAGENTO);
  }

  protected async fetchPlatformRate(taxCode: string): Promise<number | null> {
    const { apiUrl, apiKey } = this.config;

    if (!apiUrl || !apiKey) {
      logger.debug({ message: 'Magento API credentials not configured, skipping live rate fetch' });
      return null;
    }

    try {
      const url = `${apiUrl}/rest/V1/taxRates/search?searchCriteria[filter_groups][0][filters][0][field]=code&searchCriteria[filter_groups][0][filters][0][value]=${encodeURIComponent(taxCode)}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        logger.warn({ message: 'Magento tax rate fetch failed', status: response.status, taxCode });
        return null;
      }

      const result = (await response.json()) as { items: Array<{ rate: number }> };

      if (!result.items || result.items.length === 0) {
        logger.debug({ message: 'No Magento tax rates found for code', taxCode });
        return null;
      }

      // Use the first matching rate
      const rate = result.items[0].rate / 100; // Magento returns percentage
      logger.debug({ message: 'Fetched Magento tax rate', taxCode, rate });
      return rate;
    } catch (error) {
      logger.error({ message: 'Error fetching Magento tax rate', taxCode }, error as Error);
      return null;
    }
  }
}
