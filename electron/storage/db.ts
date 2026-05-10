import Database from "better-sqlite3";
import migrationSql from "./migrations/001_initial.sql?raw";

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(migrationSql);
  return db;
}
