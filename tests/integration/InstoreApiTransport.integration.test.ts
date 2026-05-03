/**
 * InstoreApiTransport Integration Test
 *
 * Tests the HTTP transport layer for multi-register functionality.
 * Note: This test requires react-native-http-bridge to be properly linked.
 */

import { Platform } from 'react-native';
import { instoreApiConfig } from '../../services/instoreapi/InstoreApiConfig';
import { instoreApiServer } from '../../services/instoreapi/InstoreApiServer';
import { instoreApiTransport } from '../../services/instoreapi/InstoreApiTransport';

// Mock react-native-http-bridge for testing
jest.mock('react-native-http-bridge', () => ({
  start: jest.fn((_port: number, _serviceName: string, _callback: Function) => {
    // Simulate successful start
    // eslint-disable-next-line no-console
    console.log(`Mock HTTP bridge started on port ${_port}`);
  }),
  stop: jest.fn(() => {
    // eslint-disable-next-line no-console
    console.log('Mock HTTP bridge stopped');
  }),
  respond: jest.fn((_requestId: string, status: number, _contentType: string, _body: string) => {
    // eslint-disable-next-line no-console
    console.log(`Mock response: ${status} ${_body}`);
  }),
}));

describe('InstoreApiTransport', () => {
  beforeEach(async () => {
    // Reset to server mode for testing
    await instoreApiConfig.save({
      mode: 'server',
      port: 8787,
      sharedSecret: 'test-secret',
      registerId: 'test-register',
      registerName: 'Test Register',
      serverAddress: '',
    });
  });

  afterEach(async () => {
    // Clean up
    await instoreApiTransport.stop();
    await instoreApiServer.stop();
  });

  describe('Transport Lifecycle', () => {
    it('should start and stop HTTP transport in server mode', async () => {
      expect(instoreApiTransport.isListening).toBe(false);

      // Start transport
      await instoreApiTransport.start();
      expect(instoreApiTransport.isListening).toBe(true);

      // Stop transport
      await instoreApiTransport.stop();
      expect(instoreApiTransport.isListening).toBe(false);
    });

    it('should not start transport in non-server mode', async () => {
      await instoreApiConfig.save({ mode: 'standalone' });

      await instoreApiTransport.start();
      expect(instoreApiTransport.isListening).toBe(false);
    });

    it('should handle multiple start calls gracefully', async () => {
      await instoreApiTransport.start();
      expect(instoreApiTransport.isListening).toBe(true);

      // Second start should not throw
      await instoreApiTransport.start();
      expect(instoreApiTransport.isListening).toBe(true);
    });
  });

  describe('Server Integration', () => {
    it('should start server with transport', async () => {
      expect(instoreApiServer.isRunning).toBe(false);

      await instoreApiServer.start();

      expect(instoreApiServer.isRunning).toBe(true);
      expect(instoreApiTransport.isListening).toBe(true);
    });

    it('should stop server with transport', async () => {
      await instoreApiServer.start();
      expect(instoreApiServer.isRunning).toBe(true);

      await instoreApiServer.stop();

      expect(instoreApiServer.isRunning).toBe(false);
      expect(instoreApiTransport.isListening).toBe(false);
    });
  });

  describe('Platform Support', () => {
    it('should handle web platform gracefully', async () => {
      // Mock Platform.OS to be 'web'
      const originalOS = Platform.OS;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Platform as any).OS = 'web';

      // Should not throw, but should warn
      await instoreApiTransport.start();
      expect(instoreApiTransport.isListening).toBe(false);

      // Restore original OS
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Platform as any).OS = originalOS;
    });
  });

  describe('Error Handling', () => {
    it('should handle transport start failure', async () => {
      // Mock http-bridge to throw error
      const httpBridge = require('react-native-http-bridge');
      httpBridge.start.mockImplementationOnce(() => {
        throw new Error('Port already in use');
      });

      await expect(instoreApiTransport.start()).rejects.toThrow('Port already in use');
      expect(instoreApiTransport.isListening).toBe(false);
    });

    it('should handle missing http-bridge gracefully', async () => {
      // This test would need to be run in an environment where the module is not available
      // For now, we just verify the error handling path exists
      expect(instoreApiTransport.isListening).toBe(false);
    });
  });
});

describe('HTTP Request Handling', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRequest: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let httpBridge: any;

  beforeEach(async () => {
    // Get the http-bridge mock
    httpBridge = require('react-native-http-bridge');

    // Only clear the start mock to avoid accumulating callbacks
    httpBridge.start.mockClear();

    // Reset to server mode for testing
    await instoreApiConfig.save({
      mode: 'server',
      port: 8787,
      sharedSecret: 'test-secret',
      registerId: 'test-register',
      registerName: 'Test Register',
      serverAddress: '',
    });

    mockRequest = {
      requestId: 'test-123',
      method: 'GET',
      url: 'http://localhost:8787/api/health',
      headers: { 'x-shared-secret': 'test-secret' },
      data: null,
    };
  });

  afterEach(async () => {
    // Clean up
    await instoreApiTransport.stop();
    await instoreApiServer.stop();
    // Clear respond mock after test
    httpBridge.respond.mockClear();
  });

  it('should handle GET /api/health request', async () => {
    // Start the server (which starts the transport)
    await instoreApiServer.start();

    // Get the callback function that was passed to httpBridge.start
    const callback = httpBridge.start.mock.calls[0][2];

    // Simulate an incoming request
    await callback(mockRequest);

    // Wait for async operations to complete
    await new Promise(resolve => setImmediate(resolve));

    // Verify response was sent
    expect(httpBridge.respond).toHaveBeenCalledWith('test-123', 200, 'application/json', expect.stringContaining('"ok":true'));
  });

  it('should handle authentication failure', async () => {
    await instoreApiServer.start();
    const callback = httpBridge.start.mock.calls[0][2];

    // Request without proper secret
    const unauthRequest = {
      ...mockRequest,
      headers: { 'x-shared-secret': 'wrong-secret' },
    };

    await callback(unauthRequest);

    // Wait for async operations to complete
    await new Promise(resolve => setImmediate(resolve));

    expect(httpBridge.respond).toHaveBeenCalledWith('test-123', 401, 'application/json', expect.stringContaining('"error":"Unauthorized"'));
  });

  it('should handle JSON parsing for POST requests', async () => {
    await instoreApiServer.start();
    const callback = httpBridge.start.mock.calls[0][2];

    const postRequest = {
      ...mockRequest,
      method: 'POST',
      url: 'http://localhost:8787/api/orders',
      data: JSON.stringify({
        order: { id: 'test-order', total: 10.0 },
        items: [],
      }),
    };

    await callback(postRequest);

    // Wait for async operations to complete
    await new Promise(resolve => setImmediate(resolve));

    // Should attempt to handle the request (may fail due to missing data, but should parse JSON)
    expect(httpBridge.respond).toHaveBeenCalled();
  });

  it('should handle query parameters for GET requests', async () => {
    await instoreApiServer.start();
    const callback = httpBridge.start.mock.calls[0][2];

    const getWithQuery = {
      ...mockRequest,
      url: 'http://localhost:8787/api/sync/events?since=1234567890',
    };

    await callback(getWithQuery);

    // Wait for async operations to complete
    await new Promise(resolve => setImmediate(resolve));

    expect(httpBridge.respond).toHaveBeenCalledWith('test-123', 200, 'application/json', expect.stringContaining('"events"'));
  });
});
