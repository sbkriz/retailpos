# Sales Screen UX – EARS Requirements

> **System**: RetailPOS – Sales Screen User Experience
> **Actor**: Cashier, System
> **Date**: 2026-05-03
> **Source**: `screens/SaleScreen.tsx`, `screens/sale/ProductGrid.tsx`, `screens/sale/Basket.tsx`, `screens/sale/BasketContent.tsx`, `components/SalesStatusHeader.tsx`, `components/BasketBlockers.tsx`, `components/RecoveryModal.tsx`, `utils/orderStateMapper.ts`, `hooks/useSaleScreen.ts`

---

## Context

The Sales Screen is the primary interface for cashiers to conduct transactions. This spec defines the **behaviour-led UX requirements** that transform the technically-capable sales flow into a **guided sales workspace** optimized for speed, clarity, and error prevention.

The UX layer sits above the existing basket, checkout, and payment services. It does not change the underlying business logic — it reshapes how that logic is surfaced to the user through:

1. **Persistent state visibility** — Always show current context (register, cashier, order state, totals)
2. **Clear next actions** — One dominant CTA per state
3. **Inline validation** — Surface blockers before checkout
4. **Guided recovery** — Replace generic errors with actionable recovery flows
5. **Interruption resilience** — Detect and offer resume for interrupted operations

### Design Principles

| Principle                                    | Implementation                                             |
| -------------------------------------------- | ---------------------------------------------------------- |
| **Make the next action obvious**             | One primary CTA per state, secondary actions grouped       |
| **Show state, not just data**                | User-facing state labels (Draft, Ready, Processing, Paid)  |
| **Validate early, fail fast**                | Basket blockers prevent invalid checkouts                  |
| **Guide recovery, don't just report errors** | Recovery modals with primary/secondary/tertiary actions    |
| **Preserve progress aggressively**           | SQLite persistence + interruption detection + resume UI    |
| **Hide complexity, expose control**          | Technical states mapped to user-facing labels              |
| **Optimize for speed, not features**         | Fast path for common sales, accessible path for exceptions |
| **Instrument everything**                    | Track behavioural metrics for continuous improvement       |

### Actors

| Actor   | Role                                                                 |
| ------- | -------------------------------------------------------------------- |
| Cashier | Conducts sales, recovers from errors, resumes interrupted operations |
| System  | Validates basket, surfaces blockers, guides recovery, tracks metrics |

---

## 1. Ubiquitous Requirements

**1.1** The system shall display a persistent status header at all times showing: register name, cashier name, sale mode, order state, item count, total, and sync status.

**1.2** The system shall map technical order states (`draft`, `pending`, `processing`, `paid`, `synced`, `failed`, `cancelled`) to user-facing states (`Empty`, `Building`, `Ready`, `Processing`, `Paid`, `Synced`, etc.) via `getUserFacingSaleState()`.

**1.3** The system shall validate the basket before checkout and surface blockers inline (customer required, variant missing, unsynced orders, etc.) via `BasketBlockers` component.

**1.4** The system shall display exactly one primary CTA per sale state, with secondary actions grouped and tertiary actions (destructive) de-emphasized.

**1.5** The system shall replace all `Alert.alert` error dialogs in the sales flow with `RecoveryModal` components that offer primary/secondary/tertiary recovery actions.

**1.6** The system shall detect interrupted operations on app open (draft sale, interrupted checkout, interrupted payment, unsynced orders) and offer resume flows via `InterruptionBanner`.

**1.7** The system shall use reassuring operational language for sync failures: "Order saved locally. Platform sync pending." instead of "Sync failed."

**1.8** The system shall track behavioural analytics for all key UX events: time to checkout, taps per sale, payment recovery time, split tender completion rate, sync failure rate.

---

## 2. Event-Driven Requirements

### 2.1 Sales Status Header

**2.1.1** When `SaleScreen` mounts, the system shall render `SalesStatusHeader` with current register name, cashier name, sale mode (`counter` | `delivery` | `pickup`), order state, item count, total, and unsynced count.

**2.1.2** When the basket state changes (items added/removed, totals updated), the system shall update the status header immediately without re-mounting.

**2.1.3** When the order state transitions (Building → Ready → Processing → Paid), the system shall update the state badge color, label, and icon in the header.

**2.1.4** When rendering the state badge, the system shall display it as a large, prominent badge with:

- State emoji icon (🛒 open, ⚠️ needs-attention, ✅ ready-to-pay, 💳 processing-payment, 🎉 completed, ❌ cancelled, 🚫 failed)
- Bold uppercase text label
- 2px colored border matching the state color
- Colored background (15% opacity of state color)
- Minimum width of 120px for consistent sizing

**2.1.5** When `unsyncedOrdersCount > 0`, the system shall render a sync badge in the header showing the count, tappable to trigger `syncAllPendingOrders()`.

**2.1.6** When `unsyncedOrdersCount > 0` and sync is not in progress, the system shall animate the sync badge with a continuous pulse animation (scale 1.0 → 1.15 over 800ms, looping) to draw attention.

**2.1.7** When the cashier taps the sync badge, the system shall call `syncAllPendingOrders()` and show a loading indicator until sync completes.

### 2.2 User-Facing Sale States

**2.2.1** When the basket is empty, the system shall set `saleState` to `'empty'` and render the empty state UI.

**2.2.2** When the basket has items and no blockers, the system shall set `saleState` to `'building'` and enable the "Complete Order" button.

**2.2.3** When the basket has items and one or more blockers, the system shall set `saleState` to `'needs-attention'` and change the primary CTA to "Fix Issues".

**2.2.4** When `startCheckout()` is called, the system shall set `saleState` to `'preparing-checkout'` and show a loading indicator.

**2.2.5** When `CheckoutModal` opens, the system shall set `saleState` to `'ready-for-payment'`.

**2.2.6** When `markPaymentProcessing()` is called, the system shall set `saleState` to `'processing-payment'`.

**2.2.7** When `completePayment()` returns `success: true`, the system shall set `saleState` to `'paid'` if sync is pending, or `'synced'` if sync completes immediately.

**2.2.8** When `completePayment()` returns `success: false`, the system shall set `saleState` to `'payment-failed'`.

**2.2.9** When an order is paid but sync fails, the system shall set `saleState` to `'action-required'`.

#### 2.2.10 State Icon Mapping

The system shall map each user-facing sale state to a visual emoji icon via `getSaleStateIcon()`:

| State                | Icon | Purpose                                |
| -------------------- | ---- | -------------------------------------- |
| `open`               | 🛒   | Shopping cart for active sales         |
| `needs-attention`    | ⚠️   | Warning for issues requiring attention |
| `ready-to-pay`       | ✅   | Checkmark for ready-to-checkout state  |
| `processing-payment` | 💳   | Credit card for payment in progress    |
| `completed`          | 🎉   | Celebration for successful completion  |
| `cancelled`          | ❌   | X mark for cancelled orders            |
| `failed`             | 🚫   | Stop sign for failed transactions      |

### 2.3 Basket Validation & Blockers

**2.3.1** When the basket changes, the system shall call `validateBasket(basket)` to compute the current list of blockers.

**2.3.2** When a discount is applied but no customer email is set, the system shall add a blocker: `{ type: 'warning', message: 'Customer email required for loyalty discount', action: { label: 'Add Customer', onPress: openCustomerModal } }`.

**2.3.3** When `unsyncedOrdersCount > 0`, the system shall add an info blocker: `{ type: 'info', message: '{n} orders pending sync', action: { label: 'Retry Sync', onPress: syncAllPendingOrders } }`.

**2.3.4** When a product is added without a required variant, the system shall add an error blocker: `{ type: 'error', message: 'Variant selection required for {productName}', action: { label: 'Select Variant', onPress: openVariantPicker } }`.

**2.3.5** When `blockers.length > 0`, the system shall render `BasketBlockers` component in the basket panel/sidebar, above the totals section.

**2.3.6** When blockers first appear (transition from 0 to 1+ blockers), the system shall animate the `BasketBlockers` component with a shake animation (horizontal translation ±10px over 100ms, 3 iterations) to ensure the blockers are impossible to miss.

**2.3.7** When rendering blockers, the system shall display them as a prominent banner with:

- Warning background color (15% opacity)
- Large icons (22px) and medium-sized text
- Colored action buttons with filled backgrounds (not borders)
- Elevation/shadow for visual prominence
- High contrast to stand out from surrounding content

**2.3.8** When the cashier taps a blocker action button, the system shall execute the action and re-validate the basket.

**2.3.9** When all blockers are resolved, the system shall transition `saleState` from `'needs-attention'` to `'building'` and enable the "Complete Order" button.

### 2.4 Primary CTA by State

**2.4.1** When `saleState === 'empty'`, the system shall not render a primary CTA in the basket.

**2.4.2** When `saleState === 'building'` or `'ready-for-checkout'`, the system shall render a large, prominent "Complete Order" button as the primary CTA.

**2.4.3** When `saleState === 'needs-attention'`, the system shall render "Fix {n} {Issue|Issues}" as the primary CTA, which opens a blockers modal or scrolls to the blockers section.

**2.4.4** When `saleState === 'needs-attention'`, the system shall animate the "Fix Issues" button with a continuous pulse animation (scale 1.0 → 1.15 over 800ms, looping) and change its color to warning color to demand attention.

**2.4.5** When `saleState === 'preparing-checkout'`, the system shall render a disabled button with loading indicator and label "Preparing Checkout...".

**2.4.6** When `saleState === 'processing-payment'`, the system shall render a disabled button with loading indicator and label "Processing Payment...".

**2.4.7** When `saleState === 'paid'`, `'sync-pending'`, or `'synced'`, the system shall render "New Sale" as the primary CTA, which clears the basket and resets state.

**2.4.8** When `saleState === 'payment-failed'`, the system shall render "Try Again" as the primary CTA, which reopens the checkout modal.

**2.4.9** When `saleState === 'action-required'`, the system shall render "Retry Sync" as the primary CTA.

### 2.5 Recovery Modals

**2.5.1** When a card payment is declined, the system shall render `RecoveryModal` with:

- `type: 'error'`
- `title: 'Card Payment Declined'`
- `message: 'The card was declined by the bank. No charge was completed.'`
- `actions: [{ label: 'Try Again', type: 'primary' }, { label: 'Choose Another Method', type: 'secondary' }, { label: 'Cancel Order', type: 'tertiary', destructive: true }]`

**2.5.2** When the terminal is disconnected during payment, the system shall render `RecoveryModal` with:

- `type: 'warning'`
- `title: 'Terminal Disconnected'`
- `message: 'The card terminal is not connected. Reconnect the terminal or choose another payment method.'`
- `actions: [{ label: 'Retry Terminal', type: 'primary' }, { label: 'Use Cash', type: 'secondary' }, { label: 'Manual Card Entry', type: 'secondary' }]`

**2.5.3** When platform sync fails after payment, the system shall render `RecoveryModal` with:

- `type: 'info'`
- `title: 'Order Saved Locally'`
- `message: 'Order #{orderId} is paid and saved. Platform sync is pending.'`
- `details: 'Error: {syncError}'`
- `actions: [{ label: 'Retry Sync Now', type: 'primary' }, { label: 'Continue Selling', type: 'secondary' }]`

**2.5.4** When split tender payment is incomplete, the system shall render `RecoveryModal` with:

- `type: 'warning'`
- `title: 'Payment Incomplete'`
- `message: 'Total: {total}\nPaid: {paid}\nRemaining: {remaining}\n\nAdd another payment to complete.'`
- `actions: [{ label: 'Add Payment', type: 'primary' }, { label: 'Remove Last Payment', type: 'secondary' }, { label: 'Cancel Order', type: 'tertiary', destructive: true }]`

**2.5.5** When a high-value order requires manager approval, the system shall render `RecoveryModal` with:

- `type: 'warning'`
- `title: 'Manager Approval Required'`
- `message: 'Order total {total} exceeds the {threshold} threshold. Manager PIN required to continue.'`
- `actions: [{ label: 'Enter Manager PIN', type: 'primary' }, { label: 'Cancel Order', type: 'tertiary', destructive: true }]`

**2.5.6** When the cashier taps a recovery action, the system shall execute the action callback and close the modal.

**2.5.7** When a recovery modal is dismissed without action, the system shall leave the order in its current state (not automatically cancelled).

### 2.6 Interruption Detection & Resume

**2.6.1** When `SaleScreen` mounts, the system shall call `useInterruptionRecovery()` to check for interrupted operations.

**2.6.2** When a draft sale is detected (basket has items on app open), the system shall render `InterruptionBanner` with:

- `type: 'draft-sale'`
- `message: 'You have a draft sale in progress'`
- `actions: [{ label: 'Resume Sale', onPress: resumeDraftSale }, { label: 'Clear Basket', onPress: clearBasket }]`

**2.6.3** When an interrupted checkout is detected (LocalOrder with `status: 'draft'` exists), the system shall render `InterruptionBanner` with:

- `type: 'interrupted-checkout'`
- `message: 'Checkout was interrupted. Order #{orderId} · {itemCount} items · {total}'`
- `actions: [{ label: 'Resume Checkout', onPress: resumeCheckout }, { label: 'Cancel Order', onPress: cancelOrder }]`

**2.6.4** When an interrupted payment is detected (LocalOrder with `status: 'processing'` exists), the system shall render `InterruptionBanner` with:

- `type: 'interrupted-payment'`
- `message: 'Payment was interrupted. Order #{orderId} · Processing state'`
- `actions: [{ label: 'Recover Payment', onPress: recoverPayment }, { label: 'Cancel Order', onPress: cancelOrder }]`

**2.6.5** When unsynced orders are detected on app open, the system shall render `InterruptionBanner` with:

- `type: 'unsynced'`
- `message: '{count} orders pending sync'`
- `actions: [{ label: 'Retry Sync', onPress: syncAllPendingOrders }, { label: 'Continue', onPress: dismissBanner }]`

**2.6.6** When the cashier taps "Resume Sale", the system shall dismiss the banner and leave the basket intact.

**2.6.7** When the cashier taps "Resume Checkout", the system shall open `CheckoutModal` with the existing `orderId`.

**2.6.8** When the cashier taps "Recover Payment", the system shall open a recovery modal with options to retry payment, change method, or cancel order.

**2.6.9** When the cashier taps "Clear Basket" or "Cancel Order", the system shall confirm the action and execute it.

### 2.7 Sync State Language

**2.7.1** When an order is paid and sync is pending, the system shall display "Order saved locally. Sync pending." in the sync status banner.

**2.7.2** When sync fails, the system shall display "Order is paid and saved. Platform sync pending." with a "Retry Sync" button.

**2.7.3** When multiple orders are unsynced, the system shall display "{count} orders pending sync. Continue selling." with a "Retry Sync" button.

**2.7.4** When sync succeeds, the system shall display "Order synced successfully." as a success toast.

**2.7.5** When sync is in progress, the system shall display "Syncing to {platform}..." with a loading indicator.

**2.7.6** The system shall never use the word "failed" in sync status messages visible to cashiers — always use "pending" or "action required".

### 2.8 Payment Method Availability

**2.8.1** When `CheckoutModal` opens, the system shall compute payment method availability for each method based on current context (customer email, terminal connection, order total, etc.).

**2.8.2** When a payment method is available, the system shall render it in the "Recommended" or "Other Methods" section with full opacity and enabled state.

**2.8.3** When a payment method requires customer email (loyalty, store credit) and no customer is set, the system shall render it in the "Requires Customer" section with reduced opacity, disabled state, and explanation text "Add customer email to use".

**2.8.4** When a payment method is unavailable (terminal disconnected), the system shall render it in the "Unavailable" section with reduced opacity, disabled state, and explanation text "Terminal disconnected" plus a recovery action button "Reconnect".

**2.8.5** When the cashier taps a recovery action button (e.g., "Reconnect"), the system shall execute the action and re-compute payment method availability.

**2.8.6** When the cashier taps an unavailable payment method, the system shall show a toast explaining why it's unavailable and how to fix it.

---

## 3. State-Driven Requirements

**3.1** While `saleState === 'empty'`, the basket shall render the empty state (cart icon, "Your cart is empty", "Tap a product to add it") and no primary CTA.

**3.2** While `saleState === 'building'`, the primary CTA shall read "Complete Order" and be enabled.

**3.3** While `saleState === 'needs-attention'`, the primary CTA shall read "Fix {n} {Issue|Issues}" and the `BasketBlockers` component shall be visible.

**3.4** While `saleState === 'preparing-checkout'` or `'processing-payment'`, the primary CTA shall show a loading indicator and be disabled.

**3.5** While `saleState === 'paid'`, `'sync-pending'`, or `'synced'`, the primary CTA shall read "New Sale".

**3.6** While `blockers.length > 0`, the "Complete Order" button shall be disabled (if rendered) and the "Fix Issues" button shall be the primary CTA.

**3.7** While `interruptionState.type !== 'none'`, the `InterruptionBanner` shall be visible at the top of the screen.

**3.8** While a `RecoveryModal` is visible, all other interactive elements shall be disabled (modal overlay).

**3.9** While `unsyncedOrdersCount > 0`, the sync badge shall be visible in the status header.

**3.10** While sync is in progress (`isSyncing === true`), the sync badge shall show a loading indicator and be disabled.

---

## 3.5 Animation Specifications

**3.5.1** All animations shall use `useNativeDriver: true` for GPU-accelerated 60fps performance.

**3.5.2** All animations shall respect the system `prefers-reduced-motion` accessibility preference.

**3.5.3** Pulse animations (sync badge, Fix Issues button) shall:

- Scale from 1.0 to 1.15
- Duration: 800ms per direction (1600ms total cycle)
- Easing: default (ease-in-out)
- Loop continuously while condition persists
- Stop immediately when condition resolves

**3.5.4** Shake animations (basket blockers) shall:

- Translate horizontally ±10px
- Duration: 100ms per shake
- Iterations: 3 shakes total
- Trigger once when blockers first appear
- Not repeat until blockers are cleared and re-appear

**3.5.5** Animations shall only use transform (scale, translateX) and opacity properties to avoid layout thrashing.

**3.5.6** Animated components shall maintain proper `accessibilityLabel` and `accessibilityRole` attributes.

**3.5.7** Color changes (e.g., Fix Issues button to warning color) shall transition smoothly without animation to avoid distraction.

---

## 4. Optional Feature Requirements

**4.1** Where `registerName` is configured, the status header shall display it; otherwise it shall display "Register".

**4.2** Where `saleMode` is set to `'delivery'` or `'pickup'`, the status header shall display the mode; otherwise it defaults to `'counter'`.

**4.3** Where analytics tracking is enabled, the system shall track all key UX events (time to checkout, taps per sale, payment recovery time, etc.) via `AnalyticsService`.

**4.4** Where a blocker has an `action` callback, the system shall render an action button in the blocker row.

**4.5** Where a recovery modal has a `details` field, the system shall render it below the main message in a muted style.

---

## 5. Unwanted Behaviour / Edge Cases

### 5.1 State Transition Edge Cases

**5.1.1** If `getUserFacingSaleState()` is called with no basket and no order, then it shall return `'empty'`.

**5.1.2** If `getUserFacingSaleState()` is called with a basket but blockers exist, then it shall return `'needs-attention'` regardless of order state.

**5.1.3** If `getUserFacingSaleState()` is called with an order in `'paid'` status but `syncStatus === 'failed'`, then it shall return `'action-required'`, not `'paid'`.

### 5.2 Blocker Edge Cases

**5.2.1** If `validateBasket()` is called with an empty basket, then it shall return an empty blockers array.

**5.2.2** If multiple blockers of the same type exist (e.g., multiple products missing variants), then each shall be rendered as a separate blocker row.

**5.2.3** If a blocker action callback throws, then the system shall catch the error, log it, and show a generic error toast — the blocker shall remain visible.

### 5.3 Interruption Detection Edge Cases

**5.3.1** If multiple interruption types are detected simultaneously (e.g., draft sale + unsynced orders), then the system shall prioritize in order: interrupted payment > interrupted checkout > draft sale > unsynced orders.

**5.3.2** If `useInterruptionRecovery()` is called before services are initialized, then it shall return `{ type: 'none', isChecking: true }` until initialization completes.

**5.3.3** If the cashier dismisses an interruption banner and the condition still exists (e.g., basket still has items), then the banner shall not re-appear until the next app open.

### 5.4 Recovery Modal Edge Cases

**5.4.1** If a recovery modal is shown and the underlying condition resolves (e.g., terminal reconnects), then the modal shall remain visible until the cashier takes an action or dismisses it.

**5.4.2** If multiple recovery scenarios occur in sequence (e.g., payment declined, then terminal disconnected on retry), then each shall show its own recovery modal — modals do not stack.

### 5.5 Sync Language Edge Cases

**5.5.1** If sync fails with a network error, then the message shall be "Connection timeout. Will retry automatically." not "Sync failed."

**5.5.2** If sync fails with an authentication error, then the message shall be "Platform authentication issue. Contact support." not "Unauthorized."

---

## 6. Complex Requirements

**6.1** When the cashier adds an item to the basket while `saleState === 'needs-attention'` due to a customer requirement blocker, and the added item does not require a customer, the system shall re-validate the basket and keep the blocker visible — adding items does not auto-resolve blockers.

**6.2** When the cashier resolves all blockers (e.g., adds customer email) while `CheckoutModal` is open, the system shall not auto-proceed with payment — the cashier must explicitly select a payment method.

**6.3** When an interruption banner is shown for an interrupted payment and the cashier taps "Recover Payment", the system shall check the current order status: if still `'processing'`, offer retry/change method; if `'failed'`, offer retry only; if `'paid'`, dismiss banner and show success.

**6.4** When multiple unsynced orders exist and the cashier taps "Retry Sync", the system shall sync all orders in sequence and show a summary toast: "{synced} synced, {failed} failed" — not individual toasts per order.

**6.5** When a payment method becomes available mid-checkout (e.g., terminal reconnects while `CheckoutModal` is open), the system shall re-compute availability and move the method from "Unavailable" to "Recommended" without closing the modal.

---

## 7. Sales UX Flow Summary

### State transition flow

```
App opens
  → useInterruptionRecovery() checks for interrupted operations
  → [draft sale detected] InterruptionBanner shown
  → [no interruptions] saleState: 'empty'

Cashier adds product
  → saleState: 'building'
  → validateBasket() → no blockers
  → Primary CTA: "Complete Order" (enabled)

Cashier applies discount without customer
  → validateBasket() → blocker added
  → saleState: 'needs-attention'
  → Primary CTA: "Fix 1 Issue"
  → BasketBlockers rendered

Cashier adds customer
  → validateBasket() → blocker resolved
  → saleState: 'building'
  → Primary CTA: "Complete Order" (enabled)

Cashier taps "Complete Order"
  → saleState: 'preparing-checkout'
  → startCheckout() called
  → LocalOrder created
  → saleState: 'ready-for-payment'
  → CheckoutModal opens

Cashier selects payment method
  → Payment method availability computed
  → [terminal disconnected] shown in "Unavailable" section
  → [loyalty without customer] shown in "Requires Customer" section
  → [cash] shown in "Recommended" section

Cashier selects cash
  → Cash tender step shown
  → Cashier enters amount
  → Cashier taps confirm
  → saleState: 'processing-payment'
  → completePayment() called
  → [success] saleState: 'paid' or 'sync-pending'
  → [failure] saleState: 'payment-failed'
  → RecoveryModal shown

Payment succeeds
  → Basket cleared
  → saleState: 'paid'
  → Primary CTA: "New Sale"
  → Background sync starts
  → [sync succeeds] saleState: 'synced'
  → [sync fails] saleState: 'action-required'
```

### Blocker validation flow

```
validateBasket(basket)
  → blockers = []

  → [discount applied && !customerEmail]
    → blockers.push({ type: 'warning', message: 'Customer email required', action: 'Add Customer' })

  → [unsyncedOrdersCount > 0]
    → blockers.push({ type: 'info', message: '{n} orders pending sync', action: 'Retry Sync' })

  → [product without required variant]
    → blockers.push({ type: 'error', message: 'Variant required for {product}', action: 'Select Variant' })

  → return blockers
```

### Recovery modal flow

```
Payment declined
  → RecoveryModal shown
    → Title: "Card Payment Declined"
    → Message: "No charge was completed."
    → Actions:
      - Primary: "Try Again" → reopens CheckoutModal
      - Secondary: "Choose Another Method" → reopens CheckoutModal
      - Tertiary: "Cancel Order" → cancelOrder(), closes modal

Terminal disconnected
  → RecoveryModal shown
    → Title: "Terminal Disconnected"
    → Message: "Reconnect or choose another method."
    → Actions:
      - Primary: "Retry Terminal" → reconnectTerminal(), retries payment
      - Secondary: "Use Cash" → opens CheckoutModal with cash selected
      - Secondary: "Manual Card Entry" → opens CheckoutModal with manual card selected
```

---

## 8. Component Traceability

| Requirement (summary)                    | Component / Hook / Service                          | Source File                                                 |
| ---------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| Status header rendered                   | `SalesStatusHeader`                                 | `components/SalesStatusHeader.tsx`                          |
| Status header integrated into SaleScreen | `SaleScreen`                                        | `screens/SaleScreen.tsx`                                    |
| User-facing state computed               | `getUserFacingSaleState()`                          | `utils/orderStateMapper.ts`                                 |
| State label and color helpers            | `getSaleStateLabel()`, `getSaleStateColor()`        | `utils/orderStateMapper.ts`                                 |
| State icon mapping                       | `getSaleStateIcon()`                                | `utils/orderStateMapper.ts`                                 |
| Sale state exposed to UI                 | `useSaleScreen.saleState`                           | `hooks/useSaleScreen.ts`                                    |
| Basket validation                        | `validateBasket()` in `useSaleScreen`               | `hooks/useSaleScreen.ts`                                    |
| Blockers rendered                        | `BasketBlockers`                                    | `components/BasketBlockers.tsx`                             |
| Blockers integrated into basket          | `BasketContent`, `Basket`                           | `screens/sale/BasketContent.tsx`, `screens/sale/Basket.tsx` |
| Primary CTA by state                     | `BasketContent.getPrimaryCTA()`                     | `screens/sale/BasketContent.tsx`                            |
| Recovery modal rendered                  | `RecoveryModal`                                     | `components/RecoveryModal.tsx`                              |
| Payment declined recovery                | `useCheckout.handlePayment` error branch            | `hooks/useCheckout.ts`                                      |
| Terminal disconnected recovery           | `usePayment.processPayment` error branch            | `hooks/usePayment.ts`                                       |
| Sync failure recovery                    | `OrderSyncService.syncOrderToPlatform` error branch | `services/order/OrderSyncService.ts`                        |
| Interruption detection                   | `useInterruptionRecovery()`                         | `hooks/useInterruptionRecovery.ts`                          |
| Interruption banner rendered             | `InterruptionBanner`                                | `components/InterruptionBanner.tsx`                         |
| Interruption banner integrated           | `SaleScreen`                                        | `screens/SaleScreen.tsx`                                    |
| Resume draft sale                        | `useInterruptionRecovery.resumeDraftSale()`         | `hooks/useInterruptionRecovery.ts`                          |
| Resume checkout                          | `useInterruptionRecovery.resumeCheckout()`          | `hooks/useInterruptionRecovery.ts`                          |
| Recover payment                          | `useInterruptionRecovery.recoverPayment()`          | `hooks/useInterruptionRecovery.ts`                          |
| Sync status language                     | `SyncStatusBanner`                                  | `components/SyncStatusBanner.tsx`                           |
| Payment method availability              | `getPaymentMethodAvailability()` in `CheckoutModal` | `components/CheckoutModal.tsx`                              |
| Payment methods grouped by availability  | `CheckoutModal` render sections                     | `components/CheckoutModal.tsx`                              |
| Analytics tracking                       | `AnalyticsService.track()`                          | `services/analytics/AnalyticsService.ts`                    |
