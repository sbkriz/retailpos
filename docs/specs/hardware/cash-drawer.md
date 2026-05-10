# Cash Drawer – EARS Requirements

> **System**: RetailPOS – Cash Drawer
> **Actor**: Cashier, System
> **Date**: 2026-05-10
> **Source**: `services/drawer/CashDrawerServiceInterface.ts`, `services/drawer/CashDrawerServiceFactory.ts`, `services/drawer/PrinterCashDrawerService.ts`, `services/drawer/ElectronDrawerDriver.ts`, `services/checkout/CheckoutService.ts`, `contexts/BasketProvider.tsx`, `screens/settings/hardware/CashDrawerSettingsTab.tsx`, `hooks/useCashDrawerStatus.ts`

---

## Context

The cash drawer subsystem provides a unified `open()` / `isOpen()` interface over three possible hardware paths: an ESC/POS printer with an RJ-11 drawer-kick port, an Electron IPC channel, or a no-op fallback when no drawer hardware is present.

`CashDrawerServiceFactory` is a singleton that resolves the correct driver lazily on the first call to `getService()`. Resolution follows a fixed priority order so that the most capable available driver is always selected. The factory can be reset to force re-resolution after hardware state changes.

The drawer is opened as a fire-and-forget side effect of cash payment completion — it must never block or throw during the checkout flow.

### Driver Priority

| Priority | Condition                                                     | Driver                                    |
| -------- | ------------------------------------------------------------- | ----------------------------------------- |
| 1        | `PrinterServiceFactory.isConnectedToPrinter()` returns `true` | `PrinterDrawerDriver` (ESC/POS via RJ-11) |
| 2        | `isElectron()` and an active printer config exists            | `ElectronDrawerDriver` (IPC)              |
| 3        | Neither condition met                                         | `NoOpDrawerDriver`                        |

### Driver Capabilities

| Driver                 | `open()` result                  | `isOpen()` result                |
| ---------------------- | -------------------------------- | -------------------------------- |
| `PrinterDrawerDriver`  | ESC/POS drawer-kick command sent | `printer.getStatus().drawerOpen` |
| `ElectronDrawerDriver` | IPC `drawerOpen` called          | IPC `drawerIsOpen` called        |
| `NoOpDrawerDriver`     | Always `true`                    | Always `undefined`               |

---

## 1. Ubiquitous Requirements

**1.1** The system shall expose cash drawer control through a common interface providing `open(pin?)` and `isOpen()` methods.

**1.2** `CashDrawerServiceFactory` shall be a singleton — a single instance is shared across the application for the lifetime of the session.

**1.3** `open()` shall never throw an exception — errors shall be caught internally and the method shall return `false` on failure, allowing the checkout flow to continue uninterrupted.

**1.4** The drawer driver shall be resolved lazily on the first call to `getService()` and cached for subsequent calls until `reset()` is invoked.

---

## 2. Event-Driven Requirements

### 2.1 Factory — Driver Resolution

**2.1.1** When `CashDrawerServiceFactory.getService()` is called and `PrinterServiceFactory.isConnectedToPrinter()` returns `true`, the system shall return a `PrinterDrawerDriver` instance.

**2.1.2** When `CashDrawerServiceFactory.getService()` is called, `isConnectedToPrinter()` returns `false`, `isElectron()` returns `true`, and an active printer config exists, the system shall return an `ElectronDrawerDriver` instance.

**2.1.3** When `CashDrawerServiceFactory.getService()` is called and neither condition in **2.1.1** nor **2.1.2** is met, the system shall return a `NoOpDrawerDriver` instance.

**2.1.4** When `CashDrawerServiceFactory.reset()` is called, the system shall discard the cached driver so that the next call to `getService()` re-evaluates the resolution priority from scratch.

### 2.2 PrinterDrawerDriver

**2.2.1** When `PrinterDrawerDriver.open(pin?)` is called and `printer.isConnected()` returns `true`, the system shall call `printer.openDrawer(pin)` to send the ESC/POS drawer-kick command via the RJ-11 port (pin 2 or pin 5).

**2.2.2** When `PrinterDrawerDriver.open(pin?)` is called and `printer.isConnected()` returns `false`, the system shall return `false` without attempting to send the command.

**2.2.3** When `PrinterDrawerDriver.isOpen()` is called, the system shall call `printer.getStatus()` and return the `drawerOpen` field from the status response.

### 2.3 ElectronDrawerDriver

**2.3.1** When `ElectronDrawerDriver.open(pin?)` is called and the Electron API is available, the system shall call `getElectronAPI().drawerOpen(printerConfig, pin)` and return the result.

**2.3.2** When `ElectronDrawerDriver.open(pin?)` is called and the Electron API is unavailable, the system shall return `false` without throwing.

**2.3.3** When `ElectronDrawerDriver.isOpen()` is called and the Electron API is available, the system shall call `getElectronAPI().drawerIsOpen(printerConfig)` and return the result.

**2.3.4** When `ElectronDrawerDriver.isOpen()` is called and the Electron API is unavailable, the system shall return `false`.

### 2.4 NoOpDrawerDriver

**2.4.1** When `NoOpDrawerDriver.open()` is called, the system shall return `true` immediately — the checkout flow may proceed as if the drawer opened successfully.

**2.4.2** When `NoOpDrawerDriver.isOpen()` is called, the system shall return `undefined` — drawer state is unknown when no hardware is present.

### 2.5 Drawer Settings UI

**2.5.1** When `CashDrawerSettingsTab` mounts, the system shall load drawer settings from `keyValueRepository` under key `'cashDrawerSettings'` and populate the UI fields.

**2.5.2** The settings shall include: `pin` (2 or 5) for the RJ-11 drawer kick pin, and `openOnCash` (boolean) to control automatic opening on cash payments.

**2.5.3** When the user changes the pin selection, the system shall mark the form as dirty and show the Save button.

**2.5.4** When the user toggles "Automatically open drawer on cash payments", the system shall mark the form as dirty and show the Save button.

**2.5.5** When the user taps Save, the system shall persist the settings to `keyValueRepository` and show a success alert.

**2.5.6** The pin selector shall display two options: Pin 2 (default, most common) and Pin 5, with helper text indicating "Most cash drawers use Pin 2".

### 2.6 Drawer Status Monitoring

**2.6.1** `useCashDrawerStatus` hook shall accept a `drawerService` and `pollIntervalMs` (default 5000ms) and return `{ isOpen, isPolling, refresh }`.

**2.6.2** When the hook mounts with a valid drawer service (not `'none'` driver), the system shall immediately call `drawerService.isOpen()` and then poll at the specified interval.

**2.6.3** When the hook mounts with a `'none'` driver or `null` service, the system shall set `isOpen = undefined` and `isPolling = false` without starting the poll.

**2.6.4** When `drawerService.isOpen()` throws an error, the system shall log the error and set `isOpen = undefined` — polling shall continue.

**2.6.5** When the hook unmounts, the system shall clear the polling interval.

**2.6.6** When `refresh()` is called, the system shall immediately check the drawer status without waiting for the next poll interval.

### 2.7 Checkout Integration

**2.7.1** When `CheckoutService.completePayment()` is called with `paymentMethod === 'cash'` and `posConfig.values.drawerOpenOnCash` is `true`, the system shall set `openDrawer: true` in the payment completion result.

**2.7.2** When the basket UI (`BasketContent` or `Basket`) receives a payment completion result with `openDrawer: true`, the system shall call `cashDrawerServiceFactory.getService().open()` as a fire-and-forget operation — the result is not awaited and does not affect the checkout outcome.

### 2.8 Audit Logging

**2.8.1** When `PrinterDrawerDriver.open()` successfully sends the drawer kick command, the system shall call `auditLogService.log('drawer:opened', { driver: 'printer', pin })`.

**2.8.2** When `ElectronDrawerDriver.open()` successfully opens the drawer via IPC, the system shall call `auditLogService.log('drawer:opened', { driver: 'electron', pin })`.

**2.8.3** When a drawer `open()` call fails, the system shall call `auditLogService.log('hardware:error', { device: 'cash_drawer', error })`.

**2.8.4** When the drawer is detected as closed after being open, the system shall call `auditLogService.log('drawer:closed', { timestamp })`.

---

## 3. State-Driven Requirements

**3.1** While `PrinterServiceFactory.isConnectedToPrinter()` returns `true`, `getService()` shall always resolve to `PrinterDrawerDriver` — the Electron and no-op paths are not evaluated.

**3.2** While the cached driver is set (i.e. `reset()` has not been called since the last `getService()`), subsequent calls to `getService()` shall return the cached driver without re-evaluating the priority order.

**3.3** While `posConfig.values.drawerOpenOnCash` is `false`, the drawer shall not be opened regardless of payment method.

---

## 4. Optional Feature Requirements

**4.1** Where the `open(pin?)` method is called with an explicit pin argument, the driver shall use that pin (2 or 5) for the drawer-kick command; where no pin is provided, the driver shall use the default pin.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If `printer.openDrawer()` throws (e.g. printer disconnected mid-call), `PrinterDrawerDriver.open()` shall catch the error and return `false` — the checkout flow shall not be interrupted.

**5.2** If `getElectronAPI()` returns `null` or `undefined`, `ElectronDrawerDriver` shall treat the API as unavailable and return `false` from both `open()` and `isOpen()` without throwing.

**5.3** If `getService()` is called concurrently before the first resolution completes, both calls shall receive the same driver instance — the factory shall not create duplicate drivers.

**5.4** If `reset()` is called while a drawer `open()` call is in flight, the in-flight call shall complete against the previously resolved driver; the next `getService()` call after `reset()` will re-resolve.

**5.5** If the drawer status changes from open to closed, the `useCashDrawerStatus` hook shall detect this on the next poll and update `isOpen` accordingly — the `drawer:closed` audit log is emitted by the driver or service layer, not by the hook.

---

## 6. Component Traceability

| Requirement (summary)                                 | Component / Service                               | Source File                                           |
| ----------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| Factory singleton, priority-based resolution          | `CashDrawerServiceFactory.getService`             | `services/drawer/CashDrawerServiceFactory.ts`         |
| `reset()` invalidates cached driver                   | `CashDrawerServiceFactory.reset`                  | `services/drawer/CashDrawerServiceFactory.ts`         |
| `open()` / `isOpen()` interface contract              | `CashDrawerServiceInterface`                      | `services/drawer/CashDrawerServiceInterface.ts`       |
| Printer driver: checks connection before kick         | `PrinterDrawerDriver.open`                        | `services/drawer/PrinterCashDrawerService.ts`         |
| Printer driver: ESC/POS drawer-kick (pin 2 or 5)      | `PrinterDrawerDriver.open` → `printer.openDrawer` | `services/drawer/PrinterCashDrawerService.ts`         |
| Printer driver: status via `printer.getStatus()`      | `PrinterDrawerDriver.isOpen`                      | `services/drawer/PrinterCashDrawerService.ts`         |
| Printer driver: audit logging                         | `PrinterDrawerDriver.open` → `auditLogService`    | `services/drawer/PrinterCashDrawerService.ts`         |
| Electron driver: IPC `drawerOpen`                     | `ElectronDrawerDriver.open`                       | `services/drawer/ElectronDrawerDriver.ts`             |
| Electron driver: IPC `drawerIsOpen`                   | `ElectronDrawerDriver.isOpen`                     | `services/drawer/ElectronDrawerDriver.ts`             |
| Electron driver: graceful fallback if API unavailable | `ElectronDrawerDriver.open` / `isOpen`            | `services/drawer/ElectronDrawerDriver.ts`             |
| Electron driver: audit logging                        | `ElectronDrawerDriver.open` → `auditLogService`   | `services/drawer/ElectronDrawerDriver.ts`             |
| NoOp driver: `open()` always `true`                   | `NoOpDrawerDriver.open`                           | `services/drawer/CashDrawerServiceFactory.ts`         |
| NoOp driver: `isOpen()` always `undefined`            | `NoOpDrawerDriver.isOpen`                         | `services/drawer/CashDrawerServiceFactory.ts`         |
| Drawer settings UI                                    | `CashDrawerSettingsTab`                           | `screens/settings/hardware/CashDrawerSettingsTab.tsx` |
| Settings: pin selector (2 or 5)                       | `CashDrawerSettingsTab` pin buttons               | `screens/settings/hardware/CashDrawerSettingsTab.tsx` |
| Settings: auto-open on cash toggle                    | `CashDrawerSettingsTab` checkbox                  | `screens/settings/hardware/CashDrawerSettingsTab.tsx` |
| Settings: save to keyValueRepository                  | `CashDrawerSettingsTab.handleSave`                | `screens/settings/hardware/CashDrawerSettingsTab.tsx` |
| Status monitoring hook                                | `useCashDrawerStatus`                             | `hooks/useCashDrawerStatus.ts`                        |
| Status polling (5s default)                           | `useCashDrawerStatus` interval                    | `hooks/useCashDrawerStatus.ts`                        |
| Status refresh on demand                              | `useCashDrawerStatus.refresh`                     | `hooks/useCashDrawerStatus.ts`                        |
| `openDrawer: true` when cash + config enabled         | `CheckoutService.completePayment`                 | `services/checkout/CheckoutService.ts`                |
| Fire-and-forget `open()` from basket UI               | `BasketContent` / `Basket` payment handler        | `contexts/BasketProvider.tsx`                         |
| `drawer:opened` audit action                          | `AuditLogService` + driver implementations        | `services/audit/AuditLogService.ts`                   |
| `drawer:closed` audit action                          | `AuditLogService` + driver implementations        | `services/audit/AuditLogService.ts`                   |
| `hardware:error` audit action                         | `AuditLogService` + driver implementations        | `services/audit/AuditLogService.ts`                   |
