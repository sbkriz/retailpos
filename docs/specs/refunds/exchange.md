# Exchange – EARS Requirements

> **System**: RetailPOS – Exchange & Return-for-New  
> **Actor**: Cashier, System  
> **Date**: 2026-05-03  
> **Source**: `services/exchange/ExchangeService.ts`, `services/refunds/RefundService.ts`, `services/checkout/CheckoutService.ts`, `repositories/ReturnRepository.ts`, `services/audit/AuditLogService.ts`

---

## Context

An exchange is a combined return-and-purchase transaction where a customer returns one or more items and receives new items in the same transaction. The system calculates the net amount due (new items total minus return credit) and settles it with zero or more payment lines. If the return credit exceeds the new items total, the customer receives the difference as store credit or refund.

`ExchangeService` orchestrates the exchange flow by:

1. Creating an exchange session with return items and their credit value
2. Adding new items to the session
3. Collecting payments to settle the net amount
4. Confirming the exchange, which creates return records and a new order atomically

All monetary arithmetic uses integer-cent math internally (per ADR-006) with rounding to two decimal places for display.

### Actors

| Actor   | Role                                                                                     |
| ------- | ---------------------------------------------------------------------------------------- |
| Cashier | Initiates exchange, selects return items, adds new items, collects payment, confirms     |
| System  | Calculates net due, creates return records, creates new order, links records, audits log |

### Exchange Session State Machine

| State               | Transition                                                     |
| ------------------- | -------------------------------------------------------------- |
| `session_created`   | `addItem()` → `has_new_items`                                  |
| `has_new_items`     | `removeItem()` → `session_created` (if last item removed)      |
| `has_new_items`     | `addPayment()` → `partially_settled` or `fully_settled`        |
| `partially_settled` | `addPayment()` → `fully_settled` (when `remainingDue ≈ 0`)     |
| `fully_settled`     | `confirm()` → `confirmed` (return records + new order created) |
| `any`               | Session abandoned (no confirm) → no database changes           |

### Key Defaults

| Field                   | Default                                            | Source                            |
| ----------------------- | -------------------------------------------------- | --------------------------------- |
| `returnCredit`          | Sum of `returnItems[].price × quantity`            | `ExchangeService.createSession()` |
| `newItemsTotal`         | Sum of `newItems[].price × quantity`               | `ExchangeService.addItem()`       |
| `netDue`                | `newItemsTotal - returnCredit`                     | `calcTotals()`                    |
| `remainingDue`          | `netDue - sum(payments[].amount where amount > 0)` | `calcTotals()`                    |
| `issueRefund` on return | `false` (no refund issued for exchange returns)    | `ExchangeService.confirm()`       |
| `restock` on return     | `true` (returned items are restocked)              | `ExchangeService.confirm()`       |

---

## 1. Ubiquitous Requirements

**1.1** The system shall calculate `returnCredit` as the sum of `price × quantity` for all `returnItems`, rounded to two decimal places.

**1.2** The system shall calculate `newItemsTotal` as the sum of `price × quantity` for all `newItems`, rounded to two decimal places.

**1.3** The system shall calculate `netDue` as `newItemsTotal - returnCredit`, rounded to two decimal places. A negative `netDue` means the store owes the customer.

**1.4** The system shall calculate `remainingDue` as `netDue - sum(payments[].amount where amount > 0)`, rounded to two decimal places.

**1.5** The system shall recalculate `netDue` and `remainingDue` after every `addItem()`, `removeItem()`, `addPayment()`, or `removePayment()` operation.

**1.6** The system shall generate a UUID for each exchange session, basket item, and payment line.

**1.7** The system shall never persist an exchange session to the database — sessions are ephemeral in-memory objects until `confirm()` is called.

**1.8** The system shall audit-log every confirmed exchange with action `exchange:completed`, including original order ID, new order ID, return IDs, return credit, new items total, and net due.

**1.9** The system shall create return records with `issueRefund: false` for all return items in an exchange — no refund is issued because the credit is applied to the new purchase.

**1.10** The system shall set `restock: true` on all return records in an exchange, restoring inventory for the returned items.

---

## 2. Event-Driven Requirements

### 2.1 Create Exchange Session

**2.1.1** When `createSession(originalOrderId, returnItems)` is called, the system shall generate a UUID for the session ID.

**2.1.2** When the session is created, the system shall calculate `returnCredit` as the sum of `price × quantity` for all `returnItems`, rounded to two decimal places.

**2.1.3** When the session is created, the system shall initialize `newItems` as an empty array, `newItemsTotal` as `0`, and `payments` as an empty array.

**2.1.4** When the session is created, the system shall call `calcTotals()` to compute `netDue` and `remainingDue`.

**2.1.5** When `createSession()` returns, the system shall return the complete `ExchangeSession` object with all calculated fields.

### 2.2 Add New Item

**2.2.1** When `addItem(session, item)` is called, the system shall append the `item` to `session.newItems`.

**2.2.2** When the item is added, the system shall recalculate `newItemsTotal` as the sum of `price × quantity` for all `newItems`, rounded to two decimal places.

**2.2.3** When `newItemsTotal` is recalculated, the system shall call `calcTotals()` to update `netDue` and `remainingDue`.

**2.2.4** When `addItem()` returns, the system shall return the updated `ExchangeSession` object.

### 2.3 Remove New Item

**2.3.1** When `removeItem(session, itemId)` is called, the system shall filter `session.newItems` to exclude the item with matching `id`.

**2.3.2** When the item is removed, the system shall recalculate `newItemsTotal` as the sum of `price × quantity` for all remaining `newItems`, rounded to two decimal places.

**2.3.3** When `newItemsTotal` is recalculated, the system shall call `calcTotals()` to update `netDue` and `remainingDue`.

**2.3.4** When `removeItem()` returns, the system shall return the updated `ExchangeSession` object.

### 2.4 Add Payment

**2.4.1** When `addPayment(session, payment)` is called, the system shall generate a UUID for the payment line ID.

**2.4.2** When the payment line is created, the system shall set `processedAt` to the current timestamp (`Date.now()`).

**2.4.3** When the payment line is created, the system shall append it to `session.payments`.

**2.4.4** When the payment is added, the system shall call `calcTotals()` to update `remainingDue` by subtracting the sum of all positive payment amounts from `netDue`.

**2.4.5** When `addPayment()` returns, the system shall return the updated `ExchangeSession` object.

### 2.5 Remove Payment

**2.5.1** When `removePayment(session, paymentId)` is called, the system shall filter `session.payments` to exclude the payment with matching `id`.

**2.5.2** When the payment is removed, the system shall call `calcTotals()` to update `remainingDue`.

**2.5.3** When `removePayment()` returns, the system shall return the updated `ExchangeSession` object.

### 2.6 Confirm Exchange

**2.6.1** When `confirm(session, cashierId?, cashierName?)` is called, the system shall validate that `Math.abs(session.remainingDue) <= 0.01` (settled within 1 cent tolerance).

**2.6.2** When the settlement validation fails, the system shall return `{ success: false, error: 'Exchange not fully settled' }` without creating any database records.

**2.6.3** When the settlement validation succeeds, the system shall call `ReturnService.processReturn()` with all `returnItems`, setting `issueRefund: false` and `restock: true`.

**2.6.4** When `processReturn()` returns `success: false`, the system shall return `{ success: false, error: returnResult.error ?? 'Failed to process return leg' }` without creating a new order.

**2.6.5** When `processReturn()` succeeds and `session.newItems.length > 0`, the system shall call `CheckoutService.startCheckout()` to create a new order.

**2.6.6** When the new order is created, the system shall call `CheckoutService.completePayment()` with the primary payment method from `session.payments` and all payment lines.

**2.6.7** When the new order is created and return records exist, the system shall link each return record to the new order ID via `ReturnRepository.linkToExchange()`.

**2.6.8** When all steps succeed, the system shall call `auditLogService.log('exchange:completed')` with metadata including `originalOrderId`, `newOrderId`, `returnIds`, `returnCredit`, `newItemsTotal`, and `netDue`.

**2.6.9** When `confirm()` succeeds, the system shall return `{ success: true, newOrderId, returnIds }`.

**2.6.10** When any step in `confirm()` throws an error, the system shall catch the error, log it, and return `{ success: false, error: errorMessage }`.

---

## 3. State-Driven Requirements

**3.1** While `session.newItems` is empty, the system shall allow `confirm()` to proceed if `returnItems` exist — this represents a return-only exchange where the customer receives store credit or refund.

**3.2** While `session.remainingDue > 0.01`, the system shall reject `confirm()` with error `'Exchange not fully settled'`.

**3.3** While `session.remainingDue < -0.01`, the system shall reject `confirm()` with error `'Exchange not fully settled'` — the customer is owed money that has not been collected as a payment line.

**3.4** While `session.payments` is empty and `netDue > 0`, the system shall reject `confirm()` because no payment has been collected.

**3.5** While `session.payments` is empty and `netDue <= 0`, the system shall allow `confirm()` to proceed — the return credit covers the new items or the customer is owed a refund.

---

## 4. Optional Feature Requirements

**4.1** Where `cashierId` and `cashierName` are provided to `confirm()`, the system shall pass them to `CheckoutService.startCheckout()` and `CheckoutService.completePayment()` for audit logging.

**4.2** Where `session.newItems.length === 0`, the system shall skip the `startCheckout()` and `completePayment()` calls and return `newOrderId: undefined` in the result.

**4.3** Where `ReturnRepository` implements `linkToExchange()`, the system shall link return records to the new order ID. Where the method is not available, the system shall skip the linking step without failing.

---

## 5. Unwanted Behaviour / Edge Cases

### 5.1 Unsettled Exchange

**5.1.1** If `confirm()` is called when `Math.abs(session.remainingDue) > 0.01`, then the system shall return `{ success: false, error: 'Exchange not fully settled' }` without creating any database records.

**5.1.2** If the cashier attempts to confirm an exchange with `remainingDue = 0.02`, then the system shall reject it — the tolerance is strictly `<= 0.01`.

### 5.2 Return Processing Failure

**5.2.1** If `ReturnService.processReturn()` returns `success: false`, then the system shall return `{ success: false, error }` without creating a new order or linking records.

**5.2.2** If `ReturnService.processReturn()` throws an error, then the system shall catch it, log it, and return `{ success: false, error: errorMessage }`.

### 5.3 Checkout Failure

**5.3.1** If `CheckoutService.startCheckout()` throws an error after return records have been created, then the system shall catch the error, log it, and return `{ success: false, error }` — the return records remain in the database as orphaned returns.

**5.3.2** If `CheckoutService.completePayment()` throws an error after the new order is created, then the system shall catch the error, log it, and return `{ success: false, error }` — the new order remains in `status: 'draft'` or `'pending'`.

### 5.4 Empty Return Items

**5.4.1** If `createSession()` is called with an empty `returnItems` array, then `returnCredit` shall be `0` and the exchange behaves as a regular purchase.

### 5.5 Empty New Items

**5.5.1** If `confirm()` is called when `session.newItems` is empty, then the system shall skip the checkout steps and return `{ success: true, newOrderId: undefined, returnIds }` — this represents a return-only transaction.

### 5.6 Negative Net Due

**5.6.1** If `netDue` is negative (return credit exceeds new items total), then the cashier must add a payment line with a negative amount (refund) to settle `remainingDue` to zero before confirming.

**5.6.2** If `confirm()` is called when `netDue < 0` and no negative payment line exists, then `remainingDue` will be negative and the system shall reject with `'Exchange not fully settled'`.

### 5.7 Linking Failure

**5.7.1** If `ReturnRepository.linkToExchange()` is not available (e.g. platform repository does not implement it), then the system shall skip the linking step without throwing — the exchange completes successfully but return records are not linked to the new order.

**5.7.2** If `linkToExchange()` throws an error for any return ID, then the system shall log the error and continue linking remaining return IDs — partial linking failure does not fail the entire exchange.

---

## 6. Complex Requirements

**6.1** When `confirm()` is called and `session.newItems.length > 0` and `processReturn()` succeeds, the system shall atomically create a new order via `startCheckout()`, complete payment via `completePayment()`, link return records via `linkToExchange()`, and audit-log the exchange — if any step fails, the system shall return `{ success: false, error }` but already-created records remain in the database.

**6.2** When `calcTotals()` is called, the system shall compute `netDue` as `newItemsTotal - returnCredit` and `remainingDue` as `netDue - sum(payments[].amount where amount > 0)`, rounding both to two decimal places using `Math.round(value * 100) / 100`.

**6.3** When `addPayment()` is called with a negative amount (refund), the system shall include it in `session.payments` but exclude it from the `remainingDue` calculation — only positive payment amounts reduce `remainingDue`.

**6.4** When `confirm()` creates a new order and multiple payment lines exist in `session.payments`, the system shall pass the primary payment method (first payment with `amount > 0`) to `completePayment()` along with all payment lines for multi-tender support.

---

## 7. Exchange Lifecycle Summary

### Exchange Flow

```
Cashier initiates exchange
  → ExchangeService.createSession(originalOrderId, returnItems)
    → returnCredit = Σ(returnItems[].price × quantity)
    → newItems = [], newItemsTotal = 0, payments = []
    → netDue = newItemsTotal - returnCredit
    → remainingDue = netDue

Cashier adds new items
  → ExchangeService.addItem(session, item)
    → newItems.push(item)
    → newItemsTotal = Σ(newItems[].price × quantity)
    → netDue = newItemsTotal - returnCredit
    → remainingDue = netDue - Σ(payments[].amount where amount > 0)

Cashier collects payment
  → ExchangeService.addPayment(session, { method, amount, transactionId })
    → payments.push({ id: UUID, ...payment, processedAt: Date.now() })
    → remainingDue = netDue - Σ(payments[].amount where amount > 0)

Cashier confirms exchange
  → ExchangeService.confirm(session, cashierId, cashierName)
    → Validate: Math.abs(remainingDue) <= 0.01
    → ReturnService.processReturn({ orderId, items, issueRefund: false, restock: true })
      → Return records created in SQLite
    → [if newItems.length > 0]
      → CheckoutService.startCheckout(undefined, cashierId, cashierName)
        → New order created in SQLite
      → CheckoutService.completePayment(newOrderId, primaryMethod, primaryTxId, payments)
        → Order marked paid, basket cleared
      → ReturnRepository.linkToExchange(returnId, newOrderId) for each return
    → auditLogService.log('exchange:completed', { originalOrderId, newOrderId, returnIds, ... })
    → return { success: true, newOrderId, returnIds }
```

### Settlement Examples

| Scenario                          | Return Credit | New Items Total | Net Due | Payments Required                             |
| --------------------------------- | ------------- | --------------- | ------- | --------------------------------------------- |
| Even exchange                     | £50.00        | £50.00          | £0.00   | None (remainingDue = 0)                       |
| Customer pays difference          | £30.00        | £50.00          | £20.00  | +£20.00 (card/cash)                           |
| Customer receives refund          | £50.00        | £30.00          | -£20.00 | -£20.00 (refund payment line)                 |
| Return-only (no new items)        | £50.00        | £0.00           | -£50.00 | -£50.00 (refund payment line)                 |
| Multi-tender (customer pays more) | £30.00        | £80.00          | £50.00  | +£30.00 (card) + £20.00 (cash) = £50.00 total |

---

## 8. Component Traceability

| Requirement (summary)                         | Component / Hook / Service                                              | Source File                            |
| --------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| Exchange session created with return items    | `ExchangeService.createSession`                                         | `services/exchange/ExchangeService.ts` |
| Return credit calculated from return items    | `ExchangeService.createSession` (reduce sum)                            | `services/exchange/ExchangeService.ts` |
| New item added to session                     | `ExchangeService.addItem`                                               | `services/exchange/ExchangeService.ts` |
| New items total recalculated                  | `ExchangeService.addItem` (reduce sum)                                  | `services/exchange/ExchangeService.ts` |
| New item removed from session                 | `ExchangeService.removeItem`                                            | `services/exchange/ExchangeService.ts` |
| Payment line added to session                 | `ExchangeService.addPayment`                                            | `services/exchange/ExchangeService.ts` |
| Payment line removed from session             | `ExchangeService.removePayment`                                         | `services/exchange/ExchangeService.ts` |
| Net due and remaining due calculated          | `calcTotals` (helper function)                                          | `services/exchange/ExchangeService.ts` |
| Exchange confirmed with settlement validation | `ExchangeService.confirm`                                               | `services/exchange/ExchangeService.ts` |
| Return records created for return items       | `ExchangeService.confirm` → `ReturnService.processReturn`               | `services/exchange/ExchangeService.ts` |
| New order created for new items               | `ExchangeService.confirm` → `CheckoutService.startCheckout`             | `services/exchange/ExchangeService.ts` |
| Payment completed on new order                | `ExchangeService.confirm` → `CheckoutService.completePayment`           | `services/exchange/ExchangeService.ts` |
| Return records linked to new order            | `ExchangeService.confirm` → `ReturnRepository.linkToExchange`           | `services/exchange/ExchangeService.ts` |
| Exchange completion audit logged              | `ExchangeService.confirm` → `auditLogService.log('exchange:completed')` | `services/exchange/ExchangeService.ts` |

---

**Document Metadata**:

- **Author**: Kiro AI Agent
- **Date**: 2026-05-03
- **Version**: 1.0
- **Status**: Final
- **Related**: `docs/specs/refunds/refunds.md`, `docs/specs/checkout/checkout.md`
