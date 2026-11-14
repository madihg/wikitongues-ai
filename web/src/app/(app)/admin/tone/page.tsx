import { ToneAdmin } from "@/components/tone/tone-admin";
import { requireResearcherPage } from "@/lib/admin/page-gate";

/**
 * Tone-mark pass 2, the researcher's view. The gate runs on the server
 * first: signed out goes to the login page, anyone but a researcher gets
 * the forbidden page, and nothing is rendered for either.
 */
export default async function ToneAdminPage() {
  await requireResearcherPage();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">
        Pass 2: tone marks
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-text-secondary">
        More than one person adds tone marks to a copy of the same answer. This
        page shows how far they agree, and where a decision is needed. The
        first versions are never changed.
      </p>
      <div className="mt-6">
        <ToneAdmin />
      </div>
    </div>
  );
}
