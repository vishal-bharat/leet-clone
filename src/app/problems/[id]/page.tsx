import { notFound } from "next/navigation";
import { marked } from "marked";
import Workspace from "@/components/Workspace";
import { getProblem } from "@/lib/problemStore";
import { starterCode } from "@/lib/javaTypes";

export const dynamic = "force-dynamic";

export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const problem = await getProblem((await params).id);
  if (!problem) notFound();
  const html = await marked.parse(problem.description || "_No description._");
  return <Workspace problem={problem} descriptionHtml={html} starter={starterCode(problem)} />;
}
