/**
 * Payment IPC Bridge (Node.js / main process)
 *
 * Stripe Terminal JS SDK runs in the renderer (it is a browser SDK).
 * This bridge handles the parts that require Node.js access — primarily
 * fetching connection tokens from a backend without exposing the Stripe
 * secret key to the renderer process.
 *
 * The renderer's ElectronPaymentService calls these handlers via IPC.
 * All functions return safe fallback values on error.
 *
 * To use:
 *   Set STRIPE_SECRET_KEY in the Electron environment (e.g. via .env or
 *   system environment variables). Never bundle the secret key in the app.
 */

const https = require('https');

/** In-memory state for the current payment session */
let currentSession = null;

/**
 * Initialise a payment session.
 * Validates that the required config is present before the renderer
 * attempts to connect to a reader.
 * @param {{ publishableKey: string, locationId: string }} config
 * @returns {Promise<boolean>}
 */
async function initPayment(config) {
  if (!config?.publishableKey || !config?.locationId) {
    console.error('[paymentBridge] initPayment: missing publishableKey or locationId');
    return false;
  }
  currentSession = { publishableKey: config.publishableKey, locationId: config.locationId };
  console.info('[paymentBridge] Payment session initialised for location:', config.locationId);
  return true;
}

/**
 * Fetch a Stripe Terminal connection token from the backend.
 * Called by the renderer's TerminalConnectionTokenProvider.
 * Requires STRIPE_SECRET_KEY in the environment.
 * @returns {Promise<{ secret: string } | null>}
 */
async function fetchConnectionToken() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[paymentBridge] STRIPE_SECRET_KEY not set — cannot fetch connection token');
    return null;
  }

  return new Promise(resolve => {
    const postData = 'expand[]=location';
    const options = {
      hostname: 'api.stripe.com',
      path: '/v1/terminal/connection_tokens',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.secret) {
            resolve({ secret: parsed.secret });
          } else {
            console.error('[paymentBridge] Unexpected response:', parsed);
            resolve(null);
          }
        } catch (err) {
          console.error('[paymentBridge] JSON parse error:', err);
          resolve(null);
        }
      });
    });

    req.on('error', err => {
      console.error('[paymentBridge] HTTPS error:', err.message);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Discover Stripe smart readers.
 * The actual discovery is done by the Stripe Terminal JS SDK in the renderer.
 * This stub returns an empty array — the renderer handles discovery directly.
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
async function discoverReaders() {
  // Stripe Terminal JS SDK discovery runs in the renderer process.
  // This IPC handler exists for future use (e.g. network-level reader discovery
  // via a backend API). Return empty array — renderer handles this.
  return [];
}

/**
 * Connect to a reader.
 * Stub — connection is managed by the Stripe Terminal JS SDK in the renderer.
 * @param {string} _readerId
 * @returns {Promise<boolean>}
 */
async function connectReader(_readerId) {
  return true;
}

/**
 * Collect a payment.
 * Stub — payment collection is managed by the Stripe Terminal JS SDK in the renderer.
 * @param {{ amount: number, currency: string, reference: string }} _request
 * @returns {Promise<{ success: boolean, errorMessage?: string }>}
 */
async function collectPayment(_request) {
  // The renderer's ElectronPaymentService uses the Stripe Terminal JS SDK
  // directly for payment collection. This IPC handler is a stub.
  return { success: false, errorMessage: 'Use Stripe Terminal JS SDK in renderer' };
}

/**
 * Cancel in-progress payment.
 * Stub — cancellation is managed by the Stripe Terminal JS SDK in the renderer.
 */
async function cancelPayment() {
  // No-op stub
}

/**
 * Disconnect from reader.
 * Stub — disconnection is managed by the Stripe Terminal JS SDK in the renderer.
 */
async function disconnectReader() {
  currentSession = null;
}

module.exports = {
  initPayment,
  fetchConnectionToken,
  discoverReaders,
  connectReader,
  collectPayment,
  cancelPayment,
  disconnectReader,
};
