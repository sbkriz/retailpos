# ADR-005: Platform Abstraction via Factory + Interface Pattern

**Date**: 2025-01-01  
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

RetailPOS supports 9+ e-commerce platforms (Shopify, WooCommerce, BigCommerce, etc.) plus an offline mode. Each domain (products, orders, inventory, categories, search) needs platform-specific implementations. Without a consistent abstraction, platform-specific code would leak into UI components and hooks.

## Decision

Every domain follows the same pattern: Interface → Factory (singleton) → Platform implementations → Offline fallback.

For example: `ProductServiceFactory.getInstance().getService(platform)` returns the correct implementation for the active platform. `ServiceConfigBridge` configures factories when credentials change. The `PlatformServiceRegistry` layer was removed as redundant — hooks call factories directly.

## Consequences

Adding a new platform means adding one implementation class per domain. Factories cache instances to avoid redundant construction. The offline implementation is always available as a fallback. No platform-specific code leaks into UI components or hooks — they only interact with the interface.
