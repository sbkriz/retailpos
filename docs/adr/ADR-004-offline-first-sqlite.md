# ADR-004: Offline-First SQLite with Platform Sync

**Date**: 2025-01-01  
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

A POS must work without internet connectivity. Orders must be recorded locally even when the e-commerce platform is unreachable. Blocking checkout on a network call would be unacceptable in a retail environment.

## Decision

All business data (orders, basket, products, users) is stored in local SQLite via `expo-sqlite`. After payment completes, `OrderSyncService` syncs paid orders to the e-commerce platform asynchronously with retry logic and exponential backoff. `BackgroundSyncService` runs a periodic sync cycle. The checkout flow never blocks on platform sync — the local write is the source of truth.

A `sync_status` field on each order tracks its sync state (`pending`, `synced`, `failed`).

## Consequences

Checkout always succeeds locally regardless of network state. Sync failures are surfaced in the Sync Queue screen, not at the point of sale. Orders may be temporarily out of sync with the platform, which is an acceptable trade-off for reliability. The Sync Queue screen gives staff visibility into any backlog.
