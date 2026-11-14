import { AnnotatorActivity } from "@/components/admin/annotator-activity";
import { TimeSpent } from "@/components/admin/time-spent";

/**
 * People: who worked, for how many hours, and who is running out of prompts.
 * The hours table and the activity table are the two cards that used to sit
 * side by side near the foot of the Researcher Dashboard, unchanged. The
 * hours table belongs to the time work (measured hours, the recounted
 * estimate and the frozen old estimate side by side); this page only gives
 * it a home.
 */
export default function PeoplePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">People</h1>
        <p className="mt-2 text-sm text-text-tertiary">
          Who worked, for how many hours, and who is running out of prompts.
        </p>
      </div>
      <div className="space-y-6">
        <TimeSpent />
        <AnnotatorActivity />
      </div>
    </div>
  );
}
