import { HelpButton } from "@/components/help-button";
import {
  BUCKETS,
  RUBRIC_V2,
  RUBRIC_VERSION,
  axisAnchors,
  bucketLabel,
  type RubricV2Axis,
} from "@/lib/buckets";

/**
 * Standalone rubric reference (/annotator/rubric). Built entirely from the
 * RUBRIC_V2 / BUCKETS config in src/lib/buckets.ts - nothing here is
 * hardcoded, so a rubric change in config auto-updates this page.
 *
 * Why this page exists: the rubric otherwise only renders mid-annotation,
 * after an annotator picks a winner - and "both inadequate" (the common
 * case) skips it entirely, so annotators and reviewers had no way to browse
 * it. Pure config render, no fetches - safe as a server component.
 */

const PASS_ORDER: RubricV2Axis["pass"][] = ["linguistic", "pragmatics"];

const PASS_INFO: Record<
  RubricV2Axis["pass"],
  { title: string; blurb: string }
> = {
  linguistic: {
    title: "Pass 1 - the language itself",
    blurb:
      "Is the Igala correct on its own terms - grammar, word choice, spelling, tone marks, and meaning.",
  },
  pragmatics: {
    title: "Pass 2 - pragmatics & cultural fit",
    blurb:
      "Stepping back: does the answer fit Igala culture, sound like a real speaker would say it, and stay free of contamination from other languages?",
  },
};

function anchorChipClass(score: number): string {
  if (score === 0) return "bg-danger-subtle text-danger";
  if (score === 5) return "bg-success-subtle text-success";
  return "bg-warning-subtle text-warning";
}

function AxisCard({ axis }: { axis: RubricV2Axis }) {
  const anchors = axisAnchors(axis.key);
  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-base font-semibold text-text-primary">
          {axis.label}
        </h3>
        <span className="font-mono text-xs text-text-muted">{axis.key}</span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
        {axis.description}
      </p>
      {anchors.length > 0 && (
        <div className="mt-3 space-y-1.5 rounded-md border border-border bg-surface-sunken px-3 py-2.5">
          {anchors.map((anchor) => (
            <div
              key={anchor.score}
              className="flex items-start gap-2 text-xs leading-snug"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[11px] font-semibold ${anchorChipClass(anchor.score)}`}
              >
                {anchor.score}
              </span>
              <span className="text-text-secondary">{anchor.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RubricReferencePage() {
  const presentPasses = new Set(RUBRIC_V2.map((a) => a.pass));
  const orderedPasses = PASS_ORDER.filter((p) => presentPasses.has(p));
  // Any pass value that shows up in config but isn't in our known order still
  // renders, just appended at the end, so a new pass never silently vanishes.
  const extraPasses = Array.from(presentPasses).filter(
    (p) => !PASS_ORDER.includes(p),
  );

  return (
    <div>
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-text-primary">
            Scoring Rubric
          </h1>
          <span className="inline-flex items-center rounded-full bg-accent-subtle px-2.5 py-0.5 text-xs font-medium text-accent-text">
            {RUBRIC_VERSION}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-tertiary">
          These are the qualities annotators score when a model output wins a
          comparison. Scores run 0 (completely wrong) to 5 (what a fluent
          speaker would write); an axis can be N/A when it does not apply.
        </p>
      </div>

      <div className="mb-8 rounded-lg border border-info/30 bg-info-subtle p-5">
        <p className="text-sm font-semibold text-info">
          Where do these appear?
        </p>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          During annotation, the rubric shows after you pick output A or B as
          the winner - you score the winner. Choosing &quot;both
          inadequate&quot; skips scoring, which is why you may not have seen it
          yet.
        </p>
      </div>

      {[...orderedPasses, ...extraPasses].map((pass) => {
        const axes = RUBRIC_V2.filter((a) => a.pass === pass);
        if (axes.length === 0) return null;
        const info = PASS_INFO[pass] ?? { title: pass, blurb: "" };
        return (
          <div key={pass} className="mb-10">
            <h2 className="text-lg font-semibold text-text-primary">
              {info.title}
            </h2>
            {info.blurb && (
              <p className="mt-1 text-sm text-text-tertiary">{info.blurb}</p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {axes.map((axis) => (
                <AxisCard key={axis.key} axis={axis} />
              ))}
            </div>
          </div>
        );
      })}

      <div className="mb-10">
        <h2 className="text-lg font-semibold text-text-primary">
          Which axes apply to which prompt category
        </h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Not every axis applies to every prompt category - annotators only
          score the axes relevant to the category.
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-sunken">
              <tr>
                <th
                  scope="col"
                  className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-tertiary"
                >
                  Prompt category
                </th>
                {RUBRIC_V2.map((axis) => (
                  <th
                    key={axis.key}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-text-tertiary"
                  >
                    {axis.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {BUCKETS.map((bucket) => (
                <tr key={bucket.key}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm font-medium text-text-primary">
                    {bucketLabel(bucket.key)}
                  </td>
                  {RUBRIC_V2.map((axis) => {
                    const inScope = bucket.axes.includes(axis.key);
                    return (
                      <td key={axis.key} className="px-3 py-2.5 text-center">
                        {inScope ? (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-subtle text-xs font-medium text-accent-text">
                            ✓
                          </span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <HelpButton
        title="Scoring Rubric"
        description="A browsable reference for the axes annotators score after picking a winning output, and which axes apply to which prompt category. Use it to train new annotators or double-check a score before submitting. This page is read-only - it mirrors the live rubric config and never changes any data."
      />
    </div>
  );
}
