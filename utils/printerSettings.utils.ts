/**
 * Pure validation logic for printer settings.
 * Extracted from usePrinterSettings so it can be unit-tested without React or RN.
 */

export enum PrinterConnectionType {
  BLUETOOTH = 'bluetooth',
  NETWORK = 'network',
  USB = 'usb',
}

export interface PrinterSettingsInput {
  printerName?: string;
  connectionType: PrinterConnectionType | string;
  macAddress?: string;
  ipAddress?: string;
  port?: number;
  vendorId?: number;
  productId?: number;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validatePrinterSettings(settings: PrinterSettingsInput): ValidationResult {
  if (!settings.printerName?.trim()) {
    return { isValid: false, error: 'Printer name is required' };
  }

  switch (settings.connectionType) {
    case PrinterConnectionType.BLUETOOTH:
      if (!settings.macAddress?.match(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)) {
        return { isValid: false, error: 'Invalid MAC address format' };
      }
      break;

    case PrinterConnectionType.NETWORK:
      if (!settings.ipAddress?.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
        return { isValid: false, error: 'Invalid IP address format' };
      }
      if (!settings.port || settings.port < 1 || settings.port > 65535) {
        return { isValid: false, error: 'Port must be between 1 and 65535' };
      }
      break;

    case PrinterConnectionType.USB:
      if (settings.vendorId === undefined || settings.productId === undefined) {
        return { isValid: false, error: 'Vendor ID and Product ID are required for USB printers' };
      }
      break;
  }

  return { isValid: true };
}
