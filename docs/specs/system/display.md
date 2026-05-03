# Customer Display – EARS Requirements

> **System**: RetailPOS – Customer-Facing Display Management  
> **Actor**: System, Cashier  
> **Date**: 2026-05-03  
> **Source**: `services/display/CustomerDisplayServiceFactory.ts`, `services/display/CustomerDisplayServiceInterface.ts`, `services/display/WebSocketDisplayService.ts`, `services/display/NoOpDisplayService.ts`

---

## Context

The customer display system pushes real-time basket state to a secondary display device (tablet, monitor, pole display) so customers can see items, prices, and totals as they're scanned. The system supports multiple driver types (WebSocket, Serial, Electron IPC) and gracefully degrades to a no-op service when no display is configured.

The factory pattern allows runtime configuration and hot-swapping of display drivers without restarting the app. All display operations are non-blocking — failures never interrupt the checkout flow.

### Actors

| Actor   | Role                                                                                |
| ------- | ----------------------------------------------------------------------------------- |
| System  | Pushes basket state to display on every basket change; manages connection lifecycle |
| Cashier | Configures display settings; tests connection; views connection status              |

### Display Driver Types

| Driver Type | Description                                                                  | Status             |
| ----------- | ---------------------------------------------------------------------------- | ------------------ |
| `websocket` | WebSocket server pushes JSON state to browser-based display on second device | ✅ Implemented     |
| `serial`    | USB serial connection to pole display (VFD/LCD, e.g. Epson DM-D110)          | 🔴 Not implemented |
| `electron`  | Second Electron window via IPC (for desktop POS with dual monitors)          | 🔴 Not implemented |
| `none`      | No-op service — all operations succeed silently without sending data         | ✅ Implemented     |

### Display Screens

| Screen     | When Shown                                                           |
| ---------- | -------------------------------------------------------------------- |
| `idle`     | Basket is empty; shows welcome message                               |
| `basket`   | Items in basket; shows item list, subtotal, tax, total               |
| `payment`  | Payment in progress; shows total and "Processing payment..." message |
| `thankyou` | Payment complete; shows thank-you message                            |

### Key Defaults

| Field                | Default                     | Source                            |
| -------------------- | --------------------------- | --------------------------------- |
| `enabled`            | `false`                     | `DEFAULT_DISPLAY_SETTINGS`        |
| `type`               | `'none'`                    | `DEFAULT_DISPLAY_SETTINGS`        |
| `endpoint`           | `''`                        | `DEFAULT_DISPLAY_SETTINGS`        |
| `idleMessage`        | `'Welcome!'`                | `DEFAULT_DISPLAY_SETTINGS`        |
| `thankYouMessage`    | `'Thank you!'`              | `DEFAULT_DISPLAY_SETTINGS`        |
| Connection timeout   | 5,000 ms                    | `WebSocketDisplayService.connect` |
| Settings storage key | `'customerDisplaySettings'` | `DISPLAY_SETTINGS_KEY`            |

---

## 1. Ubiquitous Requirements

**1.1** The system shall maintain a singleton instance of `CustomerDisplayServiceFactory` exported as `customerDisplayServiceFactory`.

**1.2** The system shall store display settings in the key-value repository under the key `'customerDisplaySettings'`.

**1.3** The system shall use `LoggerFactory` to create a child logger named `'CustomerDisplayServiceFactory'` for all log messages.

**1.4** The system shall maintain a `currentService` reference to the active display service instance.

**1.5** The system shall default to `NoOpDisplayService` when no display is configured or when the configured driver is not yet implemented.

**1.6** The system shall never throw errors from display operations — all failures shall be caught, logged, and ignored to prevent blocking the checkout flow.

**1.7** The system shall support runtime reconfiguration without requiring app restart.

**1.8** The system shall disconnect the previous service before connecting a new service when configuration changes.

---

## 2. Event-Driven Requirements

### 2.1 Factory Initialization

**2.1.1** When `initialize()` is called, the system shall call `keyValueRepository.getObject<CustomerDisplaySettings>('customerDisplaySettings')` to load saved settings.

**2.1.2** When saved settings are found, the system shall merge them with `DEFAULT_DISPLAY_SETTINGS` using spread syntax and store the result in `this.settings`.

**2.1.3** When no saved settings are found, the system shall use `DEFAULT_DISPLAY_SETTINGS` as `this.settings`.

**2.1.4** When settings are loaded and `settings.enabled` is `true` and `settings.type` is not `'none'`, the system shall call `applySettings(settings)` to connect the display.

**2.1.5** When settings are loaded and `settings.enabled` is `false` or `settings.type` is `'none'`, the system shall use `NoOpDisplayService` as `currentService`.

**2.1.6** When any step in `initialize()` throws an error, the system shall catch it, log an error message, and continue with `NoOpDisplayService` — initialization failure is non-fatal.

### 2.2 Get Service

**2.2.1** When `getService()` is called, the system shall return `currentService` without modification.

### 2.3 Get Settings

**2.3.1** When `getSettings()` is called, the system shall return a shallow copy of `this.settings` using spread syntax.

### 2.4 Configure Display

**2.4.1** When `configure(settings)` is called, the system shall store the provided settings in `this.settings`.

**2.4.2** When settings are stored, the system shall call `keyValueRepository.setObject('customerDisplaySettings', settings)` to persist them.

**2.4.3** When settings are persisted, the system shall call `applySettings(settings)` to connect the new display.

**2.4.4** When `applySettings()` completes, the system shall return the connection result (`true` if connected, `false` if failed).

### 2.5 Apply Settings

**2.5.1** When `applySettings(settings)` is called, the system shall call `currentService.disconnect()` to disconnect the previous display.

**2.5.2** When the previous service is disconnected and `settings.enabled` is `false` or `settings.type` is `'none'`, the system shall set `currentService` to a new `NoOpDisplayService` instance and return `true`.

**2.5.3** When `settings.enabled` is `true` and `settings.type` is `'websocket'`, the system shall create a new `WebSocketDisplayService` instance and assign it to `currentService`.

**2.5.4** When `settings.enabled` is `true` and `settings.type` is `'serial'` or `'electron'`, the system shall log a warning message `'Display type '<type>' not yet implemented, using no-op'` and set `currentService` to `NoOpDisplayService`.

**2.5.5** When a new service is created, the system shall build a `DisplayConnectionConfig` object with `endpoint`, `baudRate`, and `characterWidth` from settings.

**2.5.6** When the config is built, the system shall call `currentService.connect(config)` and await the result.

**2.5.7** When `connect()` returns `false`, the system shall log a warning message `'Failed to connect customer display at <endpoint>'`.

**2.5.8** When `connect()` completes, the system shall return the connection result.

### 2.6 Reset Display

**2.6.1** When `reset()` is called, the system shall call `currentService.disconnect()` to disconnect the active display.

**2.6.2** When the service is disconnected, the system shall set `currentService` to a new `NoOpDisplayService` instance.

### 2.7 WebSocket Connection

**2.7.1** When `WebSocketDisplayService.connect(config)` is called, the system shall store `config` in `this.config`.

**2.7.2** When the config is stored, the system shall create a new `WebSocket` instance with `config.endpoint` as the URL.

**2.7.3** When the WebSocket is created, the system shall create a 5-second timeout using `setTimeout`.

**2.7.4** When the timeout fires before connection, the system shall log a warning message `'WebSocket display connection timed out'` and resolve the promise with `false`.

**2.7.5** When the WebSocket `onopen` event fires, the system shall clear the timeout, log an info message `'Customer display connected via WebSocket: <endpoint>'`, and resolve the promise with `true`.

**2.7.6** When the WebSocket `onerror` event fires, the system shall clear the timeout and resolve the promise with `false`.

**2.7.7** When any step in `connect()` throws an error, the system shall catch it, log an error message, and return `false`.

### 2.8 WebSocket Disconnection

**2.8.1** When `WebSocketDisplayService.disconnect()` is called and `this.ws` is not `null`, the system shall call `this.ws.close()`.

**2.8.2** When the WebSocket is closed, the system shall set `this.ws` to `null`.

**2.8.3** When disconnection completes, the system shall log an info message `'Customer display disconnected'`.

### 2.9 Update Display State

**2.9.1** When `update(state)` is called on `WebSocketDisplayService`, the system shall call `send({ type: 'update', payload: state })`.

**2.9.2** When `send()` is called and `isConnected()` returns `false`, the system shall return immediately without sending.

**2.9.3** When `send()` is called and `isConnected()` returns `true`, the system shall call `JSON.stringify(message)` to serialize the message.

**2.9.4** When the message is serialized, the system shall call `this.ws.send(serialized)` to send it to the display.

**2.9.5** When `send()` throws an error, the system shall catch it, log an error message, and return without throwing.

### 2.10 Show Idle Screen

**2.10.1** When `showIdle(message?)` is called on `WebSocketDisplayService`, the system shall call `send({ type: 'idle', payload: { message } })`.

### 2.11 Show Payment Screen

**2.11.1** When `showPayment(total, currencyCode)` is called on `WebSocketDisplayService`, the system shall call `send({ type: 'payment', payload: { total, currencyCode } })`.

### 2.12 Show Thank You Screen

**2.12.1** When `showThankYou(message?)` is called on `WebSocketDisplayService`, the system shall call `send({ type: 'thankyou', payload: { message } })`.

### 2.13 Check Connection Status

**2.13.1** When `isConnected()` is called on `WebSocketDisplayService`, the system shall return `true` if `this.ws?.readyState === WebSocket.OPEN`, otherwise `false`.

### 2.14 No-Op Service Operations

**2.14.1** When any method is called on `NoOpDisplayService`, the system shall return immediately without performing any operation.

**2.14.2** When `connect()` is called on `NoOpDisplayService`, the system shall return `Promise.resolve(true)`.

**2.14.3** When `isConnected()` is called on `NoOpDisplayService`, the system shall return `false`.

---

## 3. State-Driven Requirements

**3.1** While `settings.enabled` is `false`, the system shall use `NoOpDisplayService` as `currentService`.

**3.2** While `settings.type` is `'none'`, the system shall use `NoOpDisplayService` as `currentService`.

**3.3** While `settings.type` is `'websocket'` and `settings.enabled` is `true`, the system shall use `WebSocketDisplayService` as `currentService`.

**3.4** While `settings.type` is `'serial'` or `'electron'`, the system shall use `NoOpDisplayService` as `currentService` until those drivers are implemented.

**3.5** While the WebSocket connection is open (`readyState === WebSocket.OPEN`), the system shall send display updates via `ws.send()`.

**3.6** While the WebSocket connection is not open, the system shall silently skip all `send()` calls without throwing errors.

**3.7** While `currentService` is `NoOpDisplayService`, all display operations shall succeed immediately without side effects.

---

## 4. Optional Feature Requirements

**4.1** Where `settings.baudRate` is provided, the system shall pass it to the serial display driver when implemented.

**4.2** Where `settings.characterWidth` is provided, the system shall pass it to the serial display driver to format text for the display width.

**4.3** Where `settings.idleMessage` is provided, the system shall use it as the default message for `showIdle()` calls without an explicit message parameter.

**4.4** Where `settings.thankYouMessage` is provided, the system shall use it as the default message for `showThankYou()` calls without an explicit message parameter.

---

## 5. Unwanted Behaviour / Edge Cases

### 5.1 Initialization Failure

**5.1.1** If `initialize()` throws an error (e.g. key-value repository unavailable), then the system shall catch the error, log it, and continue with `NoOpDisplayService` — the app must not crash due to display initialization failure.

### 5.2 Connection Failure

**5.2.1** If `connect()` fails (e.g. WebSocket endpoint unreachable), then the system shall log a warning and return `false` — the display remains disconnected but the app continues functioning.

**5.2.2** If `connect()` times out after 5 seconds, then the system shall log a warning, resolve the promise with `false`, and leave the WebSocket in a closed state.

### 5.3 Send Failure

**5.3.1** If `send()` throws an error (e.g. WebSocket closed unexpectedly), then the system shall catch the error, log it, and return without throwing — display failures never block basket operations.

### 5.4 Disconnection During Send

**5.4.1** If the WebSocket disconnects while `send()` is in progress, then the `send()` call shall throw an error which is caught and logged — the message is lost but the app continues.

### 5.5 Reconfiguration During Connection

**5.5.1** If `configure()` is called while a connection is in progress, then the system shall disconnect the previous service immediately and start connecting the new service — the in-progress connection is abandoned.

### 5.6 Unsupported Driver Type

**5.6.1** If `settings.type` is `'serial'` or `'electron'`, then the system shall log a warning and use `NoOpDisplayService` — unsupported drivers degrade gracefully to no-op.

### 5.7 Missing Endpoint

**5.7.1** If `settings.type` is `'websocket'` and `settings.endpoint` is empty or `undefined`, then `connect()` shall throw an error which is caught and logged — the connection fails but the app continues.

### 5.8 Invalid WebSocket URL

**5.8.1** If `settings.endpoint` is not a valid WebSocket URL (e.g. missing `ws://` or `wss://` protocol), then the `WebSocket` constructor shall throw an error which is caught and logged — the connection fails but the app continues.

---

## 6. Complex Requirements

**6.1** When `configure(settings)` is called, the system shall atomically persist settings, disconnect the old service, create and connect the new service, and return the connection result — if any step fails, the system shall log the error and continue with the last successfully connected service or `NoOpDisplayService`.

**6.2** When `initialize()` is called and saved settings indicate an enabled display, the system shall load settings, create the appropriate service, connect it, and log the result — if connection fails, the system shall continue with `NoOpDisplayService` without throwing.

**6.3** When `send()` is called on `WebSocketDisplayService` and the connection is open, the system shall serialize the message, send it, and catch any errors — the caller never sees exceptions from display operations.

**6.4** When `applySettings()` is called with `type: 'websocket'`, the system shall create a `WebSocketDisplayService`, build a connection config, call `connect()`, log the result, and return the connection status — the factory orchestrates the entire connection lifecycle.

---

## 7. Customer Display Lifecycle Summary

### Initialization Flow

```
App startup
  → customerDisplayServiceFactory.initialize()
    → keyValueRepository.getObject('customerDisplaySettings')
      → If found: merge with DEFAULT_DISPLAY_SETTINGS
      → If not found: use DEFAULT_DISPLAY_SETTINGS
    → If settings.enabled && settings.type !== 'none':
      → applySettings(settings)
        → currentService.disconnect()
        → Create new service based on settings.type
        → currentService.connect(config)
        → Log result
    → If settings.enabled === false || settings.type === 'none':
      → currentService = new NoOpDisplayService()
```

### Configuration Flow

```
Cashier configures display in Settings
  → customerDisplayServiceFactory.configure(settings)
    → this.settings = settings
    → keyValueRepository.setObject('customerDisplaySettings', settings)
    → applySettings(settings)
      → currentService.disconnect()
      → If settings.enabled === false || settings.type === 'none':
        → currentService = new NoOpDisplayService()
        → return true
      → If settings.type === 'websocket':
        → currentService = new WebSocketDisplayService()
      → If settings.type === 'serial' || 'electron':
        → Log warning 'not yet implemented'
        → currentService = new NoOpDisplayService()
        → return true
      → config = { endpoint, baudRate, characterWidth }
      → connected = await currentService.connect(config)
      → If !connected: log warning
      → return connected
```

### WebSocket Connection Flow

```
WebSocketDisplayService.connect(config)
  → this.config = config
  → this.ws = new WebSocket(config.endpoint)
  → timeout = setTimeout(() => { log warning, resolve(false) }, 5000)
  → this.ws.onopen = () => {
      clearTimeout(timeout)
      log 'Customer display connected via WebSocket: <endpoint>'
      resolve(true)
    }
  → this.ws.onerror = () => {
      clearTimeout(timeout)
      resolve(false)
    }
```

### Update Display Flow

```
Basket changes
  → basketService.addItem() / updateItemQuantity() / etc.
  → customerDisplayServiceFactory.getService().update(state)
    → If NoOpDisplayService: return immediately
    → If WebSocketDisplayService:
      → send({ type: 'update', payload: state })
        → If !isConnected(): return
        → JSON.stringify(message)
        → this.ws.send(serialized)
        → Catch and log any errors
```

### Show Idle Flow

```
Basket cleared
  → basketService.clearBasket()
  → customerDisplayServiceFactory.getService().showIdle('Welcome!')
    → If NoOpDisplayService: return immediately
    → If WebSocketDisplayService:
      → send({ type: 'idle', payload: { message: 'Welcome!' } })
```

### Show Payment Flow

```
Checkout initiated
  → checkoutService.startCheckout()
  → customerDisplayServiceFactory.getService().showPayment(total, 'GBP')
    → If NoOpDisplayService: return immediately
    → If WebSocketDisplayService:
      → send({ type: 'payment', payload: { total, currencyCode: 'GBP' } })
```

### Show Thank You Flow

```
Payment complete
  → checkoutService.completePayment()
  → customerDisplayServiceFactory.getService().showThankYou('Thank you!')
    → If NoOpDisplayService: return immediately
    → If WebSocketDisplayService:
      → send({ type: 'thankyou', payload: { message: 'Thank you!' } })
```

### Disconnection Flow

```
App shutdown or display reset
  → customerDisplayServiceFactory.reset()
    → currentService.disconnect()
      → If WebSocketDisplayService:
        → this.ws?.close()
        → this.ws = null
        → log 'Customer display disconnected'
      → If NoOpDisplayService:
        → return immediately
    → currentService = new NoOpDisplayService()
```

---

## 8. Component Traceability

| Requirement (summary)         | Component / Hook / Service                    | Source File                                           |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| Singleton factory instance    | `customerDisplayServiceFactory` constant      | `services/display/CustomerDisplayServiceFactory.ts`   |
| Factory initialization        | `CustomerDisplayServiceFactory.initialize`    | `services/display/CustomerDisplayServiceFactory.ts`   |
| Settings loaded from storage  | `keyValueRepository.getObject`                | `repositories/KeyValueRepository.ts`                  |
| Settings merged with defaults | Spread syntax in `initialize()`               | `services/display/CustomerDisplayServiceFactory.ts`   |
| Service retrieved             | `CustomerDisplayServiceFactory.getService`    | `services/display/CustomerDisplayServiceFactory.ts`   |
| Settings retrieved            | `CustomerDisplayServiceFactory.getSettings`   | `services/display/CustomerDisplayServiceFactory.ts`   |
| Display configured            | `CustomerDisplayServiceFactory.configure`     | `services/display/CustomerDisplayServiceFactory.ts`   |
| Settings persisted            | `keyValueRepository.setObject`                | `repositories/KeyValueRepository.ts`                  |
| Settings applied              | `CustomerDisplayServiceFactory.applySettings` | `services/display/CustomerDisplayServiceFactory.ts`   |
| Previous service disconnected | `currentService.disconnect()`                 | `services/display/CustomerDisplayServiceInterface.ts` |
| WebSocket service created     | `new WebSocketDisplayService()`               | `services/display/WebSocketDisplayService.ts`         |
| No-op service created         | `new NoOpDisplayService()`                    | `services/display/NoOpDisplayService.ts`              |
| Connection config built       | `DisplayConnectionConfig` object              | `services/display/CustomerDisplayServiceInterface.ts` |
| Service connected             | `currentService.connect(config)`              | `services/display/CustomerDisplayServiceInterface.ts` |
| WebSocket created             | `new WebSocket(config.endpoint)`              | `services/display/WebSocketDisplayService.ts`         |
| Connection timeout set        | `setTimeout(() => { ... }, 5000)`             | `services/display/WebSocketDisplayService.ts`         |
| WebSocket onopen handler      | `this.ws.onopen = () => { ... }`              | `services/display/WebSocketDisplayService.ts`         |
| WebSocket onerror handler     | `this.ws.onerror = () => { ... }`             | `services/display/WebSocketDisplayService.ts`         |
| Display state updated         | `WebSocketDisplayService.update`              | `services/display/WebSocketDisplayService.ts`         |
| Idle screen shown             | `WebSocketDisplayService.showIdle`            | `services/display/WebSocketDisplayService.ts`         |
| Payment screen shown          | `WebSocketDisplayService.showPayment`         | `services/display/WebSocketDisplayService.ts`         |
| Thank you screen shown        | `WebSocketDisplayService.showThankYou`        | `services/display/WebSocketDisplayService.ts`         |
| Message sent to display       | `WebSocketDisplayService.send`                | `services/display/WebSocketDisplayService.ts`         |
| Connection status checked     | `WebSocketDisplayService.isConnected`         | `services/display/WebSocketDisplayService.ts`         |
| WebSocket disconnected        | `WebSocketDisplayService.disconnect`          | `services/display/WebSocketDisplayService.ts`         |
| Display reset                 | `CustomerDisplayServiceFactory.reset`         | `services/display/CustomerDisplayServiceFactory.ts`   |
| Logger created                | `LoggerFactory.getInstance().createLogger`    | `services/logger/LoggerFactory.ts`                    |

---

**Document Metadata**:

- **Author**: Kiro AI Agent
- **Date**: 2026-05-03
- **Version**: 1.0
- **Status**: Final
- **Related**: `docs/specs/basket/basket.md`, `docs/specs/checkout/checkout.md`
