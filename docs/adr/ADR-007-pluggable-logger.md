# ADR-007: Pluggable Logger with Transport Pattern

**Date**: 2025-01-01  
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

The project needed structured logging that works in development (console output) and production (Sentry, Datadog, etc.) without requiring changes at call sites when switching or adding transports.

## Decision

`LoggerFactory` provides a singleton root logger (`ReactNativeLogger`) backed by `react-native-logs`. External transports implement `LogTransport { name, minLevel?, log(entry) }` and are registered via `LoggerFactory.addTransport()`. Child loggers share their parent's transport list. Console output is suppressed in production via a `__DEV__` guard. Services receive a `LoggerInterface` via constructor injection rather than importing the logger directly.

## Consequences

Development logging works with zero configuration. Production observability is enabled by registering transports (e.g. Sentry) at app startup. No `console.log` calls appear in service code. Adding a new transport requires a single `addTransport()` call at startup — no changes to existing service code.
