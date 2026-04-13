# Notifications – EARS Requirements

> **System**: RetailPOS – In-App Notification System
> **Actor**: Cashier, Manager, System
> **Date**: 2026-04-13
> **Source**: `services/notifications/NotificationService.ts`, `services/notifications/NotificationTypes.ts`, `contexts/NotificationProvider.tsx`, `components/NotificationBell.tsx`, `components/NotificationDrawer.tsx`, `components/Toast.tsx`, `services/sync/BackgroundSyncService.ts`, `services/returns/ReturnService.ts`

---

## Context

The notification system provides a non-blocking, in-app channel for surfacing background events to the cashier or manager — primarily sync outcomes and return results. It is intentionally decoupled from the checkout flow: producers call `notificationService.notify()` fire-and-forget, and the UI layer reacts independently.

The system has two layers:

- **Service layer** (`NotificationService`) — a singleton in-memory store that holds up to 100 notifications and emits events to registered listeners.
- **UI layer** (`NotificationProvider`, `NotificationBell`, `NotificationDrawer`, `Toast`) — React context that subscribes to the service, maintains UI state, and renders the bell badge, drawer, and transient toast.

### Producers

| Producer                | Event                                        | Severity  |
| ----------------------- | -------------------------------------------- | --------- |
| `BackgroundSyncService` | Orders synced successfully                   | `success` |
| `BackgroundSyncService` | One or more orders failed to sync            | `error`   |
| `BackgroundSyncService` | Background sync encountered an error         | `warning` |
| `ReturnService`         | Return processed successfully                | `info`    |
| `ReturnService`         | Platform refund failed after return recorded | `warning` |

### Actors

| Actor             | Role                                                  |
| ----------------- | ----------------------------------------------------- |
| System            | Produces notifications from background services       |
| Cashier / Manager | Views toast pop-ups, opens drawer, marks read, clears |

---

## 1. Ubiquitous Requirements

**1.1** The system shall store notifications in memory only — no persistence to SQLite or AsyncStorage. Notifications are lost on app restart by design.

**1.2** The system shall cap the in-memory list at 100 notifications, discarding the oldest when the limit is exceeded.

**1.3** Every notification shall carry: `id`, `title`, `message`, `severity` (`info` | `warning` | `error` | `success`), `timestamp`, and `read` flag.

**1.4** Notifications may optionally carry an `actionLabel`, `actionKey`, and `actionPayload` to support tappable actions in the drawer.

**1.5** The system shall never block a producer — `notify()` is synchronous and listener errors are silently swallowed.

**1.6** `NotificationProvider` shall be mounted at the root of the app so all screens share the same notification state.

---

## 2. Event-Driven Requirements

### 2.1 Producing a Notification

**2.1.1** When `notificationService.notify(title, message, severity, action?)` is called, the system shall prepend the new notification to the in-memory list (newest first), assign a unique `id`, set `read: false`, and emit the notification to all registered listeners.

**2.1.2** When the in-memory list exceeds 100 items after prepend, the system shall truncate to the 100 most recent notifications.

**2.1.3** When `BackgroundSyncService` completes a sync cycle with `result.synced > 0`, the system shall call `notificationService.notify('Orders Synced', '{n} order(s) synced successfully.', 'success')`.

**2.1.4** When `BackgroundSyncService` completes a sync cycle with `result.failed > 0`, the system shall call `notificationService.notify('Sync Failed', '{n} order(s) failed to sync. Will retry automatically.', 'error')`.

**2.1.5** When `BackgroundSyncService` catches an unhandled error during sync and `consecutiveFailures <= 3`, the system shall call `notificationService.notify('Sync Error', 'Background sync encountered an error. Retrying…', 'warning')`.

**2.1.6** When `ReturnService.processReturn()` completes successfully, the system shall call `notificationService.notify('Return Processed', '{n} item(s) returned for order {orderId}', 'info')`.

**2.1.7** When `ReturnService.processReturn()` records the return locally but the platform refund call fails, the system shall call `notificationService.notify('Refund Warning', 'Return recorded but platform refund failed: {error}', 'warning')`.

### 2.2 NotificationProvider — Subscription

**2.2.1** When `NotificationProvider` mounts, the system shall load the current notification list and unread count from `notificationService.getAll()` and `notificationService.getUnreadCount()` into React state.

**2.2.2** When `NotificationProvider` mounts, the system shall register a listener via `notificationService.addListener()` and unregister it on unmount.

**2.2.3** When a new notification arrives via the listener, the system shall update `notifications` and `unreadCount` state and set `latestToast` to the new notification.

### 2.3 Toast

**2.3.1** When `latestToast` is set to a non-null notification, the `Toast` component shall spring-animate into view from the top of the screen.

**2.3.2** When `latestToast` is set, `NotificationProvider` shall start a 4-second timer; when the timer fires, `latestToast` shall be set to `null` and the toast shall animate out.

**2.3.3** When the cashier taps the dismiss button on the toast, the system shall call `dismissToast()`, setting `latestToast` to `null` immediately.

**2.3.4** When `latestToast` is `null`, the `Toast` component shall render nothing.

**2.3.5** When a second notification arrives before the 4-second timer expires, the system shall replace `latestToast` with the newer notification and reset the 4-second timer.

### 2.4 Notification Bell

**2.4.1** When `unreadCount > 0`, `NotificationBell` shall render a red badge overlaid on the bell icon showing the count.

**2.4.2** When `unreadCount > 99`, the badge shall display `'99+'` instead of the numeric count.

**2.4.3** When `unreadCount === 0`, the badge shall not be rendered.

**2.4.4** When the cashier taps the bell, the system shall call the `onPress` callback (opening the `NotificationDrawer`).

### 2.5 Notification Drawer

**2.5.1** When the drawer opens, the system shall render all notifications newest-first with severity icon, title, relative timestamp, message (max 2 lines), and optional action label.

**2.5.2** When the cashier taps a notification row, the system shall call `markRead(id)` and, if `actionKey` is set, call `onAction(actionKey, actionPayload)`.

**2.5.3** When `markRead(id)` is called, the system shall update the notification's `read` flag in the service and refresh `notifications` and `unreadCount` state.

**2.5.4** When the cashier taps "Mark all read" (visible only when `unreadCount > 0`), the system shall call `markAllRead()`, setting all notifications to `read: true` and `unreadCount` to `0`.

**2.5.5** When the cashier taps "Clear all" (visible only when `notifications.length > 0`), the system shall call `clearAll()`, emptying the in-memory list and resetting `unreadCount` to `0`.

**2.5.6** When the notification list is empty, the drawer shall render the empty state: bell icon, "No notifications" title, and description text.

**2.5.7** When the cashier taps the close button, the system shall call `onClose()` to hide the drawer.

---

## 3. State-Driven Requirements

**3.1** While `unreadCount > 0`, the `NotificationBell` badge shall be visible with the current count.

**3.2** While `latestToast` is non-null, the `Toast` component shall be visible at the top of the screen above all other content (`zIndex: 9999`).

**3.3** While `notifications` is empty in the drawer, the empty state shall be rendered instead of the list.

**3.4** While a notification row has `read === false`, it shall render with a highlighted background and bold title, plus an unread dot indicator.

---

## 4. Optional Feature Requirements

**4.1** Where a notification carries a non-empty `actionLabel`, the drawer row shall render the label as a tappable link (e.g. "View Order →").

**4.2** Where `onAction` is provided to `NotificationDrawer`, tapping a notification with an `actionKey` shall invoke `onAction(actionKey, actionPayload)` — the caller maps keys to navigation or handler logic.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If a listener throws during `notify()`, the system shall catch the error silently and continue notifying remaining listeners — a bad listener must not break the notification pipeline.

**5.2** If `notify()` is called before `NotificationProvider` has mounted (e.g. during app startup), the notification shall be stored in the service's in-memory list and will be loaded when the provider mounts via `getAll()`.

**5.3** If the app is restarted, all in-memory notifications are lost — this is by design. Notifications are ephemeral status signals, not durable records.

**5.4** If `markRead()` is called with an unknown `id`, the system shall silently do nothing.

---

## 6. Component Traceability

| Requirement (summary)                                 | Component / Service                               | Source File                                     |
| ----------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| Notification produced on sync success                 | `BackgroundSyncService.performSync`               | `services/sync/BackgroundSyncService.ts`        |
| Notification produced on sync failure                 | `BackgroundSyncService.performSync`               | `services/sync/BackgroundSyncService.ts`        |
| Notification produced on return processed             | `ReturnService.processReturn`                     | `services/returns/ReturnService.ts`             |
| Notification produced on refund warning               | `ReturnService.processReturn`                     | `services/returns/ReturnService.ts`             |
| In-memory store, cap at 100, emit to listeners        | `NotificationService.notify`                      | `services/notifications/NotificationService.ts` |
| Provider subscribes on mount, unsubscribes on unmount | `NotificationProvider` useEffect                  | `contexts/NotificationProvider.tsx`             |
| Toast set on new notification                         | `NotificationProvider` listener callback          | `contexts/NotificationProvider.tsx`             |
| Toast auto-dismissed after 4 seconds                  | `NotificationProvider` useEffect on `latestToast` | `contexts/NotificationProvider.tsx`             |
| Toast spring-in / slide-out animation                 | `Toast` useEffect on `notification` prop          | `components/Toast.tsx`                          |
| Bell badge shows unread count                         | `NotificationBell`                                | `components/NotificationBell.tsx`               |
| Badge capped at 99+                                   | `NotificationBell`                                | `components/NotificationBell.tsx`               |
| Drawer renders list newest-first                      | `NotificationDrawer` FlatList                     | `components/NotificationDrawer.tsx`             |
| Tap row → markRead + optional action                  | `NotificationDrawer.handlePress`                  | `components/NotificationDrawer.tsx`             |
| Mark all read                                         | `NotificationDrawer` → `markAllRead`              | `components/NotificationDrawer.tsx`             |
| Clear all                                             | `NotificationDrawer` → `clearAll`                 | `components/NotificationDrawer.tsx`             |
| Empty state in drawer                                 | `NotificationDrawer` ListEmptyComponent           | `components/NotificationDrawer.tsx`             |
| Unread row styling (bold, highlight, dot)             | `NotificationDrawer` renderItem                   | `components/NotificationDrawer.tsx`             |
