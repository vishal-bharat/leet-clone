import { NextResponse } from "next/server";
import { SESSION_COOKIE, appPassword, safeEqual, sessionValue } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const given = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const password = appPassword();
  const base = new URL(req.url);
  if (!password) return NextResponse.redirect(new URL(safeNext, base), 303);

  if (!safeEqual(given, password)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(safeNext)}`, base), 303);
  }
  const res = NextResponse.redirect(new URL(safeNext, base), 303);
  res.cookies.set(SESSION_COOKIE, sessionValue(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: base.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
