"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { COMMON_TYPES, starterCode, validateProblem } from "@/lib/javaTypes";
import TagInput from "./TagInput";
import type { CompareMode, Difficulty, Param, Problem, TestCase } from "@/lib/types";

type Draft = Omit<Problem, "id">;

const EMPTY: Draft = {
  title: "",
  difficulty: "Easy",
  tags: [],
  description: "",
  functionName: "",
  returnType: "int",
  params: [{ name: "nums", type: "int[]" }],
  compare: "exact",
  testCases: [
    { args: [""], expected: "" },
    { args: [""], expected: "" },
    { args: [""], expected: "" },
  ],
};

const label = "block text-xs font-medium mb-1 uppercase tracking-wide";
const card = "rounded-lg border p-4 mb-4";
const cardStyle = { borderColor: "var(--border)", background: "var(--panel)" };

export default function ProblemForm({ initial, knownTags = [] }: { initial?: Problem; knownTags?: string[] }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial ? { ...initial, tags: initial.tags ?? [] } : EMPTY);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const preview = useMemo(() => {
    try {
      return d.functionName ? starterCode(d) : "";
    } catch (e) {
      return `// ${(e as Error).message}`;
    }
  }, [d]);

  function setParam(i: number, patch: Partial<Param>) {
    set("params", d.params.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function addParam() {
    setD((x) => ({ ...x, params: [...x.params, { name: "", type: "int" }], testCases: x.testCases.map((t) => ({ ...t, args: [...t.args, ""] })) }));
  }
  function removeParam(i: number) {
    setD((x) => ({
      ...x,
      params: x.params.filter((_, j) => j !== i),
      testCases: x.testCases.map((t) => ({ ...t, args: t.args.filter((_, j) => j !== i) })),
    }));
  }
  function setCase(i: number, patch: Partial<TestCase>) {
    set("testCases", d.testCases.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }
  function setArg(i: number, k: number, v: string) {
    setCase(i, { args: d.testCases[i].args.map((a, j) => (j === k ? v : a)) });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateProblem(d);
    setErrors(errs);
    if (errs.length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(initial ? `/api/problems/${initial.id}` : "/api/problems", {
        method: initial ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(d),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrors(body.errors ?? [body.error ?? "Save failed"]);
        return;
      }
      router.push(`/problems/${body.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const retForExpected = d.returnType.trim() === "void" ? `${d.params[0]?.name || "first argument"} after the call` : d.returnType;

  return (
    <form onSubmit={submit} className="w-full max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">{initial ? "Edit question" : "Add a question"}</h1>

      {errors.length > 0 && (
        <div className="rounded-lg border p-3 mb-4 text-sm" style={{ borderColor: "var(--red)", background: "#3a1f1f" }}>
          <ul className="list-disc pl-5 space-y-0.5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <section className={card} style={cardStyle}>
        <div className="grid grid-cols-[1fr_9rem] gap-3 mb-3">
          <div>
            <label className={label}>Title</label>
            <input className="input" value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Two Sum" />
          </div>
          <div>
            <label className={label}>Difficulty</label>
            <select className="input" value={d.difficulty} onChange={(e) => set("difficulty", e.target.value as Difficulty)}>
              <option>Easy</option><option>Medium</option><option>Hard</option>
            </select>
          </div>
        </div>
        <div className="mb-3">
          <label className={label}>Tags</label>
          <TagInput value={d.tags ?? []} onChange={(t) => set("tags", t)} suggestions={knownTags} />
        </div>
        <label className={label}>Description (Markdown)</label>
        <textarea
          className="input mono"
          rows={10}
          value={d.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder={"Given an array of integers `nums` and an integer `target`...\n\n**Example**\n\n```\nInput:  nums = [2,7,11,15], target = 9\nOutput: [0,1]\n```"}
        />
      </section>

      <section className={card} style={cardStyle}>
        <h2 className="font-semibold mb-3">Method signature</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={label}>Method name</label>
            <input className="input mono" value={d.functionName} onChange={(e) => set("functionName", e.target.value)} placeholder="twoSum" />
          </div>
          <div>
            <label className={label}>Return type</label>
            <input className="input mono" list="java-types-ret" value={d.returnType} onChange={(e) => set("returnType", e.target.value)} />
          </div>
        </div>
        <label className={label}>Parameters</label>
        {d.params.map((p, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input className="input mono" list="java-types" value={p.type} onChange={(e) => setParam(i, { type: e.target.value })} placeholder="int[]" />
            <input className="input mono" value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} placeholder="nums" />
            <button type="button" className="btn btn-ghost btn-danger" onClick={() => removeParam(i)} aria-label="Remove parameter">✕</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost text-xs" onClick={addParam}>+ Add parameter</button>

        <div className="mt-4">
          <label className={label}>Answer comparison</label>
          <select className="input" value={d.compare} onChange={(e) => set("compare", e.target.value as CompareMode)}>
            <option value="exact">Exact match</option>
            <option value="anyOrder">Any order (top-level list)</option>
            <option value="anyOrderNested">Any order (every nested list too)</option>
          </select>
        </div>

        <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
          Types: int, long, double, boolean, char, String, ListNode, TreeNode, arrays like int[][] and lists like List&lt;List&lt;Integer&gt;&gt;.
          Use void for in-place problems; the first parameter is then checked after the call.
        </p>
        {preview && (
          <pre className="mono text-xs mt-3 p-3 rounded overflow-x-auto" style={{ background: "var(--bg)" }}>{preview}</pre>
        )}
        <datalist id="java-types">{COMMON_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="java-types-ret">{["void", ...COMMON_TYPES].map((t) => <option key={t} value={t} />)}</datalist>
      </section>

      <section className={card} style={cardStyle}>
        <h2 className="font-semibold mb-1">Test cases</h2>
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          Write values as JSON: <code className="mono">[2,7,11,15]</code>, <code className="mono">9</code>, <code className="mono">&quot;abc&quot;</code>,{" "}
          <code className="mono">true</code>. Linked lists are arrays; trees are level-order arrays with <code className="mono">null</code>.
        </p>
        {d.testCases.map((t, i) => (
          <div key={i} className="rounded border p-3 mb-3" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Case {i + 1}</span>
              {d.testCases.length > 1 && (
                <button type="button" className="btn btn-ghost btn-danger !py-0.5 text-xs" onClick={() => set("testCases", d.testCases.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
            {d.params.map((p, k) => (
              <div key={k} className="flex items-center gap-2 mb-2">
                <span className="mono text-xs w-28 shrink-0 truncate text-right" style={{ color: "var(--muted)" }}>{p.name || `arg${k + 1}`} =</span>
                <input className="input mono" value={t.args[k] ?? ""} onChange={(e) => setArg(i, k, e.target.value)} />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="mono text-xs w-28 shrink-0 truncate text-right" style={{ color: "var(--accent)" }} title={retForExpected}>expected =</span>
              <input className="input mono" value={t.expected} onChange={(e) => setCase(i, { expected: e.target.value })} />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-ghost text-xs" onClick={() => set("testCases", [...d.testCases, { args: d.params.map(() => ""), expected: "" }])}>
          + Add test case
        </button>
      </section>

      <div className="flex gap-2 justify-end">
        <button type="button" className="btn" onClick={() => router.back()}>Cancel</button>
        <button type="submit" className="btn btn-accent" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Add question"}</button>
      </div>
    </form>
  );
}
