# Onboarding – Wizard EARS Requirements

> **System**: RetailPOS – Onboarding Wizard  
> **Actor**: Admin (first-run setup)  
> **Date**: 2026-04-11  
> **Source**: `screens/OnboardingScreen.tsx`, `screens/onboarding/`, `contexts/OnboardingProvider.tsx`, `hooks/useEcommerceSettings.ts`, `hooks/usePaymentSettings.ts`, `services/config/POSConfigService.ts`

---

## Context

The onboarding wizard runs exactly once — on first launch, before the admin can access the POS. It collects all configuration required to operate the system: e-commerce platform credentials (or offline store setup), payment provider, hardware peripherals, POS operational settings, authentication method, and the first admin user account.

The wizard has two distinct paths determined by the platform choice:

- **Online path** — connects to an existing e-commerce platform (Shopify, WooCommerce, Magento, etc.)
- **Offline path** — standalone mode with a locally managed product catalogue and staff accounts

Once the admin taps "Confirm & Finish" on the Summary step, the onboarding status is persisted as `'completed'` in the key-value store and the wizard is never shown again.

### Actors

| Actor  | Role                                                                        |
| ------ | --------------------------------------------------------------------------- |
| Admin  | Completes the wizard; configures platform, payment, hardware, and users     |
| System | Persists settings, validates connections, gates app entry, routes the steps |

### Step Transition Table

#### Online path (10 steps)

| From                     | To (allowed)               |
| ------------------------ | -------------------------- |
| `welcome`                | `platform_selection`       |
| `platform_selection`     | `platform_configuration`   |
| `platform_configuration` | `payment_provider_setup`   |
| `payment_provider_setup` | `printer_setup`            |
| `printer_setup`          | `scanner_setup`            |
| `scanner_setup`          | `pos_setup`                |
| `pos_setup`              | `auth_method_setup`        |
| `auth_method_setup`      | `admin_user`               |
| `admin_user`             | `summary`                  |
| `summary`                | _(none — wizard complete)_ |

#### Offline path (11 steps)

| From                     | To (allowed)               |
| ------------------------ | -------------------------- |
| `welcome`                | `platform_selection`       |
| `platform_selection`     | `offline_setup`            |
| `offline_setup`          | `admin_user`               |
| `admin_user`             | `staff_setup`              |
| `staff_setup`            | `payment_provider_setup`   |
| `payment_provider_setup` | `printer_setup`            |
| `printer_setup`          | `scanner_setup`            |
| `scanner_setup`          | `pos_setup`                |
| `pos_setup`              | `auth_method_setup`        |
| `auth_method_setup`      | `summary`                  |
| `summary`                | _(none — wizard complete)_ |

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

**1.2** The system shall display a `ProgressIndicator` showing the current step number, total steps, and step labels on every step except `welcome`.

**1.3** The system shall preserve all data entered in the current step when the admin navigates back to a prior step.

**1.4** The system shall route the wizard through the online path when the selected platform is any value other than `'offline'`.

**1.5** The system shall route the wizard through the offline path when the selected platform is `'offline'`.

**1.6** The system shall persist e-commerce settings to the key-value store via `useEcommerceSettings.saveSettings()` before advancing past the Platform Configuration or Offline Store Setup step.

**1.7** The system shall persist POS configuration to `POSConfigService` via `posConfig.updateAll()` when the admin completes the POS Setup step.

**1.8** The system shall validate all required fields on the current step before advancing to the next step, and shall not navigate forward if validation fails.

---

## 2. Event-Driven Requirements

### 2.1 Welcome Step

**2.1.1** When the admin taps "Get Started" on the `welcome` step, the system shall navigate to the `platform_selection` step.

### 2.2 Platform Selection Step

**2.2.1** When the admin selects an online platform (Shopify, WooCommerce, BigCommerce, Magento, Sylius, Wix, PrestaShop, or Squarespace), the system shall store the selected platform ID and navigate to the `platform_configuration` step.

**2.2.2** When the admin selects "Offline Mode", the system shall store `'offline'` as the platform ID and navigate to the `offline_setup` step.

### 2.3 Platform Configuration Step

**2.3.1** When the admin completes the Platform Configuration step, the system shall save the entered credentials (API key, store URL, and webhook secret where applicable) under the platform key in e-commerce settings, call `saveSettings()`, and navigate to the `payment_provider_setup` step.

**2.3.2** When the admin taps "Back" on the Platform Configuration step, the system shall navigate to the `platform_selection` step.

### 2.4 Offline Store Setup Step

**2.4.1** When the admin completes the Offline Store Setup step, the system shall save the store name, currency, and category list to e-commerce settings with `platform: 'offline'`, call `saveSettings()`, and navigate to the `admin_user` step.

**2.4.2** When the admin taps "Back" on the Offline Store Setup step, the system shall navigate to the `platform_selection` step.

### 2.5 Admin User Step

**2.5.1** When the admin creates the admin user account on the `admin_user` step, the system shall navigate to the `staff_setup` step (offline path) or the `summary` step (online path).

**2.5.2** When the admin taps "Back" on the `admin_user` step in offline mode, the system shall navigate to the `offline_setup` step.

**2.5.3** When the admin taps "Back" on the `admin_user` step in online mode, the system shall navigate to the `auth_method_setup` step.

### 2.6 Staff Setup Step

**2.6.1** When the admin completes the Staff Setup step, the system shall navigate to the `payment_provider_setup` step.

**2.6.2** When the admin taps "Back" on the Staff Setup step in offline mode, the system shall navigate to the `platform_selection` step.

**2.6.3** When the admin adds a staff account on the Staff Setup step, the system shall create the account with the entered username and PIN.

### 2.7 Payment Provider Step

**2.7.1** When the admin completes the Payment Provider step, the system shall navigate to the `printer_setup` step.

**2.7.2** When the admin taps "Back" on the Payment Provider step in online mode, the system shall navigate to the `platform_configuration` step.

**2.7.3** When the admin taps "Back" on the Payment Provider step in offline mode, the system shall navigate to the `staff_setup` step.

**2.7.4** When the admin selects a payment provider on the Payment Provider step, the system shall display the credential fields specific to that provider — Stripe (publishable key, secret key), Square (application ID, location ID, access token), or Worldpay (merchant ID, site reference, installation ID).

### 2.8 Printer Setup Step

**2.8.1** When the admin completes or skips the Printer Setup step, the system shall navigate to the `scanner_setup` step.

**2.8.2** When the admin taps "Back" on the Printer Setup step, the system shall navigate to the `payment_provider_setup` step.

### 2.9 Scanner Setup Step

**2.9.1** When the admin completes or skips the Scanner Setup step, the system shall navigate to the `pos_setup` step.

**2.9.2** When the admin taps "Back" on the Scanner Setup step, the system shall navigate to the `printer_setup` step.

### 2.10 POS Setup Step

**2.10.1** When the admin completes the POS Setup step, the system shall call `posConfig.updateAll()` with the entered store name, address, phone, tax rate, currency symbol, max sync retries, and drawer-on-cash setting, then navigate to the `auth_method_setup` step.

**2.10.2** When the admin taps "Back" on the POS Setup step, the system shall navigate to the `scanner_setup` step.

### 2.11 Auth Method Setup Step

**2.11.1** When the admin completes the Auth Method Setup step, the system shall navigate to the `admin_user` step.

**2.11.2** When the admin taps "Back" on the Auth Method Setup step, the system shall navigate to the `pos_setup` step.

**2.11.3** When the Auth Method Setup step is rendered, the system shall pass `selectedPlatform` to the step component so it can determine `authMode` (`'online'` or `'offline'`) and filter the available authentication methods accordingly.

### 2.12 Summary Step

**2.12.1** When the admin taps "Confirm & Finish" on the `summary` step, the system shall call `setIsOnboarded(true)`, which persists `'completed'` to the `onboarding_status` key in the key-value store and navigates to the Login screen.

**2.12.2** When the admin taps "Back" on the `summary` step, the system shall navigate to the `admin_user` step.

---

## 3. State-Driven Requirements

**3.1** While the wizard is in the **online path**, the system shall include the steps `platform_configuration` and exclude `offline_setup` and `staff_setup` from the `STEP_ORDER` array and progress indicator.

**3.2** While the wizard is in the **offline path**, the system shall include `offline_setup` and `staff_setup` and exclude `platform_configuration` from the `STEP_ORDER` array and progress indicator.

**3.3** While the `welcome` step is active, the system shall not render the `ProgressIndicator`.

**3.4** While the `printer_setup` step is active, the system shall render a "Skip" option that advances to `scanner_setup` without requiring a printer connection.

**3.5** While the `scanner_setup` step is active, the system shall render a "Skip" option that advances to `pos_setup` without requiring a scanner connection.

**3.6** While the wizard is in the **online path** and the `auth_method_setup` step is active, the system shall keep `platform_auth` permanently enabled and prevent the admin from disabling it.

**3.7** While the wizard is in the **offline path** and the `auth_method_setup` step is active, the system shall keep PIN authentication permanently enabled and prevent the admin from disabling it.

**3.8** While the wizard is in progress and the admin exits the app before reaching the `summary` step, the system shall retain the `onboarding_status` as absent or `'pending'` so the wizard resumes from the `welcome` step on next launch.

---

## 4. Optional Feature Requirements

**4.1** Where `USE_MOCK_PAYMENT` is `'true'`, the system shall use mock payment service implementations during the Payment Provider step, bypassing real terminal connections.

**4.2** Where `USE_MOCK_SCANNER` is `'true'`, the system shall use mock scanner service implementations during the Scanner Setup step.

**4.3** Where `USE_MOCK_PRINTERS` is `'true'`, the system shall use mock printer service implementations during the Printer Setup step.

**4.4** Where the selected platform is `'shopify'`, the system shall display Shopify-specific credential fields (store URL, API key, access token) in the Platform Configuration step.

**4.5** Where the selected platform is `'woocommerce'`, the system shall display WooCommerce-specific credential fields (store URL, consumer key, consumer secret) in the Platform Configuration step.

**4.6** Where the selected platform is `'magento'`, the system shall display Magento-specific credential fields (store URL, username, password) in the Platform Configuration step.

**4.7** Where the selected platform is `'sylius'`, the system shall display Sylius-specific credential fields (API URL, access token) in the Platform Configuration step.

**4.8** Where the selected platform is `'prestashop'`, the system shall display PrestaShop-specific credential fields (store URL, API key) in the Platform Configuration step.

---

## 5. Unwanted Behaviour / Edge Cases

### 5.1 Already Onboarded

**5.1.1** If the app is launched and `onboarding_status` equals `'completed'` in the key-value store, then the system shall skip the wizard entirely and navigate directly to the Login screen.

### 5.2 Required Fields Missing

**5.2.1** If the admin attempts to advance from the Platform Configuration step without entering all required credentials for the selected platform, then the system shall display a validation error and prevent navigation to the next step.

**5.2.2** If the admin attempts to advance from the POS Setup step without entering a store name, tax rate, or currency symbol, then the system shall display a validation error and prevent navigation.

**5.2.3** If the admin attempts to advance from the Offline Store Setup step without entering a store name, then the system shall display a validation error and prevent navigation.

### 5.3 Connection Test Failure

**5.3.1** If the platform connection test fails during the Platform Configuration step, then the system shall display the error message returned by the service and allow the admin to correct the credentials and retry without losing entered data.

**5.3.2** If the payment provider connection test fails during the Payment Provider step, then the system shall display the error message and allow the admin to retry or skip the test.

### 5.4 Admin User Creation

**5.4.1** If the admin attempts to create an admin user with a PIN that is already in use, then the system shall reject the submission and display a "PIN already taken" error.

**5.4.2** If the admin attempts to create an admin user with a PIN shorter than 6 digits, then the system shall reject the submission and display a validation error.

### 5.5 Hardware Connectivity

**5.5.1** If the printer discovery scan returns no devices during the Printer Setup step, then the system shall display a "No printers found" message and offer the admin the option to retry discovery or skip the step.

**5.5.2** If the printer connection attempt fails during the Printer Setup step, then the system shall display the connection error and allow the admin to retry or skip the step.

**5.5.3** If the scanner discovery scan returns no devices during the Scanner Setup step, then the system shall display a "No scanners found" message and offer the admin the option to retry discovery or skip the step.

**5.5.4** If the scanner connection attempt fails during the Scanner Setup step, then the system shall display the connection error and allow the admin to retry or skip the step.

### 5.6 Settings Persistence Failure

**5.6.1** If `saveSettings()` throws an error during the Platform Configuration or Offline Store Setup step, then the system shall display an error message and prevent navigation to the next step until the save succeeds.

**5.6.2** If `posConfig.updateAll()` throws an error during the POS Setup step, then the system shall display an error message and prevent navigation to the next step.

---

## 6. Complex Requirements

**6.1** When the admin completes the POS Setup step while in the **offline path**, the system shall persist all POS config values via `posConfig.updateAll()` and navigate to the `auth_method_setup` step — the same behaviour as the online path, since POS config is path-independent.

**6.2** When the admin taps "Confirm & Finish" on the Summary step and all required settings are present, the system shall simultaneously call `setIsOnboarded(true)` (which writes `'completed'` to the key-value store) and trigger navigation to the Login screen via `OnboardingProvider`.

**6.3** When the admin selects a platform on the Platform Selection step, the system shall simultaneously store the platform ID in local state, determine the correct path (online or offline), and render the appropriate next step — `platform_configuration` for online platforms or `offline_setup` for `'offline'`.

---

## 7. Onboarding Wizard Lifecycle Summary

### Online path

```
welcome
  → platform_selection
    → platform_configuration
      → payment_provider_setup
        → printer_setup (skippable)
          → scanner_setup (skippable)
            → pos_setup
              → auth_method_setup
                → admin_user
                  → summary
                    → [Login Screen]
```

### Offline path

```
welcome
  → platform_selection
    → offline_setup
      → admin_user
        → staff_setup
          → payment_provider_setup
            → printer_setup (skippable)
              → scanner_setup (skippable)
                → pos_setup
                  → auth_method_setup
                    → summary
                      → [Login Screen]
```

### Configuration written during wizard

| Step                   | Persisted via                         | Key / Store                    |
| ---------------------- | ------------------------------------- | ------------------------------ |
| Platform Configuration | `useEcommerceSettings.saveSettings()` | `ecommerceSettings` (KV store) |
| Offline Store Setup    | `useEcommerceSettings.saveSettings()` | `ecommerceSettings` (KV store) |
| Payment Provider       | `usePaymentSettings.saveSettings()`   | `paymentSettings` (KV store)   |
| Printer Setup          | `usePrinterSettings.saveSettings()`   | `printerSettings` (KV store)   |
| Scanner Setup          | `useScannerSettings.saveSettings()`   | `scannerSettings` (KV store)   |
| POS Setup              | `posConfig.updateAll()`               | `pos.*` keys (KV store)        |
| Auth Method Setup      | `useAuthSettings.saveSettings()`      | `authSettings` (KV store)      |
| Admin User             | `useUsers.createUser()`               | `users` (SQLite table)         |
| Summary / Confirm      | `OnboardingProvider.setIsOnboarded()` | `onboarding_status` (KV store) |

---

## 8. Component Traceability

| Requirement (summary)                                       | Component / Hook / Service                       | Source File                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| App launch → check onboarding status                        | `OnboardingProvider` (useEffect)                 | `contexts/OnboardingProvider.tsx`                                            |
| Welcome → navigate to platform selection                    | `handleNextFromWelcome`                          | `screens/OnboardingScreen.tsx`                                               |
| Platform selected (online) → platform config                | `handlePlatformSelect`                           | `screens/OnboardingScreen.tsx`                                               |
| Platform selected (offline) → offline setup                 | `handlePlatformSelect`                           | `screens/OnboardingScreen.tsx`                                               |
| Platform config complete → save + payment step              | `handleNextFromPlatformConfig`                   | `screens/OnboardingScreen.tsx`                                               |
| Offline setup complete → save + admin user step             | `handleNextFromOfflineSetup`                     | `screens/OnboardingScreen.tsx`                                               |
| Admin user created (online) → summary                       | `handleNextFromAdminUser`                        | `screens/OnboardingScreen.tsx`                                               |
| Admin user created (offline) → staff setup                  | `handleNextFromAdminUser`                        | `screens/OnboardingScreen.tsx`                                               |
| Staff setup complete → payment step                         | `handleNextFromStaffSetup`                       | `screens/OnboardingScreen.tsx`                                               |
| Payment complete → printer step                             | `handleNextFromPayment`                          | `screens/OnboardingScreen.tsx`                                               |
| Printer complete/skip → scanner step                        | `handleNextFromPrinter`                          | `screens/OnboardingScreen.tsx`                                               |
| Scanner complete/skip → POS setup step                      | `handleNextFromScanner`                          | `screens/OnboardingScreen.tsx`                                               |
| POS setup complete → persist config + auth step             | `handleNextFromPOSSetup` + `posConfig.updateAll` | `screens/OnboardingScreen.tsx`, `services/config/POSConfigService.ts`        |
| Auth method complete → admin user step                      | `handleNextFromAuthMethodSetup`                  | `screens/OnboardingScreen.tsx`                                               |
| Summary confirmed → set onboarded + navigate                | `handleOnboardingComplete` + `setIsOnboarded`    | `screens/OnboardingScreen.tsx`, `contexts/OnboardingProvider.tsx`            |
| Onboarding status persisted to KV store                     | `OnboardingProvider.setIsOnboarded`              | `contexts/OnboardingProvider.tsx`                                            |
| E-commerce settings saved                                   | `useEcommerceSettings.saveSettings`              | `hooks/useEcommerceSettings.ts`                                              |
| POS config persisted                                        | `posConfig.updateAll`                            | `services/config/POSConfigService.ts`                                        |
| Progress indicator rendered                                 | `ProgressIndicator`                              | `components/ProgressIndicator.tsx`                                           |
| Step order (online)                                         | `STEP_ORDER` (online branch)                     | `screens/OnboardingScreen.tsx`                                               |
| Step order (offline)                                        | `STEP_ORDER` (offline branch)                    | `screens/OnboardingScreen.tsx`                                               |
| Auth mode passed to auth step                               | `AuthMethodSetupStep` prop `selectedPlatform`    | `screens/OnboardingScreen.tsx`, `screens/onboarding/AuthMethodSetupStep.tsx` |
| platform_auth always on (online)                            | `AuthMethodSetupStep` (online mode filter)       | `screens/onboarding/AuthMethodSetupStep.tsx`                                 |
| PIN always on (offline)                                     | `AuthMethodSetupStep` (offline mode filter)      | `screens/onboarding/AuthMethodSetupStep.tsx`                                 |
| Staff account created with username + PIN                   | `StaffSetupStep` + `useUsers.createUser`         | `screens/onboarding/StaffSetupStep.tsx`                                      |
| Payment provider credential fields (Stripe/Square/Worldpay) | `PaymentProviderStep`                            | `screens/onboarding/PaymentProviderStep.tsx`                                 |
| Printer discovery failure → retry or skip                   | `PrinterSetupStep`                               | `screens/onboarding/PrinterSetupStep.tsx`                                    |
| Scanner discovery failure → retry or skip                   | `ScannerSetupStep`                               | `screens/onboarding/ScannerSetupStep.tsx`                                    |
