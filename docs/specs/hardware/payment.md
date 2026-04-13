# Payment Terminal – EARS Requirements

> **System**: RetailPOS – Payment Terminal
> **Actor**: Cashier, System
> **Date**: 2026-04-13
> **Source**: `services/payment/PaymentServiceInterface.ts`, `services/payment/PaymentServiceFactory.ts`, `services/payment/PaymentService.ts`, `services/payment/StripeService.ts`, `services/payment/StripeNfcService.ts`, `services/payment/SquareService.ts`, `services/payment/WorldpayService.ts`, `services/payment/ElectronPaymentService.ts`, `hooks/usePayment.ts`

---

## Context

The payment subsystem abstracts five provider implementations — `worldpay`, `stripe`, `stripe_nfc`, `square`, and `electron_stripe` — behind a common `PaymentServiceInterface`. A singleton `PaymentServiceFactory` selects the active provider at runtime based on the configured provider, environment variables, and platform detection.

`PaymentService` acts as a unified delegate: it holds a reference to the currently active provider service and forwards all calls to it. The active provider can be swapped at runtime via `setPaymentProvider()`. Optional interface methods (`getTransactionStatus`, `voidTransaction`, `refundTransaction`) are not required to be implemented by every provider; callers must handle the `'not supported'` rejection.

Square and Electron services are lazy-loaded via `require()` to avoid bundling issues on platforms where they are not used.

### Provider Selection

| Condition                   | Provider Selected                                  |
| --------------------------- | -------------------------------------------------- |
| `USE_MOCK_PAYMENT=true`     | Mock service (any provider)                        |
| `isElectron()` and not mock | `ELECTRON_STRIPE`                                  |
| Neither condition           | Configured `currentProvider` (default: `WORLDPAY`) |

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

**1.4** The default provider shall be `WORLDPAY` when no provider has been explicitly configured and the environment is not Electron.

**1.5** `processPayment(request)` shall require `amount` and `reference` to be present in the `PaymentRequest`; all other fields are optional.

**1.6** Every `PaymentResponse` shall include `success` and `timestamp` fields regardless of outcome.

---

## 2. Event-Driven Requirements

### 2.1 Factory — Provider Selection

**2.1.1** When `PaymentServiceFactory.getPaymentService()` is called with `USE_MOCK_PAYMENT=true`, the system shall return a mock payment service regardless of the configured provider or platform.

**2.1.2** When `PaymentServiceFactory.getPaymentService()` is called on Electron without `USE_MOCK_PAYMENT`, the system shall automatically select `ELECTRON_STRIPE` as the active provider.

**2.1.3** When `PaymentServiceFactory.getPaymentService()` is called outside Electron without `USE_MOCK_PAYMENT`, the system shall return the service for `currentProvider`.

**2.1.4** When `PaymentService.setPaymentProvider(provider)` is called, the system shall update `currentProvider` and immediately swap the active service to the implementation for the new provider.

### 2.2 Terminal Lifecycle

**2.2.1** When `connectToTerminal(deviceId)` is called, the system shall establish a connection to the specified payment terminal and resolve when the terminal is ready to accept transactions.

**2.2.2** When `processPayment(request)` is called before `connectToTerminal()` has been called, the system shall return a `PaymentResponse` with `success: false` and an appropriate `errorMessage`.

**2.2.3** When `disconnect()` is called, the system shall terminate the active terminal connection and release all associated resources.

**2.2.4** When `usePayment` hook unmounts, the system shall call `disconnect()` on the active payment service.

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

**2.5.2** When the `require()` call for the Square SDK throws a load error, the system shall catch the error and fall back to the mock payment service for the remainder of the session.

### 2.6 Electron Payment Service — Lazy Loading

**2.6.1** When `ElectronPaymentService` is first instantiated, the system shall load the implementation via `require('./ElectronPaymentService')` to avoid bundling it in non-Electron builds.

### 2.7 Optional Methods

**2.7.1** When `getTransactionStatus(transactionId)` is called on a provider that does not implement it, the system shall return a rejected promise with the message `'not supported'`.

**2.7.2** When `voidTransaction(transactionId)` is called on a provider that does not implement it, the system shall return a rejected promise with the message `'not supported'`.

**2.7.3** When `refundTransaction(transactionId, amount)` is called on a provider that does not implement it, the system shall return a rejected promise with the message `'not supported'`.

---

## 3. State-Driven Requirements

**3.1** While `isTerminalConnected()` returns `false`, `processPayment()` shall not submit a transaction to the provider — it shall return a failure response immediately.

**3.2** While `USE_MOCK_PAYMENT=true`, all provider selection logic is bypassed — the mock service handles every call regardless of `currentProvider` or platform.

**3.3** While running on Electron without `USE_MOCK_PAYMENT`, `currentProvider` is always treated as `ELECTRON_STRIPE` — manual calls to `setPaymentProvider()` with other providers are overridden by the factory.

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

**5.4** If the Square SDK `require()` fails and the mock fallback is activated, the system shall log the load error via the logger so it is visible in development builds.

**5.5** If `disconnect()` is called when no terminal is connected, the system shall silently do nothing — it shall not throw.

**5.6** If `getAvailableTerminals()` is called while no terminal discovery is supported by the active provider, the system shall return an empty array.

---

## 6. Component Traceability

| Requirement (summary)                                      | Component / Service                       | Source File                                   |
| ---------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Factory singleton, env + platform selection                | `PaymentServiceFactory.getPaymentService` | `services/payment/PaymentServiceFactory.ts`   |
| `USE_MOCK_PAYMENT` bypasses all real providers             | `PaymentServiceFactory.getPaymentService` | `services/payment/PaymentServiceFactory.ts`   |
| Electron auto-selects `ELECTRON_STRIPE`                    | `PaymentServiceFactory.getPaymentService` | `services/payment/PaymentServiceFactory.ts`   |
| Default provider `WORLDPAY`                                | `PaymentServiceFactory` default config    | `services/payment/PaymentServiceFactory.ts`   |
| `setPaymentProvider()` swaps active service                | `PaymentService.setPaymentProvider`       | `services/payment/PaymentService.ts`          |
| Delegate pattern — all calls forwarded to active service   | `PaymentService` method implementations   | `services/payment/PaymentService.ts`          |
| `PaymentServiceInterface` contract                         | `PaymentServiceInterface`                 | `services/payment/PaymentServiceInterface.ts` |
| `PaymentRequest` shape                                     | `PaymentRequest` interface                | `services/payment/PaymentServiceInterface.ts` |
| `PaymentResponse` shape                                    | `PaymentResponse` interface               | `services/payment/PaymentServiceInterface.ts` |
| `connectToTerminal` / `disconnect` / `isTerminalConnected` | Provider implementations                  | `services/payment/StripeService.ts` etc.      |
| `getAvailableTerminals` for device discovery               | Provider implementations                  | `services/payment/StripeService.ts` etc.      |
| Square lazy-load via `require()`                           | `SquareService` constructor               | `services/payment/SquareService.ts`           |
| Square mock fallback on load error                         | `SquareService` constructor catch         | `services/payment/SquareService.ts`           |
| Electron service lazy-load via `require()`                 | `ElectronPaymentService` loader           | `services/payment/ElectronPaymentService.ts`  |
| Optional methods throw `'not supported'`                   | Provider base / individual providers      | `services/payment/PaymentServiceInterface.ts` |
| `disconnect()` on unmount                                  | `usePayment` cleanup                      | `hooks/usePayment.ts`                         |
| `disconnect()` on provider switch                          | `PaymentService.setPaymentProvider`       | `services/payment/PaymentService.ts`          |
| Payment result feeds `CheckoutService.completePayment`     | `usePayment.processPayment`               | `hooks/usePayment.ts`                         |
