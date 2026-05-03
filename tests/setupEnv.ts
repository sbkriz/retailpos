/**
 * Jest environment setup
 * Runs BEFORE the test environment is created
 * This is the earliest point where we can set environment variables
 */

// Set NODE_ENV to test BEFORE any modules are loaded
process.env.NODE_ENV = 'test';
