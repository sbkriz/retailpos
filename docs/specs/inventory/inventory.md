# Inventory – EARS Requirements

> **System**: RetailPOS – Inventory Management & Procurement
> **Actor**: Manager, Admin, System
> **Date**: 2026-05-02
> **Source**: `services/inventory/InventoryServiceInterface.ts`, `services/inventory/InventoryServiceFactory.ts`, `hooks/useInventory.ts`, `screens/InventoryScreen.tsx`, `screens/inventory/InventoryItemCard.tsx`, `screens/inventory/InventoryFilterTabs.tsx`, `screens/inventory/InventorySummaryFooter.tsx`

---

## Context

The Inventory screen allows managers and admins to view and adjust stock levels for all products. It is accessible from the Inventory tab in the main navigation (visible to `admin` and `manager` roles only — cashiers do not have the Inventory tab).

Inventory data is fetched from the active e-commerce platform via `InventoryServiceFactory`. The screen loads the product list first, then queries inventory levels for all product IDs in a single call. Adjustments (increment/decrement) and absolute quantity sets are both supported.

### Procurement Extension (Gap — Not Yet Implemented)

Procurement is a local-first domain that sits above the platform inventory adapters. It does not require per-platform implementations — purchase orders, vendor records, and receiving workflows are managed in SQLite and push stock adjustments to the platform via the existing `InventoryServiceFactory` on receiving. This section documents the target behaviour for the procurement gap.

**Platform capability gating:** Procurement screens and workflows are always available regardless of platform. The only capability-gated step is the inventory push on receiving — this uses the existing `inventory` capability key. If `inventory: 'not_recommended'` for the active platform, stock adjustments are recorded locally only and not pushed to the platform.

**New services required:**

- `ProcurementService` — manages purchase orders and receiving
- `VendorService` — manages vendor/supplier records
- `InventoryCountService` — manages stock-take sessions
- `TransferOrderService` — manages stock transfers between locations/registers

**New SQLite tables required:**

- `vendors` — supplier records
- `purchase_orders` — PO header (vendor, status, expected date)
- `purchase_order_items` — PO lines (product, variant, ordered qty, received qty, unit cost)
- `inventory_counts` — stock-take session header
- `inventory_count_items` — counted quantities per product/variant
- `transfer_orders` — transfer header (from/to location, status)
- `transfer_order_items` — transfer lines

**Reorder points** are stored as a new column `reorder_point` on the existing `inventory_items` table (or a new `product_inventory_config` table if the platform inventory table is read-only).

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

---

## 7. Procurement & Advanced Inventory (Gap — Target Spec)

### 7.1 Vendors

**7.1.1** When an admin navigates to Inventory → Vendors, the system shall display a list of all vendor records from the `vendors` SQLite table, ordered by name.

**7.1.2** When an admin creates a vendor, the system shall persist `name`, `contactName`, `email`, `phone`, `address`, and `notes` to the `vendors` table and assign a UUID.

**7.1.3** When an admin edits a vendor, the system shall update the record in place and record an audit log entry `vendor:updated`.

**7.1.4** When an admin deletes a vendor, the system shall soft-delete the record (`deleted_at` timestamp) — existing purchase orders referencing the vendor shall remain intact.

### 7.2 Purchase Orders

**7.2.1** When an admin creates a purchase order, the system shall persist a `purchase_orders` header row with `vendorId`, `status: 'draft'`, `expectedDate`, and `notes`, plus one `purchase_order_items` row per line with `productId`, `variantId`, `orderedQty`, and `unitCost`.

**7.2.2** When an admin submits a purchase order (status `draft` → `ordered`), the system shall set `orderedAt` and record an audit log entry `purchase_order:submitted`.

**7.2.3** When an admin opens a purchase order for receiving, the system shall display each line with `orderedQty`, `receivedQty` (sum of prior receipts), and an editable `receiveNow` field defaulting to `orderedQty − receivedQty`.

**7.2.4** When an admin confirms receiving, the system shall:

1. Increment `purchase_order_items.receivedQty` by `receiveNow` for each line.
2. Call `InventoryServiceFactory.getService(platform).updateInventory(updates)` with `adjustment: true` for each received line to push the stock increase to the platform.
3. Set `purchase_orders.status` to `'partially_received'` if any line is still short, or `'received'` if all lines are fully received.
4. Record an audit log entry `purchase_order:received`.

**7.2.5** When a purchase order reaches `status: 'received'`, the system shall send a notification `'Purchase Order Received'` via `notificationService`.

**7.2.6** When an admin cancels a purchase order with `status: 'draft'` or `'ordered'`, the system shall set `status: 'cancelled'` and record an audit log entry `purchase_order:cancelled` — received quantities are not reversed.

### 7.3 Reorder Points

**7.3.1** When an admin sets a reorder point for a product/variant, the system shall persist `reorderPoint` and `reorderQty` to `product_inventory_config` keyed by `productId` + `variantId`.

**7.3.2** When `InventoryScreen` loads inventory and a product's `quantity ≤ reorderPoint`, the system shall flag the item with a `reorder` badge in addition to the existing low-stock badge.

**7.3.3** When a reorder point is breached after a sale (inventory decremented at checkout), the system shall send a notification `'Reorder Required: {productName}'` via `notificationService`.

**7.3.4** When an admin taps "Create PO" on a reorder-flagged item, the system shall pre-populate a new purchase order draft with the item's `reorderQty` and the item's default vendor (if set).

### 7.4 Inventory Counts (Stock Takes)

**7.4.1** When an admin starts an inventory count, the system shall create an `inventory_counts` session row with `status: 'in_progress'` and `startedAt`, and pre-populate `inventory_count_items` with all current products and their platform-reported quantities as `expectedQty`.

**7.4.2** When a cashier or manager scans or enters a product during a count, the system shall update `inventory_count_items.countedQty` for that product/variant.

**7.4.3** When an admin finalises a count, the system shall:

1. Calculate `variance = countedQty − expectedQty` for each line.
2. Call `updateInventory` with `adjustment: false` and `quantity: countedQty` for each line where `variance !== 0`.
3. Set `inventory_counts.status` to `'completed'` and `completedAt`.
4. Record an audit log entry `inventory_count:completed` with the total variance summary.

**7.4.4** When an admin discards an in-progress count, the system shall set `status: 'discarded'` — no inventory adjustments are made.

### 7.5 Transfer Orders

**7.5.1** When an admin creates a transfer order, the system shall persist a `transfer_orders` header with `fromLocation`, `toLocation`, `status: 'draft'`, and one `transfer_order_items` row per line with `productId`, `variantId`, and `transferQty`.

**7.5.2** When an admin dispatches a transfer order (status `draft` → `in_transit`), the system shall decrement inventory at `fromLocation` via `updateInventory` with `adjustment: true` and `quantity: -transferQty`.

**7.5.3** When an admin confirms receipt of a transfer order (status `in_transit` → `received`), the system shall increment inventory at `toLocation` via `updateInventory` with `adjustment: true` and `quantity: +transferQty`, and record an audit log entry `transfer_order:received`.

### 7.6 Barcode Label Printing

**7.6.1** When an admin selects one or more products in the inventory list and taps "Print Labels", the system shall call `PrinterServiceFactory.getService()` and send a label print job for each selected product/variant containing `name`, `sku`, `barcode`, and `price`.

**7.6.2** When the printer is unavailable, the system shall display an error and offer to export the label data as a CSV for offline printing.

### 7.7 Vendor Returns

**7.7.1** When an admin creates a vendor return against a received purchase order, the system shall create a `vendor_returns` record with `purchaseOrderId`, `vendorId`, `status: 'pending'`, and per-line `returnQty` and `reason`.

**7.7.2** When a vendor return is confirmed, the system shall decrement inventory via `updateInventory` with `adjustment: true` and `quantity: -returnQty` for each returned line, and record an audit log entry `vendor_return:confirmed`.
