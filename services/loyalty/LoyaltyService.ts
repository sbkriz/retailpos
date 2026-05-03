/**
 * LoyaltyService
 *
 * Earn, redeem, adjust, and query loyalty points.
 * Local-first — the SQLite ledger is always authoritative.
 * Platform outbound sync is non-blocking and only runs when
 * the loyalty capability is 'custom' and the adapter is ready.
 *
 * Configuration keys (stored in key_value_store):
 *   loyalty.enabled      boolean  (default false)
 *   loyalty.earnRate     number   cents per 1 point (default 100 = £1 per point)
 *   loyalty.redeemRate   number   cents per point when redeeming (default 1 = 1p per point)
 *   loyalty.expiryDays   number | null
 *
 * See: docs/specs/customer/crm-loyalty.md §2.3–2.5
 */

import { loyaltyRepository } from '../../repositories/LoyaltyRepository';
import { keyValueRepository } from '../../repositories/KeyValueRepository';
import { auditLogService } from '../audit/AuditLogService';
import { notificationService } from '../notifications/NotificationService';
import { LoggerFactory } from '../logger/LoggerFactory';
import { toCents, toDollars } from '../../utils/money';

export interface LoyaltyConfig {
  enabled: boolean;
  earnRate: number; // cents per 1 point earned
  redeemRate: number; // cents per point when redeeming
  expiryDays: number | null;
}

const DEFAULT_CONFIG: LoyaltyConfig = {
  enabled: false,
  earnRate: 100,
  redeemRate: 1,
  expiryDays: null,
};

const CONFIG_KEY = 'loyalty.config';

export interface LoyaltyBalance {
  points: number;
  valueInCents: number;
  tier: string | null;
  lifetimeEarned: number;
}

export class LoyaltyService {
  private static instance: LoyaltyService;
  private logger = LoggerFactory.getInstance().createLogger('LoyaltyService');
  private configCache: LoyaltyConfig | null = null;

  private constructor() {}

  static getInstance(): LoyaltyService {
    if (!LoyaltyService.instance) {
      LoyaltyService.instance = new LoyaltyService();
    }
    return LoyaltyService.instance;
  }

  // ── Config ────────────────────────────────────────────────────────────

  async getConfig(): Promise<LoyaltyConfig> {
    if (this.configCache) return this.configCache;
    const stored = await keyValueRepository.getObject<LoyaltyConfig>(CONFIG_KEY);
    this.configCache = stored ?? DEFAULT_CONFIG;
    return this.configCache;
  }

  async updateConfig(config: Partial<LoyaltyConfig>): Promise<void> {
    const current = await this.getConfig();
    const updated = { ...current, ...config };
    await keyValueRepository.setObject(CONFIG_KEY, updated);
    this.configCache = updated;
  }

  // ── Balance ───────────────────────────────────────────────────────────

  async getBalance(email: string): Promise<LoyaltyBalance> {
    const account = await loyaltyRepository.getOrCreateAccount(email);
    const config = await this.getConfig();

    // Calculate tier based on lifetime earned
    const tier = this.calculateTier(account.lifetime_earned);

    return {
      points: account.balance,
      valueInCents: account.balance * config.redeemRate,
      tier,
      lifetimeEarned: account.lifetime_earned,
    };
  }

  /**
   * Calculate loyalty tier based on lifetime points earned.
   * Tiers: Bronze (default), Silver (500+), Gold (2000+)
   */
  private calculateTier(lifetimeEarned: number): string {
    // Tier thresholds (can be made configurable later)
    const TIER_SILVER = 500;
    const TIER_GOLD = 2000;

    if (lifetimeEarned >= TIER_GOLD) return 'Gold';
    if (lifetimeEarned >= TIER_SILVER) return 'Silver';
    return 'Bronze';
  }

  /**
   * Update the tier in the loyalty_accounts table.
   * Called after earn/adjust operations.
   */
  private async updateTier(email: string): Promise<void> {
    try {
      const account = await loyaltyRepository.getOrCreateAccount(email);
      const newTier = this.calculateTier(account.lifetime_earned);

      if (account.tier !== newTier) {
        await loyaltyRepository.updateTier(email, newTier);
        this.logger.info(`Updated tier for ${email}: ${account.tier} → ${newTier}`);
      }
    } catch (err) {
      this.logger.error({ message: `Failed to update tier for ${email}` }, err instanceof Error ? err : new Error(String(err)));
    }
  }

  // ── Earn ──────────────────────────────────────────────────────────────

  /**
   * Earn points for a completed order.
   * Non-blocking — failure must not block checkout.
   */
  async earnPoints(email: string, orderId: string, orderTotal: number): Promise<void> {
    try {
      const config = await this.getConfig();
      if (!config.enabled) return;

      const totalCents = toCents(orderTotal);
      const pointsEarned = Math.floor(totalCents / config.earnRate);
      if (pointsEarned <= 0) return;

      await loyaltyRepository.getOrCreateAccount(email);
      await loyaltyRepository.appendTransaction(email, 'earn', pointsEarned, orderId, 'Order purchase');
      await loyaltyRepository.updateBalance(email, pointsEarned);

      // Update tier after earning points
      await this.updateTier(email);

      notificationService.notify('Loyalty Points Earned', `+${pointsEarned} points earned on this order`, 'info');

      this.logger.info(`Earned ${pointsEarned} points for ${email} on order ${orderId}`);
    } catch (err) {
      this.logger.error({ message: `Failed to earn points for ${email}` }, err instanceof Error ? err : new Error(String(err)));
    }
  }

  // ── Redeem ────────────────────────────────────────────────────────────

  /**
   * Redeem points. Returns the discount amount in dollars.
   * Throws if insufficient balance.
   */
  async redeemPoints(email: string, orderId: string, pointsToRedeem: number): Promise<{ transactionId: string; discountDollars: number }> {
    const config = await this.getConfig();
    const account = await loyaltyRepository.getOrCreateAccount(email);

    const clamped = Math.min(pointsToRedeem, account.balance);
    if (clamped <= 0) throw new Error('Insufficient loyalty points balance');

    const txId = await loyaltyRepository.appendTransaction(email, 'redeem', -clamped, orderId, 'Points redemption');
    await loyaltyRepository.updateBalance(email, -clamped);

    const discountCents = clamped * config.redeemRate;
    const discountDollars = toDollars(discountCents);

    this.logger.info(`Redeemed ${clamped} points for ${email} — discount ${discountDollars}`);
    return { transactionId: txId, discountDollars };
  }

  /**
   * Reverse a redemption (e.g. basket cleared after redeeming).
   */
  async reverseRedemption(transactionId: string): Promise<void> {
    try {
      const tx = await loyaltyRepository.findTransactionById(transactionId);
      if (!tx || tx.type !== 'redeem') return;

      const restoredPoints = Math.abs(tx.points);
      await loyaltyRepository.appendTransaction(tx.customer_email, 'reversal', restoredPoints, tx.order_id, `Reversal of ${transactionId}`);
      await loyaltyRepository.updateBalance(tx.customer_email, restoredPoints);
      this.logger.info(`Reversed redemption ${transactionId} — restored ${restoredPoints} points`);
    } catch (err) {
      this.logger.error({ message: `Failed to reverse redemption ${transactionId}` }, err instanceof Error ? err : new Error(String(err)));
      notificationService.notify('Loyalty Warning', `Failed to reverse points redemption — manual review required`, 'warning');
    }
  }

  // ── Manual Adjustment ─────────────────────────────────────────────────

  async adjustPoints(email: string, delta: number, reason: string, managerId?: string): Promise<void> {
    await loyaltyRepository.getOrCreateAccount(email);
    await loyaltyRepository.appendTransaction(email, 'adjustment', delta, null, reason, managerId);
    await loyaltyRepository.updateBalance(email, delta);

    // Update tier after adjustment
    await this.updateTier(email);

    await auditLogService.log('loyalty:adjusted', {
      userId: managerId,
      details: `Loyalty adjustment for ${email}: ${delta > 0 ? '+' : ''}${delta} points — ${reason}`,
      metadata: { email, delta, reason },
    });
  }

  // ── Transaction history ───────────────────────────────────────────────

  async getTransactions(email: string, limit = 50) {
    return loyaltyRepository.findTransactionsByEmail(email, limit);
  }
}

export const loyaltyService = LoyaltyService.getInstance();
