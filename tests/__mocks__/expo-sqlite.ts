/**
 * Mock for expo-sqlite module
 * Used in Jest tests to avoid native module dependencies
 */

export interface SQLiteDatabase {
  execAsync: jest.Mock;
  runAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  getAllAsync: jest.Mock;
  closeAsync: jest.Mock;
  withTransactionAsync: jest.Mock;
}

const mockDatabase: SQLiteDatabase = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
  getFirstAsync: jest.fn().mockResolvedValue({ user_version: 0 }), // Return proper PRAGMA result
  getAllAsync: jest.fn().mockResolvedValue([]),
  closeAsync: jest.fn().mockResolvedValue(undefined),
  withTransactionAsync: jest.fn(async (callback: (txn: SQLiteDatabase) => Promise<void>) => {
    // Execute the callback with the mock database as the transaction object
    await callback(mockDatabase);
  }),
};

export function openDatabaseSync(_name: string): SQLiteDatabase {
  return mockDatabase;
}

export function openDatabaseAsync(_name: string): Promise<SQLiteDatabase> {
  return Promise.resolve(mockDatabase);
}

export default {
  openDatabaseSync,
  openDatabaseAsync,
};
