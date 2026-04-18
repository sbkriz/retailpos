# Inventory – EARS Requirements

> **System**: RetailPOS – Inventory Management
> **Actor**: Manager, Admin, System
> **Date**: 2026-04-13
> **Source**: `services/inventory/InventoryServiceInterface.ts`, `services/inventory/InventoryServiceFactory.ts`, `hooks/useInventory.ts`, `screens/InventoryScreen.tsx`, `screens/inventory/InventoryItemCard.tsx`, `screens/inventory/InventoryFilterTabs.tsx`, `screens/inventory/InventorySummaryFooter.tsx`

---

## Context

The Inventory screen allows managers and admins to view and adjust stock levels for all products. It is accessible from the Inventory tab in the main navigation (visible to `admin` and `manager` roles only — cashiers do not have the Inventory tab).

Inventory data is fetched from the active e-commerce platform via `InventoryServiceFactory`. The screen loads the product list first, then queries inventory levels for all product IDs in a single call. Adjustments (increment/decrement) and absolute quantity sets are both supported.

### Stock Status

| Quantity             | Badge colour | Label          |
| -------------------- | ------------ | -------------- |
| `0`                  | Red          | Out of Stock   |
| `1–10` (≤ threshold) | Amber        | `{n} in stock` |
| `> 10`               | Green        | `{n} in stock` |

The low stock threshold defaults to `10` and can be overridden per item via `InventoryItem.lowStockThreshold`.

### Filter Tabs

| Tab          | Shows                                  |
| ------------ | -------------------------------------- |
| All          | All items                              |
| Low Stock    | `quantity > 0 && quantity ≤ threshold` |
| Out of Stock | `quantity === 0`                       |

---

## 1. Ubiquitous Requirements

**1.1** `InventoryServiceFactory.getInstance().getService(platform)` shall return the platform-specific inventory service, defaulting to `ECommercePlatform.OFFLINE` when no platform is provided.

**1.2** `InventoryUpdate.adjustment: true` means the `quantity` field is a delta (+/-). `adjustment: false` means it is an absolute value.

**1.3** The Inventory tab shall only be visible to `admin` and `manager` roles — `canAccessTab(role, 'Inventory')` returns `false` for `cashier`.

**1.4** All monetary and quantity values displayed in `InventoryScreen` shall use the store's configured currency via `useCurrency()`.

---

## 2. Event-Driven Requirements

### 2.1 Loading Inventory

**2.1.1** When `InventoryScreen` mounts, the system shall call `fetchProducts()` to load the product list.

**2.1.2** When the product list is non-empty, the system shall call `loadInventory()` which calls `getInventory(productIds)` with all product IDs.

**2.1.3** When `getInventory(productIds)` returns a result, the system shall map each inventory item to an `InventoryItem` by joining with the product list (name, SKU), and set `inventoryItems` state.

**2.1.4** When `getInventory` throws, the system shall set `error` state and log the error — the screen shall not crash.

**2.1.5** When the user pulls to refresh, the system shall call `fetchProducts()` then `loadInventory()` and set `refreshing` state accordingly.

### 2.2 Filtering

**2.2.1** When the user taps a filter tab, the system shall set `filter` state to `'all'`, `'low'`, or `'out'` and re-render the filtered list.

**2.2.2** When `filter === 'low'`, the system shall show only items where `quantity > 0 && quantity ≤ lowStockThreshold`.

**2.2.3** When `filter === 'out'`, the system shall show only items where `quantity === 0`.

**2.2.4** When `searchQuery` is non-empty, the system shall additionally filter by name or SKU (case-insensitive) before applying the stock filter.

### 2.3 Quick Adjust (±1)

**2.3.1** When the user taps `+` on an item card, the system shall call `adjustInventory(productId, +1, variantId)` which calls `updateInventory([{ productId, variantId, quantity: 1, adjustment: true }])`.

**2.3.2** When the user taps `−` on an item card and `quantity > 0`, the system shall call `adjustInventory(productId, -1, variantId)`.

**2.3.3** When `adjustInventory` returns `true`, the system shall optimistically update the item's `quantity` in local state by the adjustment amount (clamped to `≥ 0`).

**2.3.4** When `adjustInventory` returns `false`, the system shall set `inlineError` to `'Failed to update inventory. Please try again.'`.

**2.3.5** The `−` button shall be disabled when `item.quantity === 0`.

### 2.4 Edit Quantity (Absolute Set)

**2.4.1** When the user taps "Edit" on an item card, the system shall set `editingItem` to the item's key (`{productId}-{variantId}`) and `editQuantity` to the current quantity as a string.

**2.4.2** When the user taps "Save" in edit mode, the system shall validate that `editQuantity` parses to a non-negative integer. If invalid, the system shall set `inlineError` to `'Please enter a valid quantity.'` and not call the service.

**2.4.3** When validation passes, the system shall call `setInventoryQuantity(productId, quantity, variantId)` which calls `updateInventory([{ productId, variantId, quantity, adjustment: false }])`.

**2.4.4** When `setInventoryQuantity` returns `true`, the system shall update the item's `quantity` in local state, clear `editingItem`, `editQuantity`, and `inlineError`.

**2.4.5** When `setInventoryQuantity` returns `false`, the system shall set `inlineError` to `'Failed to update inventory. Please try again.'`.

**2.4.6** When the user taps "Cancel" in edit mode, the system shall clear `editingItem` and `editQuantity` without making any service call.

### 2.5 Service Layer

**2.5.1** When `useInventory.getInventory(productIds)` is called, the system shall call `InventoryServiceFactory.getInstance().getService(platform).getInventory(productIds)`, set `inventory` state on success, and set `error` on failure.
**2.5.2** When `useInventory.updateInventory(updates)` is called, the system shall call `service.updateInventory(updates)`. If `result.failed > 0`, the system shall set `error` to `'{n} inventory updates failed'`.

**2.5.3** When `useInventory.adjustInventory(productId, adjustment, variantId?)` is called, the system shall call `updateInventory([{ productId, variantId, quantity: adjustment, adjustment: true }])` and return `true` if `result.successful > 0`.

**2.5.4** When `useInventory.setInventoryQuantity(productId, quantity, variantId?)` is called, the system shall call `updateInventory([{ productId, variantId, quantity, adjustment: false }])` and return `true` if `result.successful > 0`.

**2.5.5** When `useInventory.getProductInventory(productId)` is called, the system shall call `getInventory([productId])` and return the sum of all variant quantities for that product, or `0` if no items are returned.

### 2.6 Barcode Scanner Integration

**2.6.1** When `InventoryScreen` renders, the system shall show a scan button (barcode icon) in the header alongside the title.

**2.6.2** When the user taps the scan button, the system shall toggle `scanModeActive`. When `scanModeActive` becomes `true`, the system shall connect to the scanner using `ScannerServiceFactory` with the persisted scanner settings and start a scan listener.

**2.6.3** When a barcode is received from the scan listener, the system shall call `handleInventoryScan(barcode)`.

**2.6.4** When `handleInventoryScan(barcode)` is called, the system shall search `inventoryItems` for an item where `item.sku === barcode` or `item.productId === barcode`.

**2.6.5** When a match is found, the system shall set `searchQuery` to the matched item's name (which filters the list to show that item) and set `editingItem` to the item's key to open it in edit mode.

**2.6.6** When no match is found, the system shall show `Alert.alert('Not Found', 'No inventory item found for barcode: {barcode}')`.

**2.6.7** When `scanModeActive` becomes `false` (user taps the scan button again) or `InventoryScreen` unmounts, the system shall stop the scan listener and disconnect the scanner.

**2.6.8** While `scanModeActive` is `true`, the scan button shall render with a highlighted/active style to indicate scanning is in progress.

---

## 3. State-Driven Requirements

**3.1** While `isLoading` is `true` and `inventoryItems` is empty, the screen shall render a full-screen `ActivityIndicator` with "Loading inventory..." label.

**3.2** While `isLoading` is `true` and `inventoryItems` is already populated (refresh), the screen shall show the `RefreshControl` spinner without replacing the list.

**3.3** While `editingItem` matches an item's key, that item card shall render the edit input, Save, and Cancel buttons instead of the quick-adjust controls.

**3.4** While `filter === 'low'` or `filter === 'out'`, the active filter tab shall render with a primary-colour bottom border and bold text.

**3.5** While `inventoryItems` is empty, `InventorySummaryFooter` shall not render.

**3.6** While `ecommerceInitialized` is `false`, `loadInventory` shall return immediately without making a service call, and the empty state shall show "E-Commerce Not Configured".

**3.7** While `scanModeActive` is `true`, the scan button in the header shall render with a primary-colour background to indicate active scanning.

---

## 4. Optional Feature Requirements

**4.1** Where `item.sku` is non-null, `InventoryItemCard` shall render `SKU: {sku}` below the product name.

**4.2** Where `item.variantId` is set, all service calls shall include `variantId` so variant-level inventory is tracked separately.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If `ecommerceInitialized` is `false` when `loadInventory` is called, the system shall return immediately — no service call is made and no error is shown.

**5.2** If `products.length === 0` when `loadInventory` is called, the system shall return immediately — there are no product IDs to query.

**5.3** If `editQuantity` is empty or non-numeric when Save is tapped, the system shall show `'Please enter a valid quantity.'` and not call the service.

**5.4** If `adjustInventory` is called with `adjustment = -1` when `quantity === 0`, the `−` button is disabled — this case should not occur. If it does, the service call will be made but the optimistic update clamps to `Math.max(0, quantity + adjustment)`.

**5.5** If `updateInventory` returns `result.failed > 0`, `useInventory` sets `error` state but still returns the result — the caller (`InventoryScreen`) checks the boolean return value of `adjustInventory`/`setInventoryQuantity` to decide whether to show `inlineError`.

---

## 6. Component Traceability

| Requirement (summary)                     | Component / Service                                          | Source File                                     |
| ----------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| Platform service via factory              | `InventoryServiceFactory.getInstance().getService(platform)` | `services/inventory/InventoryServiceFactory.ts` |
| `getInventory(productIds)`                | `useInventory.getInventory`                                  | `hooks/useInventory.ts`                         |
| `updateInventory(updates)`                | `useInventory.updateInventory`                               | `hooks/useInventory.ts`                         |
| `adjustInventory(+/-)`                    | `useInventory.adjustInventory`                               | `hooks/useInventory.ts`                         |
| `setInventoryQuantity(abs)`               | `useInventory.setInventoryQuantity`                          | `hooks/useInventory.ts`                         |
| `getProductInventory(id)`                 | `useInventory.getProductInventory`                           | `hooks/useInventory.ts`                         |
| Load products on mount                    | `InventoryScreen` useEffect → `fetchProducts()`              | `screens/InventoryScreen.tsx`                   |
| Load inventory when products ready        | `InventoryScreen` useEffect → `loadInventory()`              | `screens/InventoryScreen.tsx`                   |
| Map inventory result to `InventoryItem[]` | `InventoryScreen.loadInventory`                              | `screens/InventoryScreen.tsx`                   |
| Pull to refresh                           | `InventoryScreen.handleRefresh`                              | `screens/InventoryScreen.tsx`                   |
| Search filter (name + SKU)                | `InventoryScreen.filteredItems`                              | `screens/InventoryScreen.tsx`                   |
| Stock filter (all/low/out)                | `InventoryScreen.filteredItems` switch                       | `screens/InventoryScreen.tsx`                   |
| Quick adjust ±1                           | `InventoryScreen.handleAdjustQuantity`                       | `screens/InventoryScreen.tsx`                   |
| Optimistic quantity update                | `InventoryScreen.handleAdjustQuantity` success path          | `screens/InventoryScreen.tsx`                   |
| Edit mode start/cancel                    | `InventoryScreen.handleStartEdit` / `handleCancelEdit`       | `screens/InventoryScreen.tsx`                   |
| Absolute quantity set + validation        | `InventoryScreen.handleSetQuantity`                          | `screens/InventoryScreen.tsx`                   |
| Inline error display                      | `InventoryScreen` `inlineError` state                        | `screens/InventoryScreen.tsx`                   |
| Stock colour (green/amber/red)            | `InventoryItemCard.getStockColor`                            | `screens/inventory/InventoryItemCard.tsx`       |
| Edit input + Save/Cancel                  | `InventoryItemCard` `isEditing` branch                       | `screens/inventory/InventoryItemCard.tsx`       |
| `−` disabled at zero                      | `InventoryItemCard` `disabled={item.quantity === 0}`         | `screens/inventory/InventoryItemCard.tsx`       |
| Filter tab counts                         | `InventoryFilterTabs` (lowStockCount, outOfStockCount)       | `screens/inventory/InventoryFilterTabs.tsx`     |
| Summary footer (total/low/out)            | `InventorySummaryFooter`                                     | `screens/inventory/InventorySummaryFooter.tsx`  |
| Footer hidden when empty                  | `InventorySummaryFooter` `items.length === 0` guard          | `screens/inventory/InventorySummaryFooter.tsx`  |
| Inventory tab role guard                  | `canAccessTab(role, 'Inventory')`                            | `utils/roleAccess.ts`                           |
| Scan button in header                     | `InventoryScreen` header scan icon                           | `screens/InventoryScreen.tsx`                   |
| Toggle scan mode + connect scanner        | `InventoryScreen.handleToggleScanMode`                       | `screens/InventoryScreen.tsx`                   |
| Scan → match by SKU/productId → edit mode | `InventoryScreen.handleInventoryScan`                        | `screens/InventoryScreen.tsx`                   |
| Scan → not found alert                    | `InventoryScreen.handleInventoryScan`                        | `screens/InventoryScreen.tsx`                   |
| Disconnect scanner on unmount/deactivate  | `InventoryScreen` useEffect cleanup                          | `screens/InventoryScreen.tsx`                   |
