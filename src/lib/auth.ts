// Optional protection for a hosted instance. Both settings are environment variables:
//   APP_PASSWORD  - if set, the whole app (pages + API) asks for this password and keeps you signed in with a cookie.
//   API_TOKEN     - if set, scripts (or Claude) can call the API with "Authorization: Bearer <API_TOKEN>".
// With neither set, the app is open, which is fine on your own laptop (localhost only).
import { createHash, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "java_prep_session";

const digest = (s: string) => createHash("sha256").update(s).digest();

export function safeEqual(a: string, b: string) {
  return timingSafeEqual(digest(a), digest(b));
}

/** Cookie value for a signed-in browser. Changes whenever APP_PASSWORD changes, which signs everyone out. */
export function sessionValue(password: string) {
  return createHash("sha256").update(`java-prep-session:${password}`).digest("hex");
}

export const appPassword = () => process.env.APP_PASSWORD || "";
export const apiToken = () => process.env.API_TOKEN || "";
