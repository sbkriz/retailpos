# Platform Capability Rollout Plan (Feature-by-Feature)

> **System**: RetailPOS – Platform Feature Gating & Functional Baseline
> **Actor**: Product, Engineering, QA
> **Date**: 2026-04-30
> **Scope**: Shopify, WooCommerce, Magento (Open Source baseline), BigCommerce, Sylius, Wix, PrestaShop, Squarespace
> **Objective**: Keep POS functional on all platforms by guaranteeing core order flow and product loading, while enabling advanced features only where truly supported.

---

## 1) Why this change is required

Current specs treat most online platforms as behaviorally equivalent in critical areas (especially draft/manual order flow and recalculated totals), which causes unreliable behavior and brittle adapters.

The POS must move to **capability-driven behavior**:

- Always-on baseline for all platforms:
  - Product/catalog loading
  - Basket operations
  - Local checkout completion
  - Order sync/create to platform
- Feature toggles per platform for advanced backend-dependent capabilities
- Runtime fallbacks when unsupported (instead of forced API calls)

---

## 2) Non-negotiable baseline (must always work)

These are required for a “functional POS” on every platform:

1. **Catalog / product loading**
   - Load products and variants (or safe product fallback shape)
   - Load categories where supported; degrade gracefully where limited
2. **Order flow**
   - Add items to basket
   - Local totals + local order creation
   - Complete local payment lifecycle (`pending/processing/paid`)
   - Sync/create order to platform in background when online
3. **Operational resilience**
   - No hard failure if draft orders, coupons, gift cards, or refunds are unsupported
   - Clear UI capability messaging
   - Deterministic fallbacks to local-only path

---

## 3) Platform capability matrix (backend-dependent features)

Legend:

- `S` = Supported as first-class capability
- `C` = Custom adapter logic required, project-specific risk
- `NR` = Not recommended for parity promise in current public API shape

| Feature                                   | Shopify | Woo | Magento | BigCommerce | Sylius | Wix | PrestaShop | Squarespace |
| ----------------------------------------- | ------- | --- | ------- | ----------- | ------ | --- | ---------- | ----------- |
| Catalog / variants                        | S       | S   | S       | S           | C      | S   | S          | S           |
| Customers / attach                        | S       | S   | S       | S           | C      | S   | S          | S           |
| Inventory read/write                      | S       | S   | S       | S           | C      | S   | S          | S           |
| Order create / sync                       | S       | S   | S       | S           | C      | S   | S          | S           |
| Draft/manual orders + recalculated totals | S       | C   | S       | C           | C      | S   | C          | NR          |
| Discounts / coupons                       | S       | S   | S       | S           | C      | S   | S          | NR          |
| Gift cards                                | S       | C   | C       | C           | NR     | S   | NR         | NR          |
| Refunds                                   | S       | C   | S       | S           | C      | S   | C          | NR          |

---

## 4) Critical spec corrections required

The following existing specs should be revised to avoid parity assumptions that are too broad:

### 4.1 `docs/specs/checkout/checkout.md`

Current text implies draft-first flow for all online platforms.

Required correction:

- Replace universal statement with capability-aware behavior:
  - If `supportsDraftOrders === true`: create draft, use platform totals
  - Else: skip draft, keep local totals authoritative, create platform order post-payment via sync
- Add explicit branch for “no recalculation support” platforms

### 4.2 `docs/specs/sync/sync.md`

Current text strongly assumes `platformOrderId`/`completeOrder()` path as common behavior.

Required correction:

- Make `completeOrder()` conditional on draft capability
- For non-draft platforms, always use `createOrder()` post-payment
- Ensure sync state machine documents both modes as first-class

### 4.3 `docs/specs/refunds/refunds.md`

Current text lists broad support without risk-tiering.

Required correction:

- Add capability tiers per platform (`S/C/NR`)
- Define `refundMode`: `platform_native` | `custom_adapter` | `local_record_only`
- For `NR`, disable UI action and keep return-only flow available

### 4.4 `docs/specs/settings/settings-tabs.md`

Current text lists supported platforms but not supported feature profiles.

Required correction:

- Add “Platform capability summary” panel in E-commerce settings
- On platform selection, show enabled/limited/disabled features before save

---

## 5) Required architecture changes

## 5.1 Introduce first-class capability model

Create a single source of truth for platform feature support.

Proposed model:

```ts
export type CapabilityLevel = 'supported' | 'custom' | 'not_recommended';

export interface PlatformCapabilities {
  catalog: CapabilityLevel;
  customers: CapabilityLevel;
  inventory: CapabilityLevel;
  orderSync: CapabilityLevel;
  draftOrders: CapabilityLevel;
  discounts: CapabilityLevel;
  giftCards: CapabilityLevel;
  refunds: CapabilityLevel;
}
```

Add helper methods:

- `supportsStrict(feature)`: only `supported`
- `supportsWithCustom(feature)`: `supported | custom`
- `isNotRecommended(feature)`

## 5.2 Make order flow capability-driven (highest priority)

Checkout and sync logic must branch on capability, not platform enum alone.

Decision rule:

- `draftOrders === supported`:
  - `startCheckout()` -> create draft + use platform totals
  - `completePayment()` / sync -> `completeOrder(platformOrderId)`
- `draftOrders !== supported`:
  - `startCheckout()` -> local order only
  - sync -> `createOrder(localOrderPayload)`

Hard requirement:

- Never block payment completion on draft APIs.

## 5.3 Make feature modules capability-aware

Each advanced module must read capabilities at runtime:

- Discounts tab/actions
- Gift card input/actions
- Refund type chooser
- Customer enrichment fields

UI behavior:

- `supported`: normal UX
- `custom`: show caution banner + allow if adapter is configured
- `not_recommended`: disable action, explain why

## 5.4 Add adapter readiness checks for `custom`

For `custom` features, add adapter-level health gate before enabling UI:

- Example: `isGiftCardAdapterReady(platform)`
- Example: `isRefundAdapterReady(platform)`

If not ready:

- hide/disable action
- structured log warning
- do not throw in cashier flow

---

## 6) Required code changes by area

## 6.1 Capability source and access

- Add `utils/platformCapabilities.ts` with matrix + helpers
- Add `services/platform/PlatformCapabilityService.ts` facade for runtime reads

## 6.2 Configuration bridge

Update `services/config/ServiceConfigBridge.ts`:

- Configure only always-required services unconditionally (product, order, sync)
- Configure optional feature services only when capability allows
- Emit startup log summary of enabled/disabled features for selected platform

## 6.3 Checkout + Sync core flows

Update:

- `services/checkout/CheckoutService.ts`
- `services/sync/OrderSyncService.ts`
- `services/order/OrderServiceInterface.ts` comments/semantics

Changes:

- Replace blanket draft assumptions with capability branch
- Ensure local payment flow remains canonical source of POS completion
- Keep order sync non-blocking

## 6.4 UI gating

Update:

- `screens/settings/EcommerceSettingsTab.tsx`
- checkout surface(s) for discount/giftcard/refund entry points

Changes:

- Add capability badges per feature
- Disable unsupported controls deterministically
- Add user-facing reason text (short and actionable)

## 6.5 Domain service guards

Update all factories/services that expose advanced features:

- discount/giftcard/refund/customer enrichment services

Changes:

- Guard unsupported calls with typed result (`success: false`, `reason: 'unsupported_for_platform'`)
- Avoid throwing in main cashier flow

---

## 7) Functional behavior contract (runtime)

For every selected platform, runtime must satisfy:

1. Product screen loads products (or clear blocking error before transaction start)
2. Cashier can add products and complete local payment
3. Order reaches terminal local state (`paid`)
4. Sync path selected correctly by capability
5. Unsupported advanced features never break checkout flow

---

## 8) Platform-specific rollout policy

### Tier A (broad parity now)

- Shopify
- Wix

Policy:

- Enable all `S` features by default
- Keep `C` behind adapter readiness flags

### Tier B (strong core + selective advanced)

- Magento
- BigCommerce
- WooCommerce
- PrestaShop

Policy:

- Guarantee baseline + order flow
- Enable advanced features only where adapter behavior is proven stable in QA

### Tier C (exception-heavy)

- Sylius
- Squarespace

Policy:

- Guarantee baseline only by default
- Advanced features opt-in per tenant/project after adapter validation

---

## 9) QA acceptance matrix (minimum)

For each platform, test these mandatory scenarios:

1. Load products + categories/filters
2. Add variant and non-variant products to basket
3. Complete cash/card payment locally
4. Verify sync result (`createOrder` vs `completeOrder`) matches capability
5. Verify disabled advanced features do not appear or cannot be triggered
6. Verify audit/notifications still function for baseline flow

Additional for `custom` features:

- adapter-ready path
- adapter-not-ready path (graceful disable)

---

## 10) Implementation phases

### Phase 1 (must-do first): make POS always functional

- Introduce capability map
- Gate checkout/sync draft behavior
- Gate advanced UI entry points
- Update specs to capability language

> **Phase gate:** Phase 1 starts only after spec alignment checklist (Section 13) is marked complete.

### Phase 2: adapter hardening for custom features

- Woo/PrestaShop/Sylius/Magento/BigCommerce custom adapters per feature
- Add readiness probes + config checks

### Phase 3: tenant-level override support

- Add optional tenant override layer for capability upgrades/downgrades
- Keep defaults aligned to matrix above

---

## 11) Risks if not implemented

- Draft-order API mismatch causing failed or duplicate order sync
- Gift card/refund actions exposed where backend cannot guarantee behavior
- Feature regressions masked by broad “supported platform” labels
- Cashier-facing failures in checkout path (highest business risk)

---

## 12) Definition of done

This initiative is complete when:

- Platform capabilities are explicit and centralized
- Specs no longer assume equal behavior across all online platforms
- Order flow + product loading are stable for all 8 platforms
- Unsupported features are gated with clear UI messaging
- QA matrix passes on all 8 platforms for baseline flows

---

## 13) Spec alignment checklist (pre-implementation)

- `docs/specs/checkout/checkout.md` updated with capability-driven checkout modes and legacy-draft compatibility note
- `docs/specs/sync/sync.md` updated with capability-driven sync branching and legacy-draft compatibility note
- `docs/specs/refunds/refunds.md` updated with platform capability tiers and refund modes
- `docs/specs/settings/settings-tabs.md` updated with Platform Capability Summary requirements
- `docs/specs/settings/settings.md` updated for capability-driven tab/menu composition
- `docs/specs/onboarding/wizard.md` updated with authoritative minimal onboarding phases and deferred setup policy
- `docs/specs/onboarding-menu-capability-implementation.md` aligned as architecture implementation reference

All boxes above must remain true before Phase 1 code changes begin.

---

## Appendix A — Current-state mismatch summary from existing specs

Observed mismatch patterns in current docs:

- `checkout.md`: draft-first semantics described as universal for online
- `sync.md`: `platformOrderId`/`completeOrder` flow represented as typical path
- `refunds.md`: broad support stated without capability tiering
- `settings-tabs.md`: platform list shown without feature-level support disclosure

These should be treated as documentation debt and corrected before/alongside implementation.
