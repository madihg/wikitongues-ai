import { InfoTip } from "@/components/info-tip";
import type { Explained } from "@/lib/admin/measure/copy";

/**
 * Small pieces shared by the two halves of the speech measurement view.
 * The rule they exist to enforce: no number without its plain sentence one
 * tap away, and no percentage without the word that says how far to trust it.
 */

/** A label with its meaning and when to trust it, one tap away. */
export function Term({ of }: { of: Explained }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {of.label}
      <InfoTip label={`What "${of.label}" means`} width="w-80">
        <span className="block">{of.meaning}</span>
        <span className="mt-2 block text-text-tertiary">
          Trust it when: {of.trust}
        </span>
      </InfoTip>
    </span>
  );
}

/** The sample word, with what it means and how far the next one is. */
export function Sample({
  word,
  meaning,
  next,
}: {
  word: string;
  meaning: string;
  next: string | null;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="text-text-tertiary">Sample:</span>
      <span className="rounded border border-border-strong px-1.5 py-0.5 font-medium text-text-primary">
        {word}
      </span>
      <InfoTip label={`What "${word}" means`} width="w-80">
        <span className="block">{meaning}</span>
        {next && <span className="mt-2 block text-text-tertiary">{next}</span>}
      </InfoTip>
    </span>
  );
}

export const pct = (share: number, digits = 1) =>
  `${(share * 100).toFixed(digits)}%`;

/** "27 to 35" for a range of shares, in whole percent. */
export const pctRange = (lo: number, hi: number) =>
  `${Math.round(lo * 100)} to ${Math.round(hi * 100)}`;

export const signed = (points: number, digits = 1) =>
  `${points > 0 ? "+" : ""}${points.toFixed(digits)}`;

export const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Lagos",
  });

/** An honest empty state: one sentence, and what would fill it when known. */
export function Empty({
  children,
  next,
}: {
  children: React.ReactNode;
  next?: string | null;
}) {
  return (
    <div className="rounded-md border border-dashed border-border-strong px-4 py-3 text-sm text-text-secondary">
      {children}
      {next && <span className="mt-1 block text-text-tertiary">{next}</span>}
    </div>
  );
}

export const card = "rounded-lg border border-border bg-surface p-6";
export const subhead = "text-sm font-semibold text-text-primary";
export const eyebrow =
  "font-mono text-xs uppercase tracking-widest text-text-muted";
export const th =
  "px-2 py-1.5 text-left text-xs font-medium text-text-tertiary";
export const td = "px-2 py-2 tabular-nums";
