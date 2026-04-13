# Authentication – EARS Requirements

> **System**: RetailPOS – Authentication
> **Actor**: Cashier, Manager, System
> **Date**: 2026-04-13
> **Source**: `services/auth/AuthService.ts`, `services/auth/AuthConfigService.ts`, `services/auth/AuthMethodInterface.ts`, `services/auth/providers/`, `screens/LoginScreen.tsx`

---

## Context

The authentication subsystem supports six method types — `pin`, `biometric`, `password`, `magstripe`, `rfid_nfc`, and `platform_auth` — behind a common `AuthMethodProvider` interface. `AuthService` holds a registry of all six providers and delegates credential verification to the appropriate one.

`AuthConfigService` persists the active configuration (primary method, allowed methods, per-method config, and auth mode) to `KeyValueRepository`. PIN is a permanent fallback: it cannot be disabled and is always included in the available provider list regardless of configuration.

Authentication can operate in `online` or `offline` mode. Hardware-dependent methods (`magstripe`, `rfid_nfc`) require a physical reader. `platform_auth` requires an internet connection and is restricted to online mode. Biometric requires OS-level enrollment.

### Auth Method Properties

| Method          | Requires Hardware        | Requires Platform Support | Supported Modes     |
| --------------- | ------------------------ | ------------------------- | ------------------- |
| `pin`           | No                       | No                        | `online`, `offline` |
| `biometric`     | No                       | Yes (OS enrollment)       | `online`, `offline` |
| `password`      | No                       | No                        | `online`, `offline` |
| `magstripe`     | Yes (USB/BT card reader) | No                        | `online`, `offline` |
| `rfid_nfc`      | Yes (NFC/RFID reader)    | No                        | `online`, `offline` |
| `platform_auth` | No                       | No                        | `online` only       |

### Method Registration Order

`ALL_AUTH_METHODS`: `pin` → `biometric` → `password` → `magstripe` → `rfid_nfc` → `platform_auth`

---

## 1. Ubiquitous Requirements

**1.1** The system shall register all six auth method providers in `AuthService` at construction time — no provider may be added or removed at runtime.

**1.2** PIN shall always be available as an authentication method. It cannot be disabled, removed from the allowed list, or excluded from `getAvailableProviders()`.

**1.3** `AuthConfigService` shall persist every configuration change (primary method, allowed methods, auth mode, per-method config) to `KeyValueRepository` immediately on each setter call.

**1.4** `AuthConfigService.load()` shall be called at application startup to restore the persisted configuration before any authentication attempt is made.

**1.5** `AuthMethodProvider` shall expose `type`, `info` (`AuthMethodInfo`), `isAvailable()`, `authenticate(credential?)`, `enroll(userId, credential)`, `unenroll(userId)`, and `isEnrolled(userId)`.

**1.6** `AuthMethodInfo` shall carry `label`, `description`, `icon`, `requiresHardware`, `requiresPlatformSupport`, and `supportedModes` for each method.

---

## 2. Event-Driven Requirements

### 2.1 Configuration — Load and Persist

**2.1.1** When `AuthConfigService.load()` is called, the system shall read the persisted configuration from `KeyValueRepository` and populate `primaryMethod`, `allowedMethods`, `authMode`, and all per-method configs into memory.

**2.1.2** When `AuthConfigService.setPrimaryMethod(method)` is called, the system shall update the in-memory primary method and persist the change immediately.

**2.1.3** When `AuthConfigService.setAllowedMethods(methods)` is called, the system shall update the in-memory allowed list and persist the change immediately.

**2.1.4** When `AuthConfigService.enableMethod(method)` is called, the system shall add the method to the allowed list if not already present and persist the change.

**2.1.5** When `AuthConfigService.disableMethod(method)` is called with any method other than `'pin'`, the system shall remove the method from the allowed list and persist the change.

**2.1.6** When `AuthConfigService.disableMethod('pin')` is called, the system shall perform no operation — PIN cannot be disabled.

**2.1.7** When `AuthConfigService.setMethodConfig(method, config)` is called, the system shall store the config object keyed by method and persist the change immediately.

**2.1.8** When `AuthConfigService.getMethodConfig(method)` is called, the system shall return the stored config for that method, or `null` if none has been set.

### 2.2 Authentication

**2.2.1** When `AuthService.authenticate(method, credential)` is called, the system shall look up the provider for `method`, call `provider.isAvailable()`, and only proceed to `provider.authenticate(credential)` if `isAvailable()` returns `true`.

**2.2.2** When `AuthService.authenticate(method, credential)` is called and `provider.isAvailable()` returns `false`, the system shall return a failure result indicating the method is unavailable — it shall not throw.

**2.2.3** When `AuthService.authenticateWithPrimary(credential)` is called, the system shall attempt authentication using the configured primary method.

**2.2.4** When `AuthService.authenticateWithPrimary(credential)` fails (primary method returns a failure result), the system shall automatically retry using the PIN provider as fallback.

**2.2.5** When `AuthService.authenticateWithPrimary(credential)` is called and the configured primary method is unavailable or has been disabled, the system shall fall back to PIN directly without attempting the primary method.

### 2.3 Available Providers

**2.3.1** When `AuthService.getAvailableProviders()` is called, the system shall iterate over the allowed methods list, call `isAvailable()` on each provider, and return only those that return `true`.

**2.3.2** When `AuthService.getAvailableProviders()` is called, the system shall always include the PIN provider in the result regardless of the allowed methods list or `isAvailable()` result.

**2.3.3** When `getAuthMethodsForMode(mode)` is called, the system shall return only those methods whose `supportedModes` includes the given mode.

### 2.4 Hardware Methods

**2.4.1** When `magstripe` provider's `isAvailable()` is called and no USB or Bluetooth card reader is detected, the system shall return `false`.

**2.4.2** When `rfid_nfc` provider's `isAvailable()` is called and no NFC or RFID reader is detected, the system shall return `false`.

**2.4.3** When a hardware method's `authenticate(credential)` is called with a credential read from the physical device, the system shall validate the credential and return a success or failure result.

### 2.5 Platform Auth

**2.5.1** When `platform_auth` provider's `isAvailable()` is called in `offline` mode, the system shall return `false`.

**2.5.2** When `platform_auth` provider's `isAvailable()` is called in `online` mode with internet connectivity, the system shall return `true`.

### 2.6 Biometric

**2.6.1** When `biometric` provider's `isAvailable()` is called and the OS reports no enrolled biometric credentials, the system shall return `false`.

**2.6.2** When `biometric` provider's `isAvailable()` is called and the OS reports enrolled biometric credentials, the system shall return `true`.

### 2.7 Audit Logging

**2.7.1** When `LoginScreen` receives a successful authentication result, the system shall call `auditLogService.log('auth:login', { userId, userName })`.

**2.7.2** When `LoginScreen` receives a failed authentication result, the system shall call `auditLogService.log('auth:failed', { details: 'method={method} error={error}' })`.

---

## 3. State-Driven Requirements

**3.1** While `authMode` is `'offline'`, `platform_auth` shall not appear in `getAvailableProviders()` results.

**3.2** While a hardware method is in the allowed list but its physical device is not connected, `isAvailable()` for that method shall return `false` and it shall be excluded from `getAvailableProviders()`.

**3.3** While `biometric` is in the allowed list but the OS has no enrolled biometric, `isAvailable()` shall return `false` and it shall be excluded from `getAvailableProviders()`.

**3.4** While PIN is the configured primary method and `authenticateWithPrimary` is called, the system shall authenticate directly via PIN without triggering the fallback path.

---

## 4. Optional Feature Requirements

**4.1** Where `setMethodConfig(method, config)` is used for `magstripe` or `rfid_nfc`, the config may include a device ID or connection parameters for the physical reader — providers shall use this config when establishing the hardware connection.

**4.2** Where `enroll(userId, credential)` is supported by a provider, the system shall store the enrolled credential associated with the given user ID for future `authenticate` calls.

**4.3** Where `unenroll(userId)` is called, the system shall remove any stored credential for that user from the provider's enrollment store.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If `AuthConfigService.load()` has not been called before `authenticate()` is invoked, the system shall operate with default configuration values — PIN as primary, all methods allowed, `online` mode.

**5.2** If `AuthConfigService.load()` reads malformed JSON from `KeyValueRepository`, the system shall catch the parse error, log it, and fall back to default configuration — it shall not throw.

**5.3** If `authenticateWithPrimary` falls back to PIN and PIN authentication also fails, the system shall return the PIN failure result — there is no further fallback.

**5.4** If `disableMethod` is called for the current primary method (other than PIN), the system shall remove it from the allowed list; subsequent calls to `authenticateWithPrimary` shall fall back to PIN.

**5.5** If `getAvailableProviders()` is called when all non-PIN methods are unavailable, the system shall return a list containing only the PIN provider.

**5.6** If a provider's `isAvailable()` throws unexpectedly, the system shall catch the error, treat the method as unavailable, and continue evaluating remaining providers.

---

## 6. Component Traceability

| Requirement (summary)                                      | Component / Service                                               | Source File                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| Six providers registered at construction                   | `AuthService` constructor                                         | `services/auth/AuthService.ts`         |
| `authenticate(method, credential)` with availability check | `AuthService.authenticate`                                        | `services/auth/AuthService.ts`         |
| `authenticateWithPrimary` with PIN fallback                | `AuthService.authenticateWithPrimary`                             | `services/auth/AuthService.ts`         |
| `getAvailableProviders` always includes PIN                | `AuthService.getAvailableProviders`                               | `services/auth/AuthService.ts`         |
| `getAuthMethodsForMode` filters by `supportedModes`        | `AuthService.getAuthMethodsForMode`                               | `services/auth/AuthService.ts`         |
| Config persisted on every setter call                      | `AuthConfigService.setPrimaryMethod` / `setAllowedMethods` / etc. | `services/auth/AuthConfigService.ts`   |
| `load()` restores config at startup                        | `AuthConfigService.load`                                          | `services/auth/AuthConfigService.ts`   |
| `disableMethod('pin')` is a no-op                          | `AuthConfigService.disableMethod`                                 | `services/auth/AuthConfigService.ts`   |
| Per-method config storage                                  | `AuthConfigService.setMethodConfig` / `getMethodConfig`           | `services/auth/AuthConfigService.ts`   |
| Provider interface contract                                | `AuthMethodProvider`                                              | `services/auth/AuthMethodInterface.ts` |
| `AuthMethodInfo` shape                                     | `AuthMethodInfo`                                                  | `services/auth/AuthMethodInterface.ts` |
| Magstripe requires physical card reader                    | `MagstripeAuthProvider.isAvailable`                               | `services/auth/providers/`             |
| RFID/NFC requires physical reader                          | `RfidNfcAuthProvider.isAvailable`                                 | `services/auth/providers/`             |
| `platform_auth` online-only                                | `PlatformAuthProvider.isAvailable`                                | `services/auth/providers/`             |
| Biometric requires OS enrollment                           | `BiometricAuthProvider.isAvailable`                               | `services/auth/providers/`             |
| `auth:login` audit log on success                          | `LoginScreen` success handler                                     | `screens/LoginScreen.tsx`              |
| `auth:failed` audit log on failure                         | `LoginScreen` failure handler                                     | `screens/LoginScreen.tsx`              |
