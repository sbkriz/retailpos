# ADR-008: Authentication — Pluggable Multi-Method with PIN Fallback

**Date**: 2025-01-01  
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

Different retail environments need different authentication methods: PIN for speed, biometric for security, magstripe or RFID for hardware-based access, and platform auth for online mode. A single hardcoded auth method would not serve all deployment scenarios.

## Decision

`AuthService` holds a registry of `AuthMethodProvider` implementations. `AuthConfigService` persists the primary method and the set of allowed methods. PIN is always available and cannot be disabled. `platform_auth` is restricted to online mode. Hardware methods (`magstripe`, `rfid_nfc`) require physical devices to be present. `authenticateWithPrimary()` falls back to PIN if the primary method fails.

## Consequences

Adding a new auth method means adding one provider class and registering it. The login screen dynamically renders UI based on the active methods. PIN is the universal fallback — the POS can always be accessed even if the primary method is unavailable. The registry pattern keeps `AuthService` open for extension without modification.
