# Reporting – EARS Requirements

> **System**: RetailPOS – Sales Reporting & Analytics
> **Actor**: Manager, System
> **Date**: 2026-04-13
> **Source**: `services/reporting/ReportingService.ts`, `hooks/useReporting.ts`, `screens/ReportingScreen.tsx`

---

## Context

The reporting subsystem provides sales analytics derived entirely from the local SQLite `orders` table — no platform API calls are made. All queries filter to orders with `status === 'paid'` or `status === 'synced'`, ensuring only completed transactions are counted.

`ReportingService` is a singleton that exposes five query methods and a CSV export. `useReporting` is the React hook layer that manages loading state and surfaces data to `ReportingScreen`. The screen provides four date range presets and renders summary cards, a bar chart, payment method breakdown, and cashier performance.

### Date Range Presets

| Preset      | Range                               |
| ----------- | ----------------------------------- |
| `today`     | Midnight today → midnight tomorrow  |
| `yesterday` | Midnight yesterday → midnight today |
| `week`      | 7 days ago → midnight tomorrow      |
| `month`     | 30 days ago → midnight tomorrow     |

### Report Data Shapes

**SalesSummary**: `totalOrders`, `totalSales`, `totalTax`, `totalDiscount`, `netSales`, `averageOrderValue`

**SalesByPeriod**: `label` (HH:00 or YYYY-MM-DD), `orderCount`, `totalSales`

**CashierPerformance**: `cashierId`, `cashierName`, `orderCount`, `totalSales`, `averageOrderValue`

**PaymentBreakdown**: `method`, `count`, `total`, `percentage`

### Chart Mode

| Selected range         | Chart data                                  | Chart label     |
| ---------------------- | ------------------------------------------- | --------------- |
| `today` or `yesterday` | `salesByHour` (24 buckets)                  | "Sales by Hour" |
| `week` or `month`      | `salesByDay` (one entry per day with sales) | "Sales by Day"  |

---

## 1. Ubiquitous Requirements

**1.1** `ReportingService` shall be a singleton — a single instance is shared across the application.

**1.2** All report queries shall read exclusively from the local SQLite `orders` table via `OrderRepository.findByDateRange(from, to)` — no platform API calls are made.

**1.3** All report queries shall filter to orders with `status === 'paid'` or `status === 'synced'` — pending, draft, processing, failed, and cancelled orders are excluded from all metrics.

**1.4** All monetary values returned by `ReportingService` shall be rounded to two decimal places using `Math.round(value * 100) / 100`.

**1.5** The CSV export shall include all orders in the date range regardless of status — it is a raw data export, not a filtered analytics view.

**1.6** All monetary values displayed in `ReportingScreen` shall be formatted using `formatMoney(value, currency.code)` where `currency` is sourced from `useCurrency()` — the currency code comes from store settings, not hardcoded.

---

## 2. Event-Driven Requirements

### 2.1 Sales Summary

**2.1.1** When `ReportingService.getSalesSummary(from, to)` is called, the system shall query all orders in the range, filter to paid/synced, and return:

- `totalOrders` — count of paid/synced orders
- `totalSales` — sum of `order.total`
- `totalTax` — sum of `order.tax`
- `totalDiscount` — sum of `order.discount_amount` (defaulting to 0 when null)
- `netSales` — `totalSales - totalTax`, rounded to two decimal places
- `averageOrderValue` — `totalSales / totalOrders`, or `0` when no orders

### 2.2 Sales by Hour

**2.2.1** When `ReportingService.getSalesByHour(dayStart, dayEnd)` is called, the system shall initialise 24 buckets (hours 0–23), assign each paid/synced order to its bucket by `new Date(order.created_at).getHours()`, and return all 24 entries with `label` formatted as `'HH:00'`.

**2.2.2** Hours with no orders shall be included in the result with `orderCount: 0` and `totalSales: 0` — the array always has exactly 24 entries.

### 2.3 Sales by Day

**2.3.1** When `ReportingService.getSalesByDay(from, to)` is called, the system shall group paid/synced orders by `YYYY-MM-DD` date key derived from `order.created_at`, sort entries chronologically, and return one `SalesByPeriod` entry per day that has at least one order.

**2.3.2** Days with no orders shall be omitted from the result — unlike hourly buckets, day buckets are sparse.

### 2.4 Cashier Performance

**2.4.1** When `ReportingService.getCashierPerformance(from, to)` is called, the system shall group paid/synced orders by `cashier_id` (defaulting to `'unknown'` when null), compute `orderCount`, `totalSales`, and `averageOrderValue` per cashier, and return the list sorted by `totalSales` descending.

**2.4.2** When `cashier_name` is null on an order, the system shall use `'Unknown'` as the display name.

### 2.5 Payment Breakdown

**2.5.1** When `ReportingService.getPaymentBreakdown(from, to)` is called, the system shall group paid/synced orders by `payment_method` (defaulting to `'unknown'` when null), compute `count`, `total`, and `percentage` of grand total per method, and return the list sorted by `total` descending.

**2.5.2** `percentage` shall be calculated as `(methodTotal / grandTotal) * 100`, rounded to one decimal place (`Math.round(ratio * 1000) / 10`). When `grandTotal === 0`, all percentages shall be `0`.

### 2.6 CSV Export

**2.6.1** When `ReportingService.exportOrdersCsv(from, to)` is called, the system shall return a CSV string with header row `Order ID,Date,Status,Subtotal,Tax,Discount,Total,Payment Method,Cashier,Sync Status` followed by one row per order in the date range (all statuses included), with `created_at` formatted as ISO 8601.

### 2.7 Hook — `useReporting`

**2.7.1** When `useReporting.loadReport(from, to)` is called, the system shall call `getSalesSummary`, `getSalesByDay`, `getCashierPerformance`, and `getPaymentBreakdown` in parallel via `Promise.all`, set all four state values on success, and set `error` on failure.

**2.7.2** When `useReporting.loadHourlyReport(dayStart, dayEnd)` is called, the system shall call `getSalesSummary`, `getSalesByHour`, `getCashierPerformance`, and `getPaymentBreakdown` in parallel via `Promise.all`, set all four state values on success, and set `error` on failure.

**2.7.3** When either load method is called, the system shall set `isLoading: true` before the queries and `isLoading: false` in the `finally` block regardless of outcome.

**2.7.4** When `useReporting.exportCsv(from, to)` is called, the system shall delegate directly to `reportingService.exportOrdersCsv(from, to)` and return the CSV string.

### 2.8 ReportingScreen — UI Flow

**2.8.1** When `ReportingScreen` mounts, the system shall call `loadHourlyReport` with the `today` date range as the default.

**2.8.2** When the manager selects a date range preset, the system shall recompute `from`/`to` timestamps and call `loadHourlyReport` for `today`/`yesterday` or `loadReport` for `week`/`month`.

**2.8.3** When the manager taps the CSV export button, the system shall call `exportCsv(from, to)` for the selected range and invoke `Share.share({ message: csv, title: 'Sales Report - {range}' })`.

**2.8.4** When `exportCsv` or `Share.share` throws, `ReportingScreen` shall show `Alert.alert('Export Failed', 'Could not export the report.')`.

---

## 3. State-Driven Requirements

**3.1** While `isLoading` is `true` and `summary` is `null` (initial load), `ReportingScreen` shall render a full-screen `ActivityIndicator`.

**3.2** While `isLoading` is `true` and `summary` is already set (refresh), the screen shall continue showing the previous data — no loading overlay is shown.

**3.3** While `error` is non-null, `ReportingScreen` shall render an error box with the error message below the date range selector.

**3.4** While `summary` is non-null, `ReportingScreen` shall render four summary cards: Total Sales, Orders, Avg Order, and Tax.

**3.5** While `salesData` (hourly or daily depending on range) contains entries with `totalSales > 0` or `orderCount > 0`, `ReportingScreen` shall render the bar chart section. Each bar width is proportional to `totalSales / maxSales`, with a minimum of 2% to remain visible.

**3.6** While `paymentBreakdown` is non-empty, `ReportingScreen` shall render the payment methods section.

**3.7** While `cashierPerformance` is non-empty, `ReportingScreen` shall render the cashier performance section.

---

## 4. Optional Feature Requirements

**4.1** Where `salesByHour` entries all have `totalSales === 0` and `orderCount === 0`, the bar chart section shall not be rendered — the filter `d.totalSales > 0 || d.orderCount > 0` removes empty buckets from the chart.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If `orderRepository.findByDateRange` returns an empty array, all metrics shall be zero and all lists shall be empty — no error is thrown.

**5.2** If `averageOrderValue` is requested when `totalOrders === 0`, the system shall return `0` rather than `NaN` or throwing a divide-by-zero error.

**5.3** If `getPaymentBreakdown` is called when `grandTotal === 0` (no paid orders), all `percentage` values shall be `0`.

**5.4** If `loadReport` or `loadHourlyReport` throws (e.g. SQLite error), `useReporting` shall catch the error, set `error` to `'Failed to load report data.'`, and leave the previous state values unchanged — the screen continues to show the last successfully loaded data.

**5.5** If the manager taps a different date range while a load is already in progress, the new `loadData` call will run concurrently — the last call to complete will set the final state. There is no cancellation mechanism.

**5.6** The `TopProduct` interface is defined in `ReportingService` but no method currently populates it — top product reporting is not yet implemented.

**5.7** The CSV export contains raw order rows only (one row per order) — it does not include aggregated summary, hourly/daily breakdown, payment method totals, or cashier stats. The feature doc describes a richer export; the current implementation is a raw data dump intended for external analysis tools.

**5.8** `Share.share` is called with `title: 'Sales Report - {range}'` — on iOS this becomes the share sheet title, not a file name. There is no explicit filename set; the receiving app determines the filename if the user saves to files.

---

## 6. Component Traceability

| Requirement (summary)                                            | Component / Service                          | Source File                              |
| ---------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| Singleton `ReportingService`                                     | `ReportingService.getInstance`               | `services/reporting/ReportingService.ts` |
| Filter to paid/synced orders only                                | All query methods                            | `services/reporting/ReportingService.ts` |
| `getSalesSummary` — totals, net, avg                             | `ReportingService.getSalesSummary`           | `services/reporting/ReportingService.ts` |
| `getSalesByHour` — 24 buckets always                             | `ReportingService.getSalesByHour`            | `services/reporting/ReportingService.ts` |
| `getSalesByDay` — sparse day buckets, sorted                     | `ReportingService.getSalesByDay`             | `services/reporting/ReportingService.ts` |
| `getCashierPerformance` — sorted by total sales desc             | `ReportingService.getCashierPerformance`     | `services/reporting/ReportingService.ts` |
| `getPaymentBreakdown` — percentage of grand total                | `ReportingService.getPaymentBreakdown`       | `services/reporting/ReportingService.ts` |
| `exportOrdersCsv` — all statuses, ISO 8601 date                  | `ReportingService.exportOrdersCsv`           | `services/reporting/ReportingService.ts` |
| `loadReport` — parallel Promise.all (day/cashier/payment)        | `useReporting.loadReport`                    | `hooks/useReporting.ts`                  |
| `loadHourlyReport` — parallel Promise.all (hour/cashier/payment) | `useReporting.loadHourlyReport`              | `hooks/useReporting.ts`                  |
| `isLoading` set before / cleared in finally                      | `useReporting` load methods                  | `hooks/useReporting.ts`                  |
| `exportCsv` delegates to service                                 | `useReporting.exportCsv`                     | `hooks/useReporting.ts`                  |
| Default range `today`, auto-load on mount                        | `ReportingScreen` useEffect + useState       | `screens/ReportingScreen.tsx`            |
| Range selector triggers reload                                   | `ReportingScreen` `setSelectedRange`         | `screens/ReportingScreen.tsx`            |
| Hourly vs daily chart mode by range                              | `ReportingScreen` `salesData` derived state  | `screens/ReportingScreen.tsx`            |
| Bar chart proportional width, 2% minimum                         | `ReportingScreen` bar chart render           | `screens/ReportingScreen.tsx`            |
| Summary cards (4 metrics)                                        | `ReportingScreen` summaryGrid                | `screens/ReportingScreen.tsx`            |
| Payment breakdown section                                        | `ReportingScreen` paymentBreakdown render    | `screens/ReportingScreen.tsx`            |
| Cashier performance section                                      | `ReportingScreen` cashierPerformance render  | `screens/ReportingScreen.tsx`            |
| Currency formatting via `useCurrency` + `formatMoney`            | `ReportingScreen` all monetary displays      | `screens/ReportingScreen.tsx`            |
| CSV export via `Share.share`                                     | `ReportingScreen.handleExport`               | `screens/ReportingScreen.tsx`            |
| Export failure alert                                             | `ReportingScreen.handleExport` catch         | `screens/ReportingScreen.tsx`            |
| Full-screen loader on initial load                               | `ReportingScreen` isLoading + !summary guard | `screens/ReportingScreen.tsx`            |
| Error box below range selector                                   | `ReportingScreen` error render               | `screens/ReportingScreen.tsx`            |
| `TopProduct` defined but not yet implemented                     | `ReportingService` interface                 | `services/reporting/ReportingService.ts` |
