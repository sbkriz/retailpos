# ADR-010: Cash Drawer — UI-Driven, Service-Decided

**Date**: 2025-01-01  
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

The cash drawer should open automatically after cash payments. The question was whether the service layer or the UI layer should trigger the hardware call. Having the service call hardware directly would couple business logic to hardware drivers.

## Decision

`CheckoutService.completePayment()` returns a `CheckoutResult` with an `openDrawer?: boolean` flag. The service sets it to `true` when `paymentMethod === 'cash'` and `posConfig.values.drawerOpenOnCash` is enabled. The UI reads the flag and calls `cashDrawerServiceFactory.getService().open()` as a fire-and-forget operation. Services never open hardware directly.

`CashDrawerServiceFactory` resolves the appropriate driver at runtime: printer ESC/POS passthrough, Electron IPC, or a no-op implementation.

## Consequences

Clean separation of concerns — the service decides _whether_ the drawer should open based on business rules, and the UI _performs_ the hardware action. The drawer service is decoupled from the printer service. The no-op driver ensures the code path works safely on devices without a cash drawer. Adding a new drawer driver requires only a new implementation class in the factory.
