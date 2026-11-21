import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import ProblemForm from "@/components/ProblemForm";
import { allTags, getProblem } from "@/lib/problemStore";

export const dynamic = "force-dynamic";

export default async function EditProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const problem = await getProblem((await params).id);
  if (!problem) notFound();
  const knownTags = await allTags();
  return (
    <div className="min-h-full">
      <TopBar />
      <ProblemForm initial={problem} knownTags={knownTags} />
    </div>
  );
}
