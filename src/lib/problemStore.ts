// Server-only: questions are stored in a SQLite database file (data/java-prep.db by default).
// No database server is needed; the whole database is that one file.
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Difficulty, Problem } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "java-prep.db");
/** Questions from this file are imported once, the first time the database is created. */
const LEGACY_JSON = path.join(DATA_DIR, "problems.json");

type Row = { seq: number; id: string; title: string; difficulty: string; tags: string; data: string };

export type ProblemSummary = { id: string; title: string; difficulty: Difficulty; tags: string[]; tests: number };

let db: Database.Database | null = null;

function open(): Database.Database {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  const d = new Database(DB_FILE);
  d.pragma("journal_mode = WAL");
  d.pragma("busy_timeout = 5000");
  d.exec(`
    CREATE TABLE IF NOT EXISTS problems (
      seq        INTEGER PRIMARY KEY AUTOINCREMENT,
      id         TEXT NOT NULL UNIQUE,
      title      TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      tags       TEXT NOT NULL DEFAULT '[]',  -- JSON array
      data       TEXT NOT NULL,               -- the full question as JSON (description, signature, test cases)
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS problems_title ON problems(title);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  importLegacyJson(d);
  db = d;
  return d;
}

function importLegacyJson(d: Database.Database) {
  const done = d.prepare("SELECT value FROM meta WHERE key = 'json_imported'").get();
  if (done) return;
  let imported = 0;
  if (existsSync(LEGACY_JSON)) {
    const list = JSON.parse(readFileSync(LEGACY_JSON, "utf8")) as Problem[];
    const insert = d.prepare("INSERT OR IGNORE INTO problems (id, title, difficulty, tags, data) VALUES (?, ?, ?, ?, ?)");
    d.transaction(() => {
      for (const p of list) imported += insert.run(p.id, p.title, p.difficulty, JSON.stringify(p.tags ?? []), JSON.stringify({ ...p, tags: p.tags ?? [] })).changes;
    })();
  }
  d.prepare("INSERT INTO meta (key, value) VALUES ('json_imported', ?)").run(new Date().toISOString());
  if (imported) console.log(`[java-prep] Imported ${imported} questions from ${LEGACY_JSON} into ${DB_FILE}`);
}

const toProblem = (r: Row): Problem => ({ ...(JSON.parse(r.data) as Problem), id: r.id });

export async function listProblems(): Promise<Problem[]> {
  return (open().prepare("SELECT * FROM problems ORDER BY seq").all() as Row[]).map(toProblem);
}

/** Lightweight list for the questions page (no descriptions or test cases). */
export async function listSummaries(): Promise<ProblemSummary[]> {
  const rows = open()
    .prepare("SELECT id, title, difficulty, tags, json_array_length(data, '$.testCases') AS tests FROM problems ORDER BY seq")
    .all() as { id: string; title: string; difficulty: Difficulty; tags: string; tests: number }[];
  return rows.map((r) => ({ ...r, tags: JSON.parse(r.tags) as string[] }));
}

export async function getProblem(id: string) {
  const r = open().prepare("SELECT * FROM problems WHERE id = ?").get(id) as Row | undefined;
  return r ? toProblem(r) : null;
}

/** Every tag in use, most common first. */
export async function allTags(): Promise<string[]> {
  const rows = open()
    .prepare("SELECT j.value AS tag, COUNT(*) AS n FROM problems, json_each(problems.tags) AS j GROUP BY j.value ORDER BY n DESC, tag")
    .all() as { tag: string }[];
  return rows.map((r) => r.tag);
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "question";
}

export async function createProblem(p: Omit<Problem, "id">) {
  const d = open();
  const exists = d.prepare("SELECT 1 FROM problems WHERE id = ?");
  let id = slug(p.title);
  for (let n = 2; exists.get(id); n++) id = `${slug(p.title)}-${n}`;
  const created: Problem = { ...p, id };
  d.prepare("INSERT INTO problems (id, title, difficulty, tags, data) VALUES (?, ?, ?, ?, ?)").run(
    id, p.title, p.difficulty, JSON.stringify(p.tags ?? []), JSON.stringify(created),
  );
  return created;
}

export async function updateProblem(id: string, p: Omit<Problem, "id">) {
  const updated: Problem = { ...p, id };
  const res = open()
    .prepare("UPDATE problems SET title = ?, difficulty = ?, tags = ?, data = ?, updated_at = datetime('now') WHERE id = ?")
    .run(p.title, p.difficulty, JSON.stringify(p.tags ?? []), JSON.stringify(updated), id);
  return res.changes ? updated : null;
}

export async function deleteProblem(id: string) {
  return open().prepare("DELETE FROM problems WHERE id = ?").run(id).changes > 0;
}
