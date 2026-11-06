import { InfoTip } from "@/components/info-tip";
import type { Ledger } from "@/lib/speech/ledger";

/** Hours of kept, non-demo clips by tier, speaker, dialect and consent state. */

function Block({ title, rows }: { title: string; rows: Record<string, number> }) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-text-muted">none</p>
      ) : (
        <table className="mt-1 w-full text-sm">
          <tbody>
            {entries.map(([k, h]) => (
              <tr key={k} className="border-t border-border first:border-t-0">
                <td className="py-1 text-text-secondary">{k}</td>
                <td className="py-1 text-right font-mono text-text-primary">
                  {h.toFixed(2)} h
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function SpeechLedgerCard({ ledger }: { ledger: Ledger }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
        Hours ledger
        <InfoTip>
          Kept clips only. Demo clips and everything from a speaker who has
          withdrawn are left out. Speakers appear under a pseudonym.
        </InfoTip>
      </h2>
      <p className="mt-1 text-sm text-text-tertiary">
        <span className="font-mono text-text-primary">
          {ledger.totalHours.toFixed(2)} h
        </span>{" "}
        across <span className="font-mono">{ledger.clips}</span> clips.
      </p>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <Block title="Tier" rows={ledger.byTier} />
        <Block title="Consent" rows={ledger.byConsent} />
        <Block title="Dialect" rows={ledger.byDialect} />
        <Block title="Speaker" rows={ledger.bySpeaker} />
      </div>
    </section>
  );
}
