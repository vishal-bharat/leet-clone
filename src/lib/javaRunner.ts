// Server-only: compiles the user's Solution with javac and runs it against the test cases with java.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JType, javaName, parseType, signature } from "./javaTypes";
import type { CaseResult, Problem, RunResponse } from "./types";

const COMPILE_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 10_000;
const MARK = "@@CASE@@";

function bin(name: "java" | "javac") {
  return process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", name) : name;
}

/**
 * JAVA_SANDBOX=docker runs javac/java inside a throwaway container: no network, read-only filesystem,
 * capped memory/CPU/processes, unprivileged user. Recommended whenever the app is reachable by others.
 */
const SANDBOX = process.env.JAVA_SANDBOX === "docker";
const SANDBOX_IMAGE = process.env.JAVA_SANDBOX_IMAGE || "eclipse-temurin:21-jdk";

type Cmd = { cmd: string; args: string[]; container?: string };

function javaCmd(tool: "java" | "javac", args: string[], dir: string): Cmd {
  if (!SANDBOX) return { cmd: bin(tool), args };
  const container = `java-prep-${randomUUID()}`;
  // Run as the app's own user, or as "nobody" if the app itself runs as root.
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  const user = uid === 0 ? "65534:65534" : `${uid}:${process.getgid?.() ?? uid}`;
  return {
    cmd: "docker",
    container,
    args: [
      "run", "--rm", "--name", container,
      "--network", "none",
      "--read-only", "--tmpfs", "/tmp:rw,size=64m",
      "--memory", "512m", "--memory-swap", "512m", "--cpus", "1", "--pids-limit", "256",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--user", user,
      "-e", "JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=50",
      "-v", `${dir}:/work:rw`, "-w", "/work",
      SANDBOX_IMAGE, tool, ...args,
    ],
  };
}

// ---------- JSON value -> Java expression ----------

function literal(t: JType, v: unknown): string {
  switch (t.kind) {
    case "prim":
      switch (t.name) {
        case "int":
          return String(v);
        case "long":
          return `${v}L`;
        case "double":
          return Number.isInteger(v) ? `${v}.0` : String(v);
        case "boolean":
          return String(v);
        case "char":
          return `(char)${(v as string).codePointAt(0)}`;
      }
    // eslint-disable-next-line no-fallthrough
    case "string":
      return v === null ? "null" : JSON.stringify(v);
    case "listnode":
      return v === null ? "null" : `ListNode.of(new int[]{${(v as number[]).join(",")}})`;
    case "treenode":
      return v === null ? "null" : `TreeNode.of(new Integer[]{${(v as (number | null)[]).map(String).join(",")}})`;
    case "array": {
      if (v === null) return "null";
      if (t.of.kind === "list") throw new Error("Arrays of Lists are not supported; use List<List<...>>");
      return `new ${javaName(t)}{${(v as unknown[]).map((x) => literal(t.of, x)).join(",")}}`;
    }
    case "list": {
      if (v === null) return "null";
      const b = javaName(t.of, true);
      return `new ArrayList<${b}>(Arrays.<${b}>asList(${(v as unknown[]).map((x) => literal(t.of, x)).join(",")}))`;
    }
  }
}

// ---------- Generated Java sources ----------

const IMPORTS = "import java.util.*; import java.util.function.*; import java.util.stream.*; import java.math.*; ";

const LIST_NODE = `public class ListNode {
    public int val;
    public ListNode next;
    public ListNode() {}
    public ListNode(int val) { this.val = val; }
    public ListNode(int val, ListNode next) { this.val = val; this.next = next; }
    static ListNode of(int[] a) {
        ListNode dummy = new ListNode(0), cur = dummy;
        for (int x : a) { cur.next = new ListNode(x); cur = cur.next; }
        return dummy.next;
    }
}
`;

const TREE_NODE = `import java.util.*;
public class TreeNode {
    public int val;
    public TreeNode left, right;
    public TreeNode() {}
    public TreeNode(int val) { this.val = val; }
    public TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }
    static TreeNode of(Integer[] a) {
        if (a.length == 0 || a[0] == null) return null;
        TreeNode root = new TreeNode(a[0]);
        Deque<TreeNode> q = new ArrayDeque<>();
        q.add(root);
        int i = 1;
        while (!q.isEmpty() && i < a.length) {
            TreeNode n = q.poll();
            if (i < a.length && a[i] != null) { n.left = new TreeNode(a[i]); q.add(n.left); }
            i++;
            if (i < a.length && a[i] != null) { n.right = new TreeNode(a[i]); q.add(n.right); }
            i++;
        }
        return root;
    }
}
`;

const HARNESS_HELPERS = `
    static final PrintStream REAL_OUT = System.out;
    static final PrintStream REAL_ERR = System.err;
    static final int MAX_CAPTURE = 64 * 1024;

    public static void main(String[] args) throws Exception {
        Thread t = new Thread(null, Main::runAll, "solution", 512L * 1024 * 1024);
        t.start();
        t.join();
        REAL_OUT.flush();
    }

    interface Case { Object run() throws Throwable; }

    static void runCase(int idx, Case c) {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        PrintStream cap;
        try { cap = new PrintStream(buf, true, "UTF-8"); } catch (Exception e) { throw new RuntimeException(e); }
        System.setOut(cap);
        System.setErr(cap);
        String got = null, err = null;
        long t0 = System.nanoTime();
        try {
            got = json(c.run());
        } catch (Throwable e) {
            err = describe(e);
        } finally {
            System.setOut(REAL_OUT);
            System.setErr(REAL_ERR);
        }
        long ms = (System.nanoTime() - t0) / 1_000_000;
        String out;
        try { out = buf.toString("UTF-8"); } catch (Exception e) { out = ""; }
        if (out.length() > MAX_CAPTURE) out = out.substring(0, MAX_CAPTURE) + "\\n... (output truncated)";
        StringBuilder sb = new StringBuilder("${MARK}{");
        sb.append("\\"i\\":").append(idx);
        sb.append(",\\"got\\":").append(got == null ? "null" : str(got));
        sb.append(",\\"error\\":").append(err == null ? "null" : str(err));
        sb.append(",\\"stdout\\":").append(str(out));
        sb.append(",\\"ms\\":").append(ms).append("}");
        REAL_OUT.println(sb);
        REAL_OUT.flush();
    }

    static String describe(Throwable e) {
        StringBuilder sb = new StringBuilder(e.toString());
        int shown = 0;
        for (StackTraceElement f : e.getStackTrace()) {
            String file = f.getFileName();
            if (file == null || file.equals("Main.java")) continue;
            if (!file.equals("Solution.java") && !file.equals("ListNode.java") && !file.equals("TreeNode.java")) continue;
            sb.append("\\n    at ").append(f);
            if (++shown >= 8) break;
        }
        return sb.toString();
    }

    static String str(String s) {
        StringBuilder sb = new StringBuilder("\\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\\\\""); break;
                case '\\\\': sb.append("\\\\\\\\"); break;
                case '\\n': sb.append("\\\\n"); break;
                case '\\r': sb.append("\\\\r"); break;
                case '\\t': sb.append("\\\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.append('"').toString();
    }

    static String json(Object o) {
        if (o == null) return "null";
        if (o instanceof String) return str((String) o);
        if (o instanceof Character) return str(String.valueOf(o));
        if (o instanceof Double || o instanceof Float) {
            double d = ((Number) o).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) return str(String.valueOf(d));
            return String.valueOf(d);
        }
        if (o instanceof Number || o instanceof Boolean) return o.toString();
        if (o instanceof ListNode) {
            StringBuilder sb = new StringBuilder("[");
            ListNode n = (ListNode) o;
            int count = 0;
            while (n != null) {
                if (count > 0) sb.append(',');
                if (++count > 100000) throw new IllegalStateException("Returned linked list has a cycle (or more than 100000 nodes)");
                sb.append(n.val);
                n = n.next;
            }
            return sb.append(']').toString();
        }
        if (o instanceof TreeNode) {
            List<String> vals = new ArrayList<>();
            Deque<TreeNode> q = new ArrayDeque<>();
            List<TreeNode> level = new ArrayList<>();
            level.add((TreeNode) o);
            int count = 0;
            while (!level.isEmpty()) {
                List<TreeNode> next = new ArrayList<>();
                for (TreeNode n : level) {
                    if (n == null) { vals.add("null"); continue; }
                    if (++count > 100000) throw new IllegalStateException("Returned tree is too large or has a cycle");
                    vals.add(String.valueOf(n.val));
                    next.add(n.left);
                    next.add(n.right);
                }
                level = next;
            }
            int end = vals.size();
            while (end > 0 && vals.get(end - 1).equals("null")) end--;
            return "[" + String.join(",", vals.subList(0, end)) + "]";
        }
        if (o.getClass().isArray()) {
            StringBuilder sb = new StringBuilder("[");
            int len = java.lang.reflect.Array.getLength(o);
            for (int i = 0; i < len; i++) {
                if (i > 0) sb.append(',');
                sb.append(json(java.lang.reflect.Array.get(o, i)));
            }
            return sb.append(']').toString();
        }
        if (o instanceof Iterable) {
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            for (Object x : (Iterable<?>) o) {
                if (!first) sb.append(',');
                first = false;
                sb.append(json(x));
            }
            return sb.append(']').toString();
        }
        if (o instanceof Map) {
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) o).entrySet()) {
                if (!first) sb.append(',');
                first = false;
                sb.append(str(String.valueOf(e.getKey()))).append(':').append(json(e.getValue()));
            }
            return sb.append('}').toString();
        }
        return str(o.toString());
    }
`;

function buildMain(p: Problem): string {
  const types = p.params.map((x) => parseType(x.type));
  const isVoid = p.returnType.trim() === "void";
  const methods: string[] = [];
  const calls: string[] = [];
  p.testCases.forEach((tc, i) => {
    const decls = types.map((t, j) => `        ${javaName(t)} p${j} = ${literal(t, JSON.parse(tc.args[j]))};`);
    const argList = types.map((_, j) => `p${j}`).join(", ");
    const body = isVoid
      ? `        new Solution().${p.functionName}(${argList});\n        return p0;`
      : `        return new Solution().${p.functionName}(${argList});`;
    methods.push(`    static Object case${i}() throws Throwable {\n${decls.join("\n")}\n${body}\n    }`);
    calls.push(`        runCase(${i}, Main::case${i});`);
  });
  return `import java.util.*;
import java.io.*;

public class Main {
${HARNESS_HELPERS}
    static void runAll() {
${calls.join("\n")}
    }

${methods.join("\n\n")}
}
`;
}

// ---------- Process helpers ----------

function run({ cmd, args, container }: Cmd, cwd: string, timeoutMs: number) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean; spawnError?: string }>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(cmd, args, { cwd, env: process.env });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      // Killing the docker client doesn't stop the container itself.
      if (container) spawn("docker", ["kill", container], { stdio: "ignore" }).on("error", () => {});
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      if (stdout.length < 8_000_000) stdout += d;
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < 1_000_000) stderr += d;
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, timedOut, spawnError: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

function cleanJavaNoise(s: string, dir: string) {
  return s
    .split("\n")
    .filter((l) => !l.startsWith("Picked up "))
    .join("\n")
    .replaceAll(dir + path.sep, "")
    .trim();
}

// ---------- Comparison ----------

function canon(v: unknown, deep: boolean): unknown {
  if (Array.isArray(v)) {
    const items = v.map((x) => (deep ? canon(x, true) : x));
    return items.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0));
  }
  return v;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    return deepEqual(ka, kb) && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

function matches(got: unknown, expected: unknown, mode: Problem["compare"]) {
  if (mode === "exact") return deepEqual(got, expected);
  const deep = mode === "anyOrderNested";
  return deepEqual(canon(got, deep), canon(expected, deep));
}

// ---------- Entry point ----------

export async function runJava(problem: Problem, code: string): Promise<RunResponse> {
  const total = problem.testCases.length;
  const base = (): CaseResult[] =>
    problem.testCases.map((tc, i) => ({ index: i, passed: false, status: "Runtime Error", args: tc.args, expected: tc.expected }));

  if (/^\s*package\s+[\w.]+\s*;/m.test(code)) {
    return { status: "Compile Error", passed: 0, total, compileError: "Remove the `package` line; the class must be in the default package.", cases: base() };
  }

  if (!/\bclass\s+Solution\b/.test(code)) {
    return { status: "Compile Error", passed: 0, total, compileError: `Couldn't find "class Solution". Write your method inside:\n\nclass Solution {\n    ${signature(problem)} { ... }\n}`, cases: base() };
  }

  let main: string;
  try {
    main = buildMain(problem);
  } catch (e) {
    return { status: "Error", passed: 0, total, message: `Problem definition error: ${(e as Error).message}`, cases: base() };
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), "java-prep-"));
  try {
    // Imports go on line 1 so compiler/stack-trace line numbers match the editor.
    await writeFile(path.join(dir, "Solution.java"), IMPORTS + code);
    await writeFile(path.join(dir, "ListNode.java"), LIST_NODE);
    await writeFile(path.join(dir, "TreeNode.java"), TREE_NODE);
    await writeFile(path.join(dir, "Main.java"), main);
    if (SANDBOX && process.getuid?.() === 0) await chmod(dir, 0o777); // let the "nobody" user write class files

    const c = await run(javaCmd("javac", ["-encoding", "UTF-8", "-nowarn", "-d", ".", "Solution.java", "ListNode.java", "TreeNode.java", "Main.java"], dir), dir, COMPILE_TIMEOUT_MS);
    if (c.spawnError) {
      return {
        status: "Error",
        passed: 0,
        total,
        message: `Could not start javac (${c.spawnError}). Install a JDK (17+) and make sure javac is on your PATH, or set JAVA_HOME.`,
        cases: base(),
      };
    }
    if (SANDBOX && c.code !== null && c.code >= 125 && c.code <= 127) {
      return { status: "Error", passed: 0, total, message: `Docker sandbox failed to start (is Docker running and can this user use it?):\n${c.stderr.trim()}`, cases: base() };
    }
    if (c.code !== 0) {
      let msg = cleanJavaNoise(c.stderr + c.stdout, dir);
      if (c.timedOut) msg = "Compilation timed out.";
      else if (!/Solution\.java:\d+/.test(msg) && /Main\.java:\d+/.test(msg)) {
        msg = `Your method doesn't match the expected signature:\n\n    ${signature(problem)}\n\nMake sure it is inside "class Solution" with exactly these parameter and return types.`;
      }
      return { status: "Compile Error", passed: 0, total, compileError: msg, cases: base() };
    }

    const r = await run(javaCmd("java", ["-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-cp", ".", "Main"], dir), dir, RUN_TIMEOUT_MS);
    const retType = parseType(problem.returnType.trim() === "void" ? problem.params[0].type : problem.returnType);
    const nodeResult = retType.kind === "listnode" || retType.kind === "treenode";
    const results = base();
    const seen = new Set<number>();
    for (const line of r.stdout.split("\n")) {
      if (!line.startsWith(MARK)) continue;
      const o = JSON.parse(line.slice(MARK.length)) as { i: number; got: string | null; error: string | null; stdout: string; ms: number };
      const cr = results[o.i];
      seen.add(o.i);
      cr.stdout = o.stdout;
      cr.ms = o.ms;
      if (o.error) {
        cr.status = "Runtime Error";
        cr.error = o.error;
        continue;
      }
      // An empty linked list / tree is null in Java but written as [] in test cases.
      cr.got = o.got === "null" && nodeResult ? "[]" : (o.got ?? "null");
      const ok = matches(JSON.parse(cr.got), JSON.parse(cr.expected), problem.compare);
      cr.passed = ok;
      cr.status = ok ? "Accepted" : "Wrong Answer";
    }
    for (const cr of results) {
      if (seen.has(cr.index)) continue;
      if (r.timedOut) {
        cr.status = "Time Limit Exceeded";
        cr.error = `Stopped after ${RUN_TIMEOUT_MS / 1000}s (infinite loop?)`;
      } else {
        cr.status = "Runtime Error";
        cr.error = cleanJavaNoise(r.stderr, dir) || `JVM exited with code ${r.code}`;
      }
      break; // later cases never ran
    }
    for (const cr of results) if (!seen.has(cr.index) && !cr.error) cr.error = "Not run (an earlier case stopped the program).";

    const passed = results.filter((x) => x.passed).length;
    const firstFail = results.find((x) => !x.passed);
    return { status: firstFail ? (firstFail.status as RunResponse["status"]) : "Accepted", passed, total, cases: results };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
