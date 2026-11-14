import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  chooseSet,
  coverageCells,
  EXPECTED_CELLS,
  findHomographs,
  type Candidate,
} from "../src/lib/tone/coverage";
import { toneState, toneStats } from "../src/lib/tone/tone";

/**
 * TONE-MARK PASS 2, STEPS 1 AND 2: measure the problem today and propose a
 * representative set. READ-ONLY: it reads pass-1 answers and writes nothing
 * to the database. It loads nothing and assigns no one.
 *
 * It writes two public documents (numbers and row ids only, never a word of
 * Igala, never a name):
 *   tasks/tone-pass-2-baseline-2026-11.md
 *   tasks/tone-pass-2-set-2026-11.md
 * and one private JSON, outside the repository, with what must not be
 * published: which writer label is which person, and the homograph words.
 *
 *   npx tsx --env-file=.env.local scripts/tone-pass-2-measure.ts <private.json>
 */

const MIN_PER_CELL = 3;
const FIRST_BATCH = 30;

interface Row {
  id: string;
  source: "cold" | "edit";
  text: string;
  writerId: string;
  bucket: string;
  dialect: string | null;
  month: string;
  promptRef: string;
  promptText: string;
  frozen: boolean;
}

interface Tally {
  n: number;
  toned: number;
  dotted: number;
  syllables: number;
  marked: number;
  /** Within toned answers only. */
  tonedSyllables: number;
  tonedMarked: number;
  /** Within toned answers: words, and words carrying a mark. */
  tonedWords: number;
  tonedWordsMarked: number;
}
const empty = (): Tally => ({
  n: 0,
  toned: 0,
  dotted: 0,
  syllables: 0,
  marked: 0,
  tonedSyllables: 0,
  tonedMarked: 0,
  tonedWords: 0,
  tonedWordsMarked: 0,
});
function add(t: Tally, text: string) {
  const s = toneStats(text);
  t.n++;
  if (s.dotted) t.dotted++;
  t.syllables += s.syllables;
  t.marked += s.marked;
  if (s.hasTone) {
    t.toned++;
    t.tonedSyllables += s.syllables;
    t.tonedMarked += s.marked;
    for (const w of text.trim().split(/\s+/).filter(Boolean)) {
      t.tonedWords++;
      if (toneStats(w).hasTone) t.tonedWordsMarked++;
    }
  }
}
const pct = (part: number, whole: number) =>
  whole === 0 ? "n/a" : `${((100 * part) / whole).toFixed(1)}%`;
const frac = (part: number, whole: number) =>
  `${part}/${whole} (${pct(part, whole)})`;

function table(head: string[], rows: (string | number)[][]): string {
  return [
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}
function tallyRows(groups: Map<string, Tally>, sort: "n" | "key" = "n") {
  return [...groups.entries()]
    .sort((a, b) =>
      sort === "n"
        ? b[1].n - a[1].n || a[0].localeCompare(b[0])
        : a[0].localeCompare(b[0]),
    )
    .map(([key, t]) => [
      key,
      t.n,
      frac(t.toned, t.n),
      pct(t.marked, t.syllables),
      pct(t.tonedMarked, t.tonedSyllables),
      frac(t.dotted, t.n),
    ]);
}
const TALLY_HEAD = [
  "",
  "Answers",
  "With any tone mark",
  "Syllables marked, all answers",
  "Syllables marked, toned answers only",
  "With a dotted vowel",
];
function group(rows: Row[], key: (r: Row) => string): Map<string, Tally> {
  const out = new Map<string, Tally>();
  for (const r of rows) {
    const k = key(r);
    const t = out.get(k) ?? empty();
    add(t, r.text);
    out.set(k, t);
  }
  return out;
}

async function main() {
  const privatePath = process.argv[2];
  if (!privatePath)
    throw new Error("usage: tone-pass-2-measure.ts <private.json>");
  const repo = resolve(__dirname, "..", "..");
  const prisma = new PrismaClient();
  try {
    const [cold, edits] = await Promise.all([
      prisma.coldAuthorAnswer.findMany({
        where: { isDemo: false },
        select: {
          id: true,
          answerText: true,
          annotatorId: true,
          bucket: true,
          dialect: true,
          createdAt: true,
          prompt: {
            select: {
              promptId: true,
              text: true,
              bucket: true,
              isHoldout: true,
              split: true,
            },
          },
        },
      }),
      prisma.outputEdit.findMany({
        where: { isDemo: false },
        select: {
          id: true,
          correctedText: true,
          annotatorId: true,
          bucket: true,
          createdAt: true,
          modelOutput: {
            select: {
              prompt: {
                select: {
                  promptId: true,
                  text: true,
                  bucket: true,
                  isHoldout: true,
                  split: true,
                },
              },
            },
          },
        },
      }),
    ]);
    const users = await prisma.user.findMany({
      select: { id: true, name: true },
    });

    const rows: Row[] = [
      ...cold.map((c): Row => ({
        id: c.id,
        source: "cold",
        text: c.answerText,
        writerId: c.annotatorId,
        bucket: c.bucket ?? c.prompt.bucket,
        dialect: c.dialect,
        month: c.createdAt.toISOString().slice(0, 7),
        promptRef: c.prompt.promptId,
        promptText: c.prompt.text,
        frozen: c.prompt.isHoldout || c.prompt.split === "test",
      })),
      ...edits.map((e): Row => ({
        id: e.id,
        source: "edit",
        text: e.correctedText,
        writerId: e.annotatorId,
        bucket: e.bucket ?? e.modelOutput.prompt.bucket,
        dialect: null,
        month: e.createdAt.toISOString().slice(0, 7),
        promptRef: e.modelOutput.prompt.promptId,
        promptText: e.modelOutput.prompt.text,
        frozen:
          e.modelOutput.prompt.isHoldout ||
          e.modelOutput.prompt.split === "test",
      })),
    ].filter((r) => r.text.trim().length > 0);

    // Anonymous writer labels, by how many own answers each person wrote.
    const perWriter = new Map<string, number>();
    for (const r of rows.filter((x) => x.source === "cold")) {
      perWriter.set(r.writerId, (perWriter.get(r.writerId) ?? 0) + 1);
    }
    for (const r of rows)
      if (!perWriter.has(r.writerId)) perWriter.set(r.writerId, 0);
    const label = new Map(
      [...perWriter.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([id], i) => [id, `W${i + 1}`]),
    );
    const w = (r: Row) => label.get(r.writerId) ?? "W?";

    const coldRows = rows.filter((r) => r.source === "cold");
    const editRows = rows.filter((r) => r.source === "edit");
    const total = (list: Row[]) => {
      const t = empty();
      for (const r of list) add(t, r.text);
      return t;
    };
    const tc = total(coldRows);
    const te = total(editRows);

    // The "mark the tones" prompts: asked for tone in so many words.
    const asksTone = (r: Row) =>
      /\btone[- ]?mark|mark (all )?(the )?tones?\b/i.test(r.promptText);
    const asked = coldRows.filter(asksTone);
    const tAsked = total(asked);

    // Who writes the toned answers.
    const tonedByWriter = [...group(coldRows, w).entries()]
      .map(([k, t]) => ({ k, toned: t.toned, n: t.n }))
      .sort((a, b) => b.toned - a.toned);
    const top = tonedByWriter[0];

    const freeze = JSON.parse(
      readFileSync(join(repo, "tasks", "eval-freeze-v1.json"), "utf8"),
    ) as Record<string, unknown>;
    const frozenRefs = new Set<string>();
    JSON.stringify(freeze, (_k, v) => {
      if (typeof v === "string" && /^ig_[a-z_]+_\d+$/.test(v))
        frozenRefs.add(v);
      return v;
    });

    // Step 2: the set
    const pool = coldRows.filter((r) => !r.frozen);
    const leaked = pool.filter((r) => frozenRefs.has(r.promptRef)).length;
    const families = findHomographs(pool.map((r) => r.text));
    const stems = new Set(families.map((f) => f.stem));
    const familyName = new Map(families.map((f, i) => [f.stem, `H${i + 1}`]));
    const publicCell = (cell: string) =>
      cell.startsWith("homograph:")
        ? `homograph:${familyName.get(cell.slice("homograph:".length)) ?? "?"}`
        : cell;
    const candidates: Candidate[] = pool.map((r) => ({
      id: r.id,
      cells: coverageCells(r.text, {
        bucket: r.bucket,
        dialect: r.dialect,
        writer: w(r),
        homographs: stems,
      }).filter((c) => !c.startsWith("state:")),
      state: toneState(r.text),
    }));
    const set = chooseSet(candidates, MIN_PER_CELL);
    const byId = new Map(pool.map((r) => [r.id, r]));
    const inSet = set.ids.map((id) => byId.get(id)!);
    const present = new Set(set.cells.map((c) => c.cell));
    const emptyCells = EXPECTED_CELLS.filter((c) => !present.has(c));
    const stateOf = (list: Row[]) => {
      const out = { untoned: 0, partly: 0, toned: 0 };
      for (const r of list) out[toneState(r.text)]++;
      return out;
    };
    const setState = stateOf(inSet);
    const first = set.order.slice(0, FIRST_BATCH);
    const firstCells = new Set(
      first.flatMap((id) => candidates.find((c) => c.id === id)?.cells ?? []),
    );

    const today = new Date().toISOString().slice(0, 10);

    // Baseline document
    const baseline = `# Tone-mark pass 2: baseline (measured ${today})

Step 1 of the tone-mark second pass (hmart task 1549b74a). Every figure below was measured on the live data by \`web/scripts/tone-pass-2-measure.ts\`, read-only. Nothing was loaded and nothing was changed. This file holds numbers only: no Igala text and no names. Writers are labelled W1, W2 and so on, by how many own answers they wrote; the key is kept outside this repository.

## What counts as a tone mark

Detection is on NFD, storage on NFC. The code is \`web/src/lib/tone/tone.ts\`.

| Mark | Code point | Counts as |
|---|---|---|
| acute | U+0301 | tone, High |
| grave | U+0300 | tone, Low |
| macron | U+0304 | tone, Mid, on a vowel only |
| caron | U+030C | tone, rising |
| circumflex | U+0302 | tone, falling |
| double acute, double grave | U+030B, U+030F | tone, other |
| dot below | U+0323 | NOT tone: vowel quality |
| tilde, dot above or macron on n | U+0303, U+0307, U+0304 | NOT tone: the engma |

A syllable is a vowel. A nasal counts as a tone-bearing unit only when it carries a tone mark. An unmarked vowel is unmarked, never Mid.

## Which rows are pass 1

- \`ColdAuthorAnswer.answerText\`, both provenances: the speaker's own answer. This is pass 1 for tone set v1.
- \`OutputEdit.correctedText\`: a speaker's correction of a model answer. Measured below, not proposed for set v1: its wording starts from a model, and the own answers are the corpus the project publishes. It can be a later set with no change to the code (\`sourceType = "edit"\`).

Demo rows are left out everywhere.

## Overall

${table(TALLY_HEAD, [
  [
    "Own answers (ColdAuthorAnswer)",
    tc.n,
    frac(tc.toned, tc.n),
    pct(tc.marked, tc.syllables),
    pct(tc.tonedMarked, tc.tonedSyllables),
    frac(tc.dotted, tc.n),
  ],
  [
    "Corrections (OutputEdit)",
    te.n,
    frac(te.toned, te.n),
    pct(te.marked, te.syllables),
    pct(te.tonedMarked, te.tonedSyllables),
    frac(te.dotted, te.n),
  ],
])}

Within the own answers that carry any tone mark, ${frac(tc.tonedWordsMarked, tc.tonedWords)} of words carry a mark.

## Against the figures in the repository's grammar notes

The notes (\`tasks/igala-grammar-deduced.md\` R8.1 and R8.3, \`tasks/grammar-evidence-community.md\` section 6) were measured on 884 answers. The live data is larger, so each figure is measured again here.

| Figure in the notes | In the notes | Measured now |
|---|---|---|
| Own answers with any tone mark | 198/884 (22.4%) | ${frac(tc.toned, tc.n)} |
| Own answers with a dotted vowel | 706/884 (80%) | ${frac(tc.dotted, tc.n)} |
| Words marked, within toned answers | about 41% | ${pct(tc.tonedWordsMarked, tc.tonedWords)} |
| Share of all toned answers written by one person | 62% | ${pct(top?.toned ?? 0, tc.toned)} (${top?.k ?? "n/a"}: ${top?.toned ?? 0} of ${tc.toned}; ${top ? frac(top.toned, top.n) : "n/a"} of that person's answers are toned) |
| Answers to prompts that ask for tone marks that carry any | 64/197 (32%) | ${frac(tAsked.toned, tAsked.n)} |

The last row counts own answers to prompts whose text asks for tone in so many words ("tone mark", "mark the tones"). The notes may have used a different list of prompts, so the two are not the same sample.

## By writer (own answers)

${table(TALLY_HEAD, tallyRows(group(coldRows, w)))}

## By prompt bucket (own answers)

${table(TALLY_HEAD, tallyRows(group(coldRows, (r) => r.bucket)))}

## By dialect given (own answers)

${table(TALLY_HEAD, tallyRows(group(coldRows, (r) => r.dialect || "(not given)")))}

Dialect and writer are confounded: check the writer table before reading a dialect row as a property of the dialect. ${(() => {
      const byDialect = new Map<string, Set<string>>();
      for (const r of coldRows) {
        if (!r.dialect) continue;
        byDialect.set(
          r.dialect,
          (byDialect.get(r.dialect) ?? new Set()).add(w(r)),
        );
      }
      return [...byDialect.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([d, ws]) => `\`${d}\`: ${[...ws].sort().join(", ")}`)
        .join("; ");
    })()}.

## By month (own answers)

${table(
  TALLY_HEAD,
  tallyRows(
    group(coldRows, (r) => r.month),
    "key",
  ),
)}

## What this says

- Tone is still mostly not written: ${pct(tc.toned, tc.n)} of own answers carry any mark, and ${pct(tc.marked, tc.syllables)} of all syllables do.
- It depends on who writes, not on what is asked: see the writer table.
- A marked answer is rarely fully marked: ${pct(tc.tonedMarked, tc.tonedSyllables)} of syllables in toned answers carry a mark. So even toned answers gain from a second pass.
- Unmarked is unknown, not Mid. The second pass is the only way to get the tone of these answers.
`;

    // Set document
    const setRows = set.cells.map((c) => [
      `\`${publicCell(c.cell)}\``,
      c.chosen,
      c.available,
      c.examples.join(", "),
    ]);
    const kind = (prefix: string) =>
      set.cells.filter((c) => c.cell.startsWith(prefix));
    const setDoc = `# Tone-mark pass 2: proposed representative set (measured ${today})

Step 2 of the tone-mark second pass (hmart task 1549b74a). This is a PROPOSAL. Nothing is loaded and nobody is assigned. It waits for Halim's yes (checkpoint 1), and Lydia and Salem should look at the coverage table first. Made by \`web/scripts/tone-pass-2-measure.ts\`, read-only. Row ids only: no Igala text, no names.

## One screen

| | |
|---|---|
| Own answers in the live data | ${tc.n} |
| Left out: frozen benchmark prompts (\`isHoldout\` or \`split = test\`) | ${coldRows.length - pool.length} |
| Answers the set can draw on | ${pool.length} |
| Coverage cells found in the data | ${set.cells.length} |
| **Proposed set size** | **${set.ids.length} answers** |
| In the set: no tone mark yet / partly marked / fully marked | ${setState.untoned} / ${setState.partly} / ${setState.toned} |
| Cells with fewer than ${MIN_PER_CELL} answers in all the data (thin) | ${set.thin.length} |
| Expected cells with no answer at all (empty) | ${emptyCells.length} |
| First batch of ${FIRST_BATCH}: cells it fills | ${firstCells.size} of ${set.cells.length} |

Check against the freeze file: ${leaked} of the answers the set can draw on belong to a prompt named in \`tasks/eval-freeze-v1.json\` (must be 0).

## How the set was chosen

1. Each own answer is described by the cells it fills (\`web/src/lib/tone/coverage.ts\`): each tone on each vowel, tone sequences on fully marked two- and three-syllable words, contours, nasals, digraphs, elision, homograph families, grammatical monosyllables, loanwords, length, prompt bucket, writer, dialect.
2. The smallest group that fills every cell is picked (greedy set cover).
3. Each cell is then padded to at least ${MIN_PER_CELL} answers where the data has them.
4. Ties go to the answer with less tone written, so the set leans to answers that have the most to gain: ${pct(setState.untoned + setState.partly, set.ids.length)} of the set is untoned or partly toned.
5. Answers to frozen benchmark prompts are never candidates.

Homograph families are found in the data, not hard-coded: a word written with two or more different tone or dot patterns in at least three answers. The ${families.length} most varied are named H1, H2 and so on here; the words are kept outside this repository, because several are answers to frozen prompts. They are CANDIDATES: the list holds true homograph families and also common words that people simply mark in different ways. Lydia or Salem should say which are which before the set is loaded. No tone-to-meaning mapping is assumed anywhere: agreement in pass 2 is how it gets settled.

## Proposed number of markers per item

Two. Three only for answers in a family that Lydia or Salem confirms as a true homograph or a minimal pair. The candidate families are common words: ${inSet.filter((r) => (candidates.find((c) => c.id === r.id)?.cells ?? []).some((c) => c.startsWith("homograph:"))).length} of the ${set.ids.length} answers in the set contain at least one, so "three for every candidate" would mean three markers on more than half of the set.

## Thin cells (fewer than ${MIN_PER_CELL} answers exist)

${set.thin.length === 0 ? "None." : set.thin.map((c) => `- \`${publicCell(c)}\``).join("\n")}

## Empty cells (named in the brief, no answer in the data)

${emptyCells.length === 0 ? "None." : emptyCells.map((c) => `- \`${c}\``).join("\n")}
- \`downstep\`: cannot be found from the spelling. Writers do not mark it, and a downstepped High is often written as Mid. It needs a linguist's list, not a query.
- \`tonal minimal pair\`: the same limit. The homograph families above are the nearest thing the data can show.

## Coverage table

"Chosen" is how many answers of the set fill the cell. "Available" is how many exist in the data. Example ids are \`ColdAuthorAnswer.id\`.

${table(["Cell", "Chosen", "Available", "Example ids"], setRows)}

## The first batch of ${FIRST_BATCH}

The ${FIRST_BATCH} answers picked first fill ${firstCells.size} of the ${set.cells.length} cells. These are the ones to load first if the pass starts small.

${first.map((id) => `- ${id}`).join("\n")}

## The whole set (${set.ids.length} ids)

${set.ids.join(", ")}

## What happens after a yes

Nothing in this file is loaded by any agent. After both checkpoints, a person runs the load: one \`TonePassItem\` per id above (with the answer's text as it is that day, and its cells), then one \`TonePassAssignment\` per item and marker. The migration \`20261113150000_tone_pass\` must be applied first.
`;

    writeFileSync(
      join(repo, "tasks", "tone-pass-2-baseline-2026-11.md"),
      baseline,
    );
    writeFileSync(join(repo, "tasks", "tone-pass-2-set-2026-11.md"), setDoc);
    mkdirSync(dirname(resolve(privatePath)), { recursive: true });
    const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.id]));
    writeFileSync(
      resolve(privatePath),
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          note: "PRIVATE. Never commit. Writer names and homograph words.",
          writers: [...label.entries()].map(([id, l]) => ({
            label: l,
            name: nameOf.get(id) ?? id,
            id,
            ownAnswers: perWriter.get(id) ?? 0,
          })),
          homographFamilies: families.map((f, i) => ({
            name: `H${i + 1}`,
            ...f,
          })),
          setIds: set.ids,
          firstBatch: first,
          cells: Object.fromEntries(
            candidates
              .filter((c) => set.ids.includes(c.id))
              .map((c) => [c.id, c.cells]),
          ),
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        own: tc.n,
        ownToned: tc.toned,
        edits: te.n,
        editsToned: te.toned,
        pool: pool.length,
        cells: set.cells.length,
        setSize: set.ids.length,
        thin: set.thin.length,
        empty: emptyCells.length,
        families: families.length,
        leaked,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
