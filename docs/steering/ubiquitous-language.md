# Ubiquitous Language — RetailPOS

> This document is the **single canonical reference** for domain vocabulary used across specs, code, tests, ADRs, and conversation. When a term appears here, use it exactly — do not paraphrase, abbreviate, or introduce synonyms.
>
> Organised by bounded context. Each entry states the canonical term, its definition, its primary code location, and any terms that must NOT be used as substitutes.

---

## 1. Basket & Cart

### Basket

The in-progress order before payment is collected. Persisted to SQLite so it survives app restarts. A single active basket exists per register at any time.

- **Code**: `services/basket/basket.ts` → `Basket` interface; `services/basket/BasketService.ts`
- **Never call it**: cart, trolley, order (an order is created from a basket at checkout, not before)

### BasketItem

A single line in the basket. Carries a **sellable-unit snapshot** — the product data captured at add-to-cart time (`variantId`, `sku`, `optionSummary`, `taxCode`, `taxProfileId`, `taxRate`, `taxable`, `inventoryPolicy`, `catalogVersion`). The snapshot is immutable after capture.

- **Code**: `services/basket/basket.ts` → `BasketItem` interface
- **Never call it**: cart item, line item (line item is reserved for `OrderItem`)

### CartProduct

The shape of a product as it is handed to `BasketProvider.addToCart()` by UI components. Distinct from `UnifiedProduct` (catalog) and `BasketItem` (stored in basket). Carries `taxRate`, `taxable`, `taxProfileId`, `taxCode` so tax can be resolved at add-to-cart time.

- **Code**: `contexts/BasketProvider.tsx` → `CartProduct` interface

### Add-to-Cart

The act of calling `BasketProvider.addToCart(product, quantity)`, which resolves the tax rate and delegates to `BasketService.addItem()`. Tax rate resolution happens here — not in the service.

### Subtotal

`sum(price × quantity)` across all basket items, before tax and discount. Computed using integer-cent math.

- **Code**: `BasketService.calculateTotals()`

### Tax (basket)

`sum(lineTotal × taxRate)` for all items where `taxable === true`. Computed per-item using the `taxRate` snapshot on `BasketItem`. An estimate for `native_draft` platforms; authoritative for `remote_cart` and `local_only` platforms.

### Total

`max(0, roundMoney(subtotal + tax − discountAmount))`. The amount the customer pays. Never negative.

### Discount Amount

A flat monetary deduction applied to the basket. Stored as a single value — not per-item. Sourced from a validated discount code or a manager-approved manual discount.

- **Code**: `BasketService.applyDiscount()`

### DEFAULT_TAX_RATE

The emergency-fallback tax rate (`0.2` = 20%) used only when `TaxProfileService.getDefaultProfile()` returns `null`. Should not appear in normal operation after tax profiles are seeded.

- **Code**: `services/basket/BasketService.ts`
- **Never use it as**: the configured tax rate. The configured rate lives in `TaxProfile`.

---

## 2. Order & Checkout

### LocalOrder

The POS's local representation of a sale. Stored in the `orders` SQLite table. Has a lifecycle from `draft`/`pending` through `processing` to `paid`, and optionally to `synced`. Distinguished from a **Platform Order** (the order on the e-commerce platform, identified by `platformOrderId`).

- **Code**: `services/order/order.ts` → `LocalOrder` interface
- **Never call it**: order record, sale, transaction

### OrderItem (line item)

A single product line on a `LocalOrder`. Stored in `order_items`. Carries `tax_rate` as a snapshot from checkout time.

- **Code**: `repositories/OrderItemRepository.ts`
- **Never call it**: basket item (that is the pre-checkout entity)

### PaymentLine

A single payment entry on a `LocalOrder`. A completed order may have more than one (split tender). Fields: `id`, `method`, `amount` (positive = payment, negative = credit/refund), `transactionId`, `cardBrand`, `last4`, `processedAt`, `note`. Serialised to `payments_json` on the `orders` row.

- **Code**: `services/order/order.ts` → `PaymentLine` interface

### Draft Order

A `LocalOrder` with `status: 'draft'`. Created by `CheckoutService.startCheckout()` on `native_draft` platforms only. Represents a live mutable order on the e-commerce platform during checkout. Cancelled if payment is abandoned.

- **Synonyms to avoid**: pending order (that is a different status)

### platformOrderId

The ID of the corresponding order on the e-commerce platform. `null` until a draft is created (`native_draft` mode) or until sync creates the remote order post-payment (`remote_cart` / `local_only` mode).

### startCheckout()

The method that converts the active basket into a `LocalOrder`. On `native_draft` platforms it also creates the platform draft order and overwrites local tax estimates with platform-authoritative values. On other platforms it creates only the local order.

- **Code**: `services/checkout/CheckoutService.ts`

### completePayment()

The method that records the payment, clears the basket, and triggers async sync. Validates that payment total equals order total (within 1-cent tolerance) before persisting.

- **Code**: `services/checkout/CheckoutService.ts`

### completeOrder()

The platform API call used exclusively in `native_draft` sync to mark the existing draft as paid. Distinct from `completePayment()` (local) and `createOrder()` (used in `remote_cart`/`local_only` sync).

- **Code**: `OrderServiceInterface.completeOrder()`

### Order Status

The lifecycle state of a `LocalOrder`.

| Status       | Meaning                                                             |
| ------------ | ------------------------------------------------------------------- |
| `draft`      | Draft created on platform; payment not yet started (`native_draft`) |
| `pending`    | Local order created; awaiting payment (`remote_cart`/`local_only`)  |
| `processing` | Payment in progress (terminal busy)                                 |
| `paid`       | Payment recorded; ready for sync                                    |
| `failed`     | Payment attempt failed; basket preserved                            |
| `cancelled`  | Order voided by cashier or manager                                  |

### Sync Status

The sync lifecycle state of a `LocalOrder`.

| Status    | Meaning                                                  |
| --------- | -------------------------------------------------------- |
| `pending` | Paid locally; not yet synced to platform                 |
| `synced`  | Successfully delivered to platform                       |
| `failed`  | Sync exhausted retries or received a non-retryable error |

### Split Tender

Paying a single order with more than one `PaymentLine` / payment method. The sum of all `PaymentLine.amount` values must equal `LocalOrder.total`.

### ExchangeSession

An in-memory, non-persisted object representing an in-progress exchange transaction. Holds `returnItems`, `returnCredit`, `newItems`, `newItemsTotal`, `netDue`, `payments`, and `remainingDue`. Committed atomically on confirm; discarded entirely on abandon.

- **Code**: `services/exchange/ExchangeService.ts`

### Cash Tender

The physical cash amount handed over by the customer. Always ≥ the split amount for a cash `PaymentLine`. Change (`tender − amount`) is displayed but not recorded as a payment line.

---

## 3. Platform & Capability Model

### Platform

One of the supported e-commerce backends or `offline`. Represented by the `ECommercePlatform` enum.

- **Code**: `utils/platforms.ts`
- **Supported values**: `shopify`, `woocommerce`, `bigcommerce`, `magento`, `sylius`, `wix`, `prestashop`, `squarespace`, `commercefull`, `offline`

### Basket Mode

The mode that determines how the POS manages basket state relative to the platform during checkout and sync.

| Mode           | Description                                                                             | Platforms                                             |
| -------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `native_draft` | Platform creates a mutable draft at `startCheckout()`; tax is platform-authoritative    | Shopify, Wix, CommerceFull                            |
| `remote_cart`  | No platform call at checkout; POS basket is local-authoritative; sync creates the order | WooCommerce, Magento, BigCommerce, Sylius, PrestaShop |
| `local_only`   | Fully local basket; order imported post-payment via `createOrder()`                     | Squarespace, Offline                                  |

### Capability Level

The three tiers that describe how well a platform supports an advanced feature.

| Level             | Meaning                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `supported`       | First-class stable API — enabled by default                                             |
| `custom`          | Custom adapter required; project/tenant-specific risk — gated by adapter readiness flag |
| `not_recommended` | Not recommended for parity promise in current API shape — hidden or disabled in UI      |

### Platform Capability Matrix

The static table in `utils/platformCapabilities.ts` that maps every `Platform` → every feature → its `CapabilityLevel`. The single source of truth for feature gating.

- **Code**: `utils/platformCapabilities.ts` → `PLATFORM_CAPABILITY_MATRIX`

### PlatformCapabilityService

The runtime singleton that reads the active platform from the KV store and exposes capability checks (`supportsStrict`, `supportsWithCustom`, `isNotRecommended`, `getUnavailableReason`).

- **Code**: `services/platform/PlatformCapabilityService.ts`

### Sellable Unit

The platform-specific inventory entity that a `BasketItem.variantId` must point to. Not always a "variant" in the common sense — it is the exact purchasable unit (e.g. Shopify `ProductVariant.id`, Magento simple SKU, PrestaShop combination id).

### ServiceConfigBridge

The service that reads persisted e-commerce credentials from the KV store and calls `configureService(platform, config)` on every platform-specific factory. Run once after onboarding and whenever credentials change.

- **Code**: `services/config/ServiceConfigBridge.ts`

---

## 4. Products & Catalog

### UnifiedProduct

The normalised product schema used throughout the POS. All platform-specific product shapes are mapped to `UnifiedProduct` before reaching any UI component or hook.

- **Code**: `services/product/types.ts`

### UnifiedCategory

The normalised category schema. Analogous to `UnifiedProduct` for the category tree.

- **Code**: `services/category/types.ts`

### Product Variant

A specific purchasable configuration of a product (e.g. size + colour). Represented by `ProductVariant` in the catalog layer and by `variantId` on `BasketItem`.

### optionSummary

A human-readable string describing the selected variant options (e.g. `"Size: M / Colour: Red"`). Captured on `BasketItem` at add-to-cart time as part of the sellable-unit snapshot.

### inventoryPolicy

Controls whether over-selling is allowed. Values: `'deny'` (block sale when stock = 0) or `'continue'` (allow sale even with no stock). Captured on `BasketItem` at add-to-cart time.

### catalogVersion

A timestamp or version token captured on `BasketItem` at add-to-cart time. Used to detect stale snapshots if the platform catalog changes after the item was added.

---

## 5. Tax

### TaxProfile

A named tax configuration stored in SQLite. Fields: `id`, `name`, `rate` (0–1 decimal), `isDefault`, `description`. Three default profiles are seeded on first use: `Standard Rate` (20%), `Reduced Rate` (5%), `Zero Rate` (0%).

- **Code**: `repositories/TaxProfileRepository.ts`; `services/tax/TaxProfileService.ts`

### taxProfileId

A reference from an offline product to a `TaxProfile`. The tax rate is resolved from the profile at add-to-cart time, not at calculation time.

### taxCode

A platform-supplied string identifying the tax class of an online product (e.g. Shopify `'reduced-rate'`, WooCommerce `'zero-rate'`). Resolved to a local `TaxProfile` by name match via `TaxProfileService.resolveRateForTaxCode()`.

### taxRate

The resolved decimal tax rate (0–1) stored on a `BasketItem`. Captured once at add-to-cart time and used for all subsequent calculations on that line. Never re-resolved from the platform mid-session.

### TaxCalculationType

How tax is applied to a price. Values: `'inclusive'` (tax is inside the price), `'exclusive'` (tax is added on top), `'exempt'` (no tax).

### Rate Resolution Pipeline

The ordered sequence used by `BaseTaxStrategy.resolveTax()`:

1. Normalise tax code to canonical form
2. Exempt fast-path (return 0 immediately)
3. Live platform rate (`fetchPlatformRate()`)
4. Local profile fallback (SQLite `TaxProfile` name match)
5. Default profile fallback

### Zero-Rate Platform

A platform for which `fetchPlatformRate()` returns 0% because no public tax rates API is available (Shopify, BigCommerce, Wix, PrestaShop, Squarespace). These platforms return `name: 'Tax Not Available'` on taxable codes and `name: 'Exempt'` on exempt codes. Marked with a `// TODO` in the strategy for future resolution.

### Platform-Authoritative Tax

For `native_draft` platforms, the tax values returned by the platform draft order API overwrite the basket's local estimates at `startCheckout()` time. The platform's values are the only correct values for these platforms (ADR-009).

---

## 6. Authentication & Permissions

### Role

A built-in user classification. Three fixed roles exist: `admin`, `manager`, `cashier`. Roles cannot be created, deleted, or renamed. Role rank: `admin (3) > manager (2) > cashier (1)`.

### Auth Method

One of six pluggable mechanisms for verifying a user's identity.

| Key             | Type                          | Mode    | Requires hardware |
| --------------- | ----------------------------- | ------- | ----------------- |
| `pin`           | 6-digit numeric               | both    | No                |
| `biometric`     | Fingerprint / Face ID         | offline | OS enrollment     |
| `password`      | Alphanumeric                  | offline | No                |
| `magstripe`     | Card swipe                    | offline | Yes               |
| `rfid_nfc`      | Badge tap                     | offline | Yes               |
| `platform_auth` | Platform API token validation | online  | No                |

### Auth Mode

The authentication operating mode set during onboarding. `'offline'` restricts to local methods; `'online'` additionally enables `platform_auth`.

- **Code**: `services/auth/AuthConfigService.ts`

### PIN Fallback

The guarantee that `pin` is always available regardless of `allowedMethods`. `AuthService.getAvailableProviders()` always injects it. It cannot be disabled.

### PermissionService

The singleton that resolves whether a user may perform a given action. The only authoritative gate for action-level checks — nothing hardcodes role comparisons for action-level decisions.

- **Code**: `services/permissions/PermissionService.ts`

### PermissionSet

A named collection of `PermissionOverride` entries. Assigned to users. A user may have multiple sets; the highest-priority override wins. Sets can grant permissions up to the admin's own role level only.

### PermissionOverride

A single `(actionKey, granted: true | false)` entry within a `PermissionSet`.

### Action Key

A dot-namespaced string that identifies a sensitive action (e.g. `discount:manual`, `refund:process`, `price:override`). All valid keys are declared in `ACTION_REGISTRY`.

- **Code**: `utils/actionRegistry.ts`

### Manager Approval

An in-context PIN challenge presented when a cashier attempts an action that requires a higher role. The approving manager's session does not replace the cashier's — it is an authorisation event only.

- **Code**: `services/permissions/ManagerApprovalService.ts`; `components/ManagerApprovalModal.tsx`

### Brute-Force Lockout

Automatic 60-second lockout of the approval modal after 5 consecutive failed PIN entries. Prevents credential guessing via the approval flow.

### Approval Window

An optional cache that suppresses repeated approval prompts for the same action within a configurable time window (`settings.permissions.approvalWindowSeconds`). Implemented via `approvalExpiresAt` on the cached approval record.

---

## 7. Payments

### PaymentProvider

The card terminal or payment SDK in use. Values: `STRIPE_NFC`, `STRIPE`, `SQUARE`, `ADYEN`, `TAP_PAYMENTS`. Selected via `PaymentServiceFactory`. Only providers that ship a React Native SDK for tap-to-pay are represented here — non-SDK providers are integrated through the Instore API.

- **Code**: `services/payment/PaymentServiceFactory.ts`

### PaymentRequest / PaymentResponse

The provider-agnostic contract for initiating and resolving a card payment. All providers implement the same shapes.

- **Code**: `services/payment/PaymentServiceInterface.ts`

### PED (PIN Entry Device)

A physical card terminal (Ingenico, Verifone, PAX, etc.) that handles chip-and-PIN and contactless. **Must be integrated via the Instore API** — never as a direct `PaymentProvider` in the POS client (ADR-015).

### Mock Mode

When `USE_MOCK_PAYMENT=true` (`.env`), all payment providers use mock implementations. Enables demos and tests without real hardware.

---

## 8. Sync

### OrderSyncService

The singleton responsible for syncing paid `LocalOrder`s to the platform after payment. Called non-blocking immediately after `completePayment()` and also from the Sync Queue screen.

- **Code**: `services/sync/OrderSyncService.ts`

### BackgroundSyncService

A periodic service that re-runs sync for any orders still in `pending` or `failed` sync status.

### MAX_SYNC_RETRIES

The maximum number of automatic retry attempts before an order is moved to `syncStatus: 'failed'`. Configurable via `POSConfigService`.

### Retryable Error

Network errors and HTTP 5xx responses are retryable. HTTP 4xx responses are not retryable — they indicate a data or credential problem that will not resolve on retry.

### SyncQueue

The screen and hook (`SyncQueueScreen`, `useSyncQueue`) that surfaces orders in `pending` or `failed` sync state and allows managers to retry or discard them.

---

## 9. Multi-Register & Instore API

### Register Mode

The operating mode of a single POS instance.

| Mode         | Data source    | Hosting             |
| ------------ | -------------- | ------------------- |
| `standalone` | Local SQLite   | Self-contained      |
| `server`     | Local SQLite   | Hosts LAN HTTP API  |
| `client`     | Server via LAN | Thin interface only |

### Instore API

The local HTTP server hosted by the `server` register. Exposes business data (orders, returns, events) to `client` registers over the LAN. Also the integration point for PED hardware (ADR-015).

- **Code**: `services/instoreapi/InstoreApiServer.ts`

### SyncEventBus

A pub/sub bus on the server register that publishes basket and order mutations as typed events. Client registers poll `/api/sync/events` via `SyncPoller`.

### SyncPoller

The client-side polling loop that pulls sync events from the server. Uses exponential backoff on connection errors.

---

## 10. Hardware

### CashDrawer

The physical cash tray opened by a kick signal after a cash payment. Driven by the active `CashDrawerDriver` (printer kick or IPC on Electron). Opening outside a sale requires the `cash_drawer:open` permission.

### PrinterService

The abstraction over receipt printing. `UnifiedPrinterService` (mobile/tablet) and `ElectronPrinterService` (desktop) implement the same interface.

### BarcodeScanner

Hardware or camera that reads barcodes and triggers `processBarcodeData()`. Supported types: `camera`, `usb` (HID keydown), `bluetooth`, `qr_hardware`, `electron` (IPC).

### ScanResult

The outcome of a barcode scan. States: `searching`, `found_local`, `found_variant`, `found_online`, `not_found`. Displayed as an inline banner — never a blocking alert.

---

## 11. Architecture Patterns

### Factory Pattern

Every platform domain follows: `Interface → Factory (singleton) → Platform implementations → Offline fallback`. Factories cache instances. Hooks call factories directly — no registry indirection.

- **ADR**: ADR-005

### Repository Pattern

Repositories own all SQLite access. Services never call the database directly. In `client` mode, repositories are swapped for HTTP-backed implementations transparently — services have no knowledge of the mode.

- **ADR**: ADR-002, ADR-003

### Strategy Pattern

Used for tax calculation: `TaxServiceFactory` holds one `TaxStrategy` per platform. Each strategy implements `resolveTax(taxCode)` and optionally `fetchPlatformRate()`. `BaseTaxStrategy` provides the shared resolution pipeline.

### KV Store (Key-Value Store)

A simple string key → JSON value store backed by SQLite, used for configuration, feature flags, session data, and the audit log. Accessed via `KeyValueRepository`.

### Audit Log

An append-only log of significant actions, stored in the KV store. Action keys are dot-namespaced (e.g. `auth:login`, `order:paid`, `permission:approved`). Exported as CSV.

- **Code**: `services/audit/AuditLogService.ts`
- **ADR**: ADR-012

### Integer-Cent Math

All monetary arithmetic is performed in integer cents via `utils/money.ts`. Raw float arithmetic on money values is prohibited throughout the codebase.

- **ADR**: ADR-006
- **Code**: `utils/money.ts` — `multiplyMoney`, `addMoney`, `subtractMoney`, `sumMoney`, `calculateTax`, `roundMoney`, `formatMoney`

---

## 12. Notification & Observability

### NotificationService

A singleton pub/sub bus for in-app notifications (toasts, bell drawer). Publishers fire-and-forget; subscribers render UI. Auto-dismiss duration is configurable per notification.

- **ADR**: ADR-011

### Toast

A transient on-screen message delivered via `NotificationProvider`. Auto-dismissed. Used for non-blocking feedback (sync success, scan result).

### Logger

A structured, level-filtered logger injected via `LoggerFactory`. All services use `this.logger` — `console.*` calls are prohibited in production code.

- **ADR**: ADR-007

---

## 13. Anti-Terms (Do Not Use)

| Forbidden term     | Use instead                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| cart               | **basket**                                                                                        |
| cart item          | **BasketItem** (pre-checkout) / **OrderItem** (post-checkout)                                     |
| sale               | **LocalOrder** or **checkout** depending on context                                               |
| transaction        | **PaymentLine** or **payment** depending on context                                               |
| shop               | **platform** or **store** depending on context                                                    |
| ecommerce order    | **Platform Order** (when distinct from LocalOrder)                                                |
| tax rate field     | specify: **taxRate** (on BasketItem), **rate** (on TaxProfile), or **DEFAULT_TAX_RATE**           |
| synced to platform | **sync status: synced** — avoid passive phrasing                                                  |
| offline mode       | **`local_only` basket mode** (capability) or **offline platform** (platform type) — specify which |
