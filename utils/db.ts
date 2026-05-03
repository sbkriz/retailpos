import * as SQLite from 'expo-sqlite';
import { initializeSchema } from './dbSchema';

const db = SQLite.openDatabaseSync('retailPOS.db');

// Only initialize schema in non-test environments
// Tests should mock the database and not trigger real schema initialization
if (process.env.NODE_ENV !== 'test') {
  initializeSchema(db);
}

export { db };
