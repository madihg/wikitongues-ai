import { CostLedger } from "@/components/arena/cost-ledger";
import { InfoTip } from "@/components/info-tip";

export default function CostsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl text-text-primary">
          Cost ledger
          <InfoTip width="w-80">
            Every dollar the instrument spends, in one place: inference for eval
            and arena generations, and fine-tune training runs. Where the
            provider reports what it actually billed, that is the number shown -
            Together returns its price in nano-USD (billionths of a dollar) and
            we convert, so a $4.00 run arrives as 4,000,000,000. Where no
            provider figure exists, the line is an estimate from token counts
            against a published-rate table, and it is labelled as an estimate.
          </InfoTip>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Spend across providers: inference for eval and arena generations, and
          fine-tune training. Real billed amounts where the provider reports
          them, estimates otherwise, each one labelled.
        </p>
      </div>
      <CostLedger />
    </div>
  );
}
