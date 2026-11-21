import TopBar from "@/components/TopBar";
import ProblemForm from "@/components/ProblemForm";
import { allTags } from "@/lib/problemStore";

export const dynamic = "force-dynamic";

export default async function NewProblemPage() {
  const knownTags = await allTags();
  return (
    <div className="min-h-full">
      <TopBar />
      <ProblemForm knownTags={knownTags} />
    </div>
  );
}
