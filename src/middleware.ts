import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, apiToken, appPassword, safeEqual, sessionValue } from "@/lib/auth";

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|monaco/).*)"],
};

const deny = (msg: string) => NextResponse.json({ error: msg }, { status: 401, headers: { "www-authenticate": "Bearer" } });

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const password = appPassword();
  const token = apiToken();

  // Scripts / Claude: Authorization: Bearer <API_TOKEN>
  const auth = req.headers.get("authorization");
  if (isApi && auth?.toLowerCase().startsWith("bearer ")) {
    if (token && safeEqual(auth.slice(7).trim(), token)) return NextResponse.next();
    return deny(token ? "Invalid API token" : "API tokens are not enabled (set API_TOKEN on the server)");
  }

  if (!password) return NextResponse.next(); // open mode (local use)
  if (path === "/login" || path === "/api/login") return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && safeEqual(cookie, sessionValue(password))) return NextResponse.next();

  if (isApi) return deny("Sign in first, or send Authorization: Bearer <API_TOKEN>");
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}
