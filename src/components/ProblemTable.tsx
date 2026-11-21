"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Row = { id: string; title: string; difficulty: string; tags: string[]; tests: number };

export default function ProblemTable({ problems, initialTags = [] }: { problems: Row[]; initialTags?: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [diff, setDiff] = useState("All");
  const [tags, setTags] = useState<string[]>(initialTags);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of problems) for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [problems]);
  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    return problems.filter(
      (p) =>
        (p.title.toLowerCase().includes(needle) || p.tags.some((t) => t.includes(needle))) &&
        (diff === "All" || p.difficulty === diff) &&
        tags.every((t) => p.tags.includes(t)),
    );
  }, [problems, q, diff, tags]);
  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  async function remove(p: Row) {
    if (!window.confirm(`Delete "${p.title}"? This can't be undone.`)) return;
    const res = await fetch(`/api/problems/${p.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  if (problems.length === 0) {
    return (
      <div className="rounded-lg border p-10 text-center" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
        <p className="mb-4">No questions yet.</p>
        <Link href="/problems/new" className="btn btn-accent">+ Add your first question</Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-2 mb-3">
        <input className="input" placeholder="Search questions" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ width: "9rem" }} value={diff} onChange={(e) => setDiff(e.target.value)}>
          {["All", "Easy", "Medium", "Hard"].map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>
      {tagCounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 items-center">
          {tagCounts.map(([t, n]) => (
            <button key={t} type="button" onClick={() => toggleTag(t)} className={`tag-chip ${tags.includes(t) ? "tag-chip-active" : "tag-chip-ghost"}`}>
              {t} <span className="ml-1 opacity-60">{n}</span>
            </button>
          ))}
          {tags.length > 0 && (
            <button type="button" className="text-xs ml-1 underline" style={{ color: "var(--muted)" }} onClick={() => setTags([])}>clear</button>
          )}
        </div>
      )}
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
        {rows.map((p, i) => (
          <div key={p.id} className="group flex items-center gap-3 px-4 py-2.5 text-sm" style={{ background: i % 2 ? "var(--bg)" : "var(--panel)" }}>
            <span className="w-6 text-right" style={{ color: "var(--muted)" }}>{problems.indexOf(p) + 1}.</span>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <Link href={`/problems/${p.id}`} className="truncate hover:underline" style={{ textDecorationColor: "var(--accent)" }}>{p.title}</Link>
              <span className="flex gap-1 shrink-0">
                {p.tags.slice(0, 4).map((t) => (
                  <button key={t} type="button" onClick={() => toggleTag(t)} className={`tag-chip ${tags.includes(t) ? "tag-chip-active" : ""}`}>{t}</button>
                ))}
                {p.tags.length > 4 && <span className="text-xs" style={{ color: "var(--muted)" }}>+{p.tags.length - 4}</span>}
              </span>
            </div>
            <span className={`w-16 ${p.difficulty.toLowerCase()}`}>{p.difficulty}</span>
            <span className="w-16 text-xs" style={{ color: "var(--muted)" }}>{p.tests} test{p.tests === 1 ? "" : "s"}</span>
            <span className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
              <Link href={`/problems/${p.id}/edit`} className="btn btn-ghost !py-1 !px-2 text-xs">Edit</Link>
              <button onClick={() => remove(p)} className="btn btn-ghost btn-danger !py-1 !px-2 text-xs">Delete</button>
            </span>
          </div>
        ))}
        {rows.length === 0 && <div className="px-4 py-6 text-sm text-center" style={{ color: "var(--muted)" }}>No matches.</div>}
      </div>
    </>
  );
}
