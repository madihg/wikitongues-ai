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
interface CostData {
  grandTotal: number;
  togetherTotal: number;
  inference: { total: number; calls: number; byProvider: ProviderAmount[] };
  finetune: { total: number; byProvider: ProviderAmount[]; jobs: JobRow[] };
  ledger: { total: number; entries: LedgerRow[] };
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
      {/* Headline totals */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="text-xs text-text-tertiary">Total spend</div>
          <div className="mt-1 text-2xl font-semibold text-text-primary tabular-nums">
            {usd(data.grandTotal)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
            Together (fine-tunes)
            <InfoTip width="w-72">
              All spend attributable to Together AI — fine-tune training runs
              plus any Together inference. This is the &quot;cost of our
              Together sessions&quot; line.
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

      {/* Inference by provider */}
      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
          Inference by provider
          <InfoTip width="w-72">
            Estimated from token counts on every generated answer against a
            published-rate table. Providers don&apos;t return per-call cost, so
            these are estimates.
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
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          Fine-tune runs
        </h2>
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
                  <td className="py-2 text-right font-medium text-text-primary tabular-nums">
                    {usd(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-xs text-text-tertiary">
        Inference and fine-tune figures are estimates against a published-rate
        table (providers don&apos;t return per-call cost). Update rates in{" "}
        <span className="font-mono">src/lib/arena/pricing.ts</span>.
      </p>
    </div>
  );
}
