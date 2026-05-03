import { ECommercePlatform } from '../../../utils/platforms';
import { BaseTaxStrategy } from '../BaseTaxStrategy';

/**
 * Offline Tax Strategy
 *
 * Local-only tax resolution using TaxProfile repository.
 * No live rate fetching by design.
 * Spec: section 9.5 - Local profile only
 */
export class OfflineTaxStrategy extends BaseTaxStrategy {
  constructor() {
    super(ECommercePlatform.OFFLINE);
  }

  // No platform rate fetching for offline mode
  // Uses local TaxProfile resolution only
}
