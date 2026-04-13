# Authentication – Login EARS Requirements

> **System**: RetailPOS – Authentication & Login  
> **Actor**: Cashier, Admin  
> **Date**: 2026-04-12  
> **Source**: `screens/LoginScreen.tsx`, `services/auth/AuthService.ts`, `services/auth/AuthConfigService.ts`, `services/auth/AuthMethodInterface.ts`, `services/auth/providers/`, `services/audit/AuditLogService.ts`

---

## Context

The login screen is the entry point to the POS after onboarding completes. It delegates authentication to one of six method providers registered in `AuthService`. The active method is determined by `AuthConfigService`, which persists the primary method and allowed methods to the key-value store.

Authentication mode (`online` / `offline`) is set during onboarding and controls which methods are available. Offline mode supports PIN, biometric, password, magstripe, and RFID/NFC. Online mode additionally supports platform login (`platform_auth`), which validates against the configured e-commerce platform token.

PIN is always available as the fallback — it cannot be disabled and is always injected into the available providers list by `AuthService.getAvailableProviders()` even if not explicitly in the allowed list.

Every login attempt (success and failure) is recorded to `AuditLogService` under the `auth:login` or `auth:failed` action.

### Actors

| Actor   | Role                                                                                 |
| ------- | ------------------------------------------------------------------------------------ |
| Cashier | Authenticates at the start of a shift using their preferred method                   |
| Admin   | Authenticates and may also manage which methods are enabled via Settings             |
| System  | Loads available providers, delegates authentication, records audit events, navigates |

### Auth Method Summary

| Method          | Type             | Mode(s) | Requires Hardware | Requires Platform Support |
| --------------- | ---------------- | ------- | ----------------- | ------------------------- |
| `pin`           | 6-digit numeric  | offline | No                | No                        |
| `biometric`     | Fingerprint/Face | offline | No                | Yes (OS enrollment)       |
| `password`      | Alphanumeric     | offline | No                | No                        |
| `magstripe`     | Card swipe       | offline | Yes               | No                        |
| `rfid_nfc`      | Badge tap        | offline | Yes               | No                        |
| `platform_auth` | Platform token   | online  | No                | No                        |

### Auth Config Defaults

| `AuthConfigService` field | Default at first load | Configurable after onboarding |
| ------------------------- | --------------------- | ----------------------------- |
| `primaryMethod`           | `'pin'`               | Yes — Settings → Auth tab     |
| `allowedMethods`          | `['pin']`             | Yes — Settings → Auth tab     |
| `authMode`                | `'offline'`           | Set during onboarding only    |

---

## 1. Ubiquitous Requirements

**1.1** The system shall always include `pin` in the available providers list returned by `AuthService.getAvailableProviders()`, regardless of the configured `allowedMethods`.

**1.2** The system shall record every successful login attempt to `AuditLogService` with action `auth:login`, including the user ID, user name, and auth method used.

**1.3** The system shall record every failed login attempt to `AuditLogService` with action `auth:failed`, including the auth method attempted and the error reason.

**1.4** The system shall only display auth methods whose `isAvailable()` returns `true` in the method switcher.

**1.5** The system shall persist `primaryMethod`, `allowedMethods`, and `authMode` to the key-value store via `AuthConfigService` so they survive app restarts.

**1.6** The system shall load `AuthConfigService` from the key-value store once at app startup before the login screen is rendered.

---

## 2. Event-Driven Requirements

### 2.1 Screen Load

**2.1.1** When the login screen mounts, the system shall call `authService.getAvailableProviders()` and set the active method to `authConfig.primaryMethod` if it is present in the returned list, or fall back to the first available provider otherwise.

**2.1.2** When the login screen mounts and the resolved active method is `biometric`, the system shall automatically trigger `handleBiometricAuth()` once without waiting for a user tap.

**2.1.3** When the login screen mounts and the resolved active method is `magstripe` or `rfid_nfc`, the system shall set `waitingForSwipe` to `true` and focus the hidden `TextInput` to capture hardware input.

### 2.2 PIN Login

**2.2.1** When the cashier taps a digit on the PIN keypad, the system shall append the digit to the PIN display up to a maximum of 6 digits.

**2.2.2** When the cashier's PIN reaches 6 digits, the system shall immediately call `authService.authenticate('pin', pin)` without requiring a separate submit action.

**2.2.3** When `PinAuthProvider.authenticate()` returns `success: true`, the system shall call `onLogin(pin, user)` and navigate to the Order screen.

**2.2.4** When `PinAuthProvider.authenticate()` returns `success: false`, the system shall trigger the shake animation, display the error message, and clear the PIN input.

**2.2.5** When the cashier taps the delete key on the PIN keypad, the system shall remove the last digit from the PIN display and clear any active error message.

### 2.3 Biometric Login

**2.3.1** When the cashier taps the "Tap to Authenticate" button on the biometric screen, the system shall call `authService.authenticate('biometric')`, which invokes `LocalAuth.authenticateAsync()` with the prompt message "Log in to RetailPOS".

**2.3.2** When `BiometricAuthProvider.authenticate()` returns `success: true`, the system shall call `onLogin('biometric', user)` and navigate to the Order screen.

**2.3.3** When `BiometricAuthProvider.authenticate()` returns `success: false`, the system shall display the error message and allow the cashier to retry or switch to PIN.

### 2.4 Password Login

**2.4.1** When the cashier taps "Log In" or submits the password input, the system shall call `authService.authenticate('password', password)`.

**2.4.2** When `PasswordAuthProvider.authenticate()` returns `success: true`, the system shall call `onLogin(password, user)` and navigate to the Order screen.

**2.4.3** When `PasswordAuthProvider.authenticate()` returns `success: false`, the system shall display the error message and clear the password input.

**2.4.4** When the cashier submits an empty password field, the system shall display a "Password is required" error without calling `authService.authenticate()`.

### 2.5 MagStripe Login

**2.5.1** When the cashier swipes a card and the hidden `TextInput` receives input, the system shall call `authService.authenticate('magstripe', cardData)` with the trimmed card data.

**2.5.2** When `MagstripeAuthProvider.authenticate()` returns `success: true`, the system shall call `onLogin(cardData, user)` and navigate to the Order screen.

**2.5.3** When `MagstripeAuthProvider.authenticate()` returns `success: false`, the system shall display the error message and reset `waitingForSwipe` to `true` to prompt another swipe.

### 2.6 RFID/NFC Login

**2.6.1** When the cashier taps a badge and the hidden `TextInput` receives input, the system shall call `authService.authenticate('rfid_nfc', badgeData)` with the trimmed, uppercased badge UID.

**2.6.2** When `RfidNfcAuthProvider.authenticate()` returns `success: true`, the system shall call `onLogin(badgeData, user)` and navigate to the Order screen.

**2.6.3** When `RfidNfcAuthProvider.authenticate()` returns `success: false`, the system shall display the error message and reset `waitingForSwipe` to `true` to prompt another tap.

### 2.7 Platform Login

**2.7.1** When the cashier taps "Log In via Platform", the system shall call `authService.authenticate('platform_auth')`.

**2.7.2** When `PlatformAuthProvider.authenticate()` finds a valid token via `TokenService.hasValidToken()`, the system shall call `onLogin('platform_auth', user)` and navigate to the Order screen.

**2.7.3** When `PlatformAuthProvider.authenticate()` finds no valid token and `TokenService.getToken()` with `refresh: true` returns a token, the system shall call `onLogin('platform_auth', user)` and navigate to the Order screen.

**2.7.4** When `PlatformAuthProvider.authenticate()` returns `success: false`, the system shall display the error message and allow the cashier to retry.

### 2.8 Method Switching

**2.8.1** When the cashier taps a method in the method switcher, the system shall set the active method to the selected type, clear the PIN, password, and error state, and reset `biometricTriggeredRef` to `false`.

**2.8.2** When the cashier switches to `biometric`, the system shall automatically trigger `handleBiometricAuth()` once.

**2.8.3** When the cashier switches to `magstripe` or `rfid_nfc`, the system shall set `waitingForSwipe` to `true`.

**2.8.4** When the cashier switches away from `magstripe` or `rfid_nfc`, the system shall set `waitingForSwipe` to `false`.

---

## 3. State-Driven Requirements

**3.1** While the active method is `pin`, the system shall render the `PinDisplay` and `PinKeypad` components.

**3.2** While the active method is `biometric`, the system shall render the fingerprint icon and "Tap to Authenticate" button.

**3.3** While the active method is `password`, the system shall render the secure `TextInput` and "Log In" submit button.

**3.4** While the active method is `magstripe`, the system shall render the credit card icon, a "Waiting for swipe..." status label, and a focused hidden `TextInput`.

**3.5** While the active method is `rfid_nfc`, the system shall render the NFC icon, a "Waiting for badge tap..." status label, and a focused hidden `TextInput`.

**3.6** While the active method is `platform_auth`, the system shall render the "Log In via Platform" button.

**3.7** While `isLoading` is `true`, the system shall render a loading overlay with an `ActivityIndicator` over the auth UI and disable all interactive controls.

**3.8** While `availableMethods` contains more than one provider, the system shall render the method switcher row below the auth UI.

**3.9** While `authMode` is `'offline'`, the system shall not include `platform_auth` in the available providers list.

**3.10** While `authMode` is `'online'`, the system shall include `platform_auth` in the available providers list only if `PlatformAuthProvider.isAvailable()` returns `true`.

---

## 4. Optional Feature Requirements

**4.1** Where the device is running on `Platform.OS === 'web'`, the system shall treat `BiometricAuthProvider.isAvailable()` as `false` and exclude biometric from the available providers list.

**4.2** Where `expo-local-authentication` is not installed, the system shall treat `BiometricAuthProvider.isAvailable()` as `false`.

**4.3** Where `auth.magstripe.enabled` is `true` in the key-value store, the system shall include `magstripe` in the available providers list.

**4.4** Where `auth.rfid.enabled` is `true` in the key-value store, the system shall include `rfid_nfc` in the available providers list.

**4.5** Where `availableMethods` contains a `biometric` provider and the active method is `pin`, the system shall render the biometric shortcut key on the `PinKeypad`.

---

## 5. Unwanted Behaviour / Edge Cases

### 5.1 No Users Enrolled

**5.1.1** If `userRepository.hasAdminUser()` returns `false` when PIN authentication is attempted, then `PinAuthProvider` shall return `success: true` to allow initial setup access without a stored PIN.

### 5.2 Biometric Not Enrolled on Device

**5.2.1** If `LocalAuth.isEnrolledAsync()` returns `false`, then `BiometricAuthProvider.isAvailable()` shall return `false` and the system shall exclude biometric from the available providers list.

**5.2.2** If biometric authentication succeeds at the OS level but no user is linked to `auth.biometric.userId` in the key-value store, then `BiometricAuthProvider.authenticate()` shall return `success: false` with the error "No user is enrolled for biometric login. Please set up in Settings."

**5.2.3** If biometric authentication succeeds but the linked user is inactive (`user.is_active === false`), then `BiometricAuthProvider.authenticate()` shall return `success: false` with the error "Enrolled user not found or inactive."

### 5.3 Platform Auth Token Expired

**5.3.1** If `TokenService.hasValidToken()` returns `false` and `TokenService.getToken()` with `refresh: true` also returns `null`, then `PlatformAuthProvider.authenticate()` shall return `success: false` with the error "Platform authentication failed. Please check your credentials and internet connection."

**5.3.2** If no online platform is configured in the key-value store (`ecommercePlatform` is absent or `'offline'`), then `PlatformAuthProvider.isAvailable()` shall return `false` and the system shall exclude `platform_auth` from the available providers list.

### 5.4 Hardware Methods Not Configured

**5.4.1** If `auth.magstripe.enabled` is absent or `false` in the key-value store, then `MagstripeAuthProvider.isAvailable()` shall return `false` and the system shall exclude `magstripe` from the available providers list.

**5.4.2** If `auth.rfid.enabled` is absent or `false` in the key-value store, then `RfidNfcAuthProvider.isAvailable()` shall return `false` and the system shall exclude `rfid_nfc` from the available providers list.

**5.4.3** If a card is swiped but the card data does not match any enrolled user, then `MagstripeAuthProvider.authenticate()` shall return `success: false` with the error "Card not recognized. Please try again or use another login method."

**5.4.4** If a badge is tapped but the badge UID does not match any enrolled user, then `RfidNfcAuthProvider.authenticate()` shall return `success: false` with the error "Badge not recognized. Please try again or use another login method."

### 5.5 Primary Method Unavailable

**5.5.1** If `authConfig.primaryMethod` is not present in the list returned by `authService.getAvailableProviders()`, then the system shall fall back to the first available provider in the list.

**5.5.2** If `authService.getAvailableProviders()` returns an empty list (all configured methods unavailable), then the system shall always fall back to PIN, since `AuthService` unconditionally injects `PinAuthProvider` into the available list.

### 5.6 Auth Service Method Not Registered

**5.6.1** If `authService.authenticate()` is called with a method type that has no registered provider, then `AuthService` shall return `success: false` with the error "Authentication method '[type]' is not available."

---

## 6. Complex Requirements

**6.1** When the cashier switches to `biometric` while `biometricTriggeredRef.current` is `false` and `isLoading` is `false`, the system shall set `biometricTriggeredRef.current` to `true` and call `handleBiometricAuth()` automatically — ensuring the OS biometric prompt appears without requiring a manual tap.

**6.2** When `authenticateWithPrimary()` is called and the primary method fails, the system shall fall back to `authenticate('pin', credential)` to ensure the cashier can always log in via PIN.

**6.3** When `AuthService.getAvailableProviders()` is called and PIN is not in the `allowedMethods` list, the system shall prepend `PinAuthProvider` to the returned list so PIN is always the first fallback option regardless of admin configuration.

---

## 7. Authentication Lifecycle Summary

### Method resolution on screen load

```
LoginScreen mounts
  → authService.getAvailableProviders()
    → filters allowedMethods by isAvailable()
    → injects PIN if missing
  → resolve activeMethod = primaryMethod (if available) else providers[0]
  → render auth UI for activeMethod
  → if biometric: auto-trigger handleBiometricAuth()
  → if magstripe/rfid_nfc: focus hidden input, set waitingForSwipe = true
```

### Successful authentication flow

```
Cashier provides credential
  → authService.authenticate(method, credential)
    → provider.isAvailable() check
    → provider.authenticate(credential)
      → validate against SQLite / KV store / TokenService
  → success: true
    → auditLogService.log('auth:login', { userId, method })
    → onLogin(credential, user)
    → navigate to Order screen
```

### Failed authentication flow

```
Cashier provides credential
  → authService.authenticate(method, credential)
  → success: false
    → auditLogService.log('auth:failed', { method, error })
    → startShake()
    → setError(result.error)
    → clear credential input
    → cashier retries or switches method
```

### Method availability by mode

| Method          | Offline mode | Online mode    |
| --------------- | ------------ | -------------- |
| `pin`           | Always       | Always         |
| `biometric`     | If enrolled  | If enrolled    |
| `password`      | Always       | Always         |
| `magstripe`     | If enabled   | If enabled     |
| `rfid_nfc`      | If enabled   | If enabled     |
| `platform_auth` | Never        | If token valid |

---

## 8. Component Traceability

| Requirement (summary)                               | Component / Hook / Service                                                                | Source File                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Load available providers on mount                   | `LoginScreen` useEffect → `authService.getAvailableProviders`                             | `screens/LoginScreen.tsx`, `services/auth/AuthService.ts` |
| Resolve active method (primary or fallback)         | `LoginScreen` useEffect → `setActiveMethod`                                               | `screens/LoginScreen.tsx`                                 |
| Auto-trigger biometric on method = biometric        | `LoginScreen` useEffect → `handleBiometricAuth`                                           | `screens/LoginScreen.tsx`                                 |
| PIN digit appended, auto-submit at 6 digits         | `handlePinKeyPress`                                                                       | `screens/LoginScreen.tsx`                                 |
| PIN authentication delegated to provider            | `authService.authenticate('pin', pin)`                                                    | `services/auth/AuthService.ts`                            |
| PIN validated against SQLite user record            | `PinAuthProvider.authenticate` → `userRepository.findByPin`                               | `services/auth/providers/PinAuthProvider.ts`              |
| Biometric OS prompt                                 | `BiometricAuthProvider.authenticate` → `LocalAuth.authenticateAsync`                      | `services/auth/providers/BiometricAuthProvider.ts`        |
| Biometric user lookup from KV store                 | `BiometricAuthProvider.authenticate` → `keyValueRepository.getObject(BIOMETRIC_USER_KEY)` | `services/auth/providers/BiometricAuthProvider.ts`        |
| Password validated against KV store                 | `PasswordAuthProvider.authenticate` → `keyValueRepository.getObject`                      | `services/auth/providers/PasswordAuthProvider.ts`         |
| MagStripe card data captured via hidden input       | `handleCardInput` → `authService.authenticate('magstripe')`                               | `screens/LoginScreen.tsx`                                 |
| MagStripe card matched against enrolled users       | `MagstripeAuthProvider.authenticate` → `keyValueRepository.getObject`                     | `services/auth/providers/MagstripeAuthProvider.ts`        |
| RFID badge data captured via hidden input           | `handleCardInput` → `authService.authenticate('rfid_nfc')`                                | `screens/LoginScreen.tsx`                                 |
| RFID badge matched against enrolled users           | `RfidNfcAuthProvider.authenticate` → `keyValueRepository.getObject`                       | `services/auth/providers/RfidNfcAuthProvider.ts`          |
| Platform token validated via TokenService           | `PlatformAuthProvider.authenticate` → `TokenService.hasValidToken`                        | `services/auth/providers/PlatformAuthProvider.ts`         |
| Platform token refresh on expiry                    | `PlatformAuthProvider.authenticate` → `TokenService.getToken(refresh: true)`              | `services/auth/providers/PlatformAuthProvider.ts`         |
| Method switcher rendered when > 1 provider          | `LoginScreen` render → `showMethodSwitcher`                                               | `screens/LoginScreen.tsx`                                 |
| Method switch clears state and resets biometric ref | `switchMethod`                                                                            | `screens/LoginScreen.tsx`                                 |
| Shake animation on auth failure                     | `startShake` → `Animated.sequence`                                                        | `screens/LoginScreen.tsx`                                 |
| Audit log on success                                | `auditLogService.log('auth:login')`                                                       | `services/audit/AuditLogService.ts`                       |
| Audit log on failure                                | `auditLogService.log('auth:failed')`                                                      | `services/audit/AuditLogService.ts`                       |
| PIN always injected into available providers        | `AuthService.getAvailableProviders` (PIN guard)                                           | `services/auth/AuthService.ts`                            |
| Auth config loaded from KV store                    | `AuthConfigService.load`                                                                  | `services/auth/AuthConfigService.ts`                      |
| Primary method persisted to KV store                | `AuthConfigService.setPrimaryMethod`                                                      | `services/auth/AuthConfigService.ts`                      |
| Allowed methods persisted to KV store               | `AuthConfigService.setAllowedMethods`                                                     | `services/auth/AuthConfigService.ts`                      |
| Hardware method availability flag (magstripe)       | `MagstripeAuthProvider.setHardwareAvailable`                                              | `services/auth/providers/MagstripeAuthProvider.ts`        |
| Hardware method availability flag (RFID/NFC)        | `RfidNfcAuthProvider.setHardwareAvailable`                                                | `services/auth/providers/RfidNfcAuthProvider.ts`          |
