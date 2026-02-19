import { AnnotationInterface } from "@/components/annotation-interface";
import { HelpButton } from "@/components/help-button";

export default function AnnotatePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Annotate</h1>
      <p className="mt-2 text-sm text-gray-500">
        Compare model outputs side-by-side and score them on cultural accuracy,
        linguistic authenticity, creative depth, and factual correctness.
      </p>
      <div className="mt-6">
        <AnnotationInterface />
      </div>
      <HelpButton
        title="Annotate"
        description="This screen presents pairs of AI-generated responses to the same prompt. Your job is to compare them side-by-side and score each on four dimensions: cultural accuracy, linguistic authenticity, creative depth, and factual correctness. Your annotations help train and evaluate language models on underrepresented languages."
      />
    </div>
  );
}
