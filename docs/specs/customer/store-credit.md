# Store Credit – EARS Requirements

> **System**: RetailPOS – Store Credit Management  
> **Actor**: Cashier, Manager, System  
> **Date**: 2026-05-03  
> **Source**: `services/storecredit/StoreCreditService.ts`, `repositories/StoreCreditRepository.ts`, `repositories/KeyValueRepository.ts`, `services/audit/AuditLogService.ts`, `utils/money.ts`

---

## Context

Store credit is a customer balance that can be issued as compensation, refund alternative, or promotional credit, and redeemed against future purchases. The system maintains a ledger of store credit transactions (issue, redeem, expire, reversal) in SQLite, with the customer's email as the primary key.

All amounts are stored in integer cents internally (per ADR-006) to avoid floating-point errors. The service provides dollar-denominated methods for UI convenience (`getBalanceDollars`, `discountDollars`) while maintaining cent precision in the database.

Store credit is **local-first** — the SQLite ledger is always authoritative. Platform sync is out of scope for this spec.

### Actors

| Actor   | Role                                                                                     |
| ------- | ---------------------------------------------------------------------------------------- |
| Cashier | Redeems store credit during checkout, views customer balance                             |
| Manager | Issues store credit, expires credit, adjusts balances                                    |
| System  | Calculates balances, clamps redemptions, reverses failed transactions, audits all events |

### Store Credit Transaction Types

| Type       | Amount Sign | Description                                                               |
| ---------- | ----------- | ------------------------------------------------------------------------- |
| `issue`    | Positive    | Credit issued to customer (compensation, refund alternative, promotion)   |
| `redeem`   | Negative    | Credit redeemed against an order                                          |
| `expire`   | Negative    | Credit expired (e.g. after expiry period, account closure)                |
| `reversal` | Positive    | Reversal of a previous redemption (e.g. order cancelled after redemption) |

### Key Defaults

| Field                     | Default                               | Source                                    |
| ------------------------- | ------------------------------------- | ----------------------------------------- |
| `storeCredit.enabled`     | `false`                               | `KeyValueRepository` (config key)         |
| Balance calculation       | Sum of all transaction `amount_cents` | `StoreCreditRepository.getBalanceCents()` |
| Redemption clamping       | `min(requestedCents, balance)`        | `StoreCreditService.redeem()`             |
| Audit log action (issue)  | `store_credit:issued`                 | `StoreCreditService.issue()`              |
| Audit log action (redeem) | `store_credit:redeemed`               | `StoreCreditService.redeem()`             |
| Audit log action (expire) | `store_credit:expired`                | `StoreCreditService.expireCredit()`       |

---

## 1. Ubiquitous Requirements

**1.1** The system shall store all store credit amounts in integer cents in the `store_credit_ledger` table.

**1.2** The system shall calculate a customer's balance as the sum of all `amount_cents` values for that customer's email address.

**1.3** The system shall append every store credit transaction to the ledger — the ledger is append-only and transactions are never deleted or modified.

**1.4** The system shall audit-log every issue, redeem, and expire operation via `AuditLogService`.

**1.5** The system shall use the customer's email address as the primary identifier for store credit accounts.

**1.6** The system shall convert between cents and dollars using `toCents()` and `toDollars()` from `utils/money.ts` to maintain precision.

**1.7** The system shall check the `storeCredit.enabled` configuration flag before allowing store credit operations — if disabled, the feature is hidden from the UI.

**1.8** The system shall clamp redemption amounts to the customer's available balance — the system never allows negative balances.

---

## 2. Event-Driven Requirements

### 2.1 Enable/Disable Store Credit

**2.1.1** When `setEnabled(enabled)` is called, the system shall persist the boolean value to `KeyValueRepository` with key `storeCredit.enabled`.

**2.1.2** When `isEnabled()` is called, the system shall read the value from `KeyValueRepository` and return `false` if the key does not exist.

### 2.2 Get Balance

**2.2.1** When `getBalanceCents(email)` is called, the system shall call `StoreCreditRepository.getBalanceCents(email)` and return the sum of all transaction amounts for that email.

**2.2.2** When `getBalanceDollars(email)` is called, the system shall call `getBalanceCents(email)` and convert the result to dollars using `toDollars()`.

### 2.3 Issue Store Credit

**2.3.1** When `issue(email, amountCents, reason, issuedBy?)` is called with `amountCents <= 0`, the system shall throw `'Issue amount must be positive'`.

**2.3.2** When `amountCents > 0`, the system shall call `StoreCreditRepository.appendEntry(email, 'issue', amountCents, null, reason, issuedBy)` to create a new ledger entry.

**2.3.3** When the ledger entry is created, the system shall call `auditLogService.log('store_credit:issued')` with metadata including `email`, `amountCents`, `reason`, and `entryId`.

**2.3.4** When the audit log succeeds, the system shall log an info message with the issued amount and customer email.

**2.3.5** When `issue()` completes, the system shall return the `entryId` of the created ledger entry.

### 2.4 Redeem Store Credit

**2.4.1** When `redeem(email, orderId, requestedCents)` is called, the system shall call `getBalanceCents(email)` to retrieve the current balance.

**2.4.2** When the balance is retrieved, the system shall calculate `redeemedCents = min(requestedCents, balance)` to clamp the redemption to available credit.

**2.4.3** When `redeemedCents <= 0`, the system shall throw `'Insufficient store credit balance'`.

**2.4.4** When `redeemedCents > 0`, the system shall call `StoreCreditRepository.appendEntry(email, 'redeem', -redeemedCents, orderId, 'Store credit redemption')` to create a negative ledger entry.

**2.4.5** When the ledger entry is created, the system shall call `auditLogService.log('store_credit:redeemed')` with metadata including `email`, `redeemedCents`, `orderId`, and `entryId`.

**2.4.6** When `redeem()` completes, the system shall return `{ entryId, redeemedCents, discountDollars }` where `discountDollars = toDollars(redeemedCents)`.

### 2.5 Reverse Redemption

**2.5.1** When `reverseRedemption(entryId)` is called, the system shall call `StoreCreditRepository.findEntryById(entryId)` to retrieve the original transaction.

**2.5.2** When the entry is not found or `entry.type !== 'redeem'`, the system shall return immediately without creating a reversal.

**2.5.3** When the entry is found and is a redemption, the system shall calculate `restoredCents = Math.abs(entry.amount_cents)` to get the positive amount.

**2.5.4** When `restoredCents` is calculated, the system shall call `StoreCreditRepository.appendEntry(entry.customer_email, 'reversal', restoredCents, entry.order_id, 'Reversal of <entryId>')`.

**2.5.5** When the reversal entry is created, the system shall log an info message with the reversed entry ID and restored amount.

**2.5.6** When any step in `reverseRedemption()` throws an error, the system shall catch it, log an error message, and return without throwing — reversal failures are non-blocking.

### 2.6 Expire Store Credit

**2.6.1** When `expireCredit(email, amountCents, reason, expiredBy?)` is called, the system shall call `getBalanceCents(email)` to retrieve the current balance.

**2.6.2** When the balance is retrieved, the system shall calculate `toExpire = min(amountCents, balance)` to clamp the expiry to available credit.

**2.6.3** When `toExpire <= 0`, the system shall return immediately without creating an expiry entry.

**2.6.4** When `toExpire > 0`, the system shall call `StoreCreditRepository.appendEntry(email, 'expire', -toExpire, null, reason, expiredBy)` to create a negative ledger entry.

**2.6.5** When the ledger entry is created, the system shall call `auditLogService.log('store_credit:expired')` with metadata including `email`, `amountCents: toExpire`, and `reason`.

### 2.7 Get Transaction History

**2.7.1** When `getHistory(email, limit?)` is called, the system shall call `StoreCreditRepository.findEntriesByEmail(email, limit)` with `limit` defaulting to `50`.

**2.7.2** When the repository returns entries, the system shall return them to the caller without modification.

---

## 3. State-Driven Requirements

**3.1** While `storeCredit.enabled` is `false`, the UI shall hide all store credit features (issue, redeem, balance display).

**3.2** While a customer's balance is `0`, the system shall allow `redeem()` to be called but it shall throw `'Insufficient store credit balance'`.

**3.3** While a customer's balance is positive, the system shall allow redemption up to the available balance.

**3.4** While a redemption is being processed, the system shall not lock the customer's account — concurrent redemptions are allowed and will be serialized by SQLite's write lock.

---

## 4. Optional Feature Requirements

**4.1** Where `issuedBy` is provided to `issue()`, the system shall record it in the ledger entry's `issued_by` field and include it in the audit log metadata.

**4.2** Where `expiredBy` is provided to `expireCredit()`, the system shall record it in the ledger entry's `issued_by` field and include it in the audit log metadata.

**4.3** Where `limit` is provided to `getHistory()`, the system shall pass it to the repository to limit the number of returned entries.

---

## 5. Unwanted Behaviour / Edge Cases

### 5.1 Negative Issue Amount

**5.1.1** If `issue()` is called with `amountCents <= 0`, then the system shall throw `'Issue amount must be positive'` without creating a ledger entry.

### 5.2 Insufficient Balance

**5.2.1** If `redeem()` is called when the customer's balance is `0`, then the system shall throw `'Insufficient store credit balance'` without creating a ledger entry.

**5.2.2** If `redeem()` is called with `requestedCents > balance`, then the system shall clamp the redemption to `balance` and create a ledger entry for the clamped amount — the redemption succeeds with a partial amount.

### 5.3 Reversal of Non-Redemption

**5.3.1** If `reverseRedemption()` is called with an `entryId` that does not exist, then the system shall return immediately without throwing.

**5.3.2** If `reverseRedemption()` is called with an `entryId` that is not a `'redeem'` type, then the system shall return immediately without creating a reversal entry.

### 5.4 Reversal Failure

**5.4.1** If `reverseRedemption()` throws an error (e.g. database write failure), then the system shall catch the error, log it, and return without throwing — the caller is not notified of the failure.

### 5.5 Expiry of Zero Balance

**5.5.1** If `expireCredit()` is called when the customer's balance is `0`, then the system shall return immediately without creating an expiry entry or audit log.

**5.5.2** If `expireCredit()` is called with `amountCents > balance`, then the system shall clamp the expiry to `balance` and create a ledger entry for the clamped amount.

### 5.6 Concurrent Redemptions

**5.6.1** If two cashiers attempt to redeem store credit for the same customer simultaneously, then SQLite's write lock shall serialize the transactions — the second redemption will see the updated balance after the first completes.

**5.6.2** If the second redemption requests more credit than remains after the first redemption, then the system shall clamp it to the remaining balance or throw `'Insufficient store credit balance'` if the balance is zero.

### 5.7 Feature Disabled

**5.7.1** If `isEnabled()` returns `false` and a cashier attempts to redeem store credit, then the UI shall prevent the action — the service methods are still callable but the UI should gate access.

---

## 6. Complex Requirements

**6.1** When `redeem()` is called and `requestedCents > balance`, the system shall clamp the redemption to `balance`, create a ledger entry for the clamped amount, audit-log the redemption, and return `{ entryId, redeemedCents: balance, discountDollars: toDollars(balance) }` — the caller receives the actual redeemed amount, not the requested amount.

**6.2** When `reverseRedemption()` is called and the original entry is found and is a redemption, the system shall create a new ledger entry with type `'reversal'`, positive amount equal to the absolute value of the original redemption, and reason `'Reversal of <entryId>'` — the customer's balance is restored by the sum of the reversal entry.

**6.3** When `expireCredit()` is called and `amountCents > balance`, the system shall clamp the expiry to `balance`, create a ledger entry for the clamped amount, audit-log the expiry, and return without throwing — partial expiry succeeds silently.

**6.4** When `getBalanceCents()` is called, the system shall sum all ledger entries for the customer's email, including positive entries (issue, reversal) and negative entries (redeem, expire) — the balance is the algebraic sum of all transactions.

---

## 7. Store Credit Lifecycle Summary

### Issue Flow

```
Manager issues store credit
  → StoreCreditService.issue(email, amountCents, reason, issuedBy)
    → Validate: amountCents > 0
    → StoreCreditRepository.appendEntry(email, 'issue', amountCents, null, reason, issuedBy)
      → INSERT INTO store_credit_ledger (id, customer_email, type, amount_cents, reason, issued_by, created_at)
    → auditLogService.log('store_credit:issued', { email, amountCents, reason, entryId })
    → return entryId
```

### Redeem Flow

```
Cashier redeems store credit during checkout
  → StoreCreditService.redeem(email, orderId, requestedCents)
    → balance = StoreCreditRepository.getBalanceCents(email)
      → SELECT SUM(amount_cents) FROM store_credit_ledger WHERE customer_email = ?
    → redeemedCents = min(requestedCents, balance)
    → Validate: redeemedCents > 0 (throw if insufficient)
    → StoreCreditRepository.appendEntry(email, 'redeem', -redeemedCents, orderId, 'Store credit redemption')
      → INSERT INTO store_credit_ledger (id, customer_email, type, amount_cents, order_id, reason, created_at)
    → auditLogService.log('store_credit:redeemed', { email, redeemedCents, orderId, entryId })
    → return { entryId, redeemedCents, discountDollars: toDollars(redeemedCents) }
```

### Reversal Flow

```
Order cancelled after store credit redemption
  → StoreCreditService.reverseRedemption(entryId)
    → entry = StoreCreditRepository.findEntryById(entryId)
    → Validate: entry exists and entry.type === 'redeem'
    → restoredCents = Math.abs(entry.amount_cents)
    → StoreCreditRepository.appendEntry(entry.customer_email, 'reversal', restoredCents, entry.order_id, 'Reversal of <entryId>')
      → INSERT INTO store_credit_ledger (id, customer_email, type, amount_cents, order_id, reason, created_at)
    → logger.info('Reversed store credit redemption')
```

### Expiry Flow

```
Manager expires store credit
  → StoreCreditService.expireCredit(email, amountCents, reason, expiredBy)
    → balance = StoreCreditRepository.getBalanceCents(email)
    → toExpire = min(amountCents, balance)
    → Return if toExpire <= 0
    → StoreCreditRepository.appendEntry(email, 'expire', -toExpire, null, reason, expiredBy)
      → INSERT INTO store_credit_ledger (id, customer_email, type, amount_cents, reason, issued_by, created_at)
    → auditLogService.log('store_credit:expired', { email, amountCents: toExpire, reason })
```

### Balance Calculation

| Transaction Type  | Amount Sign | Effect on Balance                                 |
| ----------------- | ----------- | ------------------------------------------------- |
| Issue             | +£50.00     | Balance increases by £50.00                       |
| Redeem            | -£20.00     | Balance decreases by £20.00                       |
| Expire            | -£10.00     | Balance decreases by £10.00                       |
| Reversal          | +£20.00     | Balance increases by £20.00 (restores redemption) |
| **Final Balance** | **+£40.00** | Sum of all transactions                           |

---

## 8. Component Traceability

| Requirement (summary)                     | Component / Hook / Service                                                        | Source File                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| Store credit enabled/disabled             | `StoreCreditService.setEnabled` / `isEnabled`                                     | `services/storecredit/StoreCreditService.ts` |
| Configuration stored in key-value store   | `KeyValueRepository.setObject` / `getObject`                                      | `repositories/KeyValueRepository.ts`         |
| Customer balance retrieved                | `StoreCreditService.getBalanceCents` / `getBalanceDollars`                        | `services/storecredit/StoreCreditService.ts` |
| Balance calculated as sum of transactions | `StoreCreditRepository.getBalanceCents`                                           | `repositories/StoreCreditRepository.ts`      |
| Store credit issued                       | `StoreCreditService.issue`                                                        | `services/storecredit/StoreCreditService.ts` |
| Ledger entry appended                     | `StoreCreditRepository.appendEntry`                                               | `repositories/StoreCreditRepository.ts`      |
| Issue audit logged                        | `StoreCreditService.issue` → `auditLogService.log('store_credit:issued')`         | `services/storecredit/StoreCreditService.ts` |
| Store credit redeemed                     | `StoreCreditService.redeem`                                                       | `services/storecredit/StoreCreditService.ts` |
| Redemption clamped to balance             | `StoreCreditService.redeem` (min calculation)                                     | `services/storecredit/StoreCreditService.ts` |
| Redemption audit logged                   | `StoreCreditService.redeem` → `auditLogService.log('store_credit:redeemed')`      | `services/storecredit/StoreCreditService.ts` |
| Redemption reversed                       | `StoreCreditService.reverseRedemption`                                            | `services/storecredit/StoreCreditService.ts` |
| Original entry retrieved for reversal     | `StoreCreditRepository.findEntryById`                                             | `repositories/StoreCreditRepository.ts`      |
| Reversal entry created                    | `StoreCreditRepository.appendEntry` (type: 'reversal')                            | `repositories/StoreCreditRepository.ts`      |
| Store credit expired                      | `StoreCreditService.expireCredit`                                                 | `services/storecredit/StoreCreditService.ts` |
| Expiry clamped to balance                 | `StoreCreditService.expireCredit` (min calculation)                               | `services/storecredit/StoreCreditService.ts` |
| Expiry audit logged                       | `StoreCreditService.expireCredit` → `auditLogService.log('store_credit:expired')` | `services/storecredit/StoreCreditService.ts` |
| Transaction history retrieved             | `StoreCreditService.getHistory`                                                   | `services/storecredit/StoreCreditService.ts` |
| Entries queried by email                  | `StoreCreditRepository.findEntriesByEmail`                                        | `repositories/StoreCreditRepository.ts`      |
| Cents/dollars conversion                  | `toCents` / `toDollars`                                                           | `utils/money.ts`                             |

---

**Document Metadata**:

- **Author**: Kiro AI Agent
- **Date**: 2026-05-03
- **Version**: 1.0
- **Status**: Final
- **Related**: `docs/specs/customer/crm-loyalty.md`, `docs/specs/checkout/checkout.md`
