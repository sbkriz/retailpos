# Exchanges & Split Tender – EARS Requirements

> **System**: RetailPOS – Exchange Flows & Multi-Payment Settlement
> **Actor**: Cashier, Manager, System
> **Date**: 2026-05-02
> **Source**: `services/checkout/CheckoutService.ts`, `services/refunds/RefundService.ts`, `repositories/OrderRepository.ts`, `hooks/useCheckout.ts`, `hooks/usePayment.ts`, `screens/PaymentTerminalScreen.tsx`, `components/CheckoutModal.tsx`

---

## Context

### Current State

The POS supports single-tender checkout (one payment method per order) and refunds (monetary reversal of a paid order). Two gaps exist:

1. **True exchanges** — returning item A and immediately purchasing item B in a single transaction, settling only the net difference.
2. **Split tender** — paying a single order with more than one payment method (e.g. £30 cash + £20 via terminal).

### Architectural Changes Required

**Split tender** requires `LocalOrder` to carry a `payments: PaymentLine[]` array instead of the current single `paymentMethod` / `paymentTransactionId` fields. The existing fields are kept for backward compatibility but deprecated in favour of the array.

**Exchanges** build on top of split tender — the return leg produces a credit (negative payment line) and the new items produce a debit; the cashier settles the net balance using any tender mix.

### Key Data Shapes

**PaymentLine** (new — added to `LocalOrder`):

```ts
interface PaymentLine {
  id: string; // UUID
  method: PaymentMethod; // 'cash' | 'terminal' | 'store_credit' | 'loyalty' | 'gift_card' | 'other'
  amount: number; // positive = payment, negative = refund/credit
  transactionId?: string; // terminal transaction ID (tap-to-pay providers only)
  cardBrand?: string;
  last4?: string;
  processedAt: number; // Unix ms
  note?: string;
}
```

**ExchangeSession** (new — in-memory, not persisted until confirmed):

```ts
interface ExchangeSession {
  originalOrderId: string;
  returnItems: ReturnLineInput[]; // items being returned
  returnCredit: number; // total credit from returns (cents)
  newItems: BasketItem[]; // items being added
  newItemsTotal: number; // total of new items (cents)
  netDue: number; // newItemsTotal − returnCredit (negative = refund owed)
  payments: PaymentLine[]; // payments collected so far
  remainingDue: number; // netDue − sum(payments where amount > 0)
}
```

### Schema Changes

`orders` table — new columns:

- `payments_json TEXT` — JSON-serialised `PaymentLine[]` (nullable; null = legacy single-tender order)

`order_items` table — no changes required.

`returns` table — new column:

- `exchange_order_id TEXT` — links a return to the exchange order that replaced it (nullable).

---

## 1. Ubiquitous Requirements

**1.1** The system shall support `payments: PaymentLine[]` on `LocalOrder` — a single order may have multiple payment lines of different methods.

**1.2** The sum of all `PaymentLine.amount` values on a completed order shall equal `LocalOrder.total` — the system shall validate this before marking an order `paid`.

**1.3** Legacy orders with a single `paymentMethod` / `paymentTransactionId` shall be read as a single-element `payments` array for display purposes — no migration is required.

**1.4** An exchange is a single atomic operation: the return and the new sale are committed together. If either leg fails, neither is persisted.

**1.5** The system shall never allow a split tender to over-collect — the sum of positive payment lines shall not exceed `LocalOrder.total`. Cash change is calculated and displayed but not recorded as a payment line.

**1.6** All split tender and exchange operations shall be recorded to `AuditLogService`.

---

## 2. Event-Driven Requirements

### 2.1 Split Tender — Checkout Flow

**2.1.1** When the cashier opens the checkout modal and taps "Split Payment", the system shall enter split tender mode, displaying the order total, a running "Amount Collected" tally, and a "Remaining" amount.

**2.1.2** When the cashier selects a payment method and enters an amount in split tender mode, the system shall validate that `amount > 0` and `amount ≤ remainingDue` before adding the payment line.

**2.1.3** When the cashier adds a terminal payment line in split tender mode and `paymentMode === 'tap_to_pay'`, the system shall navigate to `PaymentTerminalScreen` with `amount` set to the split amount. On `onPaymentComplete`, the system shall add the returned `PaymentLine` (with `transactionId`, `cardBrand`, `last4`) to the session. The terminal option is not shown when `paymentMode === 'cash_only'` (desktop or no SDK provider active).

**2.1.4** When the cashier adds a cash payment line in split tender mode, the system shall prompt for the tendered amount, calculate change (`tendered − amount`), display the change due, and add the payment line with `method: 'cash'` and `amount` equal to the split amount (not the tendered amount).

**2.1.5** When the cashier adds a store credit or loyalty payment line, the system shall call `StoreCreditService.redeem()` or `LoyaltyService.redeemPoints()` respectively and add the resulting payment line.

**2.1.6** When `remainingDue === 0`, the system shall enable the "Complete Sale" button.

**2.1.7** When the cashier taps "Complete Sale" and `remainingDue === 0`, the system shall call `CheckoutService.completePayment(orderId, payments)` with the full `PaymentLine[]`.

**2.1.8** When `CheckoutService.completePayment()` is called with a `payments` array, the system shall serialise the array to `payments_json` in the `orders` table and set `status: 'paid'`.

**2.1.9** When the cashier removes a payment line from the split tender session (before completing), the system shall reverse any associated terminal charge or loyalty/credit redemption and recalculate `remainingDue`.

### 2.2 Split Tender — Receipt

**2.2.1** When a receipt is printed for a split tender order, the system shall list each `PaymentLine` with method, amount, and (for terminal payments) `cardBrand ···· last4`.

**2.2.2** When a cash payment line is present, the system shall print the tendered amount and change due on the receipt.

### 2.3 Exchange — Initiation

**2.3.1** When a manager opens an order in Order History and taps "Exchange", the system shall navigate to the Exchange screen with the original order pre-loaded.

**2.3.2** When the Exchange screen loads, the system shall display all `order_items` for the original order with a quantity selector for each, defaulting to `returnQty: 0`.

**2.3.3** When the manager selects items to return and taps "Next", the system shall calculate `returnCredit = sum(item.price × returnQty)` and create an `ExchangeSession` with `returnItems`, `returnCredit`, and an empty `newItems` list.

### 2.4 Exchange — Add New Items

**2.4.1** When the Exchange screen is in the "Add New Items" step, the system shall render the product catalogue (same as the Order screen) with an "Add to Exchange" action per product.

**2.4.2** When the manager adds a product to the exchange, the system shall append it to `ExchangeSession.newItems` and recalculate `newItemsTotal` and `netDue`.

**2.4.3** When `netDue > 0` (customer owes money), the system shall display "Amount Due: £{netDue}" and proceed to split tender settlement for the net amount.

**2.4.4** When `netDue < 0` (store owes customer), the system shall display "Refund Due: £{|netDue|}" and prompt the manager to select a refund method (cash, store credit, or original payment method).

**2.4.5** When `netDue === 0`, the system shall display "No payment required" and enable "Complete Exchange" directly.

### 2.5 Exchange — Confirm

**2.5.1** When the manager taps "Complete Exchange" and all settlement is resolved, the system shall atomically:

1. Call `RefundService.processReturn({ orderId, items: returnItems, issueRefund: false })` to create return records.
2. Call `CheckoutService.startCheckout()` with `newItems` to create a new local order.
3. Call `CheckoutService.completePayment(newOrderId, payments)` with the net settlement payment lines.
4. Link the return records to the new order via `exchange_order_id`.
5. Record an audit log entry `exchange:completed` with both order IDs.

**2.5.2** When any step in the exchange confirmation fails, the system shall roll back all changes (no return records, no new order) and display an error — the original order remains unchanged.

**2.5.3** When the exchange completes successfully, the system shall print a combined exchange receipt showing returned items, new items, and net settlement.

### 2.6 Exchange — Partial Exchange

**2.6.1** When the manager returns items but adds no new items (`newItems` is empty), the system shall treat the exchange as a pure return and route to the standard refund flow.

**2.6.2** When the manager adds new items but returns no items (`returnItems` is empty), the system shall treat the exchange as a new sale and route to the standard checkout flow.

---

## 3. State-Driven Requirements

**3.1** While `remainingDue > 0` in split tender mode, the "Complete Sale" button shall be disabled.

**3.2** While a terminal payment is being processed in split tender mode (terminal screen active), the split tender session shall be preserved — the cashier returns to the split tender screen on completion or cancellation.

**3.3** While `ExchangeSession.netDue > 0`, the "Complete Exchange" button shall be disabled until settlement equals `netDue`.

**3.4** While `ExchangeSession.netDue < 0`, the "Complete Exchange" button shall be disabled until a refund method is selected.

**3.5** While `ExchangeSession.netDue === 0`, the "Complete Exchange" button shall be enabled immediately.

---

## 4. Optional Feature Requirements

**4.1** Where `PaymentLine.method === 'gift_card'`, the system shall call `GiftCardService.redeem(code, amount)` and add the resulting payment line — gift card redemption is a valid split tender method.

**4.2** Where the platform supports partial refunds to the original payment instrument (e.g. Shopify), the exchange refund leg may use `method: 'terminal'` with the original `transactionId` as the refund target — this is a platform-level refund, not a new POS payment.

**4.3** Where `loyalty.enabled` is `true` and the exchange results in a net refund, the system shall reverse any loyalty points earned on the original order proportionally to the returned items.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If a terminal charge succeeds but `CheckoutService.completePayment()` subsequently fails, the system shall record the orphaned `PaymentLine` to a `failed_payments` log and alert the manager — the terminal charge is not automatically reversed.

**5.2** If the cashier navigates away from the split tender screen mid-session, the system shall prompt "Abandon payment session?" — if confirmed, any completed terminal charges in the session shall be voided via `PaymentService.voidTransaction()` where supported.

**5.3** If `voidTransaction()` is not supported by the active payment provider, the system shall display a warning listing the transaction IDs that require manual reversal.

**5.4** If the original order for an exchange has already been partially refunded, the system shall subtract already-refunded quantities from the available return quantities — over-returning is not permitted.

**5.5** If `ExchangeSession` is abandoned mid-flow, no return records or new orders shall be created — the session is discarded entirely.

**5.6** If two cashiers attempt to exchange the same order simultaneously (multi-register), the second exchange attempt shall fail with `'This order is already being exchanged'` — a lock flag is set on the order row during the exchange flow.

---

## 6. Complex Requirements

**6.1** When `CheckoutService.completePayment(orderId, payments)` is called, the system shall validate `sum(payments.map(p => p.amount)) === order.total` (within 1 cent rounding tolerance) before persisting — if the sum does not match, the system shall throw `'Payment total mismatch'`.

**6.2** When an exchange is confirmed and `netDue < 0` with `refundMethod: 'store_credit'`, the system shall call `StoreCreditService.issue(customerEmail, |netDue|, 'Exchange credit', managerId)` as part of the atomic exchange confirmation — the store credit is only issued if the exchange order is successfully created.

**6.3** When a split tender order is synced to a platform via `OrderSyncService`, the system shall map `PaymentLine[]` to the platform's payment representation. For platforms that support only a single payment method (most `remote_cart` platforms), the system shall use the largest payment line's method as the primary method and include the full split detail in the order `note` field.

---

### Platform Capability Gating

Split tender and exchanges are **local-first operations** — the checkout flow, `ExchangeSession`, and `PaymentLine[]` persistence all happen in SQLite regardless of platform.

Platform capabilities gate only the **sync leg**:

| What                             | Capability key used | Gate behaviour                                                         |
| -------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| Exchange return sync to platform | `refunds`           | `not_recommended` → local record only; `custom`/`supported` → API call |
| Exchange new order sync          | `orderSync`         | Always synced; `basketMode` determines the sync strategy               |
| Split tender payment detail sync | `orderSync`         | Full detail on `native_draft`; primary method + note on others         |
| Gift card redemption in split    | `giftCards`         | Hidden if `not_recommended`; disabled if `custom` + not ready          |

No new capability keys are required for this feature.

---

## 8. Component Traceability

| Requirement (summary)                       | Component / Service                                                                | Source File (target)                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `PaymentLine[]` on `LocalOrder`             | `LocalOrder` type + `OrderRepository` schema                                       | `services/order/order.ts`, `repositories/OrderRepository.ts` |
| `payments_json` column in `orders` table    | `OfflineOrderRepository` schema migration                                          | `repositories/OfflineOrderRepository.ts`                     |
| Split tender mode in checkout modal         | `CheckoutModal` split tender branch                                                | `components/CheckoutModal.tsx`                               |
| Add terminal payment line → terminal screen | `CheckoutModal` → `PaymentTerminalScreen` with split amount (tap_to_pay mode only) | `screens/PaymentTerminalScreen.tsx`                          |
| Add cash payment line + change calculation  | `CheckoutModal` cash tender handler                                                | `components/CheckoutModal.tsx`                               |
| `completePayment(orderId, payments)`        | `CheckoutService.completePayment`                                                  | `services/checkout/CheckoutService.ts`                       |
| Payment total validation                    | `CheckoutService.completePayment` sum check                                        | `services/checkout/CheckoutService.ts`                       |
| Split tender receipt lines                  | `ReceiptPreview` + `PrinterService` payment section                                | `components/ReceiptPreview.tsx`                              |
| Exchange screen — return item selection     | `ExchangeScreen` step 1                                                            | `screens/ExchangeScreen.tsx`                                 |
| Exchange screen — add new items             | `ExchangeScreen` step 2 (product catalogue)                                        | `screens/ExchangeScreen.tsx`                                 |
| Exchange session net due calculation        | `ExchangeScreen` state                                                             | `screens/ExchangeScreen.tsx`                                 |
| Exchange confirmation — atomic commit       | `ExchangeService.confirmExchange`                                                  | `services/exchange/ExchangeService.ts`                       |
| Exchange rollback on failure                | `ExchangeService.confirmExchange` catch + rollback                                 | `services/exchange/ExchangeService.ts`                       |
| Exchange audit log                          | `ExchangeService` → `auditLogService.log('exchange:completed')`                    | `services/exchange/ExchangeService.ts`                       |
| Exchange receipt                            | `PrinterService.printExchangeReceipt`                                              | `services/printer/PrinterService.ts`                         |
| Order History → Exchange entry point        | `OrderCard` "Exchange" button → `ExchangeScreen`                                   | `screens/order-history/OrderCard.tsx`                        |
| More menu — Exchange item                   | `MoreMenuComposer` Exchange entry                                                  | `services/navigation/MoreMenuComposer.ts`                    |
| Platform sync — split tender mapping        | `OrderSyncService.syncOrderToPlatform` payments mapping                            | `services/sync/OrderSyncService.ts`                          |
