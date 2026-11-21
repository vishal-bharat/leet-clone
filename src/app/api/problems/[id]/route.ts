import { NextResponse } from "next/server";
import { deleteProblem, getProblem, updateProblem } from "@/lib/problemStore";
import { toProblemInput } from "@/lib/sanitize";
import { validateProblem } from "@/lib/javaTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const p = await getProblem((await params).id);
  return p ? NextResponse.json(p) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const input = toProblemInput(await req.json());
  const errors = validateProblem(input);
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });
  const p = await updateProblem((await params).id, input);
  return p ? NextResponse.json(p) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return (await deleteProblem((await params).id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
