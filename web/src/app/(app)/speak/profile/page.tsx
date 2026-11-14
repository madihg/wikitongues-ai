import { requireSpeakPage } from "@/lib/speech/page-gate";
import { ProfileForm } from "@/components/lab/profile-form";

export default async function SpeakProfilePage() {
  await requireSpeakPage();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Speaker profile</h1>
      <p className="mt-2 text-sm text-text-tertiary">
        Every question is optional. Your dialect helps the people who use the
        recordings. Age band and gender stay private unless you say they may be
        shared.
      </p>
      <div className="mt-6">
        <ProfileForm />
      </div>
    </div>
  );
}
