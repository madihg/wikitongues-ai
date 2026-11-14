import { ToneInterface } from "@/components/tone/tone-interface";
import { TONE_INSTRUCTION } from "@/lib/tone/tone-copy";

export default function TonePassPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">
        Pass 2: tone marks
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-text-secondary">
        {TONE_INSTRUCTION}
      </p>
      <div className="mt-6">
        <ToneInterface />
      </div>
    </div>
  );
}
