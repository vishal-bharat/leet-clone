export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = "/", error } = await searchParams;
  return (
    <main className="min-h-full flex items-center justify-center px-4">
      <form method="post" action="/api/login" className="w-full max-w-sm rounded-lg border p-6" style={{ background: "var(--panel)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 font-semibold mb-5">
          <span className="mono text-sm px-1.5 py-0.5 rounded" style={{ background: "var(--accent)", color: "#1a1a1a" }}>{"{J}"}</span>
          Java Prep
        </div>
        <label className="block text-xs font-medium mb-1 uppercase tracking-wide" htmlFor="pw">Password</label>
        <input id="pw" name="password" type="password" autoFocus required className="input mb-3" autoComplete="current-password" />
        <input type="hidden" name="next" value={next} />
        {error && <p className="text-sm mb-3" style={{ color: "var(--red)" }}>Wrong password.</p>}
        <button className="btn btn-accent w-full justify-center" type="submit">Sign in</button>
      </form>
    </main>
  );
}
