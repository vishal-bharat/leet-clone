// Shared by the browser (form validation, starter code) and the server (code generation).
import type { Param, Problem } from "./types";

export type JType =
  | { kind: "prim"; name: "int" | "long" | "double" | "boolean" | "char" }
  | { kind: "string" }
  | { kind: "listnode" }
  | { kind: "treenode" }
  | { kind: "array"; of: JType }
  | { kind: "list"; of: JType };

const PRIMS = ["int", "long", "double", "boolean", "char"] as const;
const BOXED: Record<string, (typeof PRIMS)[number]> = {
  Integer: "int",
  Long: "long",
  Double: "double",
  Boolean: "boolean",
  Character: "char",
};

/** Types offered in the add-question form. Any nesting of these with [] or List<> also works. */
export const COMMON_TYPES = [
  "int",
  "long",
  "double",
  "boolean",
  "char",
  "String",
  "int[]",
  "long[]",
  "double[]",
  "char[]",
  "String[]",
  "int[][]",
  "char[][]",
  "List<Integer>",
  "List<String>",
  "List<List<Integer>>",
  "List<List<String>>",
  "ListNode",
  "TreeNode",
];

export function parseType(raw: string): JType {
  const s = raw.replace(/\s+/g, "");
  if (!s) throw new Error("Type is empty");
  if (s.endsWith("[]")) return { kind: "array", of: parseType(s.slice(0, -2)) };
  const m = s.match(/^(?:List|ArrayList)<(.+)>$/);
  if (m) {
    const of = parseType(m[1]);
    return { kind: "list", of };
  }
  if ((PRIMS as readonly string[]).includes(s)) return { kind: "prim", name: s as (typeof PRIMS)[number] };
  if (BOXED[s]) return { kind: "prim", name: BOXED[s] };
  if (s === "String") return { kind: "string" };
  if (s === "ListNode") return { kind: "listnode" };
  if (s === "TreeNode") return { kind: "treenode" };
  throw new Error(`Unsupported type "${raw}". Use primitives, String, ListNode, TreeNode, arrays (T[]) or List<T>.`);
}

/** Java source spelling of a type. `boxed` is used inside generics. */
export function javaName(t: JType, boxed = false): string {
  switch (t.kind) {
    case "prim":
      if (!boxed) return t.name;
      return { int: "Integer", long: "Long", double: "Double", boolean: "Boolean", char: "Character" }[t.name];
    case "string":
      return "String";
    case "listnode":
      return "ListNode";
    case "treenode":
      return "TreeNode";
    case "array":
      return javaName(t.of, false) + "[]";
    case "list":
      return `List<${javaName(t.of, true)}>`;
  }
}

function usesNode(t: JType, kind: "listnode" | "treenode"): boolean {
  if (t.kind === kind) return true;
  if (t.kind === "array" || t.kind === "list") return usesNode(t.of, kind);
  return false;
}

export function signature(p: Pick<Problem, "functionName" | "returnType" | "params">): string {
  const ret = p.returnType.trim() === "void" ? "void" : javaName(parseType(p.returnType));
  const params = p.params.map((x: Param) => `${javaName(parseType(x.type))} ${x.name}`).join(", ");
  return `public ${ret} ${p.functionName}(${params})`;
}

export function starterCode(p: Pick<Problem, "functionName" | "returnType" | "params">): string {
  let types: JType[] = [];
  try {
    types = p.params.map((x) => parseType(x.type));
    if (p.returnType.trim() !== "void") types.push(parseType(p.returnType));
  } catch {
    /* ignore, signature() will throw below if invalid */
  }
  const header: string[] = [];
  if (types.some((t) => usesNode(t, "listnode"))) {
    header.push(
      "/**",
      " * Definition for singly-linked list (provided):",
      " * class ListNode { int val; ListNode next; ListNode(int val) {...} }",
      " */",
    );
  }
  if (types.some((t) => usesNode(t, "treenode"))) {
    header.push(
      "/**",
      " * Definition for a binary tree node (provided):",
      " * class TreeNode { int val; TreeNode left, right; TreeNode(int val) {...} }",
      " */",
    );
  }
  return [...header, "class Solution {", `    ${signature(p)} {`, "        ", "    }", "}", ""].join("\n");
}

/** Validates a JSON value against a Java type. Returns an error message or null. */
export function checkValue(t: JType, v: unknown, path = "value"): string | null {
  const bad = (what: string) => `${path} should be ${what}, got ${JSON.stringify(v)}`;
  switch (t.kind) {
    case "prim":
      if (t.name === "boolean") return typeof v === "boolean" ? null : bad("true/false");
      if (t.name === "char") return typeof v === "string" && [...v].length === 1 ? null : bad('a 1-character string like "a"');
      if (typeof v !== "number") return bad("a number");
      if ((t.name === "int" || t.name === "long") && !Number.isInteger(v)) return bad("an integer");
      if (t.name === "int" && (v > 2147483647 || v < -2147483648)) return bad("within int range");
      return null;
    case "string":
      return v === null || typeof v === "string" ? null : bad('a string like "abc"');
    case "listnode":
    case "treenode":
      if (v === null) return null;
      if (!Array.isArray(v)) return bad("an array like [1,2,3]");
      for (let i = 0; i < v.length; i++) {
        const x = v[i];
        if (x === null && t.kind === "treenode") continue;
        if (typeof x !== "number" || !Number.isInteger(x)) return `${path}[${i}] should be an integer${t.kind === "treenode" ? " or null" : ""}`;
      }
      return null;
    case "array":
    case "list":
      if (v === null) return null;
      if (!Array.isArray(v)) return bad("an array");
      for (let i = 0; i < v.length; i++) {
        const e = checkValue(t.of, v[i], `${path}[${i}]`);
        if (e) return e;
      }
      return null;
  }
}

/** Validates a whole problem definition. Returns a list of human-readable errors. */
export function validateProblem(p: Partial<Problem>): string[] {
  const errs: string[] = [];
  if (!p.title?.trim()) errs.push("Title is required.");
  if (!p.functionName || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p.functionName)) errs.push("Function name must be a valid Java identifier.");
  const params = p.params ?? [];
  const types: JType[] = [];
  params.forEach((x, i) => {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(x.name || "")) errs.push(`Parameter ${i + 1} needs a valid name.`);
    try {
      types.push(parseType(x.type));
    } catch (e) {
      errs.push(`Parameter ${i + 1}: ${(e as Error).message}`);
    }
  });
  const isVoid = (p.returnType ?? "").trim() === "void";
  let ret: JType | null = null;
  if (isVoid) {
    if (params.length === 0) errs.push("A void function needs at least one parameter (its first argument is checked after the call).");
    else ret = types[0] ?? null;
  } else {
    try {
      ret = parseType(p.returnType ?? "");
    } catch (e) {
      errs.push(`Return type: ${(e as Error).message}`);
    }
  }
  if (errs.length) return errs;
  const tcs = p.testCases ?? [];
  if (tcs.length === 0) errs.push("Add at least one test case.");
  tcs.forEach((tc, i) => {
    const label = `Test case ${i + 1}`;
    if (tc.args.length !== params.length) {
      errs.push(`${label}: expected ${params.length} inputs.`);
      return;
    }
    tc.args.forEach((a, j) => {
      let v: unknown;
      try {
        v = JSON.parse(a);
      } catch {
        errs.push(`${label}, ${params[j].name}: not valid JSON (${a || "empty"}). Strings need double quotes.`);
        return;
      }
      const e = checkValue(types[j], v, params[j].name);
      if (e) errs.push(`${label}: ${e}`);
    });
    let ev: unknown;
    try {
      ev = JSON.parse(tc.expected);
    } catch {
      errs.push(`${label}, expected: not valid JSON (${tc.expected || "empty"}).`);
      return;
    }
    const e = ret ? checkValue(ret, ev, "expected") : null;
    if (e) errs.push(`${label}: ${e}`);
  });
  return errs;
}
