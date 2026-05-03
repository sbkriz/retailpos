/**
 * Jest setup file
 * Runs before all tests to configure the test environment
 */

// Set NODE_ENV to test to prevent database schema initialization
process.env.NODE_ENV = 'test';

// Suppress async logging warnings by filtering console.error
// eslint-disable-next-line no-console
const originalError = console.error;

// eslint-disable-next-line no-console
console.error = (...args: unknown[]) => {
  const message = args[0];

  // Suppress the specific "Cannot log after tests are done" warnings
  if (typeof message === 'string' && message.includes('Cannot log after tests are done')) {
    return;
  }

  // Allow all other errors through
  originalError(...args);
};
