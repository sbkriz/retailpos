# Loyalty – EARS Requirements

> **System**: RetailPOS – Loyalty Points Management  
> **Actor**: Cashier, Manager, System  
> **Date**: 2026-05-03  
> **Source**: `services/loyalty/LoyaltyService.ts`, `repositories/LoyaltyRepository.ts`, `repositories/KeyValueRepository.ts`, `services/audit/AuditLogService.ts`, `services/notifications/NotificationService.ts`, `utils/money.ts`

---

## Context

The loyalty system allows customers to earn points on purchases and redeem them for discounts on future orders. Points are tracked in a local SQLite ledger with the customer's email as the primary key. The system supports configurable earn and redeem rates, automatic tier calculation, and optional points expiry.

All monetary amounts are stored in integer cents internally (per ADR-006). Points are stored as integers. The system is **local-first** — the SQLite ledger is always authoritative. Platform outbound sync is non-blocking and out of scope for this spec.

### Actors

| Actor   | Role                                                                            |
| ------- | ------------------------------------------------------------------------------- |
| Cashier | Redeems loyalty points during checkout, views customer balance and tier         |
| Manager | Adjusts points manually, configures loyalty settings                            |
| System  | Earns points on completed orders, calculates tiers, reverses failed redemptions |

### Loyalty Transaction Types

| Type         | Points Sign  | Description                                                               |
| ------------ | ------------ | ------------------------------------------------------------------------- |
| `earn`       | Positive     | Points earned from a completed order                                      |
| `redeem`     | Negative     | Points redeemed for a discount on an order                                |
| `adjustment` | Positive/Neg | Manual adjustment by manager (compensation, correction)                   |
| `reversal`   | Positive     | Reversal of a previous redemption (e.g. order cancelled after redemption) |

### Loyalty Tiers

| Tier   | Lifetime Points Earned | Benefits                          |
| ------ | ---------------------- | --------------------------------- |
| Bronze | 0 – 499                | Default tier for all customers    |
| Silver | 500 – 1,999            | Unlocked at 500 lifetime points   |
| Gold   | 2,000+                 | Unlocked at 2,000 lifetime points |

Tier thresholds are currently hardcoded but can be made configurable in future iterations.

### Key Defaults

| Field                | Default                         | Source                                   |
| -------------------- | ------------------------------- | ---------------------------------------- |
| `loyalty.enabled`    | `false`                         | `KeyValueRepository` (config key)        |
| `loyalty.earnRate`   | `100` (£1 per point)            | `LoyaltyConfig` default                  |
| `loyalty.redeemRate` | `1` (1p per point)              | `LoyaltyConfig` default                  |
| `loyalty.expiryDays` | `null` (no expiry)              | `LoyaltyConfig` default                  |
| Balance calculation  | Sum of all transaction `points` | `LoyaltyRepository.getOrCreateAccount()` |
| Tier calculation     | Based on `lifetime_earned`      | `LoyaltyService.calculateTier()`         |
| Redemption clamping  | `min(pointsToRedeem, balance)`  | `LoyaltyService.redeemPoints()`          |

---

## 1. Ubiquitous Requirements

**1.1** The system shall store all loyalty points as integers in the `loyalty_transactions` table.

**1.2** The system shall calculate a customer's balance as the sum of all `points` values for that customer's email address.

**1.3** The system shall track `lifetime_earned` as the cumulative sum of all positive point transactions (earn, adjustment with positive delta, reversal).

**1.4** The system shall calculate a customer's tier based on `lifetime_earned` using the tier thresholds: Bronze (0–499), Silver (500–1,999), Gold (2,000+).

**1.5** The system shall update a customer's tier automatically after every earn or adjustment operation that changes `lifetime_earned`.

**1.6** The system shall append every loyalty transaction to the ledger — the ledger is append-only and transactions are never deleted or modified.

**1.7** The system shall audit-log every manual adjustment via `AuditLogService`.

**1.8** The system shall use the customer's email address as the primary identifier for loyalty accounts.

**1.9** The system shall convert between cents and dollars using `toCents()` and `toDollars()` from `utils/money.ts` to maintain precision.

**1.10** The system shall check the `loyalty.enabled` configuration flag before allowing loyalty operations — if disabled, the feature is hidden from the UI.

**1.11** The system shall clamp redemption amounts to the customer's available balance — the system never allows negative balances.

**1.12** The system shall emit a notification when points are earned on an order, displaying the earned amount to the cashier.

---

## 2. Event-Driven Requirements

### 2.1 Get Configuration

**2.1.1** When `getConfig()` is called and `configCache` is populated, the system shall return the cached config without querying the database.

**2.1.2** When `getConfig()` is called and `configCache` is `null`, the system shall call `KeyValueRepository.getObject<LoyaltyConfig>('loyalty.config')`.

**2.1.3** When the repository returns `null`, the system shall return `DEFAULT_CONFIG` with `enabled: false`, `earnRate: 100`, `redeemRate: 1`, `expiryDays: null`.

**2.1.4** When the repository returns a stored config, the system shall cache it in `configCache` and return it.

### 2.2 Update Configuration

**2.2.1** When `updateConfig(config)` is called, the system shall merge the provided fields with the current config using spread syntax.

**2.2.2** When the merged config is created, the system shall call `KeyValueRepository.setObject('loyalty.config', updated)` to persist it.

**2.2.3** When the config is persisted, the system shall update `configCache` with the new config.

### 2.3 Get Balance

**2.3.1** When `getBalance(email)` is called, the system shall call `LoyaltyRepository.getOrCreateAccount(email)` to retrieve or create the account.

**2.3.2** When the account is retrieved, the system shall call `calculateTier(account.lifetime_earned)` to determine the customer's tier.

**2.3.3** When the tier is calculated, the system shall call `getConfig()` to retrieve the redeem rate.

**2.3.4** When the config is retrieved, the system shall calculate `valueInCents = account.balance * config.redeemRate`.

**2.3.5** When all values are calculated, the system shall return `{ points: account.balance, valueInCents, tier, lifetimeEarned: account.lifetime_earned }`.

### 2.4 Earn Points

**2.4.1** When `earnPoints(email, orderId, orderTotal)` is called, the system shall call `getConfig()` to check if loyalty is enabled.

**2.4.2** When `config.enabled` is `false`, the system shall return immediately without earning points.

**2.4.3** When `config.enabled` is `true`, the system shall convert `orderTotal` to cents using `toCents(orderTotal)`.

**2.4.4** When the total is converted, the system shall calculate `pointsEarned = Math.floor(totalCents / config.earnRate)`.

**2.4.5** When `pointsEarned <= 0`, the system shall return immediately without creating a transaction.

**2.4.6** When `pointsEarned > 0`, the system shall call `LoyaltyRepository.getOrCreateAccount(email)` to ensure the account exists.

**2.4.7** When the account exists, the system shall call `LoyaltyRepository.appendTransaction(email, 'earn', pointsEarned, orderId, 'Order purchase')`.

**2.4.8** When the transaction is appended, the system shall call `LoyaltyRepository.updateBalance(email, pointsEarned)` to increment the balance.

**2.4.9** When the balance is updated, the system shall call `updateTier(email)` to recalculate and update the customer's tier.

**2.4.10** When the tier is updated, the system shall call `notificationService.notify('Loyalty Points Earned', '+<points> points earned on this order', 'info')`.

**2.4.11** When any step in `earnPoints()` throws an error, the system shall catch it, log an error message, and return without throwing — earning points must never block checkout.

### 2.5 Redeem Points

**2.5.1** When `redeemPoints(email, orderId, pointsToRedeem)` is called, the system shall call `getConfig()` to retrieve the redeem rate.

**2.5.2** When the config is retrieved, the system shall call `LoyaltyRepository.getOrCreateAccount(email)` to get the current balance.

**2.5.3** When the balance is retrieved, the system shall calculate `clamped = min(pointsToRedeem, account.balance)` to clamp the redemption to available points.

**2.5.4** When `clamped <= 0`, the system shall throw `'Insufficient loyalty points balance'`.

**2.5.5** When `clamped > 0`, the system shall call `LoyaltyRepository.appendTransaction(email, 'redeem', -clamped, orderId, 'Points redemption')`.

**2.5.6** When the transaction is appended, the system shall call `LoyaltyRepository.updateBalance(email, -clamped)` to decrement the balance.

**2.5.7** When the balance is updated, the system shall calculate `discountCents = clamped * config.redeemRate` and `discountDollars = toDollars(discountCents)`.

**2.5.8** When the discount is calculated, the system shall log an info message with the redeemed points and discount amount.

**2.5.9** When `redeemPoints()` completes, the system shall return `{ transactionId, discountDollars }`.

### 2.6 Reverse Redemption

**2.6.1** When `reverseRedemption(transactionId)` is called, the system shall call `LoyaltyRepository.findTransactionById(transactionId)` to retrieve the original transaction.

**2.6.2** When the transaction is not found or `tx.type !== 'redeem'`, the system shall return immediately without creating a reversal.

**2.6.3** When the transaction is found and is a redemption, the system shall calculate `restoredPoints = Math.abs(tx.points)` to get the positive amount.

**2.6.4** When `restoredPoints` is calculated, the system shall call `LoyaltyRepository.appendTransaction(tx.customer_email, 'reversal', restoredPoints, tx.order_id, 'Reversal of <transactionId>')`.

**2.6.5** When the reversal transaction is appended, the system shall call `LoyaltyRepository.updateBalance(tx.customer_email, restoredPoints)` to restore the points.

**2.6.6** When the balance is updated, the system shall log an info message with the reversed transaction ID and restored points.

**2.6.7** When any step in `reverseRedemption()` throws an error, the system shall catch it, log an error message, emit a warning notification, and return without throwing — reversal failures are non-blocking.

### 2.7 Manual Adjustment

**2.7.1** When `adjustPoints(email, delta, reason, managerId?)` is called, the system shall call `LoyaltyRepository.getOrCreateAccount(email)` to ensure the account exists.

**2.7.2** When the account exists, the system shall call `LoyaltyRepository.appendTransaction(email, 'adjustment', delta, null, reason, managerId)`.

**2.7.3** When the transaction is appended, the system shall call `LoyaltyRepository.updateBalance(email, delta)` to apply the adjustment.

**2.7.4** When the balance is updated, the system shall call `updateTier(email)` to recalculate and update the customer's tier.

**2.7.5** When the tier is updated, the system shall call `auditLogService.log('loyalty:adjusted')` with metadata including `email`, `delta`, and `reason`.

### 2.8 Update Tier

**2.8.1** When `updateTier(email)` is called, the system shall call `LoyaltyRepository.getOrCreateAccount(email)` to retrieve the account.

**2.8.2** When the account is retrieved, the system shall call `calculateTier(account.lifetime_earned)` to determine the new tier.

**2.8.3** When the new tier is calculated and differs from `account.tier`, the system shall call `LoyaltyRepository.updateTier(email, newTier)`.

**2.8.4** When the tier is updated, the system shall log an info message with the email, old tier, and new tier.

**2.8.5** When any step in `updateTier()` throws an error, the system shall catch it, log an error message, and return without throwing — tier update failures are non-blocking.

### 2.9 Get Transaction History

**2.9.1** When `getTransactions(email, limit?)` is called, the system shall call `LoyaltyRepository.findTransactionsByEmail(email, limit)` with `limit` defaulting to `50`.

**2.9.2** When the repository returns transactions, the system shall return them to the caller without modification.

---

## 3. State-Driven Requirements

**3.1** While `loyalty.enabled` is `false`, the UI shall hide all loyalty features (earn, redeem, balance display, tier display).

**3.2** While a customer's balance is `0`, the system shall allow `redeemPoints()` to be called but it shall throw `'Insufficient loyalty points balance'`.

**3.3** While a customer's balance is positive, the system shall allow redemption up to the available balance.

**3.4** While a customer's `lifetime_earned` is less than 500, the system shall assign tier `'Bronze'`.

**3.5** While a customer's `lifetime_earned` is between 500 and 1,999 (inclusive), the system shall assign tier `'Silver'`.

**3.6** While a customer's `lifetime_earned` is 2,000 or greater, the system shall assign tier `'Gold'`.

**3.7** While a redemption is being processed, the system shall not lock the customer's account — concurrent redemptions are allowed and will be serialized by SQLite's write lock.

---

## 4. Optional Feature Requirements

**4.1** Where `managerId` is provided to `adjustPoints()`, the system shall record it in the transaction's `manager_id` field and include it in the audit log metadata.

**4.2** Where `limit` is provided to `getTransactions()`, the system shall pass it to the repository to limit the number of returned transactions.

**4.3** Where `config.expiryDays` is set to a positive number, the system shall support points expiry (implementation out of scope for this spec — requires background job).

---

## 5. Unwanted Behaviour / Edge Cases

### 5.1 Insufficient Balance

**5.1.1** If `redeemPoints()` is called when the customer's balance is `0`, then the system shall throw `'Insufficient loyalty points balance'` without creating a transaction.

**5.1.2** If `redeemPoints()` is called with `pointsToRedeem > balance`, then the system shall clamp the redemption to `balance` and create a transaction for the clamped amount — the redemption succeeds with a partial amount.

### 5.2 Earn Points Failure

**5.2.1** If `earnPoints()` throws an error (e.g. database write failure), then the system shall catch the error, log it, and return without throwing — the checkout flow must not be blocked.

**5.2.2** If `earnPoints()` is called with `orderTotal` that results in `pointsEarned = 0` (e.g. order total is less than the earn rate), then the system shall return immediately without creating a transaction.

### 5.3 Reversal of Non-Redemption

**5.3.1** If `reverseRedemption()` is called with a `transactionId` that does not exist, then the system shall return immediately without throwing.

**5.3.2** If `reverseRedemption()` is called with a `transactionId` that is not a `'redeem'` type, then the system shall return immediately without creating a reversal transaction.

### 5.4 Reversal Failure

**5.4.1** If `reverseRedemption()` throws an error (e.g. database write failure), then the system shall catch the error, log it, emit a warning notification, and return without throwing — the caller is not notified of the failure.

### 5.5 Tier Update Failure

**5.5.1** If `updateTier()` throws an error (e.g. database write failure), then the system shall catch the error, log it, and return without throwing — the tier update is non-critical and will be corrected on the next earn/adjustment operation.

### 5.6 Concurrent Redemptions

**5.6.1** If two cashiers attempt to redeem points for the same customer simultaneously, then SQLite's write lock shall serialize the transactions — the second redemption will see the updated balance after the first completes.

**5.6.2** If the second redemption requests more points than remain after the first redemption, then the system shall clamp it to the remaining balance or throw `'Insufficient loyalty points balance'` if the balance is zero.

### 5.7 Feature Disabled

**5.7.1** If `config.enabled` is `false` and a cashier attempts to redeem points, then the UI shall prevent the action — the service methods are still callable but the UI should gate access.

### 5.8 Negative Adjustment

**5.8.1** If `adjustPoints()` is called with a negative `delta` that exceeds the customer's balance, then the system shall allow the adjustment — the balance can go negative via manual adjustment (manager override).

---

## 6. Complex Requirements

**6.1** When `earnPoints()` is called and `pointsEarned > 0`, the system shall atomically append a transaction, update the balance, update the tier, and emit a notification — if any step fails, the system shall catch the error, log it, and return without throwing to avoid blocking checkout.

**6.2** When `redeemPoints()` is called and `pointsToRedeem > balance`, the system shall clamp the redemption to `balance`, create a transaction for the clamped amount, update the balance, calculate the discount, and return `{ transactionId, discountDollars }` — the caller receives the actual redeemed amount, not the requested amount.

**6.3** When `reverseRedemption()` is called and the original transaction is found and is a redemption, the system shall create a new transaction with type `'reversal'`, positive points equal to the absolute value of the original redemption, and reason `'Reversal of <transactionId>'` — the customer's balance is restored by the sum of the reversal transaction.

**6.4** When `updateTier()` is called and the new tier differs from the current tier, the system shall update the `loyalty_accounts.tier` field and log the tier change — if the tier is unchanged, no database write occurs.

**6.5** When `getBalance()` is called, the system shall retrieve the account, calculate the tier, retrieve the config, calculate the value in cents, and return `{ points, valueInCents, tier, lifetimeEarned }` — all values are computed on-demand from the ledger and config.

---

## 7. Loyalty Lifecycle Summary

### Earn Flow

```
Order completed
  → LoyaltyService.earnPoints(email, orderId, orderTotal)
    → config = getConfig()
    → Return if config.enabled === false
    → totalCents = toCents(orderTotal)
    → pointsEarned = Math.floor(totalCents / config.earnRate)
    → Return if pointsEarned <= 0
    → LoyaltyRepository.getOrCreateAccount(email)
    → LoyaltyRepository.appendTransaction(email, 'earn', pointsEarned, orderId, 'Order purchase')
      → INSERT INTO loyalty_transactions (id, customer_email, type, points, order_id, reason, created_at)
    → LoyaltyRepository.updateBalance(email, pointsEarned)
      → UPDATE loyalty_accounts SET balance = balance + ?, lifetime_earned = lifetime_earned + ? WHERE customer_email = ?
    → updateTier(email)
      → Calculate new tier based on lifetime_earned
      → UPDATE loyalty_accounts SET tier = ? WHERE customer_email = ? (if changed)
    → notificationService.notify('Loyalty Points Earned', '+<points> points earned on this order', 'info')
```

### Redeem Flow

```
Cashier redeems points during checkout
  → LoyaltyService.redeemPoints(email, orderId, pointsToRedeem)
    → config = getConfig()
    → account = LoyaltyRepository.getOrCreateAccount(email)
    → clamped = min(pointsToRedeem, account.balance)
    → Throw 'Insufficient loyalty points balance' if clamped <= 0
    → txId = LoyaltyRepository.appendTransaction(email, 'redeem', -clamped, orderId, 'Points redemption')
      → INSERT INTO loyalty_transactions (id, customer_email, type, points, order_id, reason, created_at)
    → LoyaltyRepository.updateBalance(email, -clamped)
      → UPDATE loyalty_accounts SET balance = balance - ? WHERE customer_email = ?
    → discountCents = clamped * config.redeemRate
    → discountDollars = toDollars(discountCents)
    → return { transactionId: txId, discountDollars }
```

### Reversal Flow

```
Order cancelled after points redemption
  → LoyaltyService.reverseRedemption(transactionId)
    → tx = LoyaltyRepository.findTransactionById(transactionId)
    → Return if tx is null or tx.type !== 'redeem'
    → restoredPoints = Math.abs(tx.points)
    → LoyaltyRepository.appendTransaction(tx.customer_email, 'reversal', restoredPoints, tx.order_id, 'Reversal of <transactionId>')
      → INSERT INTO loyalty_transactions (id, customer_email, type, points, order_id, reason, created_at)
    → LoyaltyRepository.updateBalance(tx.customer_email, restoredPoints)
      → UPDATE loyalty_accounts SET balance = balance + ? WHERE customer_email = ?
    → logger.info('Reversed redemption')
```

### Adjustment Flow

```
Manager adjusts points
  → LoyaltyService.adjustPoints(email, delta, reason, managerId)
    → LoyaltyRepository.getOrCreateAccount(email)
    → LoyaltyRepository.appendTransaction(email, 'adjustment', delta, null, reason, managerId)
      → INSERT INTO loyalty_transactions (id, customer_email, type, points, reason, manager_id, created_at)
    → LoyaltyRepository.updateBalance(email, delta)
      → UPDATE loyalty_accounts SET balance = balance + ?, lifetime_earned = lifetime_earned + ? WHERE customer_email = ? (if delta > 0)
    → updateTier(email)
    → auditLogService.log('loyalty:adjusted', { email, delta, reason })
```

### Tier Calculation

| Lifetime Earned | Tier   | Threshold                         |
| --------------- | ------ | --------------------------------- |
| 0 – 499         | Bronze | Default tier                      |
| 500 – 1,999     | Silver | Unlocked at 500 lifetime points   |
| 2,000+          | Gold   | Unlocked at 2,000 lifetime points |

### Earn Rate Examples

| Order Total | Earn Rate | Points Earned                             |
| ----------- | --------- | ----------------------------------------- |
| £50.00      | 100       | Math.floor(5000 / 100) = 50 points        |
| £25.50      | 100       | Math.floor(2550 / 100) = 25 points        |
| £0.99       | 100       | Math.floor(99 / 100) = 0 points (no earn) |
| £100.00     | 50        | Math.floor(10000 / 50) = 200 points       |

### Redeem Rate Examples

| Points Redeemed | Redeem Rate | Discount Value             |
| --------------- | ----------- | -------------------------- |
| 100             | 1           | 100 \* 1 = 100¢ = £1.00    |
| 50              | 1           | 50 \* 1 = 50¢ = £0.50      |
| 100             | 5           | 100 \* 5 = 500¢ = £5.00    |
| 1000            | 1           | 1000 \* 1 = 1000¢ = £10.00 |

---

## 8. Component Traceability

| Requirement (summary)                       | Component / Hook / Service                                                | Source File                                     |
| ------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Loyalty configuration retrieved             | `LoyaltyService.getConfig`                                                | `services/loyalty/LoyaltyService.ts`            |
| Configuration cached in memory              | `LoyaltyService.configCache`                                              | `services/loyalty/LoyaltyService.ts`            |
| Configuration updated                       | `LoyaltyService.updateConfig`                                             | `services/loyalty/LoyaltyService.ts`            |
| Configuration stored in key-value store     | `KeyValueRepository.setObject` / `getObject`                              | `repositories/KeyValueRepository.ts`            |
| Customer balance retrieved                  | `LoyaltyService.getBalance`                                               | `services/loyalty/LoyaltyService.ts`            |
| Loyalty account created or retrieved        | `LoyaltyRepository.getOrCreateAccount`                                    | `repositories/LoyaltyRepository.ts`             |
| Tier calculated from lifetime earned        | `LoyaltyService.calculateTier`                                            | `services/loyalty/LoyaltyService.ts`            |
| Points earned on order                      | `LoyaltyService.earnPoints`                                               | `services/loyalty/LoyaltyService.ts`            |
| Points calculated from order total          | `LoyaltyService.earnPoints` (Math.floor calculation)                      | `services/loyalty/LoyaltyService.ts`            |
| Transaction appended to ledger              | `LoyaltyRepository.appendTransaction`                                     | `repositories/LoyaltyRepository.ts`             |
| Balance updated in account                  | `LoyaltyRepository.updateBalance`                                         | `repositories/LoyaltyRepository.ts`             |
| Tier updated after earn/adjustment          | `LoyaltyService.updateTier`                                               | `services/loyalty/LoyaltyService.ts`            |
| Tier persisted to account                   | `LoyaltyRepository.updateTier`                                            | `repositories/LoyaltyRepository.ts`             |
| Notification emitted on earn                | `notificationService.notify`                                              | `services/notifications/NotificationService.ts` |
| Points redeemed                             | `LoyaltyService.redeemPoints`                                             | `services/loyalty/LoyaltyService.ts`            |
| Redemption clamped to balance               | `LoyaltyService.redeemPoints` (min calculation)                           | `services/loyalty/LoyaltyService.ts`            |
| Discount calculated from points             | `LoyaltyService.redeemPoints` (points \* redeemRate)                      | `services/loyalty/LoyaltyService.ts`            |
| Redemption reversed                         | `LoyaltyService.reverseRedemption`                                        | `services/loyalty/LoyaltyService.ts`            |
| Original transaction retrieved for reversal | `LoyaltyRepository.findTransactionById`                                   | `repositories/LoyaltyRepository.ts`             |
| Reversal transaction created                | `LoyaltyRepository.appendTransaction` (type: 'reversal')                  | `repositories/LoyaltyRepository.ts`             |
| Points adjusted manually                    | `LoyaltyService.adjustPoints`                                             | `services/loyalty/LoyaltyService.ts`            |
| Adjustment audit logged                     | `LoyaltyService.adjustPoints` → `auditLogService.log('loyalty:adjusted')` | `services/loyalty/LoyaltyService.ts`            |
| Transaction history retrieved               | `LoyaltyService.getTransactions`                                          | `services/loyalty/LoyaltyService.ts`            |
| Transactions queried by email               | `LoyaltyRepository.findTransactionsByEmail`                               | `repositories/LoyaltyRepository.ts`             |
| Cents/dollars conversion                    | `toCents` / `toDollars`                                                   | `utils/money.ts`                                |

---

**Document Metadata**:

- **Author**: Kiro AI Agent
- **Date**: 2026-05-03
- **Version**: 1.0
- **Status**: Final
- **Related**: `docs/specs/customer/store-credit.md`, `docs/specs/checkout/checkout.md`
