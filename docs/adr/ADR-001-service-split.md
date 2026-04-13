# ADR-001: Service Split — Basket, Checkout, OrderSync

**Date**: 2025-01-01  
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

The original monolithic `BasketService` handled cart CRUD, checkout, payment processing, and order sync in a single class. This made the service hard to test in isolation and hard to extend without risking regressions across unrelated concerns.

## Decision

Split into three focused services with constructor injection:

- `BasketService` — cart CRUD only (add, remove, update quantities, clear)
- `CheckoutService` — start checkout, complete payment, order queries
- `OrderSyncService` — sync paid orders to e-commerce platforms

All three are wired together by `BasketServiceFactory` into a `ServiceContainer`. No service instantiates its own dependencies.

## Consequences

Each service has a single responsibility and can be tested independently with mock dependencies. Constructor injection makes test setup straightforward. `BasketServiceFactory` is the single wiring point for the entire basket/checkout domain. Adding a new concern (e.g. loyalty points) means adding a new service, not expanding an existing one.
