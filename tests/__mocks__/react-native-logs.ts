/**
 * Mock for react-native-logs module
 * Uses synchronous logging to prevent "Cannot log after tests are done" warnings
 */

// Synchronous console transport for tests
export const consoleTransport = () => {
  // Return a no-op function to suppress all log output in tests
  return () => {
    // Silent in tests
  };
};

// Mock logger factory
export const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createLogger: (_config?: any) => {
    // Return a mock logger with all methods as no-ops
    return {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      setSeverity: () => {},
    };
  },
};

export default {
  logger,
  consoleTransport,
};
