export type Difficulty = "Easy" | "Medium" | "Hard";

/**
 * How the returned value is compared with the expected value.
 * - exact: deep equality (doubles compared with a 1e-5 tolerance)
 * - anyOrder: the top-level list/array may be in any order
 * - anyOrderNested: every nested list/array may be in any order (e.g. Group Anagrams)
 */
export type CompareMode = "exact" | "anyOrder" | "anyOrderNested";

export interface Param {
  name: string;
  type: string; // Java type, e.g. "int[]", "List<List<Integer>>", "TreeNode"
}

export interface TestCase {
  /** One JSON value per parameter, as text, e.g. ["[2,7,11,15]", "9"] */
  args: string[];
  /** Expected return value as JSON text, e.g. "[0,1]" */
  expected: string;
}

export interface Problem {
  id: string;
  title: string;
  difficulty: Difficulty;
  /** Free-form topic tags, e.g. ["array", "hashmap", "stream"] */
  tags?: string[];
  /** Markdown */
  description: string;
  functionName: string;
  returnType: string; // "void" means: check the first argument after the call (in-place problems)
  params: Param[];
  compare: CompareMode;
  testCases: TestCase[];
}

export interface CaseResult {
  index: number;
  passed: boolean;
  status: "Accepted" | "Wrong Answer" | "Runtime Error" | "Time Limit Exceeded";
  args: string[];
  expected: string;
  got?: string;
  stdout?: string;
  error?: string;
  ms?: number;
}

export interface RunResponse {
  status: "Accepted" | "Wrong Answer" | "Runtime Error" | "Time Limit Exceeded" | "Compile Error" | "Error";
  passed: number;
  total: number;
  compileError?: string;
  message?: string;
  cases: CaseResult[];
}
