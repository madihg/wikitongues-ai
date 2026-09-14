/**
 * ONE-TIME BACKFILL, 2026-09-14: the Claude subscription and the Sep 14 Google
 * credit top-up.
 *
 * WHY THIS EXISTS. The ledger recorded three credit purchases ($20 Anthropic
 * API, $20 Google, $20 OpenRouter) and nothing else that left the card. But
 * the largest Claude cost of this project was never in it at all: the Claude
 * Max subscription the work is done on. Halim asked for it as its own section,
 * and a section with no rows behind it is a decoration.
 *
 * EVERY ROW BELOW IS A RECEIPT. Amounts, dates, receipt numbers, plan names
 * and billing periods were read out of the Anthropic receipt emails in
 * Halim's mailbox (invoice+statements@mail.anthropic.com), one email per row.
 * Nothing here is estimated, inferred, or prorated by us - where Anthropic
 * itself prorated (the Jul 13 mid-cycle upgrade), the row carries the amount
 * ACTUALLY PAID and the label says why it is not the list price.
 *
 * WHAT IS DELIBERATELY NOT HERE.
 *  - The May 8, 2026 receipt (#2083-0747-1704, $100.00, Max 5x, covering
 *    May 8 to Jun 8) is REAL but PRE-DATES this project: the first Wikitongues
 *    AI session state is 2026-06-22 and the June 11 payment is the first whose
 *    service period overlaps the work. Logging it would overstate what the
 *    project cost. If the accounting window should start earlier, log it with
 *    scripts/log-cost-entry.ts rather than editing this file - the ledger is
 *    append-only.
 *  - Any allocation of the subscription between this project and Halim's other
 *    work. The rows are the full amounts he paid, because that is what the
 *    receipts say. Allocation is a decision for Halim, not a number for a
 *    script to invent.
 *
 * CATEGORY. Plan seats and the "prepaid extra usage" top-ups go to
 * `subscription`, not `credits`: they are cash, but they buy no API balance,
 * so putting them in `credits` would make the per-provider burn-down show a
 * purchased balance that never burns. See prisma/schema.prisma.
 *
 * Idempotent: each row is keyed by refType+refId (the receipt number) and
 * skipped if already present. The ledger is append-only - this script only
 * ever creates.
 *
 *   npx tsx --env-file=.env.local scripts/log-claude-and-credits-2026-09-14.ts [--dry-run]
 */
import { CostCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface Row {
  category: CostCategory;
  provider: string;
  label: string;
  amountUsd: number;
  refType: string;
  refId: string;
}

const ROWS: Row[] = [
  // ── Claude Max plan seats, one row per receipt ────────────────────────────
  {
    category: "subscription",
    provider: "anthropic",
    label:
      "Claude Max plan 20x, Jun 11 to Jul 11 2026 - receipt #2035-7959-7424 (paid Jun 11, 2026, Link). The plan the platform is built on; first billing period overlapping this project.",
    amountUsd: 200,
    refType: "receipt",
    refId: "2035-7959-7424",
  },
  {
    category: "subscription",
    provider: "anthropic",
    label:
      "Claude Max plan 5x, Jul 11 to Aug 11 2026 - receipt #2932-1423-5334 (paid Jul 11, 2026, Link).",
    amountUsd: 100,
    refType: "receipt",
    refId: "2932-1423-5334",
  },
  {
    category: "subscription",
    provider: "anthropic",
    label:
      "Claude Max plan 20x, Jul 13 to Aug 13 2026 - receipt #2229-8867-6624 (paid Jul 13, 2026, Link). Mid-cycle upgrade: $200.00 list less a $93.53 proration credit for unused 5x time, so $106.47 was actually paid.",
    amountUsd: 106.47,
    refType: "receipt",
    refId: "2229-8867-6624",
  },
  {
    category: "subscription",
    provider: "anthropic",
    label:
      "Claude Max plan 20x, Aug 13 to Sep 13 2026 - receipt #2732-2182-1355 (paid Aug 13, 2026, Link).",
    amountUsd: 200,
    refType: "receipt",
    refId: "2732-2182-1355",
  },
  {
    category: "subscription",
    provider: "anthropic",
    label:
      "Claude Max plan 5x, Sep 13 to Oct 13 2026 - receipt #2465-3930-1869 (paid Sep 13, 2026, card ...7971).",
    amountUsd: 100,
    refType: "receipt",
    refId: "2465-3930-1869",
  },
  // ── Consumer-plan extra-usage top-ups, three on one day ───────────────────
  // The receipts read "Prepaid extra usage, Individual plan". Not API credits
  // (they name no API and buy no API balance) and not a seat, so they sit with
  // the subscription, labelled exactly as the receipt words them.
  {
    category: "subscription",
    provider: "anthropic",
    label:
      "Prepaid extra usage on the Claude Individual plan - receipt #2190-4041-6160 (paid Aug 21, 2026, Link). Plan-side usage top-up, not API credits.",
    amountUsd: 45,
    refType: "receipt",
    refId: "2190-4041-6160",
  },
  {
    category: "subscription",
    provider: "anthropic",
    label:
      "Prepaid extra usage on the Claude Individual plan - receipt #2672-3129-7060 (paid Aug 21, 2026, Link). Plan-side usage top-up, not API credits.",
    amountUsd: 45,
    refType: "receipt",
    refId: "2672-3129-7060",
  },
  {
    category: "subscription",
    provider: "anthropic",
    label:
      "Prepaid extra usage on the Claude Individual plan - receipt #2538-6506-0895 (paid Aug 21, 2026, Link). Plan-side usage top-up, not API credits.",
    amountUsd: 45,
    refType: "receipt",
    refId: "2538-6506-0895",
  },
  // ── Google Gemini API credit top-up ───────────────────────────────────────
  // From the AI Studio billing page on Sep 14, 2026: "$50.00 added on Sep 14",
  // prepay, auto-reload off, credit balance $48.32 immediately after.
  {
    category: "credits",
    provider: "google",
    label:
      "Gemini API prepaid credits, $50.00 added Sep 14 2026 (AI Studio billing account 01CF7A-0CAD97-63FC8A, prepay, auto-reload off). Funds the Gemini arms; balance read $48.32 just after the top-up.",
    amountUsd: 50,
    refType: "prepay_topup",
    refId: "google-2026-09-14",
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  let created = 0;
  let skipped = 0;
  for (const r of ROWS) {
    const existing = await prisma.costEntry.findFirst({
      where: { refType: r.refType, refId: r.refId },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      console.log(`  skip   ${r.refId.padEnd(20)} already logged`);
      continue;
    }
    if (dryRun) {
      console.log(
        `  WOULD  ${r.refId.padEnd(20)} ${r.category.padEnd(13)} $${r.amountUsd.toFixed(2)}`,
      );
      created++;
      continue;
    }
    await prisma.costEntry.create({
      data: {
        category: r.category,
        provider: r.provider,
        label: r.label,
        amountUsd: r.amountUsd,
        estimated: false, // every row is a receipt
        refType: r.refType,
        refId: r.refId,
      },
    });
    created++;
    console.log(
      `  logged ${r.refId.padEnd(20)} ${r.category.padEnd(13)} $${r.amountUsd.toFixed(2)}`,
    );
  }
  const subs = ROWS.filter((r) => r.category === "subscription");
  console.log(
    `\n${dryRun ? "DRY RUN - " : ""}created ${created}, skipped ${skipped}.`,
  );
  console.log(
    `  Claude subscription rows: ${subs.length}, $${subs.reduce((s, r) => s + r.amountUsd, 0).toFixed(2)}`,
  );
  console.log(
    "  Not logged: the May 8 2026 receipt (#2083-0747-1704, $100.00) pre-dates the project - see this file's header.",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
