import { NextResponse } from "next/server";
import { getProblem } from "@/lib/problemStore";
import { runJava } from "@/lib/javaRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { problemId, code } = (await req.json()) as { problemId?: string; code?: string };
  if (typeof problemId !== "string" || typeof code !== "string") {
    return NextResponse.json({ error: "problemId and code are required" }, { status: 400 });
  }
  const problem = await getProblem(problemId);
  if (!problem) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  return NextResponse.json(await runJava(problem, code));
}
