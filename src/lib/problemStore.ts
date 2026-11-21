// Server-only: question storage.
//
// Two backends, same SQL:
//  - Cloudflare D1 (over Cloudflare's HTTP API) when CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and
//    D1_DATABASE_ID are set. The app itself still runs on your server; D1 only holds the data.
//  - Otherwise a local SQLite file, data/java-prep.db (no database server needed).
//
// On first start the tables are created, and existing questions are copied in once: into D1 from the
// local SQLite file (if there is one) or data/problems.json; into SQLite from data/problems.json.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { d1Config, d1Db } from "./d1";
import type { Difficulty, Problem } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SQLITE_FILE = path.join(DATA_DIR, "java-prep.db");
const SEED_JSON = path.join(DATA_DIR, "problems.json");

export type SqlValue = string | number | null;

/** The tiny database interface both backends implement. */
export interface Db {
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
}

type Row = { seq: number; id: string; title: string; difficulty: string; tags: string; data: string };
export type ProblemSummary = { id: string; title: string; difficulty: Difficulty; tags: string[]; tests: number };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS problems (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    id         TEXT NOT NULL UNIQUE,
    title      TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    tags       TEXT NOT NULL DEFAULT '[]',
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS problems_title ON problems(title)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

// ---------- local SQLite backend ----------

async function sqliteDb(file: string): Promise<Db> {
  // Loaded lazily so the D1 setup doesn't need the native module at all.
  const { default: Database } = await import("better-sqlite3");
  mkdirSync(path.dirname(file), { recursive: true });
  const d = new Database(file);
  d.pragma("journal_mode = WAL");
  d.pragma("busy_timeout = 5000");
  return {
    async all<T>(sql: string, params: SqlValue[] = []) {
      return d.prepare(sql).all(...params) as T[];
    },
    async run(sql: string, params: SqlValue[] = []) {
      return { changes: d.prepare(sql).run(...params).changes };
    },
  };
}

// ---------- setup ----------

let ready: Promise<Db> | null = null;

function db(): Promise<Db> {
  if (!ready) {
    ready = init().catch((e) => {
      ready = null; // retry on the next request (e.g. D1 briefly unreachable)
      throw e;
    });
  }
  return ready;
}

async function init(): Promise<Db> {
  const cfg = d1Config();
  const d = cfg ? d1Db(cfg) : await sqliteDb(SQLITE_FILE);
  for (const stmt of SCHEMA) await d.run(stmt);
  const imported = await d.all("SELECT value FROM meta WHERE key = 'json_imported'");
  if (imported.length === 0) {
    const { list, from } = await initialQuestions(Boolean(cfg));
    let n = 0;
    for (const p of list) {
      n += (
        await d.run("INSERT OR IGNORE INTO problems (id, title, difficulty, tags, data) VALUES (?, ?, ?, ?, ?)", [
          p.id, p.title, p.difficulty, JSON.stringify(p.tags ?? []), JSON.stringify({ ...p, tags: p.tags ?? [] }),
        ])
      ).changes;
    }
    await d.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('json_imported', ?)", [new Date().toISOString()]);
    if (n) console.log(`[java-prep] Imported ${n} questions from ${from} into ${cfg ? "Cloudflare D1" : SQLITE_FILE}`);
  }
  console.log(`[java-prep] Storage: ${cfg ? `Cloudflare D1 (database ${cfg.databaseId})` : `SQLite file ${SQLITE_FILE}`}`);
  return d;
}

/** Questions to copy into a brand-new database. */
async function initialQuestions(toD1: boolean): Promise<{ list: Problem[]; from: string }> {
  if (toD1 && existsSync(SQLITE_FILE)) {
    const local = await sqliteDb(SQLITE_FILE);
    const rows = await local.all<Row>("SELECT * FROM problems ORDER BY seq").catch(() => [] as Row[]);
    if (rows.length) return { list: rows.map(toProblem), from: SQLITE_FILE };
  }
  if (existsSync(SEED_JSON)) return { list: JSON.parse(readFileSync(SEED_JSON, "utf8")) as Problem[], from: SEED_JSON };
  return { list: [], from: "" };
}

const toProblem = (r: Row): Problem => ({ ...(JSON.parse(r.data) as Problem), id: r.id });

// ---------- queries ----------

export async function listProblems(): Promise<Problem[]> {
  return (await (await db()).all<Row>("SELECT * FROM problems ORDER BY seq")).map(toProblem);
}

/** Lightweight list for the questions page (no descriptions or test cases). */
export async function listSummaries(): Promise<ProblemSummary[]> {
  const rows = await (await db()).all<{ id: string; title: string; difficulty: Difficulty; tags: string; tests: number }>(
    "SELECT id, title, difficulty, tags, json_array_length(data, '$.testCases') AS tests FROM problems ORDER BY seq",
  );
  return rows.map((r) => ({ ...r, tags: JSON.parse(r.tags) as string[] }));
}

export async function getProblem(id: string) {
  const [r] = await (await db()).all<Row>("SELECT * FROM problems WHERE id = ?", [id]);
  return r ? toProblem(r) : null;
}

/** Every tag in use, most common first. */
export async function allTags(): Promise<string[]> {
  const rows = await (await db()).all<{ tag: string }>(
    "SELECT j.value AS tag, COUNT(*) AS n FROM problems, json_each(problems.tags) AS j GROUP BY j.value ORDER BY n DESC, tag",
  );
  return rows.map((r) => r.tag);
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "question";
}

export async function createProblem(p: Omit<Problem, "id">) {
  const d = await db();
  const base = slug(p.title);
  const taken = new Set(
    (await d.all<{ id: string }>("SELECT id FROM problems WHERE id = ? OR id LIKE ?", [base, `${base}-%`])).map((r) => r.id),
  );
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  const created: Problem = { ...p, id };
  await d.run("INSERT INTO problems (id, title, difficulty, tags, data) VALUES (?, ?, ?, ?, ?)", [
    id, p.title, p.difficulty, JSON.stringify(p.tags ?? []), JSON.stringify(created),
  ]);
  return created;
}

export async function updateProblem(id: string, p: Omit<Problem, "id">) {
  const updated: Problem = { ...p, id };
  const res = await (await db()).run(
    "UPDATE problems SET title = ?, difficulty = ?, tags = ?, data = ?, updated_at = datetime('now') WHERE id = ?",
    [p.title, p.difficulty, JSON.stringify(p.tags ?? []), JSON.stringify(updated), id],
  );
  return res.changes ? updated : null;
}

export async function deleteProblem(id: string) {
  return (await (await db()).run("DELETE FROM problems WHERE id = ?", [id])).changes > 0;
}
