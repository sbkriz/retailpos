# Customer-Facing Display – EARS Requirements

> **System**: RetailPOS – Customer-Facing Display
> **Actor**: Customer, System
> **Date**: 2026-05-10
> **Source**: `services/display/CustomerDisplayServiceInterface.ts`, `services/display/CustomerDisplayServiceFactory.ts`, `services/display/WebSocketDisplayService.ts`, `services/display/NoOpDisplayService.ts`, `screens/settings/hardware/CustomerDisplaySettingsTab.tsx`, `screens/HardwareStatusScreen.tsx`, `contexts/BasketProvider.tsx`, `hooks/useCheckout.ts`, `hooks/useHardwareStatus.ts`

---

## Context

The customer-facing display shows the customer what the cashier is ringing up — item names, quantities, running total, and payment status. It is a read-only mirror of the basket, updated in real time as items are added or removed.

`CustomerDisplayServiceFactory` is a singleton that resolves the active display driver. The default is `NoOpDisplayService` — no display is active unless explicitly configured.

### Driver Types

| Type        | Description                                                          |
| ----------- | -------------------------------------------------------------------- |
| `websocket` | Push to a browser on a second device (tablet, monitor) via WebSocket |
| `serial`    | USB serial pole display (VFD/LCD, e.g. Epson DM-D110) — planned      |
| `electron`  | Second Electron window via IPC — planned                             |
| `none`      | No-op — default when no display is configured                        |

### Display Screens

| Screen     | Shown when                                         |
| ---------- | -------------------------------------------------- |
| `idle`     | Basket is empty — shows welcome message            |
| `basket`   | Items are in the basket — shows item list + totals |
| `payment`  | Payment is being processed — shows total due       |
| `thankyou` | Payment completed — shows thank-you message        |

### Update Flow

```
Cashier adds/removes item
  → BasketProvider cartItems/totals change
    → useEffect → customerDisplayServiceFactory.getService().update(state)
      → WebSocketDisplayService.send({ type: 'update', payload: state })
        → Customer display browser re-renders

Cashier taps "Complete Order"
  → useCheckout.handlePayment → markPaymentProcessing
    → customerDisplayServiceFactory.getService().showPayment(total, currency)

Payment succeeds
  → customerDisplayServiceFactory.getService().showThankYou()

Basket cleared
  → cartItems.length === 0
    → customerDisplayServiceFactory.getService().showIdle()
```

---

## 1. Ubiquitous Requirements

**1.1** `CustomerDisplayServiceFactory` shall be a singleton — a single instance is shared across the application.

**1.2** The default service shall be `NoOpDisplayService` — no display is active unless `CustomerDisplaySettings.enabled` is `true` and `type !== 'none'`.

**1.3** All display operations shall be fire-and-forget — they shall never block basket operations or the payment flow.

**1.4** Display settings shall be persisted to `keyValueRepository` under `'customerDisplaySettings'` and loaded via `CustomerDisplayServiceFactory.initialize()` at app startup.

---

## 2. Event-Driven Requirements

### 2.1 Initialisation

**2.1.1** When `CustomerDisplayServiceFactory.initialize()` is called, the system shall load settings from `keyValueRepository` and, if `enabled` and `type !== 'none'`, call `applySettings()` to connect.

**2.1.2** When `CustomerDisplayServiceFactory.configure(settings)` is called, the system shall persist the settings and reconnect with the new configuration.

### 2.2 Settings UI (`CustomerDisplaySettingsTab`)

**2.2.1** When `CustomerDisplaySettingsTab` mounts, the system shall display a placeholder message indicating that customer display configuration will be available in a future update.

**2.2.2** The settings tab shall describe the feature: "This feature allows you to show basket contents on a second screen for customers."

**2.2.3** When customer display settings are fully implemented, the tab shall provide fields for: enable toggle, display type selector (WebSocket, Serial, Electron), endpoint/connection configuration, idle message, and thank-you message.

### 2.3 Basket Updates

**2.3.1** When `BasketProvider` detects a change in `cartItems`, `subtotal`, `tax`, or `total`, the system shall call `customerDisplayServiceFactory.getService().update(state)` as a fire-and-forget operation.

**2.3.2** When `cartItems.length === 0`, the system shall call `showIdle()` instead of `update()`.

**2.3.3** The `CustomerDisplayState` passed to `update()` shall include: `items[]` (name, quantity, price, total), `subtotal`, `tax`, `total`, `currencyCode`, and `screen: 'basket'`.

### 2.4 Payment Screens

**2.4.1** When `useCheckout.handlePayment()` calls `markPaymentProcessing()`, the system shall call `customerDisplayServiceFactory.getService().showPayment(total, currencyCode)` to show the payment-in-progress screen.

**2.4.2** When `completePayment()` returns `success: true`, the system shall call `customerDisplayServiceFactory.getService().showThankYou()` to show the thank-you screen.

**2.4.3** After the basket is cleared (which triggers `cartItems.length === 0`), the display shall automatically transition to the idle screen via the basket update effect.

### 2.5 WebSocket Driver

**2.5.1** When `WebSocketDisplayService.connect(config)` is called, the system shall open a WebSocket connection to `config.endpoint` with a timeout specified by `config.connectionTimeoutMs` (default 5 seconds).

**2.5.2** When the WebSocket opens successfully, `isConnected()` shall return `true`.

**2.5.3** When `update(state)` is called, the system shall send `{ type: 'update', payload: state }` as a JSON string over the WebSocket.

**2.5.4** When `showIdle(message?)` is called, the system shall send `{ type: 'idle', payload: { message } }`.

**2.5.5** When `showPayment(total, currencyCode)` is called, the system shall send `{ type: 'payment', payload: { total, currencyCode } }`.

**2.5.6** When `showThankYou(message?)` is called, the system shall send `{ type: 'thankyou', payload: { message } }`.

**2.5.7** When the WebSocket is not open (`readyState !== OPEN`), all send operations shall silently do nothing.

**2.5.8** When the WebSocket connection encounters an error, the system shall log the error and set `isConnected()` to return `false`.

### 2.6 Hardware Status Integration

**2.6.1** `useHardwareStatus` hook shall accept a `display` parameter of type `CustomerDisplayServiceInterface | null` and include customer display status in the returned status object.

**2.6.2** When `useHardwareStatus` polls hardware status, the system shall check `displayService.isConnected()` and include the result in `status.display.connected`.

**2.6.3** When `displayService` is not null, the system shall include `status.display.type` with the value from `displayService.driverType`.

**2.6.4** When `HardwareStatusScreen` renders, the system shall display a "Customer Display" card showing: connection status icon (connected/disconnected), status text, display type (if connected), last checked timestamp, and "Configure Display" button.

**2.6.5** When the user taps "Configure Display" in `HardwareStatusScreen`, the system shall call `onNavigateToSettings('display')` to navigate to the customer display settings tab.

---

## 3. State-Driven Requirements

**3.1** While `CustomerDisplaySettings.enabled` is `false` or `type === 'none'`, `getService()` returns `NoOpDisplayService` — all calls are no-ops.

**3.2** While `WebSocketDisplayService.isConnected()` returns `false`, all display calls silently do nothing.

**3.3** While the basket has items, the display shall show the `basket` screen with the current item list and totals.

**3.4** While the basket is empty, the display shall show the `idle` screen with the configured welcome message.

---

## 4. Optional Feature Requirements

**4.1** Where `CustomerDisplaySettings.idleMessage` is set, `showIdle()` shall use it as the display message.

**4.2** Where `CustomerDisplaySettings.thankYouMessage` is set, `showThankYou()` shall use it as the display message.

**4.3** Where `DisplayConnectionConfig.connectionTimeoutMs` is provided, the WebSocket connection shall use that timeout value instead of the default 5 seconds.

**4.4** Where `DisplayConnectionConfig.characterWidth` is provided for serial displays, the system shall format text to fit within that character width (planned for serial driver implementation).

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If the WebSocket connection drops mid-session, `isConnected()` returns `false` and all subsequent display calls are silently dropped — the POS continues to operate normally.

**5.2** If `initialize()` fails to connect, the factory falls back to `NoOpDisplayService` — no error is surfaced to the cashier.

**5.3** Rapid basket changes (e.g. scanning multiple items quickly) will trigger multiple `update()` calls in quick succession — the WebSocket send is synchronous and non-blocking, so this is safe. The display browser should debounce rendering if needed.

**5.4** The `serial` and `electron` driver types are defined in the interface but not yet implemented — `applySettings()` falls back to `NoOpDisplayService` for these types with a logged warning.

---

## 6. Component Traceability

| Requirement (summary)                       | Component                                                | Source File                                                |
| ------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Singleton factory                           | `CustomerDisplayServiceFactory.getInstance`              | `services/display/CustomerDisplayServiceFactory.ts`        |
| Settings persisted + loaded                 | `CustomerDisplayServiceFactory.initialize` / `configure` | `services/display/CustomerDisplayServiceFactory.ts`        |
| Settings UI placeholder                     | `CustomerDisplaySettingsTab`                             | `screens/settings/hardware/CustomerDisplaySettingsTab.tsx` |
| No-op default                               | `NoOpDisplayService`                                     | `services/display/NoOpDisplayService.ts`                   |
| WebSocket connect with configurable timeout | `WebSocketDisplayService.connect`                        | `services/display/WebSocketDisplayService.ts`              |
| JSON message send                           | `WebSocketDisplayService.send`                           | `services/display/WebSocketDisplayService.ts`              |
| WebSocket error handling                    | `WebSocketDisplayService` onerror handler                | `services/display/WebSocketDisplayService.ts`              |
| `buildDisplayState` helper                  | `buildDisplayState`                                      | `services/display/CustomerDisplayServiceInterface.ts`      |
| Basket change → display update              | `BasketProvider` useEffect on cartItems/totals           | `contexts/BasketProvider.tsx`                              |
| Empty basket → idle screen                  | `BasketProvider` useEffect (`cartItems.length === 0`)    | `contexts/BasketProvider.tsx`                              |
| Payment processing → payment screen         | `useCheckout.handlePayment` → `showPayment()`            | `hooks/useCheckout.ts`                                     |
| Payment success → thank-you screen          | `useCheckout.handlePayment` → `showThankYou()`           | `hooks/useCheckout.ts`                                     |
| Hardware status monitoring                  | `useHardwareStatus` display parameter                    | `hooks/useHardwareStatus.ts`                               |
| Hardware status dashboard                   | `HardwareStatusScreen` customer display card             | `screens/HardwareStatusScreen.tsx`                         |
| Navigate to display settings                | `HardwareStatusScreen` configure button                  | `screens/HardwareStatusScreen.tsx`                         |
