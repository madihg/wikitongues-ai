import { CandidateRegistry } from "@/components/arena/candidate-registry";

export default function CandidatesPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl text-text-primary">Candidate Models</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          The registry of model variants in the arena. Each one is a
          reproducible generation recipe, so &quot;Claude baseline&quot;,
          &quot;Gemini + RAG&quot;, and a fine-tuned variant are all just rows
          that differ by a single ingredient. Registering a candidate does not
          rank it: it only makes it eligible to answer the frozen benchmark and
          be shown to annotators blind.
        </p>
      </div>

      <CandidateRegistry />
    </div>
  );
}
