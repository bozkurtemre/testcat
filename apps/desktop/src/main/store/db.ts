import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { runMigrations } from "./migrate";
import { ensureDatabaseDirectory, resolveDatabasePath } from "./path";
import * as schema from "./schema";

export type TestcatDatabase = BetterSQLite3Database<typeof schema>;

export interface StoreDatabase {
  db: TestcatDatabase;
  path: string;
  sqlite: Database.Database;
}

let defaultDatabase: StoreDatabase | null = null;

export function openStoreDatabase(path = resolveDatabasePath()): StoreDatabase {
  const databasePath = ensureDatabaseDirectory(path);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  runMigrations(sqlite);
  return {
    db: drizzle(sqlite, { schema }),
    path: databasePath,
    sqlite,
  };
}

export function getStoreDatabase(): StoreDatabase {
  defaultDatabase ??= openStoreDatabase();
  return defaultDatabase;
}
