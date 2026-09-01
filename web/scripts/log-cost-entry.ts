/**
 * LOG COST ENTRY - append one row to the cost ledger (CostEntry) by hand.
 *
 * The ledger is append-only: this script only ever creates. It never updates
 * or deletes an existing row, because a ledger you can rewrite is not a
 * ledger. To correct a mistake, log a compensating row and say so in its label.
 *
 * WHICH CATEGORY. "credits" is CASH leaving the card - a credit purchase or an
 * invoice, backed by a receipt; /api/arena/costs reports it as cashTotal and
 * never inside consumption. Every other category is CONSUMPTION burning those
 * credits down. Note that "eval_generation" rows are an audit trail only: the
 * costs route excludes them from its consumption sum because the generations
 * they describe are priced live from stored token counts.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/log-cost-entry.ts \
 *     --category credits --provider openrouter --amount 20 \
 *     --label "OpenRouter credits, one-time purchase" --actual
 *
 * Flags:
 *   --category <finetune|eval_generation|judge|inference|credits|other>
 *   --provider <string>        together, openai, anthropic, google, openrouter…
 *   --label    <string>        what this money was, in plain words
 *   --amount   <usd>           positive USD amount
 *   --actual | --estimated     billed-and-receipted vs derived from a rate table
 *   --ref-type <string>        optional provenance pointer
 *   --ref-id   <string>        optional provenance pointer
 *   --dry-run                  print the row that would be written, write nothing
 */

import { CostCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { roundUsd } from "@/lib/arena/pricing";

const CATEGORIES = Object.values(CostCategory) as string[];

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--"))
    throw new Error(`--${name} needs a value`);
  return v;
}
const has = (name: string) => process.argv.includes(`--${name}`);

function parseArgs() {
  const category = flag("category");
  const provider = flag("provider");
  const label = flag("label");
  const amountRaw = flag("amount");

  const missing = [
    ["--category", category],
    ["--provider", provider],
    ["--label", label],
    ["--amount", amountRaw],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length)
    throw new Error(`missing required flag(s): ${missing.join(", ")}`);

  if (!CATEGORIES.includes(category!))
    throw new Error(
      `unknown --category "${category}" (expected one of: ${CATEGORIES.join(", ")})`,
    );

  const amountUsd = Number(amountRaw);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0)
    throw new Error(`--amount must be a positive number, got "${amountRaw}"`);

  // Estimated-vs-actual is never guessed: one of the two flags is required, so
  // no row can silently claim to be billed when it was estimated.
  const actual = has("actual");
  const estimated = has("estimated");
  if (actual === estimated)
    throw new Error("pass exactly one of --actual or --estimated");

  return {
    category: category as CostCategory,
    provider: provider!,
    label: label!,
    amountUsd: roundUsd(amountUsd),
    estimated,
    refType: flag("ref-type") ?? null,
    refId: flag("ref-id") ?? null,
  };
}

async function main() {
  const data = parseArgs();

  if (has("dry-run")) {
    console.log("DRY RUN, nothing written:");
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const row = await prisma.costEntry.create({ data });
  console.log("wrote CostEntry:");
  console.log(
    JSON.stringify(
      {
        id: row.id,
        category: row.category,
        provider: row.provider,
        label: row.label,
        amountUsd: row.amountUsd,
        estimated: row.estimated,
        refType: row.refType,
        refId: row.refId,
        createdAt: row.createdAt,
      },
      null,
      2,
    ),
  );

  // Echo the ledger's two totals so the effect of the write is visible at once.
  const all = await prisma.costEntry.findMany();
  const cash = all
    .filter((e) => e.category === "credits")
    .reduce((s, e) => s + e.amountUsd, 0);
  const ledgerConsumption = all
    .filter((e) => e.category !== "credits" && e.category !== "eval_generation")
    .reduce((s, e) => s + e.amountUsd, 0);
  console.log(
    `ledger now: cash $${roundUsd(cash).toFixed(2)}, ledger consumption $${roundUsd(
      ledgerConsumption,
    ).toFixed(2)} (eval_generation rows excluded - already in inference)`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
