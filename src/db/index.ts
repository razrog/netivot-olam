import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

// One SQLite file = the whole database. No managed DB service to run or pay for.
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL'); // lets the indexer write while users read
db.pragma('foreign_keys = ON');

// Schema. Core searchable fields are typed, indexed columns; `extra` holds
// free-form JSON so new metadata can be added without a migration.
db.exec(`
  CREATE TABLE IF NOT EXISTS lessons (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    storage_key  TEXT    NOT NULL UNIQUE,
    provider     TEXT    NOT NULL,
    title        TEXT    NOT NULL,
    rabbi        TEXT,
    parasha      TEXT,
    lesson_date  TEXT,
    duration     INTEGER,
    extra        TEXT    NOT NULL DEFAULT '{}',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_lessons_rabbi   ON lessons(rabbi);
  CREATE INDEX IF NOT EXISTS idx_lessons_parasha ON lessons(parasha);
  CREATE INDEX IF NOT EXISTS idx_lessons_date    ON lessons(lesson_date);

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);
