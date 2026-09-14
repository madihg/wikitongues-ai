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
  /** Already inside the inference figure; listed for audit, not summed. */
  countedInInference?: boolean;
  createdAt: string;
}
interface BurndownRow {
  provider: string;
  purchased: number;
  consumed: number;
  remainingEstimate: number;
}
interface ClaudeRollup {
  subscription: number;
  credits: number;
  cash: number;
  consumption: number;
  providers: string[];
  entries: LedgerRow[];
}
interface CostData {
  grandTotal: number;
  cashTotal: number;
  creditsTotal?: number;
  subscriptionTotal?: number;
  claude?: ClaudeRollup;
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
              Money that actually left the card: prepaid API credits, and the
              plan subscriptions the team works on. Each one is backed by a
              receipt logged in the ledger below. This is the number to give a
              funder. It is not the same money as &quot;Compute consumed&quot;
              and the two are never added.
            </InfoTip>
          </div>
          <div className="mt-1 text-2xl font-semibold text-text-primary tabular-nums">
            {usd(data.cashTotal)}
          </div>
          <div className="mt-1 text-xs text-text-muted">
            {data.creditsTotal !== undefined &&
            data.subscriptionTotal !== undefined
              ? `${usd(data.creditsTotal)} API credits + ${usd(data.subscriptionTotal)} subscriptions`
              : "from receipts"}
          </div>
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

      {/* What Claude has cost, in one place. The subscription is the large
          half and the easiest to miss: it never shows up in a burn-down or a
          token count, because it buys the team's own tooling rather than API
          balance. Cash and consumption stay on separate lines here for the
          same reason they do at the top - they are different money. */}
      {data.claude && (
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
            What Claude has cost
            <InfoTip width="w-80">
              Every dollar this project has spent on Claude, from{" "}
              {data.claude.providers.join(" and ")}. The subscription is plan
              seats and the prepaid extra-usage top-ups that sit on them: real
              cash, but it buys no API balance, so it appears in no burn-down.
              Consumption is the measured burn of Claude models, priced from
              stored token counts. Cash and consumption are different money and
              are never added together.
            </InfoTip>
          </h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-text-tertiary">Subscription</div>
              <div className="mt-1 text-xl font-semibold text-text-primary tabular-nums">
                {usd(data.claude.subscription)}
              </div>
              <div className="mt-1 text-xs text-text-muted">plan seats</div>
            </div>
            <div>
              <div className="text-xs text-text-tertiary">API credits</div>
              <div className="mt-1 text-xl font-semibold text-text-primary tabular-nums">
                {usd(data.claude.credits)}
              </div>
              <div className="mt-1 text-xs text-text-muted">prepaid</div>
            </div>
            <div>
              <div className="text-xs text-text-tertiary">Cash total</div>
              <div className="mt-1 text-xl font-semibold text-text-primary tabular-nums">
                {usd(data.claude.cash)}
              </div>
              <div className="mt-1 text-xs text-text-muted">off the card</div>
            </div>
            <div>
              <div className="text-xs text-text-tertiary">
                Model burn (measured)
              </div>
              <div className="mt-1 text-xl font-semibold text-text-primary tabular-nums">
                {usd(data.claude.consumption)}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                not added to cash
              </div>
            </div>
          </div>
          {data.claude.entries.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-tertiary">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Kind</th>
                    <th className="pb-2 pr-4">What it was</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.claude.entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/50">
                      <td className="py-2 pr-4 whitespace-nowrap text-text-secondary tabular-nums">
                        {new Date(e.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-text-secondary">
                        {e.category === "subscription"
                          ? "subscription"
                          : "credits"}
                      </td>
                      <td className="py-2 pr-4 text-text-primary">{e.label}</td>
                      <td className="py-2 text-right tabular-nums text-text-primary">
                        {usd(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

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
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
            Logged entries
            <InfoTip width="w-80">
              Every row written to the cost ledger, kept whole as an audit
              trail. Rows marked{" "}
              <span className="font-medium">already in inference</span> record
              generation whose answers are stored with token counts, so
              &quot;Inference (estimated)&quot; above already prices them; they
              are listed here but left out of &quot;Compute consumed&quot; so
              the same dollar is not counted twice.
            </InfoTip>
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
                  <td className="py-2 text-text-tertiary">
                    {e.countedInInference ? "already in inference" : ""}
                  </td>
                  <td
                    className={`py-2 text-right font-medium tabular-nums ${
                      e.countedInInference
                        ? "text-text-tertiary"
                        : "text-text-primary"
                    }`}
                  >
                    {usd(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-text-tertiary">
            Rows marked{" "}
            <span className="font-medium">already in inference</span> are not
            added to &quot;Compute consumed&quot;: their generations are priced
            live from stored token counts, which is the single source of truth
            for generation cost. Ledger consumption counted above:{" "}
            <span className="tabular-nums">{usd(data.ledger.total)}</span>.
          </p>
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
