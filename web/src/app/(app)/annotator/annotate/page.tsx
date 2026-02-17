import { AnnotationInterface } from "@/components/annotation-interface";

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
    </div>
  );
}
