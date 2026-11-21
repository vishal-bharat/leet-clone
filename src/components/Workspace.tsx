"use client";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import TopBar from "./TopBar";
import type { CaseResult, Problem, RunResponse } from "@/lib/types";

// Load Monaco from this app (public/monaco, copied on npm install) instead of a CDN, so it works offline.
loader.config({ paths: { vs: "/monaco/vs" } });

const draftKey = (id: string) => `java-prep:code:${id}`;

function readDraft(id: string): string | null {
  try {
    return localStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}
function writeDraft(id: string, code: string | null) {
  try {
    if (code === null) localStorage.removeItem(draftKey(id));
    else localStorage.setItem(draftKey(id), code);
  } catch {
    /* storage unavailable: drafts just aren't kept */
  }
}

function statusColor(s: string) {
  return s === "Accepted" ? "var(--green)" : "var(--red)";
}

export default function Workspace({ problem, descriptionHtml, starter }: { problem: Problem; descriptionHtml: string; starter: string }) {
  const [code, setCode] = useState(starter);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [tab, setTab] = useState<"tests" | "result">("tests");
  const [active, setActive] = useState(0);
  const codeRef = useRef(code);
  codeRef.current = code;
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  useEffect(() => {
    const saved = readDraft(problem.id);
    if (saved) setCode(saved);
    setLoaded(true);
  }, [problem.id]);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => writeDraft(problem.id, code === starter ? null : code), 400);
    return () => clearTimeout(t);
  }, [code, loaded, problem.id, starter]);

  const runCode = useCallback(async () => {
    setRunning(true);
    setTab("result");
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problemId: problem.id, code: editorRef.current?.getValue() ?? codeRef.current }),
      });
      const body = await res.json();
      if (!res.ok) {
        setResult({ status: "Error", passed: 0, total: problem.testCases.length, message: body.error ?? "Run failed", cases: [] });
        return;
      }
      const r = body as RunResponse;
      setResult(r);
      const firstFail = r.cases.findIndex((c) => !c.passed);
      setActive(firstFail >= 0 ? firstFail : 0);
    } catch (e) {
      setResult({ status: "Error", passed: 0, total: problem.testCases.length, message: `Could not reach the server: ${(e as Error).message}`, cases: [] });
    } finally {
      setRunning(false);
    }
  }, [problem.id, problem.testCases.length]);

  const runRef = useRef(runCode);
  runRef.current = runCode;

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runRef.current();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  function reset() {
    if (code !== starter && !window.confirm("Reset the editor to the starter code? Your current code will be lost.")) return;
    setCode(starter);
    writeDraft(problem.id, null);
  }

  return (
    <div className="h-screen flex flex-col">
      <TopBar>
        <Link href="/" className="btn btn-ghost !px-2 text-sm">← Questions</Link>
        <div className="flex-1" />
        <button className="btn btn-primary" onClick={runCode} disabled={running} title="Run (Ctrl/⌘ + Enter)">
          {running ? "Running…" : "▶ Run"}
        </button>
        <div className="flex-1" />
        <Link href={`/problems/${problem.id}/edit`} className="btn btn-ghost text-sm">Edit question</Link>
      </TopBar>

      <PanelGroup direction="horizontal" className="flex-1 p-2" autoSaveId="java-prep-h">
        <Panel defaultSize={45} minSize={20} className="rounded-lg border flex flex-col" style={{ background: "var(--panel)", borderColor: "var(--border)" }}>
          <div className="px-4 py-2 text-sm font-medium border-b" style={{ borderColor: "var(--border)" }}>Description</div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <h1 className="text-xl font-semibold mb-2">{problem.title}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${problem.difficulty.toLowerCase()}`} style={{ background: "var(--panel-2)" }}>
              {problem.difficulty}
            </span>
            {(problem.tags ?? []).map((t) => (
              <Link key={t} href={`/?tag=${encodeURIComponent(t)}`} className="tag-chip ml-1.5">{t}</Link>
            ))}
            <div className="prose-desc mt-4" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
          </div>
        </Panel>

        <PanelResizeHandle className="resize-handle-h mx-0.5 rounded" />

        <Panel defaultSize={55} minSize={25}>
          <PanelGroup direction="vertical" autoSaveId="java-prep-v">
            <Panel defaultSize={62} minSize={20} className="rounded-lg border flex flex-col overflow-hidden" style={{ background: "var(--panel)", borderColor: "var(--border)" }}>
              <div className="px-4 py-1.5 text-sm flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
                <span className="font-medium">
                  Code <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>Java</span>
                </span>
                <span className="flex gap-1">
                  <button className="btn btn-ghost !py-0.5 text-xs" onClick={() => navigator.clipboard?.writeText(code)}>Copy</button>
                  <button className="btn btn-ghost !py-0.5 text-xs" onClick={reset}>Reset</button>
                </span>
              </div>
              <div className="flex-1 min-h-0">
                <Editor
                  language="java"
                  theme="vs-dark"
                  value={code}
                  onChange={(v) => setCode(v ?? "")}
                  onMount={onMount}
                  options={{
                    automaticLayout: true,
                    minimap: { enabled: false },
                    fontSize: 14,
                    tabSize: 4,
                    scrollBeyondLastLine: false,
                    padding: { top: 8 },
                  }}
                />
              </div>
            </Panel>

            <PanelResizeHandle className="resize-handle-v my-0.5 rounded" />

            <Panel defaultSize={38} minSize={12} className="rounded-lg border flex flex-col overflow-hidden" style={{ background: "var(--panel)", borderColor: "var(--border)" }}>
              <div className="px-2 py-1 flex gap-1 border-b text-sm" style={{ borderColor: "var(--border)" }}>
                <button className={`btn !py-0.5 ${tab === "tests" ? "" : "btn-ghost"}`} onClick={() => setTab("tests")}>Testcases</button>
                <button className={`btn !py-0.5 ${tab === "result" ? "" : "btn-ghost"}`} onClick={() => setTab("result")}>Result</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 text-sm">
                {tab === "tests" ? <TestcaseView problem={problem} active={active} setActive={setActive} /> : <ResultView problem={problem} result={result} running={running} active={active} setActive={setActive} />}
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  );
}

function CaseTabs({ n, active, setActive, cases }: { n: number; active: number; setActive: (i: number) => void; cases?: CaseResult[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {Array.from({ length: n }, (_, i) => (
        <button key={i} className={`btn !py-0.5 text-xs ${active === i ? "" : "btn-ghost"}`} onClick={() => setActive(i)}>
          {cases?.[i] && <span style={{ color: statusColor(cases[i].status) }}>●</span>}
          Case {i + 1}
        </button>
      ))}
    </div>
  );
}

function Field({ name, value, color }: { name: string; value: string; color?: string }) {
  return (
    <div className="mb-2.5">
      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>{name}</div>
      <pre className="mono text-[13px] px-3 py-2 rounded whitespace-pre-wrap break-all" style={{ background: "var(--panel-2)", color }}>{value}</pre>
    </div>
  );
}

function TestcaseView({ problem, active, setActive }: { problem: Problem; active: number; setActive: (i: number) => void }) {
  const tc = problem.testCases[Math.min(active, problem.testCases.length - 1)];
  if (!tc) return <p style={{ color: "var(--muted)" }}>This question has no test cases.</p>;
  return (
    <>
      <CaseTabs n={problem.testCases.length} active={active} setActive={setActive} />
      {problem.params.map((p, i) => <Field key={i} name={`${p.name} =`} value={tc.args[i]} />)}
      <Field name="Expected" value={tc.expected} />
    </>
  );
}

function ResultView({ problem, result, running, active, setActive }: { problem: Problem; result: RunResponse | null; running: boolean; active: number; setActive: (i: number) => void }) {
  if (running) return <p style={{ color: "var(--muted)" }}>Compiling and running…</p>;
  if (!result) return <p style={{ color: "var(--muted)" }}>Press Run (Ctrl/⌘ + Enter) to test your code.</p>;

  if (result.status === "Compile Error" || result.status === "Error") {
    return (
      <>
        <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--red)" }}>{result.status}</h3>
        <pre className="mono text-[13px] px-3 py-2 rounded whitespace-pre-wrap" style={{ background: "#3a1f1f", color: "#ffb4b4" }}>
          {result.compileError ?? result.message}
        </pre>
      </>
    );
  }

  const c = result.cases[Math.min(active, result.cases.length - 1)];
  const isVoid = problem.returnType.trim() === "void";
  return (
    <>
      <div className="flex items-baseline gap-3 mb-3">
        <h3 className="text-lg font-semibold" style={{ color: statusColor(result.status) }}>{result.status}</h3>
        <span className="text-xs" style={{ color: "var(--muted)" }}>{result.passed} / {result.total} test cases passed</span>
      </div>
      <CaseTabs n={result.cases.length} active={active} setActive={setActive} cases={result.cases} />
      {c && (
        <>
          {problem.params.map((p, i) => <Field key={i} name={`${p.name} =`} value={c.args[i]} />)}
          {c.error ? (
            <Field name={c.status} value={c.error} color="#ffb4b4" />
          ) : (
            <Field name={isVoid ? `Output (${problem.params[0]?.name} after call)` : "Output"} value={c.got ?? ""} color={c.passed ? undefined : "var(--red)"} />
          )}
          <Field name="Expected" value={c.expected} />
          {c.stdout ? <Field name="Stdout" value={c.stdout} /> : null}
          {typeof c.ms === "number" && <div className="text-xs" style={{ color: "var(--muted)" }}>{c.ms} ms</div>}
        </>
      )}
    </>
  );
}
