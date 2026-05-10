# Barcode & QR Scanner – EARS Requirements

> **System**: RetailPOS – Barcode & QR Scanner
> **Actor**: Cashier, System
> **Date**: 2026-05-10 (Updated)
> **Source**: `services/scanner/ScannerServiceInterface.ts`, `services/scanner/ScannerServiceFactory.ts`, `services/scanner/ScannerSettingsService.ts`, `services/scanner/BluetoothScannerService.ts`, `services/scanner/USBScannerService.ts`, `services/scanner/CameraScannerService.ts`, `services/scanner/QRHardwareScannerService.ts`, `services/scanner/ElectronScannerService.ts`, `hooks/useBarcodeScanner.ts`, `hooks/useScanner.ts`, `screens/BarcodeScannerScreen.tsx`, `screens/settings/hardware/ScannerSettingsTab.tsx`, `navigation/MainTabNavigator.tsx`, `hooks/useOrderScreen.ts`

---

## Context

The scanner subsystem abstracts four physical input strategies — camera, Bluetooth (BLE), USB HID, and dedicated QR hardware — behind a common `ScannerServiceInterface`. A singleton `ScannerServiceFactory` selects the correct implementation at runtime based on platform and environment variables.

On Electron (desktop), camera and Bluetooth are replaced with mock implementations; USB and QR hardware are served by `ElectronScannerService`, which listens to DOM `keydown` events and Electron IPC. On mobile, all four strategies use native implementations.

Scanned barcodes flow through `useBarcodeScanner`, which performs a four-step product lookup and auto-adds the matched product to the basket. The result is surfaced to the cashier via a scan result banner in `BarcodeScannerScreen`, and the matched product ID is passed to the Order screen via navigation params.

### Scanner Types

| Type          | Transport                            | Platform        |
| ------------- | ------------------------------------ | --------------- |
| `camera`      | expo-camera `CameraView`             | Mobile / Tablet |
| `bluetooth`   | BLE via react-native-ble-plx         | Mobile          |
| `usb`         | HID keyboard emulation (DOM keydown) | Web / Electron  |
| `qr_hardware` | HID keyboard emulation (DOM keydown) | Web / Electron  |

### Factory Resolution

| Condition                                | Implementation           |
| ---------------------------------------- | ------------------------ |
| `USE_MOCK_SCANNER=true`                  | Mock service (all types) |
| `isElectron()` + `camera` or `bluetooth` | Mock service             |
| `isElectron()` + `usb` or `qr_hardware`  | `ElectronScannerService` |
| Mobile, any type                         | Native implementation    |

### Scan Result Banner States

| State           | Meaning                                             |
| --------------- | --------------------------------------------------- |
| `searching`     | Lookup in progress                                  |
| `found_local`   | Matched by id / barcode / sku in local product list |
| `found_variant` | Matched via `productVariantRepository`              |
| `found_online`  | Matched via `SearchService.searchByBarcode`         |
| `not_found`     | No match after all four lookup steps                |

---

## 1. Ubiquitous Requirements

**1.1** The system shall expose all scanner implementations through the `ScannerServiceInterface`, providing `connect(deviceId)`, `disconnect()`, `isConnected()`, `startScanListener(callback)`, `stopScanListener(subscriptionId)`, and `discoverDevices()`.

**1.2** `ScannerServiceFactory` shall be a singleton — a single instance is shared across the application for the lifetime of the session.

**1.3** Scanner settings (including `bleServiceUUID`, `bleCharacteristicUUID`, USB scan thresholds, and device name patterns) shall be persisted to `keyValueRepository` under the key `'scannerSettings'` and managed by `ScannerSettingsService`.

**1.4** `ScannerServiceFactory.disconnectAll()` shall call `disconnect()` on every instantiated service, cleaning up all active connections.

**1.5** `startScanListener` shall return a unique `subscriptionId` string. Multiple listeners may be registered concurrently; each is identified by its own `subscriptionId`.

**1.6** `stopScanListener(subscriptionId)` shall remove only the listener associated with the given `subscriptionId` — other active listeners shall remain unaffected.

**1.7** `ScannerSettingsService` shall provide centralized configuration management for all scanner types, including BLE presets, USB scan detection thresholds, and device name filtering patterns.

---

## 2. Event-Driven Requirements

### 2.1 Factory — Implementation Selection

**2.1.1** When `ScannerServiceFactory.getService(type)` is called with `USE_MOCK_SCANNER=true`, the system shall return a mock scanner service regardless of type or platform.

**2.1.2** When `ScannerServiceFactory.getService('camera')` or `getService('bluetooth')` is called on Electron, the system shall return a mock scanner service.

**2.1.3** When `ScannerServiceFactory.getService('usb')` or `getService('qr_hardware')` is called on Electron, the system shall return an `ElectronScannerService` instance.

**2.1.4** When `ScannerServiceFactory.getService(type)` is called on a mobile platform with `USE_MOCK_SCANNER` unset, the system shall return the native implementation for that type.

### 2.2 Connect / Disconnect Lifecycle

**2.2.1** When `connect(deviceId)` is called on a scanner service, the system shall establish a connection to the specified device and resolve when the connection is ready.

**2.2.2** When `disconnect()` is called, the system shall terminate the active connection, release all resources, and set `isConnected()` to `false`.

**2.2.3** When `BarcodeScannerScreen` mounts, the system shall call `connect()` on the active scanner service using the persisted device ID from scanner settings.

**2.2.4** When `BarcodeScannerScreen` unmounts, the system shall call `disconnect()` on the active scanner service.

**2.2.5** When `BarcodeScannerScreen` is running on Electron and the selected scanner type is `camera`, the system shall override the type to `usb` before connecting.

### 2.3 Scanner Settings Service

**2.3.1** When `ScannerSettingsService.initialize()` is called at app startup, the system shall load persisted settings from `keyValueRepository` under the key `'scannerSettings'` and merge with defaults.

**2.3.2** `ScannerSettingsService` shall support BLE scanner presets for common models:

- `microchip_rn4020` (default): Service UUID `49535343-FE7D-4AE5-8FA9-9FAFD205E455`, Characteristic UUID `49535343-8841-43F4-A8D4-ECBE34729BB3`
- `zebra_cs4070`: Zebra-specific UUIDs
- `honeywell_1902`: Honeywell-specific UUIDs
- `socket_s700`: Socket Mobile-specific UUIDs
- `custom`: User-defined UUIDs

**2.3.3** When a BLE preset is selected via `ScannerSettingsService.updateSettings()`, the system shall automatically apply the corresponding service UUID and characteristic UUID.

**2.3.4** `ScannerSettingsService` shall support configurable USB scan detection thresholds:

- `scanIntervalMs` (default: 80ms) — inter-keystroke timeout
- `minBarcodeLength` (default: 3) — minimum characters to accept
- `maxBarcodeLength` (default: 128) — maximum characters to accept
- `suffixChar` (default: 'Enter') — scan termination key (alternative: 'Tab')

**2.3.5** `ScannerSettingsService` shall support configurable device name patterns for BLE discovery filtering (default: `['scanner', 'barcode', 'reader', 'zebra', 'honeywell', 'socket']`).

**2.3.6** When device name patterns array is empty, BLE discovery shall return all discovered devices without filtering.

**2.3.7** When `ScannerSettingsService.updateSettings()` is called, the system shall persist all changes immediately to `keyValueRepository`.

**2.3.8** `ScannerSettingsService` shall persist the last-connected device ID for each scanner type under `lastConnectedDevices`.

### 2.4 Scanner Settings UI

**2.4.1** When `ScannerSettingsTab` mounts, the system shall load current settings from `ScannerSettingsService.getSettings()`.

**2.4.2** The BLE preset selector shall display 5 options: Microchip RN4020 (Generic), Zebra CS4070, Honeywell 1902, Socket Mobile S700, Custom.

**2.4.3** When preset is set to 'custom', the system shall enable custom UUID input fields for service UUID and characteristic UUID.

**2.4.4** When a non-custom preset is selected, the custom UUID fields shall be disabled and auto-populated with the preset values.

**2.4.5** The USB configuration section shall allow editing of scan interval (ms), min/max barcode length, and suffix character (Enter/Tab selector).

**2.4.6** The device name patterns field shall accept comma-separated patterns for BLE discovery filtering, with helper text showing common patterns.

**2.4.7** When the user taps Save, the system shall call `ScannerSettingsService.updateSettings()` with all modified values and show a success confirmation.

**2.4.8** When settings are saved, the system shall set `dirty = false` and hide the save button until the next change.

### 2.5 Bluetooth Scanner (BLE) — UPDATED

**2.5.1** When `BluetoothScannerService` is constructed, the system shall load BLE UUIDs from `ScannerSettingsService.getSettings()` instead of using hardcoded defaults.

**2.5.2** When `BluetoothScannerService.configure(serviceUUID, characteristicUUID)` is called before `connect()`, the system shall use the provided UUIDs for GATT communication, overriding the settings service values.

**2.5.3** When `discoverDevices()` is called on `BluetoothScannerService`, the system shall scan for BLE peripherals for 5 seconds and filter devices using `ScannerSettingsService.matchesDevicePattern()`.

**2.5.4** When a BLE characteristic notification is received, the system shall base64-decode the characteristic value to obtain the raw barcode string before invoking scan listeners.

**2.5.5** When the BLE device disconnects unexpectedly, the system shall invoke all registered `onDisconnect` callbacks if provided.

### 2.6 USB Scanner (HID Keyboard Emulation) — UPDATED

**2.6.1** When `USBScannerService` is constructed, the system shall load scan detection thresholds from `ScannerSettingsService.getSettings()`.

**2.6.2** When `USBScannerService` is connected, the system shall attach a DOM `keydown` listener to accumulate characters into a buffer.

**2.6.3** When the inter-keystroke interval exceeds the configured `scanIntervalMs` (default: 80ms), the system shall discard the current buffer — the input is treated as human typing, not a scanner burst.

**2.6.4** When a `keydown` event with the configured `suffixChar` key (default: 'Enter') is received and the buffer contains at least `minBarcodeLength` characters (default: 3), the system shall treat the buffer contents as a complete barcode, invoke all scan listeners, and clear the buffer.

**2.6.5** When the buffer contains fewer than `minBarcodeLength` characters at suffix key press, the system shall discard the buffer without invoking listeners.

**2.6.6** When the buffer exceeds `maxBarcodeLength` characters (default: 128), the system shall discard the buffer and reset.

**2.6.7** When `discoverDevices()` is called on `USBScannerService`, the system shall return a single logical device representing the HID keyboard input channel.

### 2.7 QR Hardware Scanner (HID Keyboard Emulation) — UPDATED

**2.7.1** When `QRHardwareScannerService` is constructed, the system shall load scan detection thresholds from `ScannerSettingsService.getSettings()`.

**2.7.2** When `QRHardwareScannerService` is connected, the system shall apply the same configurable inter-keystroke threshold and character length rules as `USBScannerService`.

**2.7.3** When `discoverDevices()` is called on `QRHardwareScannerService`, the system shall return a static list of placeholder device entries representing common QR hardware models (Zebra, Honeywell, Newland).

### 2.8 Electron Scanner (DOM keydown + IPC) — UPDATED

**2.8.1** When `ElectronScannerService` is connected, the system shall register both a DOM `keydown` listener (using configurable thresholds from `ScannerSettingsService`) and an Electron IPC `onBarcodeScan` handler.

**2.8.2** When either the DOM keydown sequence or the IPC `onBarcodeScan` event produces a barcode string, the system shall invoke all registered scan listeners with that string.

**2.8.3** When `discoverDevices()` is called on `ElectronScannerService`, the system shall return a single logical device with id `'electron-hid'`.

### 2.9 Camera Scanner

**2.9.1** When `CameraScannerService.connect()` is called, the system shall request camera permission via `expo-camera` and resolve with the permission result.

**2.9.2** When `discoverDevices()` is called on `CameraScannerService`, the system shall return the available camera devices (back and front).

**2.9.3** When the scanner type is `camera`, the system shall render a `CameraView` component in `BarcodeScannerScreen`; the `CameraView` handles barcode decoding and calls the scan callback directly.

### 2.10 Barcode Lookup — `processBarcodeData`

**2.10.1** When a barcode string is received by `useBarcodeScanner`, the system shall set the banner state to `searching` and begin the four-step lookup sequence.

**2.10.2** When step 1 finds an exact match in the local products list by `id`, `barcode`, or `sku`, the system shall set banner state to `found_local`, auto-add the product to the basket, and skip remaining steps.

**2.10.3** When step 1 finds no match, the system shall call `productVariantRepository.findByBarcode()` then `findBySku()`; on match, the system shall set banner state to `found_variant`, auto-add the product, and skip remaining steps.

**2.10.4** When steps 1–2 find no match, the system shall call `SearchService.searchByBarcode()`; on match, the system shall set banner state to `found_online`, auto-add the product, and skip remaining steps.

**2.10.5** When all four steps find no match, the system shall set banner state to `not_found` and display an alert to the cashier.

**2.10.6** When a product is successfully matched and added, the system shall reset the banner state to idle after 1500 ms.

### 2.11 Navigation — Scan-to-Basket Bridge (Sale Mode)

**2.11.1** When `onScanSuccess(productId)` is called in `BarcodeScannerScreen`, the system shall call `navigation.navigate('Sale', { scannedProductId: productId })`.

**2.11.2** When `useSaleScreen` detects a non-null `route.params.scannedProductId` on mount or param change, the system shall call `addToCart` with that product ID.

### 2.12 Inventory Scan Mode

The scanner can also be used in the Inventory screen to locate a product by barcode and jump directly to its inventory card for editing. The same scanner hardware is reused but the callback routes to inventory instead of the basket.

**2.12.1** When `InventoryScreen` activates scan mode (user taps the scan button in the header), the system shall start a scan listener via `ScannerServiceFactory` using the persisted scanner settings.

**2.12.2** When a barcode is scanned in inventory mode, the system shall search `inventoryItems` for an item whose `sku` or `productId` matches the scanned value.

**2.12.3** When a match is found, the system shall set `searchQuery` to the matched item's name (filtering the list to that item) and open the item in edit mode (`editingItem`).

**2.12.4** When no match is found, the system shall show an alert: `'No inventory item found for barcode: {barcode}'`.

**2.12.5** When `InventoryScreen` deactivates scan mode or unmounts, the system shall stop the scan listener and disconnect the scanner.

---

## 3. State-Driven Requirements

**3.1** While `isConnected()` returns `false`, `startScanListener` shall not deliver barcode events to registered callbacks.

**3.2** While the scanner type is `camera`, `BarcodeScannerScreen` shall render the `CameraView` component; while the type is any other value, it shall render the external scanner view.

**3.3** While the banner state is `searching`, the scan result banner shall display a loading indicator.

**3.4** While the banner state is `found_local`, `found_variant`, or `found_online`, the banner shall display a success indicator with the matched product name.

**3.5** While the banner state is `not_found`, the banner shall display an error indicator.

---

## 4. Optional Feature Requirements

**4.1** Where `BluetoothScannerService` supports `onDisconnect` / `offDisconnect`, callers may register a callback to be notified of unexpected BLE disconnections.

**4.2** Where a scanner service implements `configure()`, callers may supply custom GATT service and characteristic UUIDs before calling `connect()` — this overrides the compiled-in defaults.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If camera permission is denied, `CameraScannerService.connect()` shall resolve with the denied permission result — it shall not throw. `BarcodeScannerScreen` shall display an appropriate message to the cashier.

**5.2** If the BLE scan completes with no matching peripherals, `discoverDevices()` shall return an empty array — it shall not throw.

**5.3** If a DOM `keydown` buffer is non-empty when `disconnect()` is called, the system shall discard the buffer without invoking listeners.

**5.4** If `stopScanListener` is called with an unknown `subscriptionId`, the system shall silently do nothing.

**5.5** If `ElectronScannerService` receives a barcode from both the DOM keydown path and the IPC path for the same physical scan, the system shall invoke listeners once per event source — deduplication is not guaranteed and callers must be tolerant of near-simultaneous duplicates.

**5.6** If `processBarcodeData` is called while a previous lookup is still in progress, the system shall ignore the new scan until the 1500 ms reset window has elapsed.

---

## 6. Component Traceability

| Requirement (summary)                             | Component / Service                                     | Source File                                        |
| ------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| Factory singleton, type-based resolution          | `ScannerServiceFactory.getService`                      | `services/scanner/ScannerServiceFactory.ts`        |
| Mock override via `USE_MOCK_SCANNER`              | `ScannerServiceFactory.getService`                      | `services/scanner/ScannerServiceFactory.ts`        |
| Electron camera/BT → mock                         | `ScannerServiceFactory.getService`                      | `services/scanner/ScannerServiceFactory.ts`        |
| Electron usb/qr → `ElectronScannerService`        | `ScannerServiceFactory.getService`                      | `services/scanner/ScannerServiceFactory.ts`        |
| `disconnectAll()` cleans up all services          | `ScannerServiceFactory.disconnectAll`                   | `services/scanner/ScannerServiceFactory.ts`        |
| `connect` / `disconnect` / `isConnected` contract | `ScannerServiceInterface`                               | `services/scanner/ScannerServiceInterface.ts`      |
| `startScanListener` returns `subscriptionId`      | `ScannerServiceInterface`                               | `services/scanner/ScannerServiceInterface.ts`      |
| `stopScanListener` removes specific listener      | `ScannerServiceInterface`                               | `services/scanner/ScannerServiceInterface.ts`      |
| Settings service with BLE presets                 | `ScannerSettingsService.initialize`                     | `services/scanner/ScannerSettingsService.ts`       |
| BLE presets (5 models + custom)                   | `ScannerSettingsService.BLE_PRESETS`                    | `services/scanner/ScannerSettingsService.ts`       |
| USB scan thresholds configuration                 | `ScannerSettingsService.getSettings`                    | `services/scanner/ScannerSettingsService.ts`       |
| Device name pattern filtering                     | `ScannerSettingsService.matchesDevicePattern`           | `services/scanner/ScannerSettingsService.ts`       |
| Settings persistence                              | `ScannerSettingsService.updateSettings`                 | `services/scanner/ScannerSettingsService.ts`       |
| Scanner settings UI                               | `ScannerSettingsTab`                                    | `screens/settings/hardware/ScannerSettingsTab.tsx` |
| BLE preset selector (5 options)                   | `ScannerSettingsTab` preset picker                      | `screens/settings/hardware/ScannerSettingsTab.tsx` |
| Custom UUID inputs                                | `ScannerSettingsTab` UUID fields                        | `screens/settings/hardware/ScannerSettingsTab.tsx` |
| USB config (interval, length, suffix)             | `ScannerSettingsTab` USB section                        | `screens/settings/hardware/ScannerSettingsTab.tsx` |
| Device name patterns input                        | `ScannerSettingsTab` patterns field                     | `screens/settings/hardware/ScannerSettingsTab.tsx` |
| BLE loads UUIDs from settings service             | `BluetoothScannerService` constructor                   | `services/scanner/BluetoothScannerService.ts`      |
| BLE configure UUIDs before connect                | `BluetoothScannerService.configure`                     | `services/scanner/BluetoothScannerService.ts`      |
| BLE 5-second device scan, pattern filter          | `BluetoothScannerService.discoverDevices`               | `services/scanner/BluetoothScannerService.ts`      |
| BLE base64 decode characteristic value            | `BluetoothScannerService` characteristic handler        | `services/scanner/BluetoothScannerService.ts`      |
| USB loads thresholds from settings service        | `USBScannerService` constructor                         | `services/scanner/USBScannerService.ts`            |
| USB configurable threshold, length, suffix        | `USBScannerService` keydown handler                     | `services/scanner/USBScannerService.ts`            |
| QR hardware loads thresholds from settings        | `QRHardwareScannerService` constructor                  | `services/scanner/QRHardwareScannerService.ts`     |
| QR hardware same configurable HID rules as USB    | `QRHardwareScannerService` keydown handler              | `services/scanner/QRHardwareScannerService.ts`     |
| QR hardware placeholder device list               | `QRHardwareScannerService.discoverDevices`              | `services/scanner/QRHardwareScannerService.ts`     |
| Electron DOM keydown + IPC dual strategy          | `ElectronScannerService`                                | `services/scanner/ElectronScannerService.ts`       |
| Electron single logical device `electron-hid`     | `ElectronScannerService.discoverDevices`                | `services/scanner/ElectronScannerService.ts`       |
| Camera permission request                         | `CameraScannerService.connect`                          | `services/scanner/CameraScannerService.ts`         |
| Camera device list (back/front)                   | `CameraScannerService.discoverDevices`                  | `services/scanner/CameraScannerService.ts`         |
| Four-step barcode lookup                          | `useBarcodeScanner.processBarcodeData`                  | `hooks/useBarcodeScanner.ts`                       |
| Auto-add on match, no dialog                      | `useBarcodeScanner.processBarcodeData`                  | `hooks/useBarcodeScanner.ts`                       |
| 1500 ms reset after success                       | `useBarcodeScanner.processBarcodeData`                  | `hooks/useBarcodeScanner.ts`                       |
| Scan result banner states                         | `BarcodeScannerScreen`                                  | `screens/BarcodeScannerScreen.tsx`                 |
| Connect on mount, disconnect on unmount           | `BarcodeScannerScreen` useEffect                        | `screens/BarcodeScannerScreen.tsx`                 |
| Electron forces camera → usb                      | `BarcodeScannerScreen` mount logic                      | `screens/BarcodeScannerScreen.tsx`                 |
| CameraView for camera type                        | `BarcodeScannerScreen` render                           | `screens/BarcodeScannerScreen.tsx`                 |
| Settings persisted to `keyValueRepository`        | `ScannerSettingsService`                                | `services/scanner/ScannerSettingsService.ts`       |
| `onScanSuccess` → navigate to Sale                | `BarcodeScannerScreen.onScanSuccess`                    | `screens/BarcodeScannerScreen.tsx`                 |
| `scannedProductId` param → `addToCart`            | `useSaleScreen`                                         | `hooks/useSaleScreen.ts`                           |
| Inventory scan mode — start listener              | `InventoryScreen` scan button → `ScannerServiceFactory` | `screens/InventoryScreen.tsx`                      |
| Inventory scan — match by SKU/productId → edit    | `InventoryScreen.handleInventoryScan`                   | `screens/InventoryScreen.tsx`                      |
| Inventory scan — not found alert                  | `InventoryScreen.handleInventoryScan`                   | `screens/InventoryScreen.tsx`                      |
