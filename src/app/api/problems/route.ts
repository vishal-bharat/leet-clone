import { NextResponse } from "next/server";
import { createProblem, listProblems } from "@/lib/problemStore";
import { toProblemInput } from "@/lib/sanitize";
import { validateProblem } from "@/lib/javaTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listProblems());
}

export async function POST(req: Request) {
  const input = toProblemInput(await req.json());
  const errors = validateProblem(input);
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });
  return NextResponse.json(await createProblem(input), { status: 201 });
}
