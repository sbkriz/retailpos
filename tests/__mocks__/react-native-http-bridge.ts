/**
 * Mock for react-native-http-bridge module
 * Used in Jest tests to avoid native module dependencies
 */

export const start = jest.fn((_port: number, _serviceName: string, _callback: Function) => {
  // Simulate successful start
});

export const stop = jest.fn(() => {
  // Simulate successful stop
});

export const respond = jest.fn((_requestId: string, _status: number, _contentType: string, _body: string) => {
  // Simulate successful response
});

export default {
  start,
  stop,
  respond,
};
