# Payment Terminal – EARS Requirements

> **System**: RetailPOS – Payment Terminal
> **Actor**: Cashier, System
> **Date**: 2026-05-09
> **Source**: `services/payment/PaymentServiceInterface.ts`, `services/payment/PaymentServiceFactory.ts`, `services/payment/PaymentService.ts`, `services/payment/StripeService.ts`, `services/payment/StripeNfcService.ts`, `services/payment/SquareService.ts`, `services/payment/AdyenService.ts`, `services/payment/TapPaymentsService.ts`, `services/payment/mock/MockPaymentService.ts`, `hooks/usePayment.ts`

---

## Context

The payment subsystem abstracts tap-to-pay React Native SDK implementations behind a common `PaymentServiceInterface`. Only providers that ship a React Native SDK for contactless (tap-to-pay) payments on mobile and tablet are supported in this layer. Providers that require a physical PED or a desktop integration are handled by the Instore API and are outside the scope of this service.

A singleton `PaymentServiceFactory` selects the active provider at runtime based on the configured `PaymentProvider`, environment variables, and whether the app is running in Expo Go. `PaymentService` acts as a unified delegate: it holds a reference to the currently active provider service and forwards all calls to it. The active provider can be swapped at runtime via `setPaymentProvider()`.

Optional interface methods (`getTransactionStatus`, `voidTransaction`, `refundTransaction`) are not required to be implemented by every provider; callers must handle the `'not supported'` rejection.

Square, Adyen, and Tap Payments services are lazy-loaded via `require()` to avoid bundling their SDKs on platforms where they are not used.

### Architecture Boundary

This layer is **tap-to-pay only**. Providers without a React Native SDK must be integrated through the Instore API (`InstoreApiTransport`). There is no Electron payment path in this layer — desktop builds route payments through the Instore API.

### Supported Providers

| Provider     | Enum           | Real service         | Notes                               |
| ------------ | -------------- | -------------------- | ----------------------------------- |
| Stripe NFC   | `STRIPE_NFC`   | `StripeNfcService`   | Stripe Terminal SDK, NFC/tap-to-pay |
| Stripe       | `STRIPE`       | `StripeService`      | Stripe Terminal SDK, reader-based   |
| Square       | `SQUARE`       | `SquareService`      | Square In-Person Payments SDK       |
| Adyen        | `ADYEN`        | `AdyenService`       | Adyen Terminal API React Native     |
| Tap Payments | `TAP_PAYMENTS` | `TapPaymentsService` | Tap Payments React Native SDK       |

### Mock Strategy

A single `MockPaymentService` replaces all real provider implementations when:

- The app is running in Expo Go (no native modules available), or
- `USE_MOCK_PAYMENT=true` is set in the environment.

`MockPaymentService` simulates the full provider lifecycle with realistic stub data so the UI can be exercised without real hardware.

### Provider Selection

| Condition                          | Provider Selected                                    |
| ---------------------------------- | ---------------------------------------------------- |
| Expo Go or `USE_MOCK_PAYMENT=true` | `MockPaymentService` (all providers)                 |
| Neither condition                  | Configured `currentProvider` (default: `STRIPE_NFC`) |

### PaymentRequest Fields

| Field          | Required | Description                            |
| -------------- | -------- | -------------------------------------- |
| `amount`       | Yes      | Payment amount in minor currency units |
| `reference`    | Yes      | Unique transaction reference           |
| `currency`     | No       | ISO 4217 currency code                 |
| `orderId`      | No       | Associated order ID                    |
| `customerName` | No       | Customer display name                  |
| `itemCount`    | No       | Number of line items                   |
| `items`        | No       | Array of line item descriptors         |

### PaymentResponse Fields

| Field           | Present    | Description                       |
| --------------- | ---------- | --------------------------------- |
| `success`       | Always     | Whether the transaction succeeded |
| `transactionId` | On success | Provider transaction identifier   |
| `receiptNumber` | On success | Receipt reference                 |
| `errorMessage`  | On failure | Human-readable error              |
| `errorCode`     | On failure | Machine-readable error code       |
| `timestamp`     | Always     | Unix ms timestamp of the response |
| `amount`        | On success | Confirmed amount charged          |
| `paymentMethod` | On success | e.g. `'card'`, `'contactless'`    |
| `cardBrand`     | On success | e.g. `'Visa'`, `'Mastercard'`     |
| `last4`         | On success | Last four digits of the card      |

---

## 1. Ubiquitous Requirements

**1.1** The system shall expose all payment provider implementations through `PaymentServiceInterface`, providing `connectToTerminal(deviceId)`, `processPayment(request)`, `disconnect()`, `isTerminalConnected()`, `getConnectedDeviceId()`, and `getAvailableTerminals()`.

**1.2** `PaymentServiceFactory` shall be a singleton — a single instance is shared across the application for the lifetime of the session.

**1.3** `PaymentService` shall delegate all interface method calls to the currently active provider service without adding business logic.

**1.4** The default provider shall be `STRIPE_NFC` when no provider has been explicitly configured.

**1.5** `processPayment(request)` shall require `amount` and `reference` to be present in the `PaymentRequest`; all other fields are optional.

**1.6** Every `PaymentResponse` shall include `success` and `timestamp` fields regardless of outcome.

**1.7** The system shall only accept `STRIPE_NFC`, `STRIPE`, `SQUARE`, `ADYEN`, and `TAP_PAYMENTS` as valid provider values. Any other value shall be rejected with `'Unsupported payment provider: <value>'`.

---

## 2. Event-Driven Requirements

### 2.1 Factory — Provider Selection

**2.1.1** When `PaymentServiceFactory.getPaymentService()` is called in Expo Go or with `USE_MOCK_PAYMENT=true`, the system shall return `MockPaymentService.getInstance()` regardless of the configured provider.

**2.1.2** When `PaymentServiceFactory.getPaymentService()` is called in a production build without `USE_MOCK_PAYMENT`, the system shall return the real SDK service for `currentProvider`.

**2.1.3** When `PaymentService.setPaymentProvider(provider)` is called, the system shall update `currentProvider` and immediately swap the active service to the implementation for the new provider.

### 2.2 Terminal Lifecycle

**2.2.1** When `connectToTerminal(deviceId)` is called, the system shall establish a connection to the specified payment terminal and resolve when the terminal is ready to accept transactions.

**2.2.2** When `processPayment(request)` is called before `connectToTerminal()` has been called, the system shall return a `PaymentResponse` with `success: false` and an appropriate `errorMessage`.

**2.2.3** When `disconnect()` is called, the system shall terminate the active terminal connection and release all associated resources.

**2.2.4** When the `usePayment` hook unmounts, the system shall call `disconnect()` on the active payment service.

**2.2.5** When `setPaymentProvider()` swaps the active provider, the system shall call `disconnect()` on the previous provider before activating the new one.

### 2.3 Processing a Payment

**2.3.1** When `processPayment(request)` is called on a connected terminal, the system shall submit the payment request to the provider and return a `PaymentResponse` on completion.

**2.3.2** When the provider returns a successful transaction, the system shall populate `transactionId`, `receiptNumber`, `amount`, `paymentMethod`, `cardBrand`, and `last4` in the `PaymentResponse` where available.

**2.3.3** When the provider returns a failure, the system shall populate `errorMessage` and `errorCode` in the `PaymentResponse` and set `success: false`.

**2.3.4** When `usePayment.processPayment(request)` completes, the system shall pass the `PaymentResponse` to `CheckoutService.completePayment()` to finalise the order.

### 2.4 Device Discovery

**2.4.1** When `getAvailableTerminals()` is called, the system shall return a list of discoverable payment terminal devices for the active provider.

**2.4.2** When `isTerminalConnected()` is called, the system shall return `true` if a terminal connection is currently active, `false` otherwise.

**2.4.3** When `getConnectedDeviceId()` is called, the system shall return the device ID of the currently connected terminal, or `null` if no terminal is connected.

### 2.5 Square — Lazy Loading

**2.5.1** When `SquareService` is first instantiated, the system shall load the Square SDK via `require()` to avoid bundling the SDK on platforms where it is not used.

**2.5.2** When the `require()` call for the Square SDK throws a load error, the system shall catch the error, log a warning, and fall back to `MockPaymentService` for the remainder of the session.

### 2.6 Adyen — Lazy Loading

**2.6.1** When `AdyenService` is first instantiated, the system shall load the Adyen SDK via `require()` to avoid bundling the SDK on platforms where it is not used.

**2.6.2** When the `require()` call for the Adyen SDK throws a load error, the system shall catch the error, log a warning, and fall back to `MockPaymentService` for the remainder of the session.

### 2.7 Tap Payments — Lazy Loading

**2.7.1** When `TapPaymentsService` is first instantiated, the system shall load the Tap Payments SDK via `require()` to avoid bundling the SDK on platforms where it is not used.

**2.7.2** When the `require()` call for the Tap Payments SDK throws a load error, the system shall catch the error, log a warning, and fall back to `MockPaymentService` for the remainder of the session.

### 2.8 Optional Methods

**2.8.1** When `getTransactionStatus(transactionId)` is called on a provider that does not implement it, the system shall return a rejected promise with the message `'getTransactionStatus not supported by the current payment provider'`.

**2.8.2** When `voidTransaction(transactionId)` is called on a provider that does not implement it, the system shall return a rejected promise with the message `'voidTransaction not supported by the current payment provider'`.

**2.8.3** When `refundTransaction(transactionId, amount)` is called on a provider that does not implement it, the system shall return a rejected promise with the message `'refundTransaction not supported by the current payment provider'`.

---

## 3. State-Driven Requirements

**3.1** While `isTerminalConnected()` returns `false`, `processPayment()` shall not submit a transaction to the provider — it shall return a failure response immediately.

**3.2** While in Expo Go or `USE_MOCK_PAYMENT=true`, all provider selection logic is bypassed — `MockPaymentService` handles every call regardless of `currentProvider`.

---

## 4. Optional Feature Requirements

**4.1** Where a provider implements `getTransactionStatus(transactionId)`, callers may poll for the status of an in-flight or recently completed transaction.

**4.2** Where a provider implements `voidTransaction(transactionId)`, callers may cancel an authorised but not yet captured transaction.

**4.3** Where a provider implements `refundTransaction(transactionId, amount)`, callers may initiate a partial or full refund against a completed transaction.

**4.4** Where `PaymentRequest.items` is populated, providers that support itemised receipts (e.g. Stripe) may use the line item data to generate an itemised receipt.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If `processPayment()` throws an unhandled exception (e.g. network timeout), the system shall catch the error and return a `PaymentResponse` with `success: false` and the error message — it shall not propagate the exception to the caller.

**5.2** If `connectToTerminal()` is called while a connection is already active, the system shall disconnect the existing connection before establishing the new one.

**5.3** If `setPaymentProvider()` is called with the same provider that is already active, the system shall perform no operation — no disconnect/reconnect cycle is triggered.

**5.4** If any SDK `require()` fails and the mock fallback is activated, the system shall log the load error via the logger so it is visible in development builds.

**5.5** If `disconnect()` is called when no terminal is connected, the system shall silently do nothing — it shall not throw.

**5.6** If `getAvailableTerminals()` is called while no terminal discovery is supported by the active provider, the system shall return an empty array.

**5.7** If `setPaymentProvider()` is called with a value outside the supported set (`STRIPE_NFC`, `STRIPE`, `SQUARE`, `ADYEN`, `TAP_PAYMENTS`), the system shall throw `'Unsupported payment provider: <value>'` immediately without modifying `currentProvider`.

---

## 6. Component Traceability

| Requirement (summary)                                      | Component / Service                       | Source File                                   |
| ---------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Factory singleton, env + Expo Go selection                 | `PaymentServiceFactory.getPaymentService` | `services/payment/PaymentServiceFactory.ts`   |
| `USE_MOCK_PAYMENT` / Expo Go bypasses real providers       | `PaymentServiceFactory.getPaymentService` | `services/payment/PaymentServiceFactory.ts`   |
| Default provider `STRIPE_NFC`                              | `PaymentServiceFactory` default config    | `services/payment/PaymentServiceFactory.ts`   |
| Unsupported provider guard                                 | `PaymentServiceFactory` (default throw)   | `services/payment/PaymentServiceFactory.ts`   |
| `setPaymentProvider()` swaps active service                | `PaymentService.setPaymentProvider`       | `services/payment/PaymentService.ts`          |
| Delegate pattern — all calls forwarded to active service   | `PaymentService` method implementations   | `services/payment/PaymentService.ts`          |
| `PaymentServiceInterface` contract                         | `PaymentServiceInterface`                 | `services/payment/PaymentServiceInterface.ts` |
| `PaymentRequest` shape                                     | `PaymentRequest` interface                | `services/payment/PaymentServiceInterface.ts` |
| `PaymentResponse` shape                                    | `PaymentResponse` interface               | `services/payment/PaymentServiceInterface.ts` |
| `connectToTerminal` / `disconnect` / `isTerminalConnected` | Provider implementations                  | `services/payment/StripeService.ts` etc.      |
| `getAvailableTerminals` for device discovery               | Provider implementations                  | `services/payment/StripeService.ts` etc.      |
| Square lazy-load via `require()`                           | `SquareService` constructor               | `services/payment/SquareService.ts`           |
| Adyen lazy-load via `require()`                            | `AdyenService` constructor                | `services/payment/AdyenService.ts`            |
| Tap Payments lazy-load via `require()`                     | `TapPaymentsService` constructor          | `services/payment/TapPaymentsService.ts`      |
| SDK load fallback to `MockPaymentService`                  | Provider constructor catch blocks         | `services/payment/*.ts`                       |
| Optional methods throw `'not supported'`                   | Provider base / individual providers      | `services/payment/PaymentServiceInterface.ts` |
| `disconnect()` on unmount                                  | `usePayment` cleanup                      | `hooks/usePayment.ts`                         |
| `disconnect()` on provider switch                          | `PaymentService.setPaymentProvider`       | `services/payment/PaymentService.ts`          |
| Payment result feeds `CheckoutService.completePayment`     | `usePayment.processPayment`               | `hooks/usePayment.ts`                         |
| Full lifecycle mock simulation                             | `MockPaymentService`                      | `services/payment/mock/MockPaymentService.ts` |
