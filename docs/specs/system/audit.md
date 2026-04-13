# Audit Log – EARS Requirements

> **System**: RetailPOS – Audit Log
> **Actor**: Manager, System
> **Date**: 2026-04-13
> **Source**: `services/audit/AuditLogService.ts`, `services/checkout/CheckoutService.ts`, `services/returns/ReturnService.ts`, `screens/LoginScreen.tsx`

---

## Context

The audit log provides a tamper-evident, append-only record of significant business events — order lifecycle, authentication, returns, and settings changes. It is intended for manager review, compliance, and debugging.

Entries are stored as a JSON array in the key-value store under the key `audit.log`. The list is capped at 2,000 entries (newest first). This is a pragmatic choice for the current scope — a production system would use a dedicated SQLite table.

The service is a singleton (`auditLogService`) accessed directly by producers. There is no UI screen yet — entries are queryable via `getAll()`, `getByAction()`, `getByUser()`, `getByDateRange()`, and exportable as CSV.

### Producers

| Producer                          | Action logged     |
| --------------------------------- | ----------------- |
| `LoginScreen` (success)           | `auth:login`      |
| `LoginScreen` (failure)           | `auth:failed`     |
| `CheckoutService.startCheckout`   | `order:created`   |
| `CheckoutService.completePayment` | `order:paid`      |
| `CheckoutService.cancelOrder`     | `order:cancelled` |
| `ReturnService.processReturn`     | `return:created`  |

### Defined Action Types

| Action               | Meaning                                         |
| -------------------- | ----------------------------------------------- |
| `order:created`      | Draft or pending order persisted to SQLite      |
| `order:paid`         | Payment recorded, basket cleared                |
| `order:synced`       | Order successfully synced to platform           |
| `order:cancelled`    | Order status set to cancelled                   |
| `order:discarded`    | Failed order manually discarded from sync queue |
| `refund:processed`   | Platform refund completed                       |
| `return:created`     | Return recorded in SQLite                       |
| `return:completed`   | Return fully resolved                           |
| `product:created`    | Product added                                   |
| `product:updated`    | Product modified                                |
| `product:deleted`    | Product removed                                 |
| `inventory:adjusted` | Stock level changed                             |
| `user:created`       | User account created                            |
| `user:updated`       | User account modified                           |
| `user:deleted`       | User account removed                            |
| `auth:login`         | Successful login                                |
| `auth:logout`        | User logged out                                 |
| `auth:failed`        | Failed login attempt                            |
| `settings:changed`   | POS settings updated                            |
| `shift:opened`       | Cash drawer shift started                       |
| `shift:closed`       | Cash drawer shift ended                         |
| `drawer:opened`      | Cash drawer opened                              |
| `sync:started`       | Sync cycle initiated                            |
| `sync:completed`     | Sync cycle finished                             |
| `sync:failed`        | Sync cycle failed                               |

---

## 1. Ubiquitous Requirements

**1.1** The system shall persist every audit entry to the key-value store under key `audit.log` as a JSON array, newest first.

**1.2** The system shall cap the stored list at 2,000 entries, discarding the oldest when the limit is exceeded.

**1.3** Every audit entry shall carry: `id`, `action`, `timestamp` (Unix ms). `userId`, `userName`, `registerId`, `details`, and `metadata` are optional.

**1.4** The system shall lazy-load the persisted list on the first call to `log()` or any query method — not at construction time.

**1.5** Persist failures shall be logged via the logger but shall not throw — audit logging must never block or crash a producer.

**1.6** The audit log is append-only by design. Individual entries cannot be edited or deleted except via `clear()`.

---

## 2. Event-Driven Requirements

### 2.1 Recording an Entry

**2.1.1** When `auditLogService.log(action, options?)` is called, the system shall ensure the in-memory list is loaded, prepend a new `AuditEntry` with a unique `id` and the current `Date.now()` timestamp, cap the list at 2,000, and persist to the key-value store.

**2.1.2** When `LoginScreen` receives a successful login result, the system shall call `auditLogService.log('auth:login', { userId, userName })`.

**2.1.3** When `LoginScreen` receives a failed login result, the system shall call `auditLogService.log('auth:failed', { details: 'method={method} error={error}' })`.

**2.1.4** When `CheckoutService.startCheckout()` persists a new order, the system shall call `auditLogService.log('order:created', { userId: cashierId, userName: cashierName, details: 'Order {id} created — {n} item(s), total {total}', metadata: { orderId, itemCount, total } })`.

**2.1.5** When `CheckoutService.completePayment()` records a successful payment, the system shall call `auditLogService.log('order:paid', { details: 'Order {id} paid via {method}', metadata: { orderId, paymentMethod, transactionId } })`.

**2.1.6** When `CheckoutService.cancelOrder()` sets an order to cancelled, the system shall call `auditLogService.log('order:cancelled', { details: 'Order {id} cancelled', metadata: { orderId } })`.

**2.1.7** When `ReturnService.processReturn()` completes, the system shall call `auditLogService.log('return:created', { userId: processedBy, details: 'Return for order {id}: {n} item(s), refund {amount}[, platform refund {refundId}]' })`.

### 2.2 Querying

**2.2.1** When `getAll()` is called, the system shall return a shallow copy of all entries, newest first.

**2.2.2** When `getByAction(action)` is called, the system shall return all entries whose `action` field matches exactly.

**2.2.3** When `getByUser(userId)` is called, the system shall return all entries whose `userId` field matches exactly.

**2.2.4** When `getByDateRange(from, to)` is called, the system shall return all entries where `timestamp >= from && timestamp < to`.

### 2.3 Export

**2.3.1** When `exportCsv()` is called, the system shall return a CSV string with header row `ID,Action,User ID,User Name,Register ID,Details,Timestamp` followed by one row per entry, with `timestamp` formatted as ISO 8601 and commas within `details` replaced with semicolons.

### 2.4 Clear

**2.4.1** When `clear()` is called, the system shall empty the in-memory list and persist the empty array to the key-value store.

---

## 3. State-Driven Requirements

**3.1** While the in-memory list has not yet been loaded from the key-value store, any call to `log()` or a query method shall trigger `ensureLoaded()` before proceeding — subsequent calls skip the load.

**3.2** While the in-memory list is at capacity (2,000 entries), each new `log()` call shall discard the oldest entry to make room for the new one.

---

## 4. Unwanted Behaviour / Edge Cases

**4.1** If the key-value store returns malformed JSON on load, the system shall catch the parse error, log it via the logger, and continue with an empty in-memory list — no entries are lost from the current session.

**4.2** If `persist()` throws (e.g. storage full), the system shall log the error but return normally — the in-memory list remains intact for the session even if the write failed.

**4.3** If `log()` is called concurrently before `ensureLoaded()` completes, both calls await the same load — the singleton's `loaded` flag prevents double-loading.

**4.4** If `clear()` is called, all in-memory entries are discarded immediately. This is irreversible — there is no undo.

**4.5** If `getByDateRange(from, to)` is called with `from > to`, the system shall return an empty array (no entries satisfy the condition).

---

## 5. Complex Requirements

**5.1** The `id` field is generated as `audit_{Date.now()}_{6-char random}` — this provides rough chronological ordering within the id itself and is unique enough for the expected volume on a single-register POS.

**5.2** The `metadata` field accepts any `Record<string, unknown>` — producers may attach structured data (e.g. `{ orderId, total }`) for programmatic querying without parsing the `details` string.

**5.3** The CSV export replaces commas in `details` with semicolons to avoid breaking the column structure — consumers must be aware that semicolons in the details field represent original commas.

---

## 6. Component Traceability

| Requirement (summary)              | Component / Service                                  | Source File                            |
| ---------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| Entry persisted to key-value store | `AuditLogService.log` → `keyValueRepository.setItem` | `services/audit/AuditLogService.ts`    |
| Lazy load on first access          | `AuditLogService.ensureLoaded`                       | `services/audit/AuditLogService.ts`    |
| Cap at 2,000 entries               | `AuditLogService.log` (slice after unshift)          | `services/audit/AuditLogService.ts`    |
| `auth:login` logged on success     | `LoginScreen` success branch                         | `screens/LoginScreen.tsx`              |
| `auth:failed` logged on failure    | `LoginScreen` failure branch                         | `screens/LoginScreen.tsx`              |
| `order:created` logged             | `CheckoutService.startCheckout`                      | `services/checkout/CheckoutService.ts` |
| `order:paid` logged                | `CheckoutService.completePayment`                    | `services/checkout/CheckoutService.ts` |
| `order:cancelled` logged           | `CheckoutService.cancelOrder`                        | `services/checkout/CheckoutService.ts` |
| `return:created` logged            | `ReturnService.processReturn`                        | `services/returns/ReturnService.ts`    |
| Query by action                    | `AuditLogService.getByAction`                        | `services/audit/AuditLogService.ts`    |
| Query by user                      | `AuditLogService.getByUser`                          | `services/audit/AuditLogService.ts`    |
| Query by date range                | `AuditLogService.getByDateRange`                     | `services/audit/AuditLogService.ts`    |
| CSV export                         | `AuditLogService.exportCsv`                          | `services/audit/AuditLogService.ts`    |
| Clear all entries                  | `AuditLogService.clear`                              | `services/audit/AuditLogService.ts`    |
