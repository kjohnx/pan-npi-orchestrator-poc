import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { readFileSync } from "fs";
import { seedDatabase } from "./seed";

const DB_PATH = path.join(process.cwd(), "data", "npi_orchestrator.db");
const SCHEMA_PATH = path.join(process.cwd(), "lib", "db", "schema.sql");

let db: Database.Database;

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);

  const count = (db.prepare("SELECT COUNT(*) as n FROM products").get() as { n: number }).n;
  if (count === 0) {
    seedDatabase(db);
  }

  return db;
}
