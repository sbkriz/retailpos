/**
 * Platform Capability Matrix
 *
 * Single source of truth for what each e-commerce platform supports.
 * Used by navigation composers, service guards, and UI gating.
 *
 * Legend:
 *   supported        – first-class, stable API support
 *   custom           – custom adapter required; project/tenant-specific risk
 *   not_recommended  – not recommended for parity promise in current public API shape
 */

import { ECommercePlatform } from './platforms';

export type CapabilityLevel = 'supported' | 'custom' | 'not_recommended';

export interface PlatformCapabilities {
  catalog: CapabilityLevel;
  customers: CapabilityLevel;
  inventory: CapabilityLevel;
  orderSync: CapabilityLevel;
  draftOrders: CapabilityLevel;
  discounts: CapabilityLevel;
  giftCards: CapabilityLevel;
  refunds: CapabilityLevel;
}

/**
 * Authoritative capability matrix per platform.
 * Matches the matrix in docs/specs/platform-capability-rollout.md §3.
 */
export const PLATFORM_CAPABILITY_MATRIX: Readonly<Record<ECommercePlatform, PlatformCapabilities>> = {
  [ECommercePlatform.SHOPIFY]: {
    catalog: 'supported',
    customers: 'supported',
    inventory: 'supported',
    orderSync: 'supported',
    draftOrders: 'supported',
    discounts: 'supported',
    giftCards: 'supported',
    refunds: 'supported',
  },
  [ECommercePlatform.WOOCOMMERCE]: {
    catalog: 'supported',
    customers: 'supported',
    inventory: 'supported',
    orderSync: 'supported',
    draftOrders: 'custom',
    discounts: 'supported',
    giftCards: 'custom',
    refunds: 'custom',
  },
  [ECommercePlatform.MAGENTO]: {
    catalog: 'supported',
    customers: 'supported',
    inventory: 'supported',
    orderSync: 'supported',
    draftOrders: 'supported',
    discounts: 'supported',
    giftCards: 'custom',
    refunds: 'supported',
  },
  [ECommercePlatform.BIGCOMMERCE]: {
    catalog: 'supported',
    customers: 'supported',
    inventory: 'supported',
    orderSync: 'supported',
    draftOrders: 'custom',
    discounts: 'supported',
    giftCards: 'custom',
    refunds: 'supported',
  },
  [ECommercePlatform.SYLIUS]: {
    catalog: 'custom',
    customers: 'custom',
    inventory: 'custom',
    orderSync: 'custom',
    draftOrders: 'custom',
    discounts: 'custom',
    giftCards: 'not_recommended',
    refunds: 'custom',
  },
  [ECommercePlatform.WIX]: {
    catalog: 'supported',
    customers: 'supported',
    inventory: 'supported',
    orderSync: 'supported',
    draftOrders: 'supported',
    discounts: 'supported',
    giftCards: 'supported',
    refunds: 'supported',
  },
  [ECommercePlatform.PRESTASHOP]: {
    catalog: 'supported',
    customers: 'supported',
    inventory: 'supported',
    orderSync: 'supported',
    draftOrders: 'custom',
    discounts: 'supported',
    giftCards: 'not_recommended',
    refunds: 'custom',
  },
  [ECommercePlatform.SQUARESPACE]: {
    catalog: 'supported',
    customers: 'supported',
    inventory: 'supported',
    orderSync: 'supported',
    draftOrders: 'not_recommended',
    discounts: 'not_recommended',
    giftCards: 'not_recommended',
    refunds: 'not_recommended',
  },
  [ECommercePlatform.COMMERCEFULL]: {
    catalog: 'supported',
    customers: 'supported',
    inventory: 'supported',
    orderSync: 'supported',
    draftOrders: 'supported',
    discounts: 'supported',
    giftCards: 'supported',
    refunds: 'supported',
  },
  [ECommercePlatform.OFFLINE]: {
    catalog: 'supported',
    customers: 'supported',
    inventory: 'supported',
    orderSync: 'supported',
    draftOrders: 'not_recommended',
    discounts: 'supported',
    giftCards: 'not_recommended',
    refunds: 'supported',
  },
};

/**
 * Get the capability profile for a platform.
 * Falls back to OFFLINE profile for unknown/null platforms.
 */
export function getPlatformCapabilities(platform: ECommercePlatform | string | null | undefined): PlatformCapabilities {
  if (!platform) return PLATFORM_CAPABILITY_MATRIX[ECommercePlatform.OFFLINE];
  return PLATFORM_CAPABILITY_MATRIX[platform as ECommercePlatform] ?? PLATFORM_CAPABILITY_MATRIX[ECommercePlatform.OFFLINE];
}

/**
 * Returns true only when the feature is fully supported (no custom adapter needed).
 */
export function supportsStrict(capabilities: PlatformCapabilities, feature: keyof PlatformCapabilities): boolean {
  return capabilities[feature] === 'supported';
}

/**
 * Returns true when the feature is supported or available via a custom adapter.
 */
export function supportsWithCustom(capabilities: PlatformCapabilities, feature: keyof PlatformCapabilities): boolean {
  return capabilities[feature] === 'supported' || capabilities[feature] === 'custom';
}

/**
 * Returns true when the feature is explicitly not recommended for this platform.
 */
export function isNotRecommended(capabilities: PlatformCapabilities, feature: keyof PlatformCapabilities): boolean {
  return capabilities[feature] === 'not_recommended';
}

/**
 * Human-readable reason string for why a feature is unavailable.
 * Used in UI disabled states and tooltips.
 */
export function getUnavailableReason(
  capabilities: PlatformCapabilities,
  feature: keyof PlatformCapabilities,
  platformName: string
): string {
  const level = capabilities[feature];
  if (level === 'not_recommended') {
    return `${featureLabel(feature)} is not supported on ${platformName}.`;
  }
  if (level === 'custom') {
    return `${featureLabel(feature)} requires a custom adapter for ${platformName}. Contact your administrator.`;
  }
  return '';
}

function featureLabel(feature: keyof PlatformCapabilities): string {
  const labels: Record<keyof PlatformCapabilities, string> = {
    catalog: 'Catalog',
    customers: 'Customer management',
    inventory: 'Inventory sync',
    orderSync: 'Order sync',
    draftOrders: 'Draft orders',
    discounts: 'Discounts',
    giftCards: 'Gift cards',
    refunds: 'Refunds',
  };
  return labels[feature];
}
