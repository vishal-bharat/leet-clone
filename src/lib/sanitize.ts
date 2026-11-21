import type { CompareMode, Difficulty, Problem } from "./types";

/** Lowercases, trims and de-duplicates tags. Accepts an array or a comma-separated string. */
export function normalizeTags(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 15);
}

/** Picks only known fields from a request body. */
export function toProblemInput(b: Record<string, unknown>): Omit<Problem, "id"> {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const diff = (["Easy", "Medium", "Hard"] as Difficulty[]).includes(b.difficulty as Difficulty) ? (b.difficulty as Difficulty) : "Easy";
  const cmp = (["exact", "anyOrder", "anyOrderNested"] as CompareMode[]).includes(b.compare as CompareMode) ? (b.compare as CompareMode) : "exact";
  const params = Array.isArray(b.params) ? b.params : [];
  const tcs = Array.isArray(b.testCases) ? b.testCases : [];
  return {
    title: str(b.title).trim(),
    difficulty: diff,
    tags: normalizeTags(b.tags),
    description: str(b.description),
    functionName: str(b.functionName).trim(),
    returnType: str(b.returnType).trim(),
    compare: cmp,
    params: params.map((p: Record<string, unknown>) => ({ name: str(p?.name).trim(), type: str(p?.type).trim() })),
    testCases: tcs.map((t: Record<string, unknown>) => ({
      args: Array.isArray(t?.args) ? (t.args as unknown[]).map((a) => str(a).trim()) : [],
      expected: str(t?.expected).trim(),
    })),
  };
}
