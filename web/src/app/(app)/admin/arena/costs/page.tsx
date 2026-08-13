import { CostLedger } from "@/components/arena/cost-ledger";
import { InfoTip } from "@/components/info-tip";

export default function CostsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl text-text-primary">
          Cost ledger
          <InfoTip width="w-80">
            Two lanes that are never added together. CASH SPENT is money that
            left the card - credit purchases and invoices, each backed by a
            receipt. COMPUTE CONSUMED is the burn against those credits:
            fine-tune training at the provider&apos;s own billed price,
            inference estimated from token counts against a published-rate
            table. Summing the lanes would count every dollar twice - once when
            bought, once when spent. Together reports billed prices in nano-USD
            (billionths of a dollar); we convert on the way in.
          </InfoTip>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Cash out of pocket on the left, compute burned against it on the
          right, and a per-provider burn-down where a purchase is on record.
          Real billed amounts where the provider reports them, estimates
          otherwise, each one labelled.
        </p>
      </div>
      <CostLedger />
    </div>
  );
}
