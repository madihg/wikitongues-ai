import { ToneAdmin } from "@/components/tone/tone-admin";

/**
 * Tone-mark pass 2, the researcher's view. Lives under the admin layout, so
 * the RoleGuard already restricts it to RESEARCHER.
 */
export default function ToneAdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">
        Pass 2: tone marks
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-text-secondary">
        More than one person adds tone marks to a copy of the same answer. This
        page shows how far they agree, and where a decision is needed. The first
        versions are never changed.
      </p>
      <div className="mt-6">
        <ToneAdmin />
      </div>
    </div>
  );
}
