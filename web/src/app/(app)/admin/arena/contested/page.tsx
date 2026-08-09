import { ContestedItems } from "@/components/arena/contested-items";

export default function ContestedPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl text-text-primary">Collective Review</h1>
        <p className="mt-2 max-w-3xl text-sm text-text-secondary">
          The places where we do not agree with each other, and the corrections
          waiting for a second pair of eyes. There are two kinds of disagreement
          on this page and they are not the same thing: one is about which model
          answered better, the other is about how we ourselves write Igala. The
          second one is where the work is.
        </p>
      </div>
      <ContestedItems />
    </div>
  );
}
