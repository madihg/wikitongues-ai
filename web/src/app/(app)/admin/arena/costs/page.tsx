import Link from "next/link";
import { CostLedger } from "@/components/arena/cost-ledger";
import { InfoTip } from "@/components/info-tip";

export default function CostsPage() {
  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl text-text-primary">
            Cost ledger
            <InfoTip width="w-80">
              Every dollar the instrument spends, in one place: inference
              (estimated from token counts), and fine-tune training runs
              including the cost of Together sessions. Figures are estimates
              against a published-rate table.
            </InfoTip>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            A holistic view of spend across providers — inference for eval and
            arena generations, and fine-tune training (Together).
          </p>
        </div>
        <Link
          href="/admin/arena"
          className="shrink-0 rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
        >
          Back to Arena
        </Link>
      </div>
      <CostLedger />
    </div>
  );
}
