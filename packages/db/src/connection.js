import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { ensureDir, protectPath } from "@bullpay/common";
import { SCHEMA } from "./schema.js";

/**
 * @param {string} filePath
 */
export function openDatabase(filePath) {
  const memory = filePath === ":memory:";
  if (!memory) {
    ensureDir(dirname(filePath), 0o700);
  }
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  if (!memory) protectPath(filePath, 0o600);
  return db;
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function migrate(db) {
  db.exec(SCHEMA);
}

/**
 * @template T
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {() => T} fn
 * @returns {T}
 */
export function withImmediateTransaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The statement may already have ended the transaction.
    }
    throw error;
  }
}
