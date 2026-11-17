"use client";

import { useCallback, useEffect, useState } from "react";
import type { ItemStatus } from "@/lib/tone/agreement";
import { clusters } from "@/lib/tone/tone";
import type { ToneAdminData, ToneAdminItem } from "@/lib/tone/tone-pass";

/**
 * The researcher's view of tone-mark pass 2: items done per marker,
 * agreement per pair of markers and per coverage cell, homograph families
 * with what was agreed for them, and every item that needs a decision, with
 * all versions side by side and the syllables that differ marked.
 */

const STATUS_LABEL: Record<ItemStatus | "adjudicated", string> = {
  waiting: "Waiting for markers",
  agreed_exact: "Agreed, exact match",
  agreed_majority: "Agreed by majority",
  needs_third: "Needs a third marker",
  needs_adjudication: "Needs the adjudicator",
  adjudicated: "Decided by the adjudicator",
};

const kappa = (k: number | null) => (k === null ? "n/a" : k.toFixed(2));
const share = (part: number, whole: number) =>
  whole === 0 ? "n/a" : `${Math.round((100 * part) / whole)}%`;

const TH =
  "px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary";
const TD = "px-3 py-2 text-sm text-text-primary";

/** One version, with the letters whose tone the markers disagree on marked. */
export function MarkedVersion({
  text,
  differing,
}: {
  text: string;
  differing: number[];
}) {
  return (
    <span className="whitespace-pre-wrap igala text-sm leading-relaxed">
      {clusters(text).map((c, i) => {
        const letter = (c.base + c.marks.join("") + c.tone.join("")).normalize(
          "NFC",
        );
        return differing.includes(i) ? (
          <mark
            key={i}
            className="rounded bg-warning-subtle px-0.5 text-text-primary"
          >
            {letter}
          </mark>
        ) : (
          <span key={i}>{letter}</span>
        );
      })}
    </span>
  );
}

export function ToneSummaryTables({ data }: { data: ToneAdminData }) {
  const s = data.summary;
  const name = (id: string) => data.names[id] ?? id;
  const homographs = s.perCell.filter((c) => c.cell.startsWith("homograph:"));
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-text-primary">
          Where it stands
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {s.items} items in the set. {data.assigned} given out, {data.skipped}{" "}
          skipped. {s.compared} have two or more versions; {s.exact} of those
          match exactly ({share(s.exact, s.compared)}). Syllables agreed:{" "}
          {s.syllablesAgreed} of {s.syllables} (
          {share(s.syllablesAgreed, s.syllables)}). Fleiss&apos; kappa over
          syllables: {kappa(s.fleiss)}.
        </p>
        <table className="mt-3 w-full max-w-md border border-border">
          <tbody>
            {(Object.keys(s.byStatus) as ItemStatus[]).map((k) => (
              <tr key={k} className="border-t border-border">
                <td className={TD}>{STATUS_LABEL[k]}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {s.byStatus[k]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-text-primary">
          Items done per marker
        </h2>
        <table className="mt-3 w-full max-w-md border border-border">
          <thead>
            <tr>
              <th className={TH}>Marker</th>
              <th className={`${TH} text-right`}>Items</th>
            </tr>
          </thead>
          <tbody>
            {s.perAnnotator.map((a) => (
              <tr key={a.annotatorId} className="border-t border-border">
                <td className={TD}>{name(a.annotatorId)}</td>
                <td className={`${TD} text-right tabular-nums`}>{a.done}</td>
              </tr>
            ))}
            {s.perAnnotator.length === 0 && (
              <tr className="border-t border-border">
                <td className={TD} colSpan={2}>
                  Nobody has marked an item yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-text-primary">
          Agreement per pair of markers
        </h2>
        <table className="mt-3 w-full border border-border">
          <thead>
            <tr>
              <th className={TH}>Pair</th>
              <th className={`${TH} text-right`}>Items both marked</th>
              <th className={`${TH} text-right`}>Exact matches</th>
              <th className={`${TH} text-right`}>Syllables</th>
              <th className={`${TH} text-right`}>Cohen&apos;s kappa</th>
            </tr>
          </thead>
          <tbody>
            {s.pairs.map((p) => (
              <tr key={`${p.a}|${p.b}`} className="border-t border-border">
                <td className={TD}>
                  {name(p.a)} and {name(p.b)}
                </td>
                <td className={`${TD} text-right tabular-nums`}>{p.items}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {p.exact} ({share(p.exact, p.items)})
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {p.syllables}
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {kappa(p.kappa)}
                </td>
              </tr>
            ))}
            {s.pairs.length === 0 && (
              <tr className="border-t border-border">
                <td className={TD} colSpan={5}>
                  No item has two versions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-text-primary">
          Agreement per coverage cell
        </h2>
        <table className="mt-3 w-full border border-border">
          <thead>
            <tr>
              <th className={TH}>Cell</th>
              <th className={`${TH} text-right`}>Items</th>
              <th className={`${TH} text-right`}>Compared</th>
              <th className={`${TH} text-right`}>Exact matches</th>
              <th className={`${TH} text-right`}>Syllables agreed</th>
            </tr>
          </thead>
          <tbody>
            {s.perCell.map((c) => (
              <tr key={c.cell} className="border-t border-border">
                <td className={`${TD} font-mono text-xs`}>{c.cell}</td>
                <td className={`${TD} text-right tabular-nums`}>{c.items}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {c.compared}
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {c.exact} ({share(c.exact, c.compared)})
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {share(c.syllablesAgreed, c.syllables)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-text-primary">
          Homograph families
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          What the markers agreed for each item of a family. Nothing here is a
          rule until the adjudicator has looked at it.
        </p>
        {homographs.length === 0 ? (
          <p className="mt-2 text-sm text-text-tertiary">
            No homograph family in the loaded set.
          </p>
        ) : (
          homographs.map((h) => (
            <div
              key={h.cell}
              className="mt-3 rounded-md border border-border p-3"
            >
              <p className="font-mono text-xs text-text-tertiary">{h.cell}</p>
              <ul className="mt-2 space-y-1">
                {data.items
                  .filter((i) => i.cells.includes(h.cell))
                  .map((i) => (
                    <li key={i.itemId} className="text-sm text-text-primary">
                      <span className="font-mono">
                        {i.agreed ? i.agreed.text : i.firstVersion}
                      </span>{" "}
                      <span className="text-xs text-text-tertiary">
                        {i.agreed
                          ? `agreed (${i.agreed.method})`
                          : "not agreed yet, first version shown"}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

export function ToneItemCard({
  item,
  names,
  onDecide,
}: {
  item: ToneAdminItem;
  names: Record<string, string>;
  /** Present for a researcher who may decide; the page passes it. */
  onDecide?: (itemId: string, agreedText: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(
    item.agreed?.text ?? item.versions[0]?.text ?? item.firstVersion,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <article
      data-testid="tone-item"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-text-secondary">
          {STATUS_LABEL[item.status]}
        </span>
        <span className="font-mono text-xs text-text-tertiary">
          {item.cells.join(", ")}
        </span>
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wider text-text-tertiary">
        First version
      </p>
      <p className="font-mono text-sm text-text-secondary">
        {item.firstVersion}
      </p>
      <div className="mt-3 space-y-2">
        {item.versions.map((v) => (
          <div key={v.annotatorId}>
            <p className="text-xs text-text-tertiary">
              {names[v.annotatorId] ?? v.annotatorId}
              {v.flagged ? ". Also proposed a correction." : ""}
              {v.unsureWords.length > 0
                ? ` Not sure about ${v.unsureWords.length} word(s).`
                : ""}
              {v.note ? ` Note: ${v.note}` : ""}
            </p>
            <MarkedVersion text={v.text} differing={item.differing} />
            {v.flagged && v.flagText && (
              <p className="mt-1 text-xs text-text-secondary">
                Proposed correction:{" "}
                <span className="font-mono">{v.flagText}</span>
              </p>
            )}
            {onDecide && (
              <button
                type="button"
                onClick={() => setDraft(v.text)}
                className="ml-2 min-h-[44px] cursor-pointer text-xs text-accent-text underline-offset-2 hover:underline"
              >
                Use this one
              </button>
            )}
          </div>
        ))}
      </div>
      {item.agreed && (
        <p className="mt-3 text-sm text-text-primary">
          Agreed ({item.agreed.method}):{" "}
          <span className="font-mono">{item.agreed.text}</span>
        </p>
      )}
      {onDecide && item.versions.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <label
            htmlFor={`decide-${item.itemId}`}
            className="text-xs font-medium uppercase tracking-wider text-text-tertiary"
          >
            The adjudicator&apos;s text (tone marks only)
          </label>
          <textarea
            id={`decide-${item.itemId}`}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 igala text-sm text-text-primary"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              disabled={busy || draft.trim().length === 0}
              onClick={async () => {
                setBusy(true);
                setMessage(await onDecide(item.itemId, draft));
                setBusy(false);
              }}
              className="min-h-[44px] cursor-pointer rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:opacity-40"
            >
              {busy ? "Saving..." : "Save the decision"}
            </button>
            {message && (
              <span role="status" className="text-sm text-text-secondary">
                {message}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export function ToneAdmin() {
  const [data, setData] = useState<ToneAdminData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tone");
      if (!res.ok) throw new Error("load");
      const j = (await res.json()) as ToneAdminData & { notReady?: boolean };
      if (j.notReady || !j.items || j.items.length === 0) {
        setState("empty");
        return;
      }
      setData(j);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return <p className="text-sm text-text-tertiary">Loading...</p>;
  }
  if (state === "error") {
    return (
      <p role="alert" className="text-sm text-danger">
        The tone pass could not be loaded. Reload the page to try again.
      </p>
    );
  }
  if (state === "empty" || !data) {
    return (
      <p
        data-testid="tone-admin-empty"
        className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary"
      >
        No tone set is loaded yet. Nothing has been given to anyone.
      </p>
    );
  }

  const decide = async (itemId: string, agreedText: string) => {
    const res = await fetch("/api/admin/tone/adjudicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, agreedText }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) return j?.error ?? "Could not save the decision.";
    await load();
    return "Saved.";
  };

  const open = data.items.filter(
    (i) => i.status === "needs_third" || i.status === "needs_adjudication",
  );
  const shown = showAll ? data.items : open;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <a
          href="/api/admin/tone/export?file=agreement"
          className="inline-flex min-h-[44px] items-center rounded-md border border-border-strong px-4 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
        >
          Download agreement (CSV)
        </a>
        <a
          href="/api/admin/tone/export?file=layers"
          className="inline-flex min-h-[44px] items-center rounded-md border border-border-strong px-4 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
        >
          Download pass 1, pass 2 and agreed texts (CSV)
        </a>
      </div>
      <ToneSummaryTables data={data} />
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">
            {showAll
              ? `All items (${data.items.length})`
              : `Items that need a decision (${open.length})`}
          </h2>
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="min-h-[44px] cursor-pointer rounded-md border border-border-strong px-4 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
          >
            {showAll
              ? "Show only items that need a decision"
              : "Show all items"}
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {shown.map((i) => (
            <ToneItemCard
              key={i.itemId}
              item={i}
              names={data.names}
              onDecide={decide}
            />
          ))}
          {shown.length === 0 && (
            <p className="text-sm text-text-tertiary">
              Nothing to decide right now.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
