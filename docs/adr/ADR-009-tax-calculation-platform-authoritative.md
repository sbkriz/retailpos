# ADR-009: Tax Calculation — Platform-Authoritative for Online Orders

**Date**: 2025-01-01  
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

Tax rates vary by jurisdiction and product type. For online orders, the e-commerce platform has authoritative tax rules that may differ from any locally-configured rate. Using a local rate for online orders risks incorrect tax collection.

## Decision

For online platforms, `CheckoutService.startCheckout()` creates a draft order on the platform first. The platform returns authoritative `tax`, `subtotal`, `total`, and per-line `taxRate` values, which overwrite the locally-calculated basket totals. For offline orders, the locally-configured `posConfig.values.taxRate` is applied. Tax rates are snapshotted on `order_items` at checkout time.

The `taxable` field was removed from `BasketItem` and `OrderLineItem` — the platform is authoritative for online orders, and offline uses a flat rate applied uniformly.

## Consequences

Online orders always reflect correct platform tax, including jurisdiction-specific rules. Offline orders use the configured flat rate. Snapshotting the rate on line items preserves the tax applied at the time of sale for audit purposes. The removal of the `taxable` field simplifies the data model at the cost of per-item tax exemption granularity in offline mode.
