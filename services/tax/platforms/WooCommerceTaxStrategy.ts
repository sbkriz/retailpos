import { ECommercePlatform } from '../../../utils/platforms';
import { BaseTaxStrategy } from '../BaseTaxStrategy';
import { NormalisedTaxCode } from '../types';
import { LoggerFactory } from '../../logger/LoggerFactory';

const logger = LoggerFactory.getInstance().createLogger('WooCommerceTaxStrategy');

/**
 * WooCommerce Tax Strategy
 *
 * Supports live rate fetching via WooCommerce REST API.
 * Spec: section 9.5 - Live rate source
 */
export class WooCommerceTaxStrategy extends BaseTaxStrategy {
  constructor() {
    super(ECommercePlatform.WOOCOMMERCE);
  }

  protected normaliseTaxCode(taxCode?: string): NormalisedTaxCode | null {
    if (!taxCode) return null;

    const code = taxCode.toLowerCase().trim();

    // WooCommerce-specific mappings
    if (code === '' || code === 'standard') {
      return { canonical: 'standard', type: 'exclusive', label: 'Standard Rate' };
    }
    if (code === 'reduced-rate' || code === 'reduced') {
      return { canonical: 'reduced', type: 'exclusive', label: 'Reduced Rate' };
    }
    if (code === 'zero-rate' || code === 'zero') {
      return { canonical: 'zero', type: 'exempt', label: 'Zero Rate' };
    }

    // Fallback to base normalisation
    return super.normaliseTaxCode(taxCode);
  }

  protected async fetchPlatformRate(taxCode: string): Promise<number | null> {
    const { apiUrl, apiKey, apiSecret } = this.config;

    if (!apiUrl || !apiKey || !apiSecret) {
      logger.debug({ message: 'WooCommerce API credentials not configured, skipping live rate fetch' });
      return null;
    }

    try {
      const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
      const url = `${apiUrl}/wp-json/wc/v3/taxes?class=${encodeURIComponent(taxCode)}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        logger.warn({ message: 'WooCommerce tax rate fetch failed', status: response.status, taxCode });
        return null;
      }

      const taxes = (await response.json()) as Array<{ rate: string }>;

      if (taxes.length === 0) {
        logger.debug({ message: 'No WooCommerce tax rates found for class', taxCode });
        return null;
      }

      // Use the first matching rate
      const rate = parseFloat(taxes[0].rate) / 100; // WooCommerce returns percentage
      logger.debug({ message: 'Fetched WooCommerce tax rate', taxCode, rate });
      return rate;
    } catch (error) {
      logger.error({ message: 'Error fetching WooCommerce tax rate', taxCode }, error as Error);
      return null;
    }
  }
}
