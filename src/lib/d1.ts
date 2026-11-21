// Cloudflare D1 over its HTTP API, so an app running on a normal server (VPS) can use D1 for storage.
// Docs: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
import type { Db, SqlValue } from "./problemStore";

export type D1Config = { accountId: string; apiToken: string; databaseId: string; apiBase: string };

export function d1Config(): D1Config | null {
  // CF_ACCOUNT_ID / CF_API_TOKEN are accepted as shorter aliases.
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID)?.trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN)?.trim();
  const databaseId = process.env.D1_DATABASE_ID?.trim();
  if (!accountId && !apiToken && !databaseId) return null;
  if (!accountId || !apiToken || !databaseId) {
    throw new Error("To use Cloudflare D1, set all three: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and D1_DATABASE_ID.");
  }
  // D1_API_BASE is only for testing against a stand-in server.
  const apiBase = (process.env.D1_API_BASE || "https://api.cloudflare.com/client/v4").replace(/\/$/, "");
  return { accountId, apiToken, databaseId, apiBase };
}

type D1Response = {
  success: boolean;
  errors?: { code?: number; message: string }[];
  result?: { success: boolean; results?: unknown[]; meta?: { changes?: number } }[];
};

export function d1Db(cfg: D1Config): Db {
  const url = `${cfg.apiBase}/accounts/${cfg.accountId}/d1/database/${cfg.databaseId}/query`;

  async function query(sql: string, params: SqlValue[] = []) {
    let lastError: Error = new Error("Cloudflare D1: no attempt made");
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${cfg.apiToken}`, "content-type": "application/json" },
          body: JSON.stringify({ sql, params }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        lastError = new Error(`Cloudflare D1 unreachable: ${(e as Error).message}`); // network error: retry
        continue;
      }
      const body = (await res.json().catch(() => null)) as D1Response | null;
      if (res.ok && body?.success && body.result?.[0]) return body.result[0];
      lastError = new Error(`Cloudflare D1 error: ${body?.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`}`);
      // Bad token, bad SQL, etc. won't fix themselves; only retry rate limits and server errors.
      if (res.status !== 429 && res.status < 500) throw lastError;
    }
    throw lastError;
  }

  return {
    async all<T>(sql: string, params?: SqlValue[]) {
      return ((await query(sql, params)).results ?? []) as T[];
    },
    async run(sql: string, params?: SqlValue[]) {
      return { changes: (await query(sql, params)).meta?.changes ?? 0 };
    },
  };
}
