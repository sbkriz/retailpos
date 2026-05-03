/**
 * Mock for uuid module
 * Used in Jest tests to avoid ES module issues
 */

let counter = 0;

export function v4(): string {
  return `mock-uuid-${++counter}`;
}

export function v1(): string {
  return `mock-uuid-v1-${++counter}`;
}

export function v3(): string {
  return `mock-uuid-v3-${++counter}`;
}

export function v5(): string {
  return `mock-uuid-v5-${++counter}`;
}

export default {
  v4,
  v1,
  v3,
  v5,
};
