# Thermal Printer – EARS Requirements

> **System**: RetailPOS – Thermal Printer & Receipt Printing
> **Actor**: Cashier, Manager, System
> **Date**: 2026-04-13
> **Source**: `services/printer/PrinterTypes.ts`, `services/printer/BasePrinterService.ts`, `services/printer/PrinterServiceFactory.ts`, `services/printer/UnifiedPrinterService.ts`, `services/printer/ElectronPrinterService.ts`, `services/printer/ReceiptConfigService.ts`, `services/printer/DailyReportService.ts`, `screens/PrinterScreen.tsx`

---

## Context

The printer subsystem supports thermal receipt printers over three connection types — network (TCP/IP), USB, and Bluetooth — behind a common `BasePrinterService` interface. A singleton `PrinterServiceFactory` manages the active printer connection and delegates all print operations to a single `UnifiedPrinterService` (mobile/tablet) or `ElectronPrinterService` (desktop).

Receipt layout is driven by `ReceiptConfigService`, which persists branding, footer text, paper width, printer model capabilities, and print options to `keyValueRepository`. `DailyReportService` handles shift management and formats daily sales reports for printing.

### Implementation Selection

| Condition                | Implementation                                                |
| ------------------------ | ------------------------------------------------------------- |
| `USE_MOCK_PRINTERS=true` | `UnifiedPrinterServiceMock`                                   |
| `isElectron()`           | `ElectronPrinterService` (IPC to main process)                |
| Mobile / Tablet          | `UnifiedPrinterService` (`@tillpos/rn-receipt-printer-utils`) |

### Connection Types

| Type        | Transport        | Config fields              |
| ----------- | ---------------- | -------------------------- |
| `network`   | TCP/IP port 9100 | `ipAddress`, `port`        |
| `usb`       | USB HID          | `vendorId`, `productId`    |
| `bluetooth` | BLE              | `macAddress`, `deviceName` |

### Printer Model Presets

| Model         | Char width (80mm) | Cut | Cash drawer |
| ------------- | ----------------- | --- | ----------- |
| `epson`       | 48                | Yes | Yes         |
| `snbc_orient` | 48                | Yes | Yes         |
| `star`        | 48                | Yes | Yes         |
| `citizen`     | 42                | Yes | Yes         |
| `generic`     | 32                | Yes | No          |

---

## 1. Ubiquitous Requirements

**1.1** `PrinterServiceFactory` shall be a singleton — a single instance is shared across the application.

**1.2** The factory shall select `UnifiedPrinterServiceMock`, `ElectronPrinterService`, or `UnifiedPrinterService` at construction time based on `USE_MOCK_PRINTERS` and `isElectron()` — this selection cannot change at runtime.

**1.3** Printer configurations shall be persisted to `keyValueRepository` under the key `'printerSettings'` as a `PrinterConfig[]` array and loaded via `loadPrinters()` at app startup.

**1.4** Receipt layout (header, footer, options, printer model) shall be driven entirely by `ReceiptConfigService` — no layout values shall be hardcoded in print methods.

**1.5** `openDrawer()` shall send the ESC/POS drawer-kick command (`DRAWER_KICK_PIN2` or `DRAWER_KICK_PIN5`) via the active printer connection — it is the authoritative drawer-open path for the printer subsystem.

**1.6** All print operations shall return `boolean` — `true` on success, `false` on failure — and shall never throw to the caller.

---

## 2. Event-Driven Requirements

### 2.1 Factory — Printer Management

**2.1.1** When `PrinterServiceFactory.loadPrinters()` is called, the system shall read the persisted `PrinterConfig[]` from `keyValueRepository` and populate `availablePrinters`. Subsequent calls shall be no-ops.

**2.1.2** When `PrinterServiceFactory.connectToPrinter(printerName)` is called, the system shall look up the printer by name in `availablePrinters`, disconnect any active printer, map the `PrinterConfig` to the unified config shape, and call `unifiedPrinterService.connect(unifiedConfig)`.

**2.1.3** When `connectToPrinter` succeeds, the system shall set `activePrinterService` and `activePrinterConfig` and return `true`.

**2.1.4** When `connectToPrinter` fails (printer not found, connection refused), the system shall clear `activePrinterService` and `activePrinterConfig` and return `false`.

**2.1.5** When `PrinterServiceFactory.updatePrinterConfig(printerName, config)` is called, the system shall upsert the config in `availablePrinters` and persist the updated list to `keyValueRepository`.

**2.1.6** When `PrinterServiceFactory.removePrinterConfig(printerName)` is called, the system shall remove the entry from `availablePrinters` and persist the updated list.

**2.1.7** When `PrinterServiceFactory.disconnect()` is called, the system shall call `disconnect()` on the active printer service and clear `activePrinterService` and `activePrinterConfig`.

**2.1.8** When `PrinterServiceFactory.testConnection(config)` is called, the system shall attempt a temporary connection via `unifiedPrinterService.connect()` and immediately disconnect — the active printer is not affected.

### 2.2 Printer Discovery

**2.2.1** When `PrinterServiceFactory.discoverPrinters()` is called on Electron, the system shall call `ElectronPrinterService.discoverPrinters()` which delegates to the main process via `api.printerDiscover()` (mDNS / USB enumeration), merge discovered printers with the persisted list (deduplicating by name), and return the combined list.

**2.2.2** When `PrinterServiceFactory.discoverPrinters()` is called on mobile/tablet, the system shall return the persisted `availablePrinters` list — no active discovery is performed.

### 2.3 Printing a Receipt

**2.3.1** When `PrinterServiceFactory.printReceipt(data)` is called and `activePrinterService` is set, the system shall delegate to `activePrinterService.printReceipt(data)`.

**2.3.2** When `PrinterServiceFactory.printReceipt(data)` is called and no printer is connected, the system shall throw `'Not connected to a printer'`.

**2.3.3** When `UnifiedPrinterService.printReceipt(data)` is called, the system shall:

1. Call `printerInstance.init()` to reset the printer state.
2. Print the header (business name, address, phone, tax ID) from `ReceiptConfigService` — center-aligned, business name bold.
3. Print order metadata (order ID, date, cashier name, optional customer name) — left-aligned.
4. Print each line item: single-quantity items on one line; multi-quantity items with a quantity × unit price sub-line.
5. Print subtotal, tax, and bold total — right-aligned.
6. Print payment method — center-aligned.
7. Print footer lines from `ReceiptConfigService` — center-aligned.
8. Call `printerInstance.cutPaper()` if `config.options.cutPaper` is `true` and the printer model supports cut.

**2.3.4** When `ElectronPrinterService.printReceipt(data)` is called, the system shall build the ESC/POS byte buffer via `formatReceiptBuffer(data)`, optionally append the drawer-kick command if `config.options.openCashDrawer` is `true`, and send the combined buffer via `api.printerSendRawData(base64, printerConfig)`.

**2.3.5** When `formatReceiptBuffer(data)` is called, the system shall produce a `Uint8Array` of ESC/POS commands encoding the full receipt layout — identical structure to **2.3.3** but as raw bytes rather than SDK calls.

### 2.4 Cash Drawer via Printer

**2.4.1** When `BasePrinterService.openDrawer(pin?)` is called, the system shall send the ESC/POS `DRAWER_KICK_PIN2` (default) or `DRAWER_KICK_PIN5` command bytes via `sendBytes()`.

**2.4.2** When `openDrawer()` is called and `isConnected()` returns `false`, the system shall return `false` without sending any command.

**2.4.3** When `ElectronPrinterService.sendBytes(data)` is called, the system shall base64-encode the byte array and call `api.printerSendRawData(base64, printerConfig)` via Electron IPC.

**2.4.4** When `UnifiedPrinterService.sendBytes(data)` is called, the system shall base64-encode the byte array and call `printerInstance.printRawData(base64, ...)` with the appropriate connection parameters.

### 2.5 Printer Status

**2.5.1** When `PrinterServiceFactory.getPrinterStatus()` is called and a printer is connected, the system shall delegate to `activePrinterService.getStatus()` and return the `PrinterStatus`.

**2.5.2** When `PrinterServiceFactory.getPrinterStatus()` is called and no printer is connected, the system shall return `{ isOnline: false, hasPaper: false, errorMessage: 'No printer connected' }`.

**2.5.3** When `ElectronPrinterService.getStatus()` is called, the system shall call `api.printerGetStatus(printerConfig)` via IPC and update `_isConnected` based on the response.

### 2.6 Receipt Configuration

**2.6.1** When `ReceiptConfigService.initialize()` is called, the system shall load the persisted `ReceiptConfig` from `keyValueRepository` under `'receipt_config'`, merging with defaults. Subsequent calls shall be no-ops.

**2.6.2** When `ReceiptConfigService.updateConfig(updates)` is called, the system shall deep-merge the updates into the current config and persist the result immediately.

**2.6.3** When `ReceiptConfigService.setPrinterModel(modelType)` is called, the system shall apply the preset for that model type and adjust `characterWidth` downward by 33% if `paperWidth === 58`.

**2.6.4** When `ReceiptConfigService.formatLine(left, right)` is called, the system shall pad the left string with spaces so the combined line fills `characterWidth` characters, truncating the left string with `'...'` if necessary.

### 2.7 Daily Report & Shift Management

**2.7.1** When `DailyReportService.openShift(cashierName, cashierId, openingCash)` is called and no shift is open, the system shall create a `ShiftData` record with `status: 'open'` and persist it to `keyValueRepository` under `'current_shift'`.

**2.7.2** When `DailyReportService.openShift()` is called while a shift is already open, the system shall throw `'A shift is already open. Please close it first.'`

**2.7.3** When `DailyReportService.closeShift(closingCash)` is called, the system shall set `endTime`, `closingCash`, and `status: 'closed'` on the current shift, append it to the shift history in `keyValueRepository`, and clear `current_shift`.

**2.7.4** When `DailyReportService.generateDailyReport(orders, shift?)` is called, the system shall filter orders to those within the shift's time range and matching `cashierId`, then calculate `totalSales`, `totalTax`, `totalDiscount`, `netSales`, `averageOrderValue`, `paymentBreakdown`, `itemsSold`, `refunds`, and `refundAmount` using safe money arithmetic.

**2.7.5** When `DailyReportService.formatDailyReportForPrint(report, currencySymbol)` is called, the system shall return a `string[]` of formatted lines ready for printing, including: header, shift info, sales summary, payment breakdown, cash drawer reconciliation (if opening cash is set), and refund summary (if refunds > 0).

### 2.8 PrinterScreen — UI Flow

**2.8.1** When `PrinterScreen` mounts, the system shall call `printerService.getAvailablePrinters()` and populate the printer list. If a printer is already connected, it shall be shown as selected.

**2.8.2** When the cashier taps a printer in the list, the system shall call `printerService.connectToPrinter(printerName)` and show a success or failure alert.

**2.8.3** When the cashier taps "Print Receipt" and a printer is connected and the cart is non-empty, the system shall build a `ReceiptData` from the current cart items and call `printerService.printReceipt(receiptData)`.

**2.8.4** When `printReceipt` succeeds, `PrinterScreen` shall show a success alert with options to clear the cart or keep items.

**2.8.5** When `printReceipt` fails, `PrinterScreen` shall show an error alert.

---

## 3. State-Driven Requirements

**3.1** While `isConnecting` is `true` in `PrinterScreen`, the printer list items shall be non-interactive and a connecting indicator shall be shown.

**3.2** While `isPrinting` is `true` in `PrinterScreen`, the "Print Receipt" button shall be disabled and a printing indicator shall be shown.

**3.3** While no printer is selected or the cart is empty, the "Print Receipt" button shall be disabled.

**3.4** While `isConnectedToPrinter()` returns `true`, `CashDrawerServiceFactory` shall resolve to `PrinterDrawerDriver` on the next `getService()` call (see cash drawer spec).

**3.5** While `config.options.cutPaper` is `true` and `printerModel.supportsCut` is `true`, every receipt print shall end with a paper cut command.

**3.6** While `config.options.openCashDrawer` is `true` on Electron, `ElectronPrinterService.printReceipt()` shall append the drawer-kick bytes to the print buffer.

---

## 4. Optional Feature Requirements

**4.1** Where `ReceiptData.customerName` is provided, the receipt shall include a `Customer:` line in the order metadata section.

**4.2** Where `ReceiptData.notes` is provided, the receipt shall include the notes text before the footer.

**4.3** Where `config.options.printQRCode` is `true` and `printerModel.supportsQRCode` is `true`, the receipt may include a QR code (implementation deferred — flag is stored but not yet rendered).

**4.4** Where `config.options.printBarcode` is `true` and `printerModel.supportsBarcode` is `true`, the receipt may include a barcode (implementation deferred — flag is stored but not yet rendered).

**4.5** Where `config.options.copies > 1`, the print operation shall repeat the receipt that many times (implementation deferred — flag is stored but not yet applied).

**4.6** Where `DailyReportService.formatDailyReportForPrint` includes a cash drawer section, the system shall calculate and display the variance between expected cash (opening + cash sales) and actual closing cash.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If `loadPrinters()` reads malformed JSON from `keyValueRepository`, the system shall catch the error, set `availablePrinters` to an empty array, and mark `printersLoaded = true` — the app shall not crash.

**5.2** If `connectToPrinter()` is called with a name not in `availablePrinters`, the system shall throw `'Printer "{name}" not found'` and return `false`.

**5.3** If the `@tillpos/rn-receipt-printer-utils` module fails to load dynamically in `UnifiedPrinterService.connect()`, the system shall throw with the import error message — the caller receives `false` from `connectToPrinter()`.

**5.4** If `ElectronAPI` is unavailable when `ElectronPrinterService.connect()` is called, the system shall return `false` without throwing.

**5.5** If `sendBytes()` is called on `AbstractPrinterService` (base class, not overridden), it shall return `false` — subclasses must override to enable raw byte sending.

**5.6** If `openShift()` is called when a shift is already open, the system shall throw rather than silently overwriting the existing shift — data integrity is preserved.

**5.7** If `generateDailyReport()` is called with no shift data, the system shall throw `'No shift data available for report.'`

**5.8** If `PrinterScreen` is opened before `loadPrinters()` has been called, `getAvailablePrinters()` returns an empty array — the screen shows "No printers found." The cashier must navigate away and back after printers are loaded.

---

## 6. Component Traceability

| Requirement (summary)                                   | Component / Service                                | Source File                                  |
| ------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| Factory singleton, implementation selection             | `PrinterServiceFactory.getInstance`                | `services/printer/PrinterServiceFactory.ts`  |
| `loadPrinters()` from `keyValueRepository`              | `PrinterServiceFactory.loadPrinters`               | `services/printer/PrinterServiceFactory.ts`  |
| `connectToPrinter(name)` → unified config mapping       | `PrinterServiceFactory.connectToPrinter`           | `services/printer/PrinterServiceFactory.ts`  |
| `updatePrinterConfig` / `removePrinterConfig` + persist | `PrinterServiceFactory`                            | `services/printer/PrinterServiceFactory.ts`  |
| `testConnection` — temporary connect/disconnect         | `PrinterServiceFactory.testConnection`             | `services/printer/PrinterServiceFactory.ts`  |
| `discoverPrinters` — Electron IPC or persisted list     | `PrinterServiceFactory.discoverPrinters`           | `services/printer/PrinterServiceFactory.ts`  |
| `printReceipt` delegates to active service              | `PrinterServiceFactory.printReceipt`               | `services/printer/PrinterServiceFactory.ts`  |
| `getPrinterStatus` delegates to active service          | `PrinterServiceFactory.getPrinterStatus`           | `services/printer/PrinterServiceFactory.ts`  |
| ESC/POS command constants                               | `ESC_POS_COMMANDS`                                 | `services/printer/BasePrinterService.ts`     |
| `formatReceiptBuffer` — ESC/POS byte buffer             | `AbstractPrinterService.formatReceiptBuffer`       | `services/printer/BasePrinterService.ts`     |
| `openDrawer(pin)` — ESC/POS drawer-kick                 | `AbstractPrinterService.openDrawer`                | `services/printer/BasePrinterService.ts`     |
| `sendBytes` — raw byte dispatch (override per impl)     | `AbstractPrinterService.sendBytes`                 | `services/printer/BasePrinterService.ts`     |
| Mobile receipt print via SDK                            | `UnifiedPrinterService.printReceipt`               | `services/printer/UnifiedPrinterService.ts`  |
| Mobile raw bytes via `printRawData`                     | `UnifiedPrinterService.sendBytes`                  | `services/printer/UnifiedPrinterService.ts`  |
| Electron receipt print via ESC/POS buffer + IPC         | `ElectronPrinterService.printReceipt`              | `services/printer/ElectronPrinterService.ts` |
| Electron raw bytes via `api.printerSendRawData`         | `ElectronPrinterService.sendBytes`                 | `services/printer/ElectronPrinterService.ts` |
| Electron status via `api.printerGetStatus`              | `ElectronPrinterService.getStatus`                 | `services/printer/ElectronPrinterService.ts` |
| Electron discovery via `api.printerDiscover`            | `ElectronPrinterService.discoverPrinters`          | `services/printer/ElectronPrinterService.ts` |
| Receipt config load / persist                           | `ReceiptConfigService.initialize` / `updateConfig` | `services/printer/ReceiptConfigService.ts`   |
| Printer model presets + char width adjustment           | `ReceiptConfigService.setPrinterModel`             | `services/printer/ReceiptConfigService.ts`   |
| `formatLine` — padded two-column layout                 | `ReceiptConfigService.formatLine`                  | `services/printer/ReceiptConfigService.ts`   |
| Shift open / close / persist                            | `DailyReportService.openShift` / `closeShift`      | `services/printer/DailyReportService.ts`     |
| Daily report generation with safe money math            | `DailyReportService.generateDailyReport`           | `services/printer/DailyReportService.ts`     |
| Daily report formatted for print                        | `DailyReportService.formatDailyReportForPrint`     | `services/printer/DailyReportService.ts`     |
| Printer list loaded on mount                            | `PrinterScreen` useEffect                          | `screens/PrinterScreen.tsx`                  |
| Connect on tap                                          | `PrinterScreen.handleConnectPrinter`               | `screens/PrinterScreen.tsx`                  |
| Print receipt from cart                                 | `PrinterScreen.handlePrintReceipt`                 | `screens/PrinterScreen.tsx`                  |
| Button disabled when no printer / empty cart            | `PrinterScreen` render                             | `screens/PrinterScreen.tsx`                  |
