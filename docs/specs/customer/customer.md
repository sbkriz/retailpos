# Customer – EARS Requirements

> **System**: RetailPOS – Customer Attachment
> **Actor**: Cashier
> **Date**: 2026-04-12
> **Source**: `components/CustomerSearchModal.tsx`, `hooks/useCustomerSearch.ts`, `services/customer/CustomerServiceInterface.ts`, `services/customer/CustomerServiceFactory.ts`, `screens/order/BasketContent.tsx`, `services/basket/BasketService.ts`, `contexts/BasketProvider.tsx`

---

## Context

The customer feature has one E2E purpose: **attach an email address to the basket so it flows into the draft order and the local order record**. Everything else (platform search, order count, total spent) is a display enhancement on top of that core.

There are two paths depending on platform:

- **Online platforms** — `CustomerSearchModal` searches the platform's customer API. The cashier selects a result; the customer's email and name are attached to the basket via `setCustomer()`.
- **Offline mode** — no platform API is available. `CustomerSearchModal` shows a simple email input form. The cashier types an email and taps "Attach Email"; the email is attached to the basket the same way.

In both cases the outcome is identical: `basket.customerEmail` and `basket.customerName` are set, and they flow into `LocalOrder.customerEmail` / `customerName` when `startCheckout()` is called, and from there into the platform draft order and the SQLite `orders` row.

### Actors

| Actor   | Role                                                               |
| ------- | ------------------------------------------------------------------ |
| Cashier | Attaches a customer email to the basket before or during checkout  |
| System  | Persists email to basket, passes it to draft order and local order |

---

## 1. Ubiquitous Requirements

**1.1** The system shall store the customer email on `basket.customerEmail` and the customer name on `basket.customerName` via `BasketService.setCustomer()`, persisting both to SQLite immediately.

**1.2** When `startCheckout()` is called, the system shall copy `customerEmail` and `customerName` from the basket snapshot into the `LocalOrder` and persist them to `orders.customer_email` and `orders.customer_name`.

**1.3** When a draft order is created on an online platform, the system shall include `customerEmail` in the `createDraftOrder()` payload so the platform associates the order with the customer.

**1.4** The customer attachment is optional — orders may be completed without a customer email attached.

**1.5** The system shall never create or modify customer records on the platform — the POS is read-only with respect to platform customer data.

---

## 2. Event-Driven Requirements

### 2.1 Open Customer Modal

**2.1.1** When the cashier taps "Add Customer" in `BasketContent`, the system shall open `CustomerSearchModal` with `platform` passed from the basket context.

**2.1.2** When `CustomerSearchModal` opens and `isAvailable` is `true` (online platform with customer service), the system shall render the search input and auto-focus it.

**2.1.3** When `CustomerSearchModal` opens and `isAvailable` is `false` (offline or no customer service), the system shall render the email input form instead of the search UI.

### 2.2 Online: Search & Select

**2.2.1** When the cashier types in the search input, the system shall debounce the input by 300 ms before calling `service.searchCustomers({ query, limit: 10 })`.

**2.2.2** When `searchCustomers()` resolves, the system shall display the results as a list showing avatar initial, name, email, phone (if present), and order count (if present).

**2.2.3** When the cashier taps a customer result, the system shall call `onSelect(customer)`, which calls `setCustomer(customer.email, displayName)` and closes the modal.

**2.2.4** When `hasMore` is `true` and the cashier scrolls to the bottom of the list, the system shall call `loadMore()` → `service.searchCustomers({ query, cursor: nextCursor })` and append results.

**2.2.5** When `searchCustomers()` throws, the system shall set `error` to `'Failed to search customers. Please try again.'` and display it above the results list.

**2.2.6** When a new search is triggered while a previous one is in flight, the system shall increment the abort counter so the stale response is ignored when it resolves.

### 2.3 Offline: Email Input

**2.3.1** When `isAvailable` is `false`, the system shall render a title ("Attach customer email"), a description, an email `TextInput`, and an "Attach Email" button.

**2.3.2** When the cashier types an email and taps "Attach Email", the system shall call `onSelect({ id: email, platformId: email, platform: OFFLINE, email })`, which calls `setCustomer(email, email)` and closes the modal.

**2.3.3** When the email input is empty, the "Attach Email" button shall be disabled.

### 2.4 Remove Customer

**2.4.1** When `basket.customerEmail` is set, `BasketContent` shall render the customer badge showing `customerName || customerEmail`, with a remove button.

**2.4.2** When the cashier taps the remove button, the system shall call `setCustomer(undefined, undefined)`, clearing both fields from the basket.

### 2.5 Close Without Selecting

**2.5.1** When the cashier taps the close button or dismisses the modal, the system shall clear the search query and results and call `onClose()` — no customer is attached.

---

## 3. State-Driven Requirements

**3.1** While `isSearching` is `true`, the system shall show an `ActivityIndicator` next to the search input.

**3.2** While `customers` is empty and `query.length > 0` and `isSearching` is `false`, the system shall render the "No customers found" empty state.

**3.3** While `customers` is empty and `query.length === 0` and `isSearching` is `false`, the system shall render the "Search for a customer" prompt state.

**3.4** While `basket.customerEmail` is set in `BasketContent`, the system shall render the customer badge and hide the "Add Customer" button.

**3.5** While `basket.customerEmail` is not set in `BasketContent`, the system shall render the "Add Customer" button and hide the customer badge.

---

## 4. Optional Feature Requirements

**4.1** Where `item.phone` is non-null on a `PlatformCustomer`, the system shall render the phone number below the email in the search result row.

**4.2** Where `item.orderCount` is defined on a `PlatformCustomer`, the system shall render the order count as a stat on the right side of the result row.

---

## 5. Unwanted Behaviour / Edge Cases

### 5.1 Platform Service Unavailable

**5.1.1** If `customerServiceFactory.getService(platform)` returns `null` (offline mode or unsupported platform), the system shall render the email input form — the cashier can still attach an email manually.

### 5.2 Stale Search Response

**5.2.1** If a search response arrives after a newer search has been triggered, the system shall discard the stale response using the abort counter — the UI shall not flicker with old results.

### 5.3 Customer Removed After Attachment

**5.3.1** If a customer is deleted from the platform after being attached to a local basket, the email remains on the basket and flows into the order — the POS does not validate customer existence at checkout time.

### 5.4 Email Not Validated

**5.4.1** The offline email input does not validate email format — any non-empty string is accepted. Format validation is out of scope for the POS; the platform will reject invalid emails during sync if applicable.

---

## 6. Flow Summary

```
── Online platform ───────────────────────────────────────────────────
Cashier taps "Add Customer"
  → CustomerSearchModal opens (isAvailable = true)
  → Cashier types query → debounce 300ms
  → service.searchCustomers({ query, limit: 10 })
  → Results displayed
  → Cashier taps result
  → setCustomer(customer.email, displayName)
  → basket.customerEmail set → badge shown in BasketContent

── Offline mode ──────────────────────────────────────────────────────
Cashier taps "Add Customer"
  → CustomerSearchModal opens (isAvailable = false)
  → Email input form shown
  → Cashier types email → taps "Attach Email"
  → setCustomer(email, email)
  → basket.customerEmail set → badge shown in BasketContent

── Both paths: email flows into order ────────────────────────────────
startCheckout()
  → LocalOrder.customerEmail = basket.customerEmail
  → OrderRepository.create() → orders.customer_email persisted
  → [online] createDraftOrder({ customerEmail, ... }) → platform associates customer
  → [offline] email stored in SQLite only
```

---

## 7. Component Traceability

| Requirement (summary)                  | Component / Hook / Service                                                      | Source File                            |
| -------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| "Add Customer" button opens modal      | `BasketContent` → `setCustomerModalVisible(true)`                               | `screens/order/BasketContent.tsx`      |
| Modal availability check               | `useCustomerSearch.isAvailable` → `customerServiceFactory.getService(platform)` | `hooks/useCustomerSearch.ts`           |
| Online: debounced search               | `useCustomerSearch.search()` → 300ms debounce → `service.searchCustomers()`     | `hooks/useCustomerSearch.ts`           |
| Online: stale response cancelled       | `useCustomerSearch` abort counter (`abortRef`)                                  | `hooks/useCustomerSearch.ts`           |
| Online: load more results              | `useCustomerSearch.loadMore()` → `service.searchCustomers({ cursor })`          | `hooks/useCustomerSearch.ts`           |
| Online: customer selected              | `CustomerSearchModal.handleSelect` → `onSelect(customer)`                       | `components/CustomerSearchModal.tsx`   |
| Offline: email input form              | `CustomerSearchModal` (`!isAvailable` branch)                                   | `components/CustomerSearchModal.tsx`   |
| Offline: email attached                | `CustomerSearchModal` attach button → `onSelect({ email })`                     | `components/CustomerSearchModal.tsx`   |
| Customer attached to basket            | `BasketContent.handleSelectCustomer` → `setCustomer(email, name)`               | `screens/order/BasketContent.tsx`      |
| Customer persisted to SQLite           | `BasketService.setCustomer()` → `BasketRepository.updateBasket()`               | `services/basket/BasketService.ts`     |
| Customer badge rendered                | `BasketContent` (`basket.customerEmail` guard)                                  | `screens/order/BasketContent.tsx`      |
| Customer removed                       | `BasketContent` remove button → `setCustomer(undefined, undefined)`             | `screens/order/BasketContent.tsx`      |
| Email flows into LocalOrder            | `CheckoutService.startCheckout` (basket snapshot)                               | `services/checkout/CheckoutService.ts` |
| Email persisted to orders table        | `OrderRepository.create()` (`customer_email` column)                            | `repositories/OrderRepository.ts`      |
| Email included in platform draft order | `CheckoutService.startCheckout` → `createDraftOrder({ customerEmail })`         | `services/checkout/CheckoutService.ts` |
