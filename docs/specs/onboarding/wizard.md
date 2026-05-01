# Onboarding – Wizard EARS Requirements

> **System**: RetailPOS – Onboarding Wizard  
> **Actor**: Admin (first-run setup)  
> **Date**: 2026-04-11  
> **Source**: `screens/OnboardingScreen.tsx`, `screens/onboarding/`, `contexts/OnboardingProvider.tsx`, `hooks/useEcommerceSettings.ts`, `hooks/usePaymentSettings.ts`, `services/config/POSConfigService.ts`

---

## Context

The onboarding wizard runs exactly once — on first launch, before the admin can access the POS. It is intentionally minimal and focuses on time-to-first-sale.

Mandatory onboarding is reduced to three phases:

1. **Platform setup** (platform selection + credentials/offline basics)
2. **Admin user setup** (create first admin account)
3. **Peripherals setup** (basic printer/scanner/payment terminal, skippable)

All non-critical and capability-dependent setup is deferred to More → Settings after first login. This includes advanced POS configuration, optional modules, and platform-specific advanced features.

Once the admin completes these three phases, onboarding status is persisted as `'completed'` in key-value store and the wizard is never shown again.

### Actors

| Actor  | Role                                                                        |
| ------ | --------------------------------------------------------------------------- |
| Admin  | Completes the wizard; configures platform, payment, hardware, and users     |
| System | Persists settings, validates connections, gates app entry, routes the steps |

### Step Transition Table

| From                | To (allowed)                   |
| ------------------- | ------------------------------ |
| `platform_setup`    | `admin_user_setup`             |
| `admin_user_setup`  | `peripherals_setup`            |
| `peripherals_setup` | _(none — onboarding complete)_ |

### Deferred Setup Policy

The following areas are **not required** in onboarding and are deferred to More → Settings based on selected platform capabilities:

- Advanced POS configuration
- Authentication method customization
- Staff setup (beyond first admin)
- Discounts / gift cards / refunds advanced settings
- Capability-dependent optional modules

### POS Configuration Defaults

| `POSConfigService` field | Default at wizard start | Configurable after onboarding |
| ------------------------ | ----------------------- | ----------------------------- |
| `storeName`              | _(none — required)_     | Yes — General Settings tab    |
| `storeAddress`           | _(none — optional)_     | Yes — General Settings tab    |
| `storePhone`             | _(none — optional)_     | Yes — General Settings tab    |
| `taxRate`                | _(none — required)_     | Yes — POS Config tab          |
| `currencySymbol`         | _(none — required)_     | Yes — General Settings tab    |
| `maxSyncRetries`         | `3`                     | Yes — POS Config tab          |
| `drawerOpenOnCash`       | `false`                 | Yes — POS Config tab          |

---

## 1. Ubiquitous Requirements

**1.1** The system shall display the onboarding wizard only when the `onboarding_status` key in the key-value store is absent or not equal to `'completed'`.

**1.2** The system shall display a `ProgressIndicator` showing current phase out of three mandatory phases.

**1.3** The system shall preserve all data entered in the current step when the admin navigates back to a prior step.

**1.4** The system shall use a unified minimal onboarding path for all platforms; platform differences only affect fields and validation inside `platform_setup`.

**1.6** The system shall persist e-commerce settings to the key-value store via `useEcommerceSettings.saveSettings()` before advancing past the Platform Configuration or Offline Store Setup step.

**1.7** The system shall persist setup-phase completion metadata so deferred setup tasks can be shown in More menu after first login.

**1.8** The system shall validate all required fields on the current step before advancing to the next step, and shall not navigate forward if validation fails.

**1.9** The onboarding specification is capability-first. Any requirement in this file that references legacy step names (`platform_configuration`, `offline_setup`, `staff_setup`, `pos_setup`, `auth_method_setup`, `summary`) is deprecated and non-normative.

**1.10** Deferred setup items shall be discoverable from More menu and Settings after first login, using platform capability composition.

---

## 1A. Minimal Onboarding Event Requirements (Authoritative)

### 1A.1 Platform setup

**1A.1.1** When onboarding starts, the system shall present platform setup first.

**1A.1.2** When the selected platform is online, the system shall require minimum credentials and allow connection test before continue.

**1A.1.3** When the selected platform is offline, the system shall require offline store basics only.

### 1A.2 Admin user setup

**1A.2.1** After platform setup is complete, the system shall require creation of the first admin user before continue.

### 1A.3 Peripherals setup

**1A.3.1** After admin user setup, the system shall present peripherals setup (printer/scanner/payment terminal baseline) with explicit skip option.

**1A.3.2** Skipping peripherals setup shall not block onboarding completion.

### 1A.4 Completion

**1A.4.1** When the three mandatory phases are complete, the system shall set onboarding status to `completed` and route to login.

**1A.4.2** The system shall persist setup progress/deferred feature markers so More menu can show "finish setup" items.

---

## 2. State-Driven Requirements

**2.1** While onboarding is in progress, the progress UI shall expose exactly three phases: `platform_setup`, `admin_user_setup`, `peripherals_setup`.

**2.2** While `peripherals_setup` is active, the system shall allow skipping printer/scanner/payment terminal configuration and still allow completion.

**2.3** While onboarding is incomplete, the app shall continue showing onboarding on launch.

**2.4** While onboarding is complete (`onboarding_status = 'completed'`), the app shall bypass onboarding and continue to authentication flow.

---

## 3. Optional Feature Requirements

**3.1** Where `USE_MOCK_PAYMENT` is `'true'`, payment terminal setup in peripherals phase may use mock providers.

**3.2** Where `USE_MOCK_SCANNER` is `'true'`, scanner setup in peripherals phase may use mock scanners.

**3.3** Where `USE_MOCK_PRINTERS` is `'true'`, printer setup in peripherals phase may use mock printers.

---

## 4. Unwanted Behaviour / Edge Cases

**4.1** If onboarding is already complete, launching the app shall not render onboarding.

**4.2** If platform setup validation fails (missing credentials or invalid offline basics), onboarding shall not advance.

**4.3** If admin user creation fails validation (PIN policy, duplicate PIN), onboarding shall not advance.

**4.4** If peripheral discovery/connection fails, onboarding shall allow retry or skip and shall not block completion.

**4.5** If settings persistence fails during any phase, onboarding shall surface the error and prevent advancing until save succeeds.

---

## 5. Onboarding Lifecycle Summary

```
platform_setup
  → admin_user_setup
    → peripherals_setup (skippable details)
      → set onboarding completed
        → [Login Screen]
```

### Configuration written during onboarding

| Phase             | Persisted via                         | Key / Store                                              |
| ----------------- | ------------------------------------- | -------------------------------------------------------- |
| Platform setup    | `useEcommerceSettings.saveSettings()` | `ecommerceSettings` (KV store)                           |
| Admin user setup  | `useUsers.createUser()`               | `users` (SQLite table)                                   |
| Peripherals setup | Peripheral settings services          | `printerSettings` / `scannerSettings` / payment settings |
| Completion        | `OnboardingProvider.setIsOnboarded()` | `onboarding_status` (KV store)                           |

### Component Traceability

| Requirement (summary)                 | Component / Hook / Service                     | Source File                              |
| ------------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| Onboarding status gate                | `OnboardingProvider`                           | `contexts/OnboardingProvider.tsx`        |
| Platform setup phase                  | `OnboardingScreen` + platform setup components | `screens/OnboardingScreen.tsx`           |
| Admin user setup phase                | onboarding admin user component + users hooks  | `screens/onboarding/`, `hooks/useUsers*` |
| Peripherals setup phase               | printer/scanner/payment setup components       | `screens/onboarding/`                    |
| Completion writes `onboarding_status` | `setIsOnboarded(true)`                         | `contexts/OnboardingProvider.tsx`        |
