import Link from "next/link";
import { CandidateDetail } from "@/components/arena/candidate-detail";
import { requireResearcherPage } from "@/lib/admin/page-gate";

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireResearcherPage();
  const { id } = await params;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/arena/candidates"
          className="inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          ← Back to candidates
        </Link>
      </div>

      <CandidateDetail id={id} />
    </div>
  );
}
