/**
 * Printer & Cash Drawer IPC Bridge (Node.js / main process)
 *
 * Handles raw ESC/POS data delivery to network, USB, and Bluetooth printers,
 * and cash drawer kick commands. All functions are async and return safe
 * fallback values on error so the renderer never receives an unhandled
 * rejection from an IPC call.
 *
 * Connection types:
 *   network   — TCP socket to printer IP:port (default 9100)
 *   usb       — USB raw write via node-usb (vendorId + productId)
 *   bluetooth — Serial-over-Bluetooth via serialport (macAddress)
 *
 * Dependencies (install as needed):
 *   npm install net          (built-in Node.js — no install needed)
 *   npm install usb          (for USB printers)
 *   npm install serialport   (for Bluetooth printers)
 */

const net = require('net');

/**
 * Send raw ESC/POS bytes (base64-encoded) to a printer.
 * @param {string} base64Data
 * @param {{ connectionType: string, host?: string, port?: number, vendorId?: string, productId?: string, macAddress?: string }} config
 * @returns {Promise<boolean>}
 */
async function sendRawData(base64Data, config) {
  const buffer = Buffer.from(base64Data, 'base64');

  switch (config.connectionType) {
    case 'network':
      return sendOverNetwork(buffer, config.host, config.port ?? 9100);

    case 'usb':
      return sendOverUsb(buffer, config.vendorId, config.productId);

    case 'bluetooth':
      return sendOverBluetooth(buffer, config.macAddress);

    default:
      console.warn('[printerBridge] Unknown connectionType:', config.connectionType);
      return false;
  }
}

/**
 * Discover printers on the local network via mDNS (_pdl-datastream._tcp).
 * Falls back to an empty array if mDNS is unavailable.
 * @returns {Promise<Array<{ id: string, name: string, connectionType: string }>>}
 */
async function discoverPrinters() {
  // mDNS discovery requires the 'mdns' or 'bonjour' package.
  // Return empty array until the package is installed — the UI handles this
  // gracefully by showing a "No printers found" message.
  try {
    const { discoverMdnsPrinters } = require('./mdnsDiscovery');
    return await discoverMdnsPrinters();
  } catch {
    return [];
  }
}

/**
 * Get printer status (online + paper).
 * @param {{ connectionType: string, host?: string, port?: number }} config
 * @returns {Promise<{ isOnline: boolean, hasPaper: boolean }>}
 */
async function getPrinterStatus(config) {
  if (config.connectionType === 'network' && config.host) {
    const reachable = await isHostReachable(config.host, config.port ?? 9100);
    return { isOnline: reachable, hasPaper: true }; // paper status requires DLE ENQ query
  }
  return { isOnline: false, hasPaper: false };
}

/**
 * Open cash drawer via ESC/POS pin kick command.
 * @param {{ connectionType: string, host?: string, port?: number }} config
 * @param {2 | 5} pin  — drawer pin (2 or 5)
 * @returns {Promise<boolean>}
 */
async function openDrawer(config, pin = 2) {
  // ESC/POS cash drawer kick: ESC p <pin> <t1> <t2>
  const pinByte = pin === 5 ? 0x05 : 0x00;
  const kickCmd = Buffer.from([0x1b, 0x70, pinByte, 0x19, 0xfa]);
  return sendRawData(kickCmd.toString('base64'), config);
}

/**
 * Query drawer sensor status. Most printers don't support this — returns
 * undefined when unsupported so the UI can hide the sensor indicator.
 * @returns {Promise<boolean | undefined>}
 */
async function isDrawerOpen(_config) {
  // DLE EOT status query is printer-model-specific.
  // Return undefined (unsupported) until a specific model is targeted.
  return undefined;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function sendOverNetwork(buffer, host, port) {
  return new Promise(resolve => {
    if (!host) {
      resolve(false);
      return;
    }

    const socket = new net.Socket();
    const timeout = 5000;

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      socket.write(buffer, () => {
        socket.destroy();
        resolve(true);
      });
    });

    socket.on('error', err => {
      console.error('[printerBridge] Network error:', err.message);
      socket.destroy();
      resolve(false);
    });

    socket.on('timeout', () => {
      console.warn('[printerBridge] Network timeout');
      socket.destroy();
      resolve(false);
    });
  });
}

function sendOverUsb(buffer, vendorId, productId) {
  try {
    const usb = require('usb');
    const device = usb.findByIds(parseInt(vendorId, 16), parseInt(productId, 16));
    if (!device) {
      return Promise.resolve(false);
    }

    return new Promise(resolve => {
      device.open();
      const iface = device.interfaces[0];
      iface.claim();
      const endpoint = iface.endpoints.find(e => e.direction === 'out');
      if (!endpoint) {
        device.close();
        resolve(false);
        return;
      }

      endpoint.transfer(buffer, err => {
        iface.release(() => device.close());
        resolve(!err);
      });
    });
  } catch (err) {
    console.error('[printerBridge] USB error:', err.message);
    return Promise.resolve(false);
  }
}

function sendOverBluetooth(buffer, macAddress) {
  try {
    const { SerialPort } = require('serialport');
    return new Promise(resolve => {
      const port = new SerialPort({ path: macAddress, baudRate: 9600 });
      port.write(buffer, err => {
        port.close();
        resolve(!err);
      });
      port.on('error', err => {
        console.error('[printerBridge] Bluetooth error:', err.message);
        resolve(false);
      });
    });
  } catch (err) {
    console.error('[printerBridge] Bluetooth unavailable:', err.message);
    return Promise.resolve(false);
  }
}

function isHostReachable(host, port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.connect(port, host, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

module.exports = { sendRawData, discoverPrinters, getPrinterStatus, openDrawer, isDrawerOpen };
