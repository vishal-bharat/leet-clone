import Link from "next/link";

export default function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="h-12 shrink-0 flex items-center gap-4 px-4 border-b" style={{ background: "var(--panel)", borderColor: "var(--border)" }}>
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="mono text-sm px-1.5 py-0.5 rounded" style={{ background: "var(--accent)", color: "#1a1a1a" }}>{"{J}"}</span>
        Java Prep
      </Link>
      <div className="flex-1 flex items-center gap-2 min-w-0">{children}</div>
      {process.env.APP_PASSWORD ? (
        <form method="post" action="/api/logout">
          <button className="btn btn-ghost text-xs" type="submit">Sign out</button>
        </form>
      ) : null}
    </header>
  );
}
