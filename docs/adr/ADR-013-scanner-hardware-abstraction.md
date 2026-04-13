# ADR-013: Scanner Hardware Abstraction — Four Types, One Interface

**Date**: 2025-01-01  
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

Different retail environments use different scanner hardware: camera on mobile devices, USB HID on desktop, Bluetooth BLE, and dedicated QR hardware. The barcode lookup pipeline should not need to know which scanner type is active.

## Decision

All scanner types implement `ScannerServiceInterface`. `ScannerServiceFactory` selects the implementation based on the `USE_MOCK_SCANNER` environment variable and `isElectron()`.

- USB and dedicated QR hardware scanners use DOM `keydown` HID emulation with an 80ms inter-keystroke threshold, 3-character minimum, and Enter as the terminator.
- Bluetooth uses `react-native-ble-plx` with configurable GATT UUIDs.
- Camera uses `expo-camera`.
- On Electron, camera and Bluetooth fall back to mock implementations.

## Consequences

The barcode lookup pipeline (`useBarcodeScanner`) is scanner-type agnostic. Adding a new scanner type means adding one service class and registering it in the factory. The 80ms HID threshold reliably distinguishes scanner bursts from human keyboard input. Electron fallbacks ensure the desktop build works without mobile hardware.
