# Payments – EARS Requirements

> **System**: RetailPOS – Payment Processing & Terminal Management
> **Actor**: Cashier, System
> **Date**: 2026-05-09
> **Source**: `services/payment/PaymentService.ts`, `services/payment/PaymentServiceInterface.ts`, `services/payment/PaymentServiceFactory.ts`, `hooks/usePayment.ts`, `screens/PaymentTerminalScreen.tsx`, `components/StripeNfcPaymentTerminal.tsx`, `screens/order-history/OrderCard.tsx`, `services/audit/AuditLogService.ts`

---

## Context

The payment layer is a provider-agnostic abstraction over tap-to-pay React Native SDK integrations. `PaymentService` is a singleton facade that delegates every operation to the currently active `PaymentServiceInterface` implementation, selected by `PaymentServiceFactory` based on the configured `PaymentProvider`.

`usePayment` exposes the singleton to React components as stable, memoised callbacks. `PaymentTerminalScreen` handles the standard terminal discovery → connect → charge flow. `StripeNfcPaymentTerminal` is a specialised component for Stripe NFC tap-to-pay that replaces the standard screen entirely when the active provider is `STRIPE_NFC`.

All providers share the same `PaymentRequest` / `PaymentResponse` contract. A single `MockPaymentService` is used for all providers when running in Expo Go or when `USE_MOCK_PAYMENT=true`, enabling safe demo and test usage without real hardware.

### Architecture Boundaries

**Tap-to-pay only**: This payment layer exclusively supports providers that offer a React Native SDK for tap-to-pay (contactless) payments on mobile and tablet hardware. Providers that require a physical PED (PIN Entry Device) or a desktop integration are **not** implemented here.

**Non-tap-to-pay providers via Instore API**: Any provider that does not offer a React Native tap-to-pay SDK must be integrated through the Instore API layer (`InstoreApiTransport`). The POS client calls Instore API endpoints (e.g. `/api/payment/initiate`, `/api/payment/status`) and the Instore API handles all PED hardware communication. This ensures:

- **Separation of concerns**: POS client remains focused on UI/UX; Instore API owns hardware protocols.
- **PCI compliance**: Sensitive payment data stays server-side.
- **Vendor agnostic**: New PED vendors are added to the Instore API without touching POS client code.
- **No Electron payment path**: Desktop (Electron) builds do not have a direct payment provider — they route through the Instore API.

### Actors

| Actor   | Role                                                                                   |
| ------- | -------------------------------------------------------------------------------------- |
| Cashier | Selects terminal, initiates payment, retries on failure, cancels                       |
| System  | Discovers terminals, manages connection state, delegates to provider, auto-disconnects |

### Supported Providers

| Provider     | Enum           | Real service         | Mock fallback        | Platform        |
| ------------ | -------------- | -------------------- | -------------------- | --------------- |
| Stripe NFC   | `STRIPE_NFC`   | `StripeNfcService`   | `MockPaymentService` | Mobile / tablet |
| Stripe       | `STRIPE`       | `StripeService`      | `MockPaymentService` | Mobile / tablet |
| Square       | `SQUARE`       | `SquareService`      | `MockPaymentService` | Mobile / tablet |
| Adyen        | `ADYEN`        | `AdyenService`       | `MockPaymentService` | Mobile / tablet |
| Tap Payments | `TAP_PAYMENTS` | `TapPaymentsService` | `MockPaymentService` | Mobile / tablet |

### Key Defaults

| Field                      | Default                 | Source                                    |
| -------------------------- | ----------------------- | ----------------------------------------- |
| Active provider on startup | `STRIPE_NFC`            | `PaymentServiceFactory` constructor       |
| Mock mode                  | `USE_MOCK_PAYMENT=true` | `.env` / `@env`                           |
| Demo amount                | `$25.99`                | `PaymentTerminalScreen` (no route params) |
| NFC tap animation duration | 800 ms per cycle        | `StripeNfcPaymentTerminal` useEffect      |

---

## 1. Ubiquitous Requirements

**1.1** The system shall route all payment operations through the `PaymentService` singleton, which delegates to the active `PaymentServiceInterface` implementation returned by `PaymentServiceFactory.getPaymentService()`.

**1.2** The system shall only support providers that offer a React Native tap-to-pay SDK (`STRIPE_NFC`, `STRIPE`, `SQUARE`, `ADYEN`, `TAP_PAYMENTS`). Any other provider must be integrated through the Instore API and is outside the scope of this layer.

**1.3** The system shall use `MockPaymentService` for all providers when `USE_MOCK_PAYMENT === 'true'` or when running in Expo Go, regardless of which provider is active.

**1.4** The system shall disconnect from the terminal when `PaymentTerminalScreen` or `StripeNfcPaymentTerminal` unmounts, calling `disconnect()` only if `isTerminalConnected()` returns `true`.

**1.5** The system shall never expose raw card data — `PaymentResponse` carries only `cardBrand`, `last4`, `transactionId`, and `receiptNumber`.

**1.6** The system shall throw `'<method> not supported by the current payment provider'` when an optional method (`getTransactionStatus`, `voidTransaction`, `refundTransaction`) is called on a provider that does not implement it.

**1.7** The system shall expose `getPaymentMode()` from `usePayment`, returning `'tap_to_pay'` when running on mobile/tablet with an active tap-to-pay SDK provider, or `'cash_only'` in all other cases (desktop, web, no provider configured).

---

## 2. Event-Driven Requirements

### 2.1 Provider Selection

**2.1.1** When `PaymentService.setPaymentProvider(provider)` is called, the system shall call `PaymentServiceFactory.setPaymentProvider(provider)` and immediately re-fetch the active service via `getPaymentService()`, so subsequent calls use the new provider.

**2.1.2** When `PaymentServiceFactory.getPaymentService()` is called with `USE_MOCK_PAYMENT === 'true'` or in Expo Go, the system shall return `MockPaymentService.getInstance()` regardless of the configured provider.

**2.1.3** When `PaymentServiceFactory.getPaymentService()` is called for `SQUARE` and the real `SquareService` module fails to load, the system shall log a warning and return `MockPaymentService.getInstance()` as a fallback.

**2.1.4** When `PaymentServiceFactory.getPaymentService()` is called for `ADYEN` and the real `AdyenService` module fails to load, the system shall log a warning and return `MockPaymentService.getInstance()` as a fallback.

**2.1.5** When `PaymentServiceFactory.getPaymentService()` is called for `TAP_PAYMENTS` and the real `TapPaymentsService` module fails to load, the system shall log a warning and return `MockPaymentService.getInstance()` as a fallback.

**2.1.6** When `PaymentServiceFactory.getPaymentService()` throws for any provider, the system shall log the error and re-throw `'Failed to initialize payment service: <message>'`.

### 2.2 Terminal Discovery

**2.2.1** When `PaymentTerminalScreen` mounts and the active provider is not `STRIPE_NFC`, the system shall call `handleScan()` automatically to discover available terminals.

**2.2.2** When `getAvailableTerminals()` resolves with an empty array, the system shall set `error` to `'No <providerLabel> terminals found. Make sure your terminal is powered on and nearby.'`

**2.2.3** When `getAvailableTerminals()` throws, the system shall set `error` to the error message or `'Failed to scan for terminals.'`

**2.2.4** When the cashier taps the refresh button, the system shall call `handleScan()`, clear `availableTerminals`, and clear any existing `error`.

### 2.3 Terminal Connection

**2.3.1** When the cashier taps a terminal in the list, the system shall call `connectToTerminal(terminalId)`, set `connecting: true`, and show an `ActivityIndicator` on the selected row.

**2.3.2** When `connectToTerminal()` returns `true`, the system shall set `connected: true` and transition to the "ready to charge" view.

**2.3.3** When `connectToTerminal()` returns `false`, the system shall set `error` to `'Could not connect to "<terminalName>". Check the terminal is ready and try again.'` and clear `selectedTerminal`.

**2.3.4** When `connectToTerminal()` throws, the system shall set `error` to the error message or `'Connection failed.'` and clear `selectedTerminal`.

**2.3.5** When the cashier taps the disconnect button, the system shall call `disconnect()`, reset `connected`, `selectedTerminal`, `selectedTerminalName`, `result`, and `error` to their initial values.

### 2.4 Standard Payment Processing

**2.4.1** When the cashier taps "Process Payment" and `connected` is `true`, the system shall call `processPayment({ amount, reference: 'ORDER-<timestamp>', orderId, customerName, items })`.

**2.4.2** When `processPayment()` resolves with `success: true`, the system shall set `result` to the response and call `onPaymentComplete(response)` after a 1 500 ms delay.

**2.4.3** When `processPayment()` resolves with `success: false`, the system shall set `result` to the response and render the failure card with `errorMessage` and a "Try Again" button.

**2.4.4** When `processPayment()` throws, the system shall set `error` to the error message or `'Payment failed. Please try again.'`

**2.4.5** When the cashier taps "Try Again" after a failure, the system shall clear `result` and `error`, returning to the "ready to charge" view with the terminal still connected.

### 2.5 Stripe NFC Flow

**2.5.1** When `PaymentTerminalScreen` mounts and `getCurrentProvider() === STRIPE_NFC`, the system shall render `StripeNfcPaymentTerminal` instead of the standard terminal UI and shall not call `handleScan()`.

**2.5.2** When `StripeNfcPaymentTerminal` mounts with `paymentStatus: 'ready'`, the system shall render the "Process Payment" button and static instructions.

**2.5.3** When the cashier taps "Process Payment" in `StripeNfcPaymentTerminal`, the system shall set `paymentStatus` to `'connecting'`, then `'waiting_for_tap'`, then call `processPayment()`.

**2.5.4** When `paymentStatus === 'waiting_for_tap'`, the system shall start a looping scale animation on the tap-to-pay icon (1.0 → 1.2 → 1.0, 800 ms per step) using `Animated.loop`.

**2.5.5** When `paymentStatus` changes away from `'waiting_for_tap'`, the system shall stop the animation and reset the scale to `1.0`.

**2.5.6** When `processPayment()` resolves with `success: true` in `StripeNfcPaymentTerminal`, the system shall set `paymentStatus` to `'approved'`, display `cardBrand` if present, and call `onPaymentComplete(response)` after 1 500 ms.

**2.5.7** When `processPayment()` resolves with `errorCode: 'card_declined'`, the system shall set `paymentStatus` to `'card_declined'` and render the declined state with a "Try Again" button.

**2.5.8** When `processPayment()` resolves with `errorCode: 'connection_error'`, the system shall set `paymentStatus` to `'connection_error'` and render the connection error state with a "Reconnect & Try Again" button.

**2.5.9** When `processPayment()` throws in `StripeNfcPaymentTerminal`, the system shall set `paymentStatus` to `'error'` and render the generic error state.

**2.5.10** When the cashier taps "Try Again" / "Reconnect & Try Again" in any error state of `StripeNfcPaymentTerminal`, the system shall call `handlePayment()` again from the beginning of the NFC flow.

### 2.6 Void & Refund

**2.6.1** When `voidTransaction(transactionId)` is called on `PaymentService`, the system shall delegate to `activeService.voidTransaction(transactionId)` if the method exists, or throw `'voidTransaction not supported by the current payment provider'`.

**2.6.2** When `refundTransaction(transactionId, amount)` is called on `PaymentService`, the system shall delegate to `activeService.refundTransaction(transactionId, amount)` if the method exists, or throw `'refundTransaction not supported by the current payment provider'`.

**2.6.3** When `getTransactionStatus(transactionId)` is called on `PaymentService`, the system shall delegate to `activeService.getTransactionStatus(transactionId)` if the method exists, or throw `'getTransactionStatus not supported by the current payment provider'`.

### 2.7 Demo Mode

**2.7.1** When `PaymentTerminalScreen` is opened with no `route.params` (or `amount === 0`), the system shall operate in demo mode — the amount card is hidden and the pay button reads "Process Payment" rather than "Charge $X.XX".

**2.7.2** When a payment completes in demo mode, the system shall call `onPaymentComplete` (which defaults to `navigation.goBack()`) with the mock `PaymentResponse`.

### 2.8 Order History — OrderCard

**2.8.1** When `OrderCard` renders an order with `syncStatus === 'synced'`, the system shall display a green "Synced" badge.

**2.8.2** When `OrderCard` renders an order with `syncStatus === 'failed'`, the system shall display a red "Failed" badge and, if `syncError` is non-null, render the error message in an error container below the order details.

**2.8.3** When `OrderCard` renders an order with any other `syncStatus`, the system shall display an amber "Pending" badge.

**2.8.4** When the cashier taps "Print" on an `OrderCard`, the system shall call `onPrintReceipt(order)`.

**2.8.5** When the cashier taps "Resync" on an `OrderCard` and `isSyncing` is `false`, the system shall call `onResync(order.id)`.

**2.8.6** When `isSyncing` is `true` on an `OrderCard`, the system shall disable the Resync button, apply `resyncButtonDisabled` style, and show "Syncing..." label with a `sync` icon.

**2.8.7** When `syncStatus === 'synced'` on an `OrderCard`, the system shall not render the Resync button.

---

## 3. State-Driven Requirements

**3.1** While `scanning` is `true` in `PaymentTerminalScreen`, the section title shall read "Scanning for terminals…" and the refresh button shall show an `ActivityIndicator`.

**3.2** While `connecting` is `true` in `PaymentTerminalScreen`, the selected terminal row shall show an `ActivityIndicator` and all terminal rows shall be disabled.

**3.3** While `connected` is `true` and `result` is `null` in `PaymentTerminalScreen`, the system shall render the "ready to charge" view with the connected terminal name, a disconnect button, and the pay button.

**3.4** While `processing` is `true` in `PaymentTerminalScreen`, the system shall render the processing indicator ("Processing payment…", "Present card to terminal") and hide the pay button.

**3.5** While `processing` is `true` in `PaymentTerminalScreen`, the back/cancel button shall be disabled.

**3.6** While `result` is non-null in `PaymentTerminalScreen`, the system shall render the result card (success or failure) and hide the terminal selector and pay button.

**3.7** While `paymentStatus === 'approved'` in `StripeNfcPaymentTerminal`, the cancel button shall be disabled.

**3.8** While `processing` is `true` in `StripeNfcPaymentTerminal`, the cancel button shall be disabled.

**3.9** While `availableTerminals` is empty and `scanning` is `false` and `error` is `null` in `PaymentTerminalScreen`, the system shall render the empty state ("No terminals found", "Tap refresh to scan again").

**3.10** While `amount > 0` in `PaymentTerminalScreen`, the system shall render the amount card showing `formatMoney(amount, currency.code)` and `customerName` if provided.

---

## 4. Optional Feature Requirements

**4.1** Where `routeParams.customerName` is provided to `PaymentTerminalScreen`, the system shall include it in the `PaymentRequest` and display it below the amount.

**4.2** Where `routeParams.orderId` is provided to `PaymentTerminalScreen`, the system shall include it in the `PaymentRequest` so the provider can associate the transaction with the local order.

**4.3** Where `routeParams.items` is provided to `PaymentTerminalScreen`, the system shall map them to `PaymentRequest.items` for line-item-level receipt data.

**4.4** Where `result.cardBrand` and `result.last4` are both present in the success result card, the system shall render `"<cardBrand> ···· <last4>"` as a metadata line.

**4.5** Where `result.transactionId` is present in the success result card, the system shall render the last 12 characters as `"Ref: <id>"`.

---

## 5. Unwanted Behaviour / Edge Cases

### 5.1 Provider Initialisation Failure

**5.1.1** If `PaymentServiceFactory.getPaymentService()` throws (e.g. native module not available), then `PaymentService` shall propagate the error as `'Failed to initialize payment service: <message>'` — the caller is responsible for handling it.

**5.1.2** If any SDK-backed service (`SquareService`, `AdyenService`, `TapPaymentsService`) fails to load (native module missing), then `PaymentServiceFactory` shall catch the error, log a warning, and return `MockPaymentService` as a silent fallback.

### 5.2 Connection Failures

**5.2.1** If `connectToTerminal()` returns `false`, then `PaymentTerminalScreen` shall display an error banner and return to the terminal list — the cashier can select the same or a different terminal.

**5.2.2** If `connectToTerminal()` throws, then `PaymentTerminalScreen` shall display the error message in the error banner and clear `selectedTerminal`.

### 5.3 Payment Failures

**5.3.1** If `processPayment()` returns `success: false` in `PaymentTerminalScreen`, then the result card shall show the failure state with `errorMessage` and a "Try Again" button — the terminal remains connected.

**5.3.2** If `processPayment()` throws in `PaymentTerminalScreen`, then `error` shall be set and the result card shall not be shown — the cashier sees the error banner and can retry.

**5.3.3** If `processPayment()` returns `errorCode: 'card_declined'` in `StripeNfcPaymentTerminal`, then the system shall show the declined state — not the generic error state.

**5.3.4** If `processPayment()` returns `errorCode: 'connection_error'` in `StripeNfcPaymentTerminal`, then the system shall show the connection error state with a reconnect option — not the declined state.

### 5.4 Unmount During Payment

**5.4.1** If `PaymentTerminalScreen` unmounts while `processing` is `true` (e.g. user force-navigates away), then the `useEffect` cleanup shall call `disconnect()` if connected — the in-flight `processPayment()` promise will resolve or reject but its `setResult` / `setError` calls will be no-ops on the unmounted component.

**5.4.2** If `StripeNfcPaymentTerminal` unmounts while `paymentStatus === 'waiting_for_tap'`, then the cleanup shall call `disconnect()` and the tap animation shall stop via `tapAnimation.stopAnimation()`.

### 5.5 Optional Method Not Supported

**5.5.1** If `voidTransaction`, `refundTransaction`, or `getTransactionStatus` is called on a provider that does not implement it, then `PaymentService` shall throw a descriptive error — callers must check provider capabilities before calling.

### 5.6 Demo Mode Edge Cases

**5.6.1** If `PaymentTerminalScreen` is opened with `amount === 0` (demo mode), then the amount card shall be hidden and the pay button shall not show a currency amount.

### 5.7 Unsupported Provider

**5.7.1** If `setPaymentProvider()` is called with a provider value that is not one of `STRIPE_NFC`, `STRIPE`, `SQUARE`, `ADYEN`, or `TAP_PAYMENTS`, then `PaymentServiceFactory` shall throw `'Unsupported payment provider: <value>'` — callers must only pass valid tap-to-pay provider values.

---

## 6. Complex Requirements

**6.1** When `StripeNfcPaymentTerminal` transitions through the NFC payment states (`ready` → `connecting` → `waiting_for_tap` → `approved` / `declined` / `connection_error` / `error`), the tap animation shall be started exactly once when entering `waiting_for_tap` and stopped exactly once when leaving it — preventing animation leaks across retries.

**6.2** When `processPayment()` is called from `PaymentTerminalScreen`, the `reference` field is set to `'ORDER-<Date.now()>'` — this is a timestamp-based reference, not the `orderId`. When `orderId` is available from route params it is passed separately as `PaymentRequest.orderId`, allowing the provider to associate the transaction with the local order record independently of the reference string.

**6.3** When `PaymentService.setPaymentProvider(provider)` is called, the factory's `currentProvider` is updated and `activeService` on the `PaymentService` singleton is replaced atomically — any subsequent call to any `PaymentServiceInterface` method will use the new provider without requiring a new `PaymentService` instance.

**6.4** When `MockPaymentService` is active (Expo Go or `USE_MOCK_PAYMENT=true`), it shall simulate the full provider lifecycle — `getAvailableTerminals()`, `connectToTerminal()`, `processPayment()`, `disconnect()` — returning realistic stub data so the UI can be exercised without real hardware.

---

## 7. Payment Flow Summary

### Standard terminal flow (Stripe, Square, Adyen, Tap Payments)

```
PaymentTerminalScreen mounts
  → handleScan()
    → getAvailableTerminals()                  ← provider discovers hardware
    → setAvailableTerminals(terminals)

Cashier taps terminal
  → handleConnect(terminalId, terminalName)
    → connectToTerminal(terminalId)            ← provider establishes connection
    → setConnected(true)                       ← "ready to charge" view

Cashier taps "Process Payment"
  → handleProcessPayment()
    → processPayment({ amount, reference, orderId, customerName, items })
    → [success] setResult(response)
               → setTimeout(onPaymentComplete, 1500)
    → [failure] setResult(response)            ← retry available, terminal stays connected

PaymentTerminalScreen unmounts
  → isTerminalConnected() && disconnect()      ← cleanup
```

### Stripe NFC flow

```
PaymentTerminalScreen mounts (provider = STRIPE_NFC)
  → renders StripeNfcPaymentTerminal (no scan)

Cashier taps "Process Payment"
  → paymentStatus: 'connecting' → 'waiting_for_tap'
  → tap animation starts
  → processPayment({ amount, reference, currency, orderId, customerName, items })
  → [success]          paymentStatus: 'approved'
                       → setTimeout(onPaymentComplete, 1500)
  → [card_declined]    paymentStatus: 'card_declined'       ← retry
  → [connection_error] paymentStatus: 'connection_error'    ← reconnect + retry
  → [throw]            paymentStatus: 'error'               ← retry

StripeNfcPaymentTerminal unmounts
  → isTerminalConnected() && disconnect()
```

### Provider resolution

```
PaymentServiceFactory.getPaymentService()
  → USE_MOCK_PAYMENT=true || Expo Go  → MockPaymentService
  → STRIPE_NFC                        → StripeNfcService
  → STRIPE                            → StripeService
  → SQUARE                            → SquareService   (lazy, fallback to mock on load error)
  → ADYEN                             → AdyenService    (lazy, fallback to mock on load error)
  → TAP_PAYMENTS                      → TapPaymentsService (lazy, fallback to mock on load error)
  → any other value                   → throw 'Unsupported payment provider'
```

---

## 8. Component Traceability

| Requirement (summary)                   | Component / Hook / Service                                                 | Source File                                   |
| --------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| Provider selected / switched            | `PaymentService.setPaymentProvider` → `PaymentServiceFactory`              | `services/payment/PaymentService.ts`          |
| Mock mode activated (Expo Go / env)     | `PaymentServiceFactory.getPaymentService` (mock check)                     | `services/payment/PaymentServiceFactory.ts`   |
| SDK load fallback to mock               | `PaymentServiceFactory.getPaymentService` (catch branch per provider)      | `services/payment/PaymentServiceFactory.ts`   |
| Stable payment callbacks in React       | `usePayment` (useMemo + useCallback)                                       | `hooks/usePayment.ts`                         |
| Payment mode resolved for checkout UI   | `usePayment.getPaymentMode()` (device + provider check)                    | `hooks/usePayment.ts`                         |
| Terminal auto-scan on mount             | `PaymentTerminalScreen` useEffect → `handleScan()`                         | `screens/PaymentTerminalScreen.tsx`           |
| Terminal list rendered                  | `PaymentTerminalScreen` (availableTerminals.map)                           | `screens/PaymentTerminalScreen.tsx`           |
| Terminal connect                        | `PaymentTerminalScreen.handleConnect` → `connectToTerminal()`              | `screens/PaymentTerminalScreen.tsx`           |
| Terminal disconnect button              | `PaymentTerminalScreen.handleDisconnect` → `disconnect()`                  | `screens/PaymentTerminalScreen.tsx`           |
| Auto-disconnect on unmount              | `PaymentTerminalScreen` useEffect cleanup → `disconnect()`                 | `screens/PaymentTerminalScreen.tsx`           |
| Standard payment processed              | `PaymentTerminalScreen.handleProcessPayment` → `processPayment()`          | `screens/PaymentTerminalScreen.tsx`           |
| Success → onPaymentComplete after delay | `PaymentTerminalScreen` (setTimeout 1500ms)                                | `screens/PaymentTerminalScreen.tsx`           |
| Failure result card + retry             | `PaymentTerminalScreen` (result.success === false branch)                  | `screens/PaymentTerminalScreen.tsx`           |
| Stripe NFC component rendered           | `PaymentTerminalScreen` (isStripeNfcActive branch)                         | `screens/PaymentTerminalScreen.tsx`           |
| NFC payment states managed              | `StripeNfcPaymentTerminal.handlePayment` (paymentStatus transitions)       | `components/StripeNfcPaymentTerminal.tsx`     |
| Tap animation started / stopped         | `StripeNfcPaymentTerminal` useEffect (paymentStatus === 'waiting_for_tap') | `components/StripeNfcPaymentTerminal.tsx`     |
| NFC card declined state                 | `StripeNfcPaymentTerminal` (errorCode === 'card_declined' branch)          | `components/StripeNfcPaymentTerminal.tsx`     |
| NFC connection error state              | `StripeNfcPaymentTerminal` (errorCode === 'connection_error' branch)       | `components/StripeNfcPaymentTerminal.tsx`     |
| NFC auto-disconnect on unmount          | `StripeNfcPaymentTerminal` useEffect cleanup                               | `components/StripeNfcPaymentTerminal.tsx`     |
| Void transaction                        | `PaymentService.voidTransaction` → `activeService.voidTransaction`         | `services/payment/PaymentService.ts`          |
| Refund transaction                      | `PaymentService.refundTransaction` → `activeService.refundTransaction`     | `services/payment/PaymentService.ts`          |
| Unsupported method guard                | `PaymentService` (optional method check + throw)                           | `services/payment/PaymentService.ts`          |
| Unsupported provider guard              | `PaymentServiceFactory` (default case throw)                               | `services/payment/PaymentServiceFactory.ts`   |
| Mock full lifecycle simulation          | `MockPaymentService`                                                       | `services/payment/mock/MockPaymentService.ts` |
| Order sync status badge                 | `OrderCard.getOrderStatusColor / getOrderStatusText`                       | `screens/order-history/OrderCard.tsx`         |
| Sync error displayed on card            | `OrderCard` (syncError non-null branch)                                    | `screens/order-history/OrderCard.tsx`         |
| Print receipt from order card           | `OrderCard` print button → `onPrintReceipt(order)`                         | `screens/order-history/OrderCard.tsx`         |
| Resync from order card                  | `OrderCard` resync button → `onResync(order.id)`                           | `screens/order-history/OrderCard.tsx`         |
| Resync disabled while syncing           | `OrderCard` (`isSyncing` → disabled + style)                               | `screens/order-history/OrderCard.tsx`         |
