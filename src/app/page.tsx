import Link from "next/link";
import TopBar from "@/components/TopBar";
import ProblemTable from "@/components/ProblemTable";
import { listSummaries } from "@/lib/problemStore";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ tag?: string | string[] }> }) {
  const { tag } = await searchParams;
  const initialTags = (Array.isArray(tag) ? tag : tag ? [tag] : []).map((t) => t.toLowerCase());
  const problems = await listSummaries();
  return (
    <div className="min-h-full flex flex-col">
      <TopBar>
        <div className="flex-1" />
        <Link href="/problems/new" className="btn btn-accent">+ Add question</Link>
      </TopBar>
      <main className="w-full max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-1">Questions</h1>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          Pick a question, write the method in Java, and run it against the test cases.
        </p>
        <ProblemTable initialTags={initialTags} problems={problems} />
      </main>
    </div>
  );
}
