# Order History – EARS Requirements

> **System**: RetailPOS – Order History, Shift Management & Daily Reports
> **Actor**: Cashier, Manager, Admin, System
> **Date**: 2026-04-13
> **Source**: `screens/OrderHistoryScreen.tsx`, `screens/order-history/OrderCard.tsx`, `screens/order-history/ShiftModal.tsx`, `screens/order-history/ReportModal.tsx`, `screens/order-history/ReceiptModal.tsx`, `hooks/useDailyReport.ts`, `services/printer/DailyReportService.ts`

---

## Context

Order History is a multi-purpose screen accessible from More → Order History. It combines three concerns:

1. **Order list** — view and act on orders for a given day
2. **Shift management** — open and close cash register shifts with opening/closing cash amounts
3. **Daily reports** — generate and print shift summaries with sales, payment breakdown, and cash reconciliation

Role determines what the user can see and do:

| Capability        | Cashier               | Manager             | Admin               |
| ----------------- | --------------------- | ------------------- | ------------------- |
| View orders       | Own orders today only | All orders, any day | All orders, any day |
| Date navigation   | ❌ locked to today    | ✅                  | ✅                  |
| Resync order      | ✅                    | ✅                  | ✅                  |
| Print receipt     | ✅                    | ✅                  | ✅                  |
| Delete order      | ❌                    | ❌                  | ✅                  |
| Open/close shift  | ✅                    | ✅                  | ✅                  |
| View/print report | ✅                    | ✅                  | ✅                  |
| Pull to refresh   | ✅                    | ✅                  | ✅                  |

### Order Card Status

| `syncStatus` | Badge colour | Badge text | Resync button shown |
| ------------ | ------------ | ---------- | ------------------- |
| `synced`     | green        | Synced     | No                  |
| `failed`     | red          | Failed     | Yes                 |
| `pending`    | amber        | Pending    | Yes                 |

---

## 1. Ubiquitous Requirements

**1.1** Cashiers shall only see their own orders — `orderRepository.findByDateRange(from, to, cashierId)` is called with the authenticated user's ID as a filter.

**1.2** Cashiers shall be locked to today's date — date navigation controls shall not be rendered for `role === 'cashier'`.

**1.3** The Delete button shall only be rendered for `role === 'admin'`.

**1.4** All monetary values shall be formatted using `formatMoney(value, currency.code)` where `currency` comes from `useCurrency()`.

**1.5** Shift state (`currentShift`) shall be loaded from `DailyReportService` on mount via `useDailyReport.reload()`.

---

## 2. Event-Driven Requirements

### 2.1 Loading Orders

**2.1.1** When `OrderHistoryScreen` mounts or `dayOffset` changes, the system shall call `orderRepository.findByDateRange(fromTs, toTs, cashierFilter)` to get order rows for the selected day, then cross-reference with `getLocalOrders()` to build full `LocalOrder` objects, sort newest-first, and set the `orders` state.

**2.1.2** When `isCashier` is `true`, `cashierFilter` shall be set to `user.id` — only the authenticated cashier's orders are returned.

**2.1.3** When `isCashier` is `false`, `cashierFilter` shall be `undefined` — all orders for the day are returned.

**2.1.4** When `loadOrders` throws, the system shall show `Alert.alert('Error', 'Failed to load orders')`.

**2.1.5** When the user pulls to refresh, the system shall call `loadOrders()` and set `refreshing` state accordingly.

### 2.2 Date Navigation (Manager / Admin only)

**2.2.1** When the user taps the left chevron, the system shall decrement `dayOffset` by 1, triggering a reload for the previous day.

**2.2.2** When the user taps the right chevron and `dayOffset < 0`, the system shall increment `dayOffset` by 1.

**2.2.3** When `dayOffset === 0` (today), the right chevron shall be disabled and rendered at reduced opacity.

**2.2.4** When `dayOffset === 0`, the date label shall display `'Today'`; for other offsets it shall display the formatted date (`weekday short, month short, day numeric`).

### 2.3 Resync Order

**2.3.1** When the user taps "Resync" on an order card, the system shall call `syncOrderToPlatform(orderId)`, set `syncingOrderId` to that order's ID during the operation, and show a success or failure alert on completion.

**2.3.2** When resync succeeds, the system shall call `loadOrders()` to refresh the list.

**2.3.3** When `syncingOrderId` matches an order's ID, that card's Resync button shall show `'Syncing...'` and be disabled.

**2.3.4** The Resync button shall only be rendered when `order.syncStatus !== 'synced'`.

### 2.4 Delete Order (Admin only)

**2.4.1** When an admin taps "Delete" on an order, the system shall show a destructive confirmation: `'Are you sure you want to delete this order? This cannot be undone.'`

**2.4.2** When the admin confirms, the system shall call `orderRepository.delete(orderId)`, reload the list, and show `Alert.alert('Deleted', 'Order removed successfully')`.

**2.4.3** When delete throws, the system shall show `Alert.alert('Error', 'Failed to delete order')`.

### 2.5 Print Receipt

**2.5.1** When the user taps "Print" on an order card, the system shall set `selectedOrder` and open `ReceiptModal`.

**2.5.2** When the user taps "Print Receipt" in `ReceiptModal`, the system shall call `getReceiptLines(order)` to format the receipt as a string array and send it to the printer (currently logged to console and shown as an alert).

**2.5.3** When the user taps "Close" in `ReceiptModal`, the system shall close the modal without printing.

### 2.6 Open Shift

**2.6.1** When the user taps "Open Shift" and no shift is currently open, the system shall open `ShiftModal` in `'open'` mode.

**2.6.2** When the user submits the shift modal in `'open'` mode, the system shall validate that `cashAmount` parses to a non-negative number, then call `openShift(user.username, user.id, amount)`.

**2.6.3** When `openShift` succeeds, the system shall show `Alert.alert('Shift Opened', ...)`, close the modal, and update `currentShift` state.

**2.6.4** When `openShift` throws (e.g. a shift is already open), the system shall show `Alert.alert('Error', errorMessage)`.

### 2.7 Close Shift

**2.7.1** When the user taps "Close Shift" and a shift is open, the system shall open `ShiftModal` in `'close'` mode.

**2.7.2** When the user submits the shift modal in `'close'` mode, the system shall validate the cash amount, call `closeShift(amount)`, then call `generateReport(orders, closedShift)` and open `ReportModal` with the result.

**2.7.3** When `closeShift` succeeds, the system shall show `Alert.alert('Shift Closed', 'Daily report generated. You can now print it.')`.

**2.7.4** When `closeShift` throws, the system shall show `Alert.alert('Error', errorMessage)`.

### 2.8 Generate Report (without closing shift)

**2.8.1** When the user taps "View Report", the system shall call `generateReport(orders)` using the current shift (if open) and open `ReportModal` with the result.

**2.8.2** When `generateReport` throws (e.g. no shift data), the system shall show `Alert.alert('Error', errorMessage)`.

### 2.9 Print Report

**2.9.1** When the user taps "Print Report" in `ReportModal`, the system shall call `getReportLines(report)` to format the report as a string array and send it to the printer (currently logged to console and shown as an alert).

**2.9.2** When the user taps "Close" in `ReportModal`, the system shall close the modal without printing.

### 2.10 Shift Modal — Validation

**2.10.1** When the user submits `ShiftModal` with a cash amount that is `NaN` or `< 0`, the system shall show `Alert.alert('Invalid Amount', 'Please enter a valid cash amount.')` and not proceed.

**2.10.2** While `isProcessingShift` is `true`, the submit button shall show `'Processing...'` and be disabled.

### 2.11 Report Modal — Content

**2.11.1** When `ReportModal` opens with a non-null report, the system shall render: Sales Summary (orders, items, AOV, gross sales, tax, discounts, net sales), Payment Breakdown (per method with count and total), Refunds section (if `refunds > 0`), and Shift Info (cashier, open/close times, opening/closing cash).

**2.11.2** When `totalDiscount === 0`, the Discounts row shall be omitted from the Sales Summary.

**2.11.3** When `report.shift.closingCash` is `null` (shift still open), the Closing Cash row shall be omitted.

---

## 3. State-Driven Requirements

**3.1** While `currentShift` is non-null, the header shall show a green "Shift Open" badge and the action bar shall show "Close Shift" (amber) instead of "Open Shift" (green).

**3.2** While `syncingOrderId` is set, the matching order card's Resync button shall be disabled and show a spinning sync icon.

**3.3** While `orders` is empty and loading is complete, the screen shall render the empty state: receipt icon, "No Orders Found" title, and a role-appropriate subtitle.

**3.4** While `unsyncedOrdersCount > 0`, the header subtitle shall include `'• {n} pending sync'`.

**3.5** While `syncQueueStatus.length > 0`, a queue status banner shall be shown below the header indicating the number of queued requests.

**3.6** While `refreshing` is `true`, the `RefreshControl` spinner shall be visible.

---

## 4. Optional Feature Requirements

**4.1** Where `report.summary.refunds > 0`, the Refunds section shall be rendered in `ReportModal` showing refund count and total amount.

**4.2** Where `order.syncStatus === 'failed'` and `order.syncError` is non-empty, `OrderCard` shall render an error box below the order details showing the sync error message.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If `openShift` is called when a shift is already open, `DailyReportService` throws `'A shift is already open. Please close it first.'` — the error is surfaced via alert and the modal stays open.

**5.2** If `closeShift` is called when no shift is open, `DailyReportService` throws `'No open shift to close.'` — surfaced via alert.

**5.3** If `generateReport` is called with no shift data (no open shift and no closed shift passed), `DailyReportService` throws `'No shift data available for report.'` — surfaced via alert.

**5.4** If the user navigates away while `syncingOrderId` is set, the sync operation continues in the background — the result alert will not appear since the component is unmounted.

**5.5** If no printer is connected when "Print Receipt" or "Print Report" is tapped, the system shall show `Alert.alert('No Printer', 'No printer connected. Please connect a printer in Settings → Printer.')` and not attempt to print. If the printer call returns `false`, the system shall show `Alert.alert('Print Failed', ...)`. If it throws, the error message is surfaced via alert.

**5.6** If `cashAmount` is empty when the shift modal is submitted, `parseFloat('')` returns `NaN` — the validation guard catches this and shows the invalid amount alert.

---

## 6. Component Traceability

| Requirement (summary)                               | Component / Service                                                                      | Source File                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| Cashier filter on order load                        | `OrderHistoryScreen.loadOrders` → `orderRepository.findByDateRange(from, to, cashierId)` | `screens/OrderHistoryScreen.tsx`         |
| Date navigation hidden for cashier                  | `OrderHistoryScreen` `!isCashier` guard                                                  | `screens/OrderHistoryScreen.tsx`         |
| Delete button admin-only                            | `OrderHistoryScreen` `isAdmin` guard                                                     | `screens/OrderHistoryScreen.tsx`         |
| Pull to refresh                                     | `OrderHistoryScreen` `RefreshControl`                                                    | `screens/OrderHistoryScreen.tsx`         |
| Date navigation prev/next                           | `OrderHistoryScreen.handlePreviousDay` / `handleNextDay`                                 | `screens/OrderHistoryScreen.tsx`         |
| Resync order                                        | `OrderHistoryScreen.handleResyncOrder` → `syncOrderToPlatform`                           | `screens/OrderHistoryScreen.tsx`         |
| Delete order with confirmation                      | `OrderHistoryScreen.handleDeleteOrder` → `orderRepository.delete`                        | `screens/OrderHistoryScreen.tsx`         |
| Print receipt → ReceiptModal                        | `OrderHistoryScreen.handlePrintReceipt`                                                  | `screens/OrderHistoryScreen.tsx`         |
| Receipt printed via `PrinterServiceFactory`         | `OrderHistoryScreen.handlePrintReceiptConfirm` → `printerService.printReceipt`           | `screens/OrderHistoryScreen.tsx`         |
| Report printed via `PrinterServiceFactory`          | `OrderHistoryScreen.handlePrintReport` → `printerService.printReceipt`                   | `screens/OrderHistoryScreen.tsx`         |
| No printer connected → alert                        | `handlePrintReceiptConfirm` / `handlePrintReport` guard                                  | `screens/OrderHistoryScreen.tsx`         |
| Open shift modal                                    | `OrderHistoryScreen.handleOpenShift`                                                     | `screens/OrderHistoryScreen.tsx`         |
| Close shift modal                                   | `OrderHistoryScreen.handleCloseShift`                                                    | `screens/OrderHistoryScreen.tsx`         |
| Shift submit validation + open/close                | `OrderHistoryScreen.handleShiftSubmit`                                                   | `screens/OrderHistoryScreen.tsx`         |
| Generate report without closing shift               | `OrderHistoryScreen.handleGenerateReport`                                                | `screens/OrderHistoryScreen.tsx`         |
| Print report lines                                  | `useDailyReport.getReportLines` → `DailyReportService.formatDailyReportForPrint`         | `hooks/useDailyReport.ts`                |
| Shift open/close persisted                          | `useDailyReport.openShift` / `closeShift` → `DailyReportService`                         | `hooks/useDailyReport.ts`                |
| Shift state loaded on mount                         | `useDailyReport.reload` → `DailyReportService.initialize`                                | `hooks/useDailyReport.ts`                |
| Order card sync status badge                        | `OrderCard.getOrderStatusColor` / `getOrderStatusText`                                   | `screens/order-history/OrderCard.tsx`    |
| Sync error box on failed orders                     | `OrderCard` syncStatus === 'failed' guard                                                | `screens/order-history/OrderCard.tsx`    |
| Resync button hidden when synced                    | `OrderCard` syncStatus !== 'synced' guard                                                | `screens/order-history/OrderCard.tsx`    |
| Cash amount input + submit                          | `ShiftModal`                                                                             | `screens/order-history/ShiftModal.tsx`   |
| Report sections (summary, payments, refunds, shift) | `ReportModal`                                                                            | `screens/order-history/ReportModal.tsx`  |
| Receipt preview + print                             | `ReceiptModal` + `ReceiptTemplate`                                                       | `screens/order-history/ReceiptModal.tsx` |
| Shift Open badge in header                          | `OrderHistoryScreen` `currentShift` guard                                                | `screens/OrderHistoryScreen.tsx`         |
| Unsynced count in subtitle                          | `OrderHistoryScreen` `unsyncedOrdersCount`                                               | `screens/OrderHistoryScreen.tsx`         |
| Sync queue banner                                   | `OrderHistoryScreen` `syncQueueStatus`                                                   | `screens/OrderHistoryScreen.tsx`         |
