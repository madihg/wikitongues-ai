import { prisma } from "@/lib/prisma";
import { isMissingTable } from "@/lib/answer-revisions";
import type { SftSourceRow, ToneLayers } from "@/lib/arena/training-export";
import { buildCsv, joinList, type CsvColumn } from "@/lib/export-csv";
import type { AgreementSummary } from "@/lib/tone/agreement";

/**
 * TONE-MARK PASS 2 IN THE EXPORTS.
 *
 * Research: tone_pass.csv, long format, one row per layer of each item that
 * is in a tone set: the pass-1 text (layer "pass1"), every marker's copy
 * (layer "pass2", with the marker's id) and the agreed text (layer
 * "agreed"). The consent flags and the split travel with every row, as in
 * every other export. The existing files (gold_answers.csv, edits.csv) are
 * not changed: an answer that never got a second pass exports exactly as it
 * does today.
 *
 * Training: the same layers ride beside an SFT row as `tone` (see
 * buildSftExamples). The completion stays the pass-1 text.
 */

export type ToneLayerName = "pass1" | "pass2" | "agreed";

export interface ToneLayerRow {
  itemId: string;
  setName: string;
  sourceType: string;
  sourceId: string;
  promptRef: string;
  layer: ToneLayerName;
  text: string;
  /** pass2 only. */
  annotatorId: string | null;
  /** agreed only: exact | majority | adjudicated. */
  method: string | null;
  flaggedCorrection: boolean | null;
  flagText: string | null;
  unsureWords: number[];
  cells: string[];
  consentTraining: boolean | null;
  consentBenchmark: boolean | null;
  split: string | null;
  isHoldout: boolean | null;
  at: string | null;
}

export interface ToneItemForExport {
  id: string;
  setName: string;
  sourceType: string;
  sourceId: string;
  sourceTextSnapshot: string;
  cells: string[];
  createdAt: Date;
  promptRef: string;
  consentTraining: boolean | null;
  consentBenchmark: boolean | null;
  split: string | null;
  isHoldout: boolean | null;
  passes: {
    annotatorId: string;
    toneMarkedText: string;
    flaggedNonToneChange: boolean;
    flagText: string | null;
    unsureWords: number[];
    updatedAt: Date;
  }[];
  agreed: { agreedText: string; method: string; agreedAt: Date } | null;
}

/** Pure: the long-format rows of the research export. */
export function toneLayerRows(items: ToneItemForExport[]): ToneLayerRow[] {
  const out: ToneLayerRow[] = [];
  for (const i of items) {
    const base = {
      itemId: i.id,
      setName: i.setName,
      sourceType: i.sourceType,
      sourceId: i.sourceId,
      promptRef: i.promptRef,
      cells: i.cells,
      consentTraining: i.consentTraining,
      consentBenchmark: i.consentBenchmark,
      split: i.split,
      isHoldout: i.isHoldout,
    };
    out.push({
      ...base,
      layer: "pass1",
      text: i.sourceTextSnapshot,
      annotatorId: null,
      method: null,
      flaggedCorrection: null,
      flagText: null,
      unsureWords: [],
      at: i.createdAt.toISOString(),
    });
    for (const p of i.passes) {
      out.push({
        ...base,
        layer: "pass2",
        text: p.toneMarkedText,
        annotatorId: p.annotatorId,
        method: null,
        flaggedCorrection: p.flaggedNonToneChange,
        flagText: p.flagText,
        unsureWords: p.unsureWords,
        at: p.updatedAt.toISOString(),
      });
    }
    if (i.agreed) {
      out.push({
        ...base,
        layer: "agreed",
        text: i.agreed.agreedText,
        annotatorId: null,
        method: i.agreed.method,
        flaggedCorrection: null,
        flagText: null,
        unsureWords: [],
        at: i.agreed.agreedAt.toISOString(),
      });
    }
  }
  return out;
}

const LAYER_COLUMNS: CsvColumn<ToneLayerRow>[] = [
  { key: "item_id", get: (r) => r.itemId },
  { key: "tone_set", get: (r) => r.setName },
  // Joins to gold_answers.csv (cold) or edits.csv (edit) on `id`.
  { key: "source_type", get: (r) => r.sourceType },
  { key: "source_id", get: (r) => r.sourceId },
  { key: "prompt_ref", get: (r) => r.promptRef },
  { key: "layer", get: (r) => r.layer },
  { key: "igala_text", get: (r) => r.text },
  { key: "consent_training", get: (r) => r.consentTraining },
  { key: "consent_benchmark", get: (r) => r.consentBenchmark },
  { key: "marker_id", get: (r) => r.annotatorId },
  { key: "agreed_method", get: (r) => r.method },
  { key: "flagged_correction", get: (r) => r.flaggedCorrection },
  { key: "proposed_correction", get: (r) => r.flagText },
  { key: "unsure_word_positions", get: (r) => r.unsureWords.join(";") },
  { key: "coverage_cells", get: (r) => joinList(r.cells) },
  { key: "split", get: (r) => r.split },
  { key: "is_holdout", get: (r) => r.isHoldout },
  { key: "at", get: (r) => r.at },
];

export function toneLayersCsv(rows: ToneLayerRow[]): string {
  return buildCsv(LAYER_COLUMNS, rows);
}

/** The research export, from the database. Pass 1 is only read here. */
export async function exportTonePass(): Promise<string> {
  const items = await prisma.tonePassItem.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      setName: true,
      sourceType: true,
      sourceId: true,
      promptId: true,
      sourceTextSnapshot: true,
      cells: true,
      createdAt: true,
    },
  });
  const ids = items.map((i) => i.id);
  const idsOf = (type: string) =>
    items.filter((i) => i.sourceType === type).map((i) => i.sourceId);
  const [passes, agreed, prompts, cold, edits] = await Promise.all([
    prisma.tonePass.findMany({
      where: { itemId: { in: ids } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        itemId: true,
        annotatorId: true,
        toneMarkedText: true,
        flaggedNonToneChange: true,
        flagText: true,
        unsureWords: true,
        updatedAt: true,
      },
    }),
    prisma.tonePassAgreed.findMany({
      where: { itemId: { in: ids } },
      select: { itemId: true, agreedText: true, method: true, agreedAt: true },
    }),
    prisma.prompt.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.promptId))] } },
      select: { id: true, promptId: true, split: true, isHoldout: true },
    }),
    prisma.coldAuthorAnswer.findMany({
      where: { id: { in: idsOf("cold") } },
      select: { id: true, consentTraining: true, consentBenchmark: true },
    }),
    prisma.outputEdit.findMany({
      where: { id: { in: idsOf("edit") } },
      select: { id: true, consentTraining: true, consentBenchmark: true },
    }),
  ]);
  const promptBy = new Map(prompts.map((p) => [p.id, p]));
  const consentBy = new Map(
    [
      ...cold.map((c) => ["cold", c] as const),
      ...edits.map((e) => ["edit", e] as const),
    ].map(([type, row]) => [`${type}:${row.id}`, row]),
  );
  const agreedBy = new Map(agreed.map((a) => [a.itemId, a]));
  return toneLayersCsv(
    toneLayerRows(
      items.map((i) => {
        const prompt = promptBy.get(i.promptId);
        const consent = consentBy.get(`${i.sourceType}:${i.sourceId}`);
        return {
          ...i,
          promptRef: prompt?.promptId ?? i.promptId,
          split: prompt?.split ?? null,
          isHoldout: prompt?.isHoldout ?? null,
          consentTraining: consent?.consentTraining ?? null,
          consentBenchmark: consent?.consentBenchmark ?? null,
          passes: passes.filter((p) => p.itemId === i.id),
          agreed: agreedBy.get(i.id) ?? null,
        };
      }),
    ),
  );
}

/**
 * Lay the tone layers beside the SFT source rows that have them. A row with
 * no second pass is returned as it came. If the tone tables are not there
 * yet, every row is returned as it came.
 */
export async function attachToneLayers(
  rows: SftSourceRow[],
): Promise<SftSourceRow[]> {
  const keys = rows.filter((r) => r.source).map((r) => r.source!.id);
  if (keys.length === 0) return rows;
  try {
    const items = await prisma.tonePassItem.findMany({
      where: { sourceId: { in: keys } },
      select: { id: true, sourceType: true, sourceId: true },
    });
    if (items.length === 0) return rows;
    const ids = items.map((i) => i.id);
    const [passes, agreed] = await Promise.all([
      prisma.tonePass.findMany({
        where: { itemId: { in: ids } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { itemId: true, annotatorId: true, toneMarkedText: true },
      }),
      prisma.tonePassAgreed.findMany({
        where: { itemId: { in: ids } },
        select: { itemId: true, agreedText: true, method: true },
      }),
    ]);
    const layers = new Map<string, ToneLayers>();
    for (const i of items) {
      const mine = passes.filter((p) => p.itemId === i.id);
      if (mine.length === 0) continue;
      const a = agreed.find((x) => x.itemId === i.id);
      const key = `${i.sourceType}:${i.sourceId}`;
      const have = layers.get(key);
      layers.set(key, {
        pass2: [
          ...(have?.pass2 ?? []),
          ...mine.map((p) => ({
            annotatorId: p.annotatorId,
            text: p.toneMarkedText,
          })),
        ],
        agreed:
          have?.agreed ?? (a ? { text: a.agreedText, method: a.method } : null),
      });
    }
    return rows.map((r) => {
      const tone = r.source
        ? layers.get(`${r.source.type}:${r.source.id}`)
        : undefined;
      return tone ? { ...r, tone } : r;
    });
  } catch (e) {
    // The training export must never fail because of this layer: without
    // it every row exports exactly as before.
    if (!isMissingTable(e)) console.error("tone layers not attached:", e);
    return rows;
  }
}

// ─── The admin view's CSV ───────────────────────────────────────────────────

interface AgreementCsvRow {
  section: string;
  key: string;
  items: number | null;
  compared: number | null;
  exact: number | null;
  syllables: number | null;
  syllablesAgreed: number | null;
  kappa: number | null;
}

/** One file, four sections: overall, per marker, per pair, per cell. */
export function agreementCsv(
  s: AgreementSummary,
  names: Record<string, string> = {},
): string {
  const name = (id: string) => names[id] ?? id;
  const rows: AgreementCsvRow[] = [
    {
      section: "overall",
      key: "all items",
      items: s.items,
      compared: s.compared,
      exact: s.exact,
      syllables: s.syllables,
      syllablesAgreed: s.syllablesAgreed,
      kappa: s.fleiss,
    },
    ...Object.entries(s.byStatus).map(([status, n]) => ({
      section: "status",
      key: status,
      items: n,
      compared: null,
      exact: null,
      syllables: null,
      syllablesAgreed: null,
      kappa: null,
    })),
    ...s.perAnnotator.map((a) => ({
      section: "marker",
      key: name(a.annotatorId),
      items: a.done,
      compared: null,
      exact: null,
      syllables: null,
      syllablesAgreed: null,
      kappa: null,
    })),
    ...s.pairs.map((p) => ({
      section: "pair",
      key: `${name(p.a)} + ${name(p.b)}`,
      items: p.items,
      compared: p.items,
      exact: p.exact,
      syllables: p.syllables,
      syllablesAgreed: null,
      kappa: p.kappa,
    })),
    ...s.perCell.map((c) => ({
      section: "cell",
      key: c.cell,
      items: c.items,
      compared: c.compared,
      exact: c.exact,
      syllables: c.syllables,
      syllablesAgreed: c.syllablesAgreed,
      kappa: null,
    })),
  ];
  const columns: CsvColumn<AgreementCsvRow>[] = [
    { key: "section", get: (r) => r.section },
    { key: "key", get: (r) => r.key },
    { key: "items", get: (r) => r.items },
    { key: "items_compared", get: (r) => r.compared },
    { key: "exact_matches", get: (r) => r.exact },
    { key: "syllables", get: (r) => r.syllables },
    { key: "syllables_agreed", get: (r) => r.syllablesAgreed },
    // Fleiss for "overall", Cohen for a pair. Blank when it is undefined.
    {
      key: "kappa",
      get: (r) => (r.kappa === null ? null : r.kappa.toFixed(4)),
    },
  ];
  return buildCsv(columns, rows);
}
