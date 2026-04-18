# Kitchen Display System (KDS) – EARS Requirements

> **System**: RetailPOS – Kitchen Display System
> **Actor**: Cashier, Kitchen Staff, System
> **Date**: 2026-04-13
> **Source**: `services/kds/KdsServiceInterface.ts`, `services/kds/KdsServiceFactory.ts`, `services/kds/HttpKdsService.ts`, `services/kds/NoOpKdsService.ts`, `hooks/useCheckout.ts`

---

## Context

The KDS subsystem sends order tickets to a kitchen display screen when payment completes. It is decoupled from the receipt printer — the printer produces a customer receipt, the KDS produces a kitchen ticket. Both fire after the same payment success event.

`KdsServiceFactory` is a singleton that resolves the active KDS driver based on persisted settings. The default is `NoOpKdsService` — no KDS is active unless explicitly configured.

### Driver Types

| Type        | Description                                                     |
| ----------- | --------------------------------------------------------------- |
| `http`      | REST API — polls for status updates every 3s (`HttpKdsService`) |
| `websocket` | Real-time push — planned                                        |
| `electron`  | Second Electron window via IPC — planned                        |
| `none`      | No-op — default when KDS is not configured                      |

### Order Ticket Flow

```
Payment completes (cash or card)
  → CheckoutService.completePayment() → order status: paid
    → BackgroundSyncService.performSync()
      → OrderSyncService.syncOrderToPlatform(orderId)
        → [sync succeeds] updateSyncSuccess()
          → dispatchKdsTicket(order)  ← retry via BackgroundSyncService backoff
            → kdsServiceFactory.getService().sendOrder(ticket)
              → POST /api/kds/orders  (HttpKdsService)
                → KDS displays ticket
                → Kitchen marks order ready
                → KDS sends status update
                  → HttpKdsService polls GET /api/kds/updates
                    → onStatusUpdate callbacks fire
```

**Why sync, not checkout:** The KDS ticket is dispatched from `OrderSyncService.syncOrderToPlatform()` after `updateSyncSuccess()`, not from `useCheckout`. This means:

- If the KDS is unreachable, `BackgroundSyncService`'s exponential backoff will retry the entire sync cycle, which re-dispatches the ticket
- The ticket is sent once per successful sync — no duplicates on retry
- The checkout flow is never blocked by KDS availability

---

## 1. Ubiquitous Requirements

**1.1** `KdsServiceFactory` shall be a singleton — a single instance is shared across the application.

**1.2** The default service shall be `NoOpKdsService` — no KDS is active unless `KdsSettings.enabled` is `true` and `type !== 'none'`.

**1.3** KDS operations (`sendOrder`, `recallOrder`, `cancelOrder`) shall be fire-and-forget from the caller's perspective — they shall never block or fail the payment success path.

**1.4** KDS settings shall be persisted to `keyValueRepository` under `'kdsSettings'` and loaded via `KdsServiceFactory.initialize()` at app startup.

---

## 2. Event-Driven Requirements

### 2.1 Initialisation

**2.1.1** When `KdsServiceFactory.initialize()` is called, the system shall load settings from `keyValueRepository` and, if `enabled` and `type !== 'none'`, call `applySettings()` to connect.

**2.1.2** When `KdsServiceFactory.configure(settings)` is called, the system shall persist the settings and call `applySettings()` to reconnect with the new configuration.

### 2.2 Settings UI (`KdsSettingsTab`)

**2.2.1** When `KdsSettingsTab` mounts, the system shall call `kdsServiceFactory.getSettings()` and populate all fields from the loaded config.

**2.2.2** When any field changes, the system shall set `dirty = true` and show the Save button.

**2.2.3** When the user taps Save with `enabled = true` and an empty endpoint, the system shall show a validation error and not call `configure()`.

**2.2.4** When the user taps Save with valid settings, the system shall call `kdsServiceFactory.configure(settings)`. If the connection succeeds, it shall show a success alert and set `connectionStatus = 'connected'`. If it fails, it shall show a warning alert and set `connectionStatus = 'failed'` — settings are still persisted.

**2.2.5** When the user taps "Test Connection", the system shall call `kdsServiceFactory.getService().connect(config)` and update `connectionStatus` to `'connected'` or `'failed'`.

**2.2.6** The connection type selector shall render three options: HTTP (active), WebSocket (disabled, "coming soon"), Electron (disabled, "coming soon").

**2.2.7** When `enabled` is `false`, the connection type, endpoint, API key, and auto-reconnect fields shall be hidden.

### 2.2 Sending an Order Ticket

**2.2.1** When `OrderSyncService.syncOrderToPlatform()` calls `updateSyncSuccess()` (order successfully synced to platform), the system shall call `dispatchKdsTicket(order)` to send the kitchen ticket.

**2.2.2** `dispatchKdsTicket` shall call `kdsServiceFactory.getService().sendOrder(ticket)` as a non-blocking promise. If it rejects, the error is logged as a warning — the sync result is not affected.

**2.2.3** Because `dispatchKdsTicket` is called from within `syncOrderToPlatform`, and `BackgroundSyncService` retries failed syncs with exponential backoff, a KDS that is temporarily unreachable will receive the ticket on the next successful sync cycle.

**2.2.4** The ticket shall contain: `orderId`, `orderRef` (last 4 chars of orderId), `items[]` (id, name, quantity), and `placedAt` timestamp.

**2.2.5** When `HttpKdsService.sendOrder(order)` is called, the system shall POST to `{endpoint}/api/kds/orders` with the ticket as JSON body and an `Authorization: Bearer {apiKey}` header if `apiKey` is set.

**2.2.6** When the POST returns a non-2xx status, the system shall log a warning — the ticket is not retried independently (the sync retry mechanism handles it).

### 2.3 Recall and Cancel

**2.3.1** When `recallOrder(orderId)` is called, the system shall POST to `{endpoint}/api/kds/orders/{orderId}/recall`.

**2.3.2** When `cancelOrder(orderId)` is called, the system shall DELETE `{endpoint}/api/kds/orders/{orderId}`.

### 2.4 Status Updates (HTTP polling)

**2.4.1** When `HttpKdsService` connects successfully, the system shall start polling `GET {endpoint}/api/kds/updates?since={lastTimestamp}` every 3 seconds.

**2.4.2** When the poll returns `KdsStatusUpdate[]` entries, the system shall call all registered `onStatusUpdate` handlers for each entry and advance `lastPollTimestamp`.

**2.4.3** When the poll throws (network error), the system shall silently skip — polling continues on the next interval.

**2.4.4** When `HttpKdsService.disconnect()` is called, the system shall stop the polling interval.

### 2.5 Status Update Subscription

**2.5.1** When `onStatusUpdate(callback)` is called, the system shall register the callback and return a unique subscription ID.

**2.5.2** When `offStatusUpdate(subscriptionId)` is called, the system shall remove the registered callback.

**2.5.3** When a handler throws during dispatch, the system shall swallow the error and continue dispatching to remaining handlers.

---

## 3. State-Driven Requirements

**3.1** While `KdsSettings.enabled` is `false` or `type === 'none'`, `getService()` returns `NoOpKdsService` — all calls are no-ops.

**3.2** While `HttpKdsService.isConnected()` returns `false`, `sendOrder` returns `false` immediately without making an HTTP call.

---

## 4. Optional Feature Requirements

**4.1** Where `KdsConnectionConfig.apiKey` is set, all HTTP requests shall include `Authorization: Bearer {apiKey}`.

**4.2** Where `KdsConnectionConfig.autoReconnect` is `true`, the service should attempt to reconnect on unexpected disconnection (not yet implemented — noted for future).

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If `sendOrder` throws an unhandled exception, `useCheckout` catches it silently — the payment success path is never interrupted.

**5.2** If the KDS endpoint is unreachable at startup, `initialize()` logs a warning and falls back to `NoOpKdsService` — the POS continues to operate normally.

**5.3** `NoOpKdsService` always returns `true` from `sendOrder`, `recallOrder`, and `cancelOrder` — callers cannot distinguish a no-op from a successful send.

---

## 6. Component Traceability

| Requirement (summary)                                 | Component                                                                                | Source File                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| Singleton factory                                     | `KdsServiceFactory.getInstance`                                                          | `services/kds/KdsServiceFactory.ts`      |
| Settings persisted + loaded                           | `KdsServiceFactory.initialize` / `configure`                                             | `services/kds/KdsServiceFactory.ts`      |
| `getSettings()` for UI                                | `KdsServiceFactory.getSettings`                                                          | `services/kds/KdsServiceFactory.ts`      |
| Settings tab — enable toggle, type, endpoint, API key | `KdsSettingsTab`                                                                         | `screens/settings/KdsSettingsTab.tsx`    |
| Settings tab — test connection                        | `KdsSettingsTab.handleTestConnection`                                                    | `screens/settings/KdsSettingsTab.tsx`    |
| Settings tab — save + validate                        | `KdsSettingsTab.handleSave` → `kdsServiceFactory.configure()`                            | `screens/settings/KdsSettingsTab.tsx`    |
| Tab registered in SettingsScreen                      | `SettingsScreen` tab `'kds'`                                                             | `screens/SettingsScreen.tsx`             |
| No-op default                                         | `NoOpKdsService`                                                                         | `services/kds/NoOpKdsService.ts`         |
| HTTP ticket send                                      | `HttpKdsService.sendOrder` → `POST /api/kds/orders`                                      | `services/kds/HttpKdsService.ts`         |
| HTTP status polling every 3s                          | `HttpKdsService.startPolling`                                                            | `services/kds/HttpKdsService.ts`         |
| Poll stops on disconnect                              | `HttpKdsService.stopPolling`                                                             | `services/kds/HttpKdsService.ts`         |
| Ticket sent after payment                             | `OrderSyncService.syncOrderToPlatform` → `dispatchKdsTicket()` after `updateSyncSuccess` | `services/sync/OrderSyncService.ts`      |
| Retry via BackgroundSyncService backoff               | `BackgroundSyncService.performSync` → `syncAllPendingOrders`                             | `services/sync/BackgroundSyncService.ts` |
| KDS failure logged, sync unaffected                   | `OrderSyncService.dispatchKdsTicket` catch                                               | `services/sync/OrderSyncService.ts`      |
