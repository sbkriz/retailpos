# ADR-011: Notification System — Singleton Event Bus

**Date**: 2025-01-01  
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

Background services (sync, returns) need to surface status messages to the UI without being coupled to React state or navigation. Passing React context or callbacks into background services would create an undesirable dependency on the UI layer.

## Decision

`NotificationService` is a singleton in-memory event bus. Producers call `notificationService.notify(title, message, severity)` fire-and-forget. `NotificationProvider` subscribes via `addListener()` and maintains React state. The bell badge, notification drawer, and toast components all read from this context. Notifications are ephemeral — they are not persisted and are lost on app restart by design.

## Consequences

Background services have no React dependency and can be tested without a React environment. The UI layer is the sole consumer of notifications. Notifications are status signals, not audit records — the `AuditLogService` handles durable event recording separately. The ephemeral nature means notifications cannot be reviewed after an app restart, which is acceptable for operational status messages.
