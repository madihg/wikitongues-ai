"use client";

import { useEffect, useState } from "react";
import { InfoTip } from "@/components/info-tip";

interface ProviderAmount {
  provider: string;
  amount: number;
  calls?: number;
  jobs?: number;
}
interface JobRow {
  id: string;
  provider: string;
  method: string;
  baseModelId: string;
  amount: number;
  status: string;
  createdAt: string;
}
interface LedgerRow {
  id: string;
  category: string;
  provider: string;
  label: string;
  amount: number;
  estimated: boolean;
  createdAt: string;
}
interface BurndownRow {
  provider: string;
  purchased: number;
  consumed: number;
  remainingEstimate: number;
}
interface CostData {
  grandTotal: number;
  cashTotal: number;
  burndown: BurndownRow[];
  togetherTotal: number;
  inference: { total: number; calls: number; byProvider: ProviderAmount[] };
  finetune: { total: number; byProvider: ProviderAmount[]; jobs: JobRow[] };
  ledger: { total: number; cashTotal: number; entries: LedgerRow[] };
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function CostLedger() {
  const [data, setData] = useState<CostData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/arena/costs")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div className="py-10 text-sm text-text-tertiary">Loading…</div>;
  if (error)
    return (
      <div className="rounded-md border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">
        {error}
      </div>
    );
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Headline totals. Cash and consumption are DIFFERENT MONIES and are
          never summed: cash is what left the card (receipts), consumption is
          the burn against those credits (billed or estimated). Adding them
          would count every dollar twice. */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
            Cash spent
            <InfoTip width="w-72">
              Money that actually left the card: credit purchases and invoices,
              each backed by a receipt logged in the ledger below. This is the
              number to give a funder.
            </InfoTip>
          </div>
          <div className="mt-1 text-2xl font-semibold text-text-primary tabular-nums">
            {usd(data.cashTotal)}
          </div>
          <div className="mt-1 text-xs text-text-muted">from receipts</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
            Compute consumed
            <InfoTip width="w-72">
              What the platform has burned through: fine-tune training at the
              provider&apos;s own billed price, inference estimated from token
              counts against a published-rate table. Burns down the credits in
              &quot;Cash spent&quot; - it is not additional money.
            </InfoTip>
          </div>
          <div className="mt-1 text-2xl font-semibold text-text-primary tabular-nums">
            {usd(data.grandTotal)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
            Together (fine-tunes)
            <InfoTip width="w-72">
              All spend attributable to Together AI: fine-tune training runs
              plus any Together inference. Training figures here are
              Together&apos;s own billed price, not our estimate. Together
              reports it in nano-USD (billionths of a dollar), so a $4.00 run
              arrives as 4,000,000,000 and we convert on the way in.
            </InfoTip>
          </div>
          <div className="mt-1 text-2xl font-semibold text-text-primary tabular-nums">
            {usd(data.togetherTotal)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="text-xs text-text-tertiary">
            Inference (estimated)
          </div>
          <div className="mt-1 text-2xl font-semibold text-text-primary tabular-nums">
            {usd(data.inference.total)}
          </div>
          <div className="mt-1 text-xs text-text-muted">
            {data.inference.calls} generations
          </div>
        </div>
      </div>

      {/* Credits burn-down, only for providers with a recorded purchase */}
      {data.burndown.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
            Credit burn-down
            <InfoTip width="w-80">
              For providers where a credit purchase is on record: what was
              bought, what has been consumed against it, and the estimated
              remainder. Consumption is partly estimated, so the remainder is an
              estimate too. Providers without a logged purchase are not shown -
              a burn-down against unknown credits would be a made-up number.
            </InfoTip>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-tertiary">
                  <th className="pb-2 pr-4">Provider</th>
                  <th className="pb-2 pr-4 text-right">Credits bought</th>
                  <th className="pb-2 pr-4 text-right">Consumed</th>
                  <th className="pb-2 text-right">Est. remaining</th>
                </tr>
              </thead>
              <tbody>
                {data.burndown.map((b) => (
                  <tr key={b.provider} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-text-primary">
                      {b.provider}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-text-primary">
                      {usd(b.purchased)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-text-secondary">
                      {usd(b.consumed)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-text-primary">
                      {usd(b.remainingEstimate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Inference by provider */}
      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
          Inference by provider
          <InfoTip width="w-72">
            These are <strong>estimates</strong>, not billed amounts. No
            provider returns a per-call cost, so we price the token counts we
            recorded on every generated answer against a published-rate table.
            Fine-tune training figures below are different: those are real
            billed amounts where the provider reports one.
          </InfoTip>
        </h2>
        {data.inference.byProvider.length === 0 ? (
          <p className="text-sm text-text-tertiary">No generations yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.inference.byProvider.map((p) => (
                <tr
                  key={p.provider}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-2 text-text-secondary">{p.provider}</td>
                  <td className="py-2 text-right text-text-tertiary tabular-nums">
                    {p.calls} calls
                  </td>
                  <td className="py-2 text-right font-medium text-text-primary tabular-nums">
                    {usd(p.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Fine-tune jobs */}
      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text-primary">
          Fine-tune runs
          <InfoTip width="w-72">
            What each training run actually cost, taken from the provider rather
            than guessed. Together reports its price in nano-USD (billionths of
            a dollar) and we convert on the way in, so a $4.00 run arrives from
            the API as 4,000,000,000. OpenAI reports no price on the job, so its
            runs are priced from the trained-token count it does report, at the
            published training rate. Rows from the{" "}
            <span className="font-mono">mock</span> provider are simulated: no
            money changed hands.
          </InfoTip>
        </h2>
        <p className="mb-3 text-xs text-text-tertiary">
          Provider-reported amounts, one row per run.
        </p>
        {data.finetune.jobs.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            No fine-tune runs with recorded cost yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-strong text-left text-text-secondary">
                <th className="py-2 font-medium">Base model</th>
                <th className="py-2 font-medium">Provider</th>
                <th className="py-2 font-medium">Method</th>
                <th className="py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.finetune.jobs.map((j) => (
                <tr key={j.id} className="border-b border-border last:border-0">
                  <td className="py-2 font-mono text-xs text-text-secondary">
                    {j.baseModelId}
                  </td>
                  <td className="py-2 text-text-secondary">{j.provider}</td>
                  <td className="py-2 text-text-secondary">{j.method}</td>
                  <td className="py-2 text-right font-medium text-text-primary tabular-nums">
                    {usd(j.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Explicit ledger */}
      {data.ledger.entries.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            Logged entries
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {data.ledger.entries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="py-2 text-text-secondary">{e.label}</td>
                  <td className="py-2 text-text-tertiary">{e.category}</td>
                  <td className="py-2 text-text-tertiary">
                    {e.estimated ? "estimate" : "billed"}
                  </td>
                  <td className="py-2 text-right font-medium text-text-primary tabular-nums">
                    {usd(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-xs leading-relaxed text-text-tertiary">
        Which numbers are real:{" "}
        <strong>fine-tune runs are real billed amounts</strong> where the
        provider reports one. Together returns its price in nano-USD (billionths
        of a dollar) and we convert on the way in.{" "}
        <strong>Inference is an estimate</strong>, because no provider returns a
        per-call cost, so recorded token counts are priced against a
        published-rate table. Logged entries carry their own estimate-or-billed
        label. Update rates in{" "}
        <span className="font-mono">src/lib/arena/pricing.ts</span>.
      </p>
    </div>
  );
}
