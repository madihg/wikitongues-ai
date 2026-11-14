import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fakeToneDb } from "./tone-pass.fake";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, key) => (holder.db as Record<string | symbol, unknown>)[key] },
  ),
}));

import {
  adjudicateTone,
  nextToneTask,
  saveTonePass,
  skipToneItem,
  toneAdminData,
  toneCount,
  TONE_INSTRUCTION,
} from "./tone-pass";
import {
  agreementCsv,
  attachToneLayers,
  exportTonePass,
  toneLayerRows,
} from "./tone-export";
import {
  buildSftExamples,
  type SftSourceRow,
} from "@/lib/arena/training-export";

/**
 * Tone-mark pass 2 over real (in-memory) rows. The texts are invented
 * non-words. Marks are explicit escapes: \u0301 acute, \u0300 grave,
 * \u0323 dot below.
 */

const H = "\u0301";
const L = "\u0300";
const DOT = "\u0323";
const PASS1 = `babe ke${DOT} du`;
const TONED = `ba${H}be${L} ke${DOT}${H} du${L}`;
const TONED_OTHER = `ba${L}be${L} ke${DOT}${H} du${L}`;

const AGNES = "u-agnes";
const SALEM = "u-salem";
const THIRD = "u-third";
const OUTSIDER = "u-outsider";

function seed() {
  return fakeToneDb({
    prompts: [
      {
        id: "p1",
        promptId: "ig_test_001",
        text: "First question?",
        split: "train",
        isHoldout: false,
      },
      {
        id: "p2",
        promptId: "ig_test_002",
        text: "Second question?",
        split: "train",
        isHoldout: false,
      },
    ],
    users: [
      { id: AGNES, name: "Marker One" },
      { id: SALEM, name: "Marker Two" },
      { id: THIRD, name: "Marker Three" },
    ],
    cold: [
      {
        id: "c1",
        answerText: PASS1,
        consentTraining: true,
        consentBenchmark: false,
      },
    ],
    edits: [
      {
        id: "e1",
        correctedText: "bo bu",
        consentTraining: true,
        consentBenchmark: true,
      },
    ],
    items: [
      {
        id: "i1",
        setName: "tone-set-v1",
        sourceType: "cold",
        sourceId: "c1",
        promptId: "p1",
        sourceTextSnapshot: PASS1,
        cells: ["bucket:orthography", "mono:du"],
        requiredMarkers: 2,
        createdAt: new Date("2026-11-13T10:00:00Z"),
      },
      {
        id: "i2",
        setName: "tone-set-v1",
        sourceType: "edit",
        sourceId: "e1",
        promptId: "p2",
        sourceTextSnapshot: "bo bu",
        cells: ["homograph:zzz"],
        requiredMarkers: 3,
        createdAt: new Date("2026-11-13T10:00:01Z"),
      },
    ],
    assignments: [
      {
        id: "a1",
        itemId: "i1",
        annotatorId: AGNES,
        skippedAt: null,
        createdAt: new Date("2026-11-13T11:00:00Z"),
      },
      {
        id: "a2",
        itemId: "i2",
        annotatorId: AGNES,
        skippedAt: null,
        createdAt: new Date("2026-11-13T11:00:01Z"),
      },
      {
        id: "a3",
        itemId: "i1",
        annotatorId: SALEM,
        skippedAt: null,
        createdAt: new Date("2026-11-13T11:00:02Z"),
      },
      {
        id: "a4",
        itemId: "i1",
        annotatorId: THIRD,
        skippedAt: null,
        createdAt: new Date("2026-11-13T11:00:03Z"),
      },
    ],
  });
}

let db: ReturnType<typeof seed>;
beforeEach(() => {
  db = seed();
  holder.db = db;
});

const save = (userId: string, body: Record<string, unknown>) =>
  saveTonePass({ userId, body });
const myPass = (userId: string, itemId = "i1") =>
  db.tonePass.rows.find((r) => r.annotatorId === userId && r.itemId === itemId);
const agreedFor = (itemId = "i1") =>
  db.tonePassAgreed.rows.find((r) => r.itemId === itemId);

describe("pass 1 is never edited, overwritten or deleted", () => {
  it("a whole sitting writes nothing to the pass-1 tables, and their rows are byte for byte the same", async () => {
    const before = JSON.stringify([
      db.coldAuthorAnswer.rows,
      db.outputEdit.rows,
    ]);

    await nextToneTask(AGNES);
    await save(AGNES, { itemId: "i1", text: TONED, activeSeconds: 40 });
    await save(AGNES, {
      itemId: "i1",
      text: `${TONED} extra`,
      keepAsCorrection: true,
    });
    await nextToneTask(AGNES, "i1");
    await save(SALEM, { itemId: "i1", text: TONED_OTHER });
    await save(THIRD, { itemId: "i1", text: TONED });
    await skipToneItem(AGNES, "i2");
    await adjudicateTone({
      adjudicatorId: SALEM,
      body: { itemId: "i1", agreedText: TONED },
    });
    await toneAdminData();
    await toneCount(AGNES);
    await exportTonePass();
    await attachToneLayers([
      {
        source: { type: "cold", id: "c1" },
        promptId: "p1",
        promptText: "First question?",
        correctedText: PASS1,
        bucket: null,
        isHoldout: false,
        verificationStatus: "single_annotator",
        provenance: "cold_sourcefree",
      },
    ]);

    expect(JSON.stringify([db.coldAuthorAnswer.rows, db.outputEdit.rows])).toBe(
      before,
    );
    // The only pass-1 calls at all are the export's reads of the consent flags.
    expect(db.pass1Calls.filter((c) => !c.endsWith(".findMany"))).toEqual([]);
    expect(new Set(db.pass1Calls)).toEqual(
      new Set(["coldAuthorAnswer.findMany", "outputEdit.findMany"]),
    );
    // and the snapshot on the item is untouched too
    expect(db.tonePassItem.rows[0].sourceTextSnapshot).toBe(PASS1);
  });

  it("no tone file calls a write on a pass-1 table (source)", () => {
    const root = join(__dirname, "..", "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !/\.(test|fake)\./.test(name)) {
          files.push(full);
        }
      }
    };
    for (const dir of [
      "lib/tone",
      "app/api/annotator/tone",
      "app/api/admin/tone",
      "components/tone",
    ]) {
      walk(join(root, dir));
    }
    expect(files.length).toBeGreaterThan(8);
    const write =
      /(coldAuthorAnswer|outputEdit)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(write);
    }
  });
});

describe("the tone-only guard on save", () => {
  it("tone marks only: saved as typed, in NFC, not flagged", async () => {
    const res = await save(AGNES, {
      itemId: "i1",
      text: TONED.normalize("NFD"),
    });
    expect(res.status).toBe(200);
    expect(res.body.flagged).toBe(false);
    expect(myPass(AGNES)).toMatchObject({
      toneMarkedText: TONED.normalize("NFC"),
      sourceTextSnapshot: PASS1,
      flaggedNonToneChange: false,
      flagText: null,
      passNumber: 2,
      sourceType: "cold",
      sourceId: "c1",
    });
  });

  it("precomposed and combining input store the same text", async () => {
    await save(AGNES, { itemId: "i1", text: TONED.normalize("NFC") });
    await save(SALEM, { itemId: "i1", text: TONED.normalize("NFD") });
    expect(myPass(AGNES)?.toneMarkedText).toBe(myPass(SALEM)?.toneMarkedText);
  });

  it("the dot below is kept: removing it is not a tone change (409)", async () => {
    const res = await save(AGNES, { itemId: "i1", text: `ba${H}be ke du` });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("non_tone_change");
    expect(db.tonePass.rows).toHaveLength(0);
  });

  it("another change answers 409 with the tone-only text to offer back", async () => {
    const res = await save(AGNES, { itemId: "i1", text: `ba${H}be ko du${L}` });
    expect(res.status).toBe(409);
    expect(res.body.undone).toBe(`ba${H}be ke${DOT} du${L}`.normalize("NFC"));
    expect(db.tonePass.rows).toHaveLength(0);
  });

  it("kept as a correction: the flag holds the correction, the tone text stays tone-only", async () => {
    const typed = `ba${H}be ko du${L}`;
    const res = await save(AGNES, {
      itemId: "i1",
      text: typed,
      keepAsCorrection: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.flagged).toBe(true);
    expect(myPass(AGNES)).toMatchObject({
      toneMarkedText: `ba${H}be ke${DOT} du${L}`.normalize("NFC"),
      flaggedNonToneChange: true,
      flagText: typed.normalize("NFC"),
    });
  });

  it("an empty text or a missing item is refused", async () => {
    expect((await save(AGNES, { itemId: "i1", text: "  " })).status).toBe(400);
    expect((await save(AGNES, { text: TONED })).status).toBe(400);
    expect((await save(AGNES, { itemId: "nope", text: TONED })).status).toBe(
      404,
    );
  });
});

describe("who gets what, once", () => {
  it("serves the items given to a person, oldest first, with nothing about other people", async () => {
    const res = await nextToneTask(AGNES);
    expect(res.body).toEqual({
      complete: false,
      task: {
        itemId: "i1",
        promptText: "First question?",
        firstVersion: PASS1,
        mine: null,
      },
      progress: { remaining: 2 },
    });
    const wire = JSON.stringify(res.body);
    for (const hidden of [
      "c1",
      AGNES,
      SALEM,
      "annotator",
      "sourceId",
      "author",
    ]) {
      expect(wire, hidden).not.toContain(hidden);
    }
  });

  it("never serves an item twice: a marked item and a skipped item do not come back", async () => {
    await save(AGNES, { itemId: "i1", text: TONED });
    const second = await nextToneTask(AGNES);
    expect((second.body.task as { itemId: string }).itemId).toBe("i2");
    expect((await skipToneItem(AGNES, "i2")).status).toBe(200);
    const done = await nextToneTask(AGNES);
    expect(done.body).toEqual({ complete: true, progress: { remaining: 0 } });
    // skipping twice, or skipping what was never given, finds nothing
    expect((await skipToneItem(AGNES, "i2")).status).toBe(404);
    expect((await skipToneItem(OUTSIDER, "i1")).status).toBe(404);
  });

  it("an item that was not given to a person cannot be marked by them (403)", async () => {
    const res = await save(OUTSIDER, { itemId: "i1", text: TONED });
    expect(res.status).toBe(403);
    expect(db.tonePass.rows).toHaveLength(0);
    expect((await nextToneTask(OUTSIDER)).body.complete).toBe(true);
  });

  it("the count is the items given to me and not yet marked", async () => {
    expect(await toneCount(AGNES)).toEqual({ waiting: 2, done: 0 });
    await save(AGNES, { itemId: "i1", text: TONED });
    expect(await toneCount(AGNES)).toEqual({ waiting: 1, done: 1 });
    expect(await toneCount(OUTSIDER)).toEqual({ waiting: 0, done: 0 });
  });

  it("before the tables exist: zero waiting, an empty queue, never an error", async () => {
    const missing = async () => {
      throw Object.assign(new Error("no table"), { code: "P2021" });
    };
    db.tonePassAssignment.findMany = missing;
    db.tonePass.findMany = missing;
    db.tonePass.count = missing;
    expect(await toneCount(AGNES)).toEqual({ waiting: 0, done: 0 });
    expect((await nextToneTask(AGNES)).body).toEqual({
      complete: true,
      progress: { remaining: 0 },
    });
  });
});

describe("Edit previous", () => {
  it("reopens my own saved copy and saves over the same row; time adds up", async () => {
    await save(AGNES, { itemId: "i1", text: TONED_OTHER, activeSeconds: 40 });
    const reopened = await nextToneTask(AGNES, "i1");
    expect((reopened.body.task as { mine: { text: string } }).mine.text).toBe(
      TONED_OTHER.normalize("NFC"),
    );
    await save(AGNES, { itemId: "i1", text: TONED, activeSeconds: 25 });
    expect(db.tonePass.rows).toHaveLength(1);
    expect(myPass(AGNES)).toMatchObject({
      toneMarkedText: TONED.normalize("NFC"),
      activeSeconds: 65,
    });
    expect(db.tonePassItem.rows[0].sourceTextSnapshot).toBe(PASS1);
  });

  it("a kept correction reopens as it was typed", async () => {
    const typed = `ba${H}be ko du`;
    await save(AGNES, { itemId: "i1", text: typed, keepAsCorrection: true });
    const reopened = await nextToneTask(AGNES, "i1");
    expect(reopened.body.task).toMatchObject({
      mine: { text: typed.normalize("NFC"), flagged: true },
    });
  });

  it("someone else's copy cannot be reopened", async () => {
    await save(AGNES, { itemId: "i1", text: TONED });
    expect((await nextToneTask(SALEM, "i1")).status).toBe(404);
  });

  it("time on one item is capped, and nonsense counts as zero", async () => {
    await save(AGNES, { itemId: "i1", text: TONED, activeSeconds: 99999 });
    expect(myPass(AGNES)?.activeSeconds).toBe(1800);
    await save(SALEM, { itemId: "i1", text: TONED, activeSeconds: "long" });
    expect(myPass(SALEM)?.activeSeconds).toBe(0);
  });
});

describe("uncertainty is data", () => {
  it("keeps the positions of the words a marker is not sure about, and a note", async () => {
    await save(AGNES, {
      itemId: "i1",
      text: TONED,
      unsureWords: [2, 0, 2, 7, -1, "x"],
      note: "  The last word could be high.  ",
    });
    expect(myPass(AGNES)).toMatchObject({
      unsureWords: [0, 2],
      note: "The last word could be high.",
    });
  });
});

describe("agreement after each save", () => {
  it("two exact matches agree", async () => {
    await save(AGNES, { itemId: "i1", text: TONED });
    expect(agreedFor()).toBeUndefined();
    await save(SALEM, { itemId: "i1", text: TONED.normalize("NFD") });
    expect(agreedFor()).toMatchObject({
      agreedText: TONED.normalize("NFC"),
      method: "exact",
    });
  });

  it("two that differ do not; a third makes a majority", async () => {
    await save(AGNES, { itemId: "i1", text: TONED });
    await save(SALEM, { itemId: "i1", text: TONED_OTHER });
    expect(agreedFor()).toBeUndefined();
    await save(THIRD, { itemId: "i1", text: TONED });
    expect(agreedFor()).toMatchObject({
      agreedText: TONED.normalize("NFC"),
      method: "majority",
    });
  });

  it("a reopened copy that breaks the agreement withdraws it", async () => {
    await save(AGNES, { itemId: "i1", text: TONED });
    await save(SALEM, { itemId: "i1", text: TONED });
    expect(agreedFor()).toBeDefined();
    await save(SALEM, { itemId: "i1", text: TONED_OTHER });
    expect(agreedFor()).toBeUndefined();
  });

  it("the adjudicator's decision stands whatever is saved after it, and must be tone-only", async () => {
    await save(AGNES, { itemId: "i1", text: TONED });
    await save(SALEM, { itemId: "i1", text: TONED_OTHER });
    const bad = await adjudicateTone({
      adjudicatorId: THIRD,
      body: { itemId: "i1", agreedText: "something else" },
    });
    expect(bad.status).toBe(400);
    const ok = await adjudicateTone({
      adjudicatorId: THIRD,
      body: { itemId: "i1", agreedText: TONED_OTHER },
    });
    expect(ok.status).toBe(200);
    await save(SALEM, { itemId: "i1", text: TONED });
    expect(agreedFor()).toMatchObject({
      agreedText: TONED_OTHER.normalize("NFC"),
      method: "adjudicated",
      adjudicatorId: THIRD,
    });
  });
});

describe("the researcher's view", () => {
  it("shows every item with its versions side by side and where they differ", async () => {
    await save(AGNES, { itemId: "i1", text: TONED });
    await save(SALEM, { itemId: "i1", text: TONED_OTHER });
    const data = await toneAdminData();
    expect(data.assigned).toBe(4);
    expect(data.names[AGNES]).toBe("Marker One");
    const [first, second] = data.items;
    expect(first).toMatchObject({
      itemId: "i1",
      status: "needs_third",
      firstVersion: PASS1,
      agreed: null,
    });
    expect(first.versions.map((v) => v.annotatorId)).toEqual([AGNES, SALEM]);
    expect(first.differing).toHaveLength(1);
    expect(second).toMatchObject({
      itemId: "i2",
      status: "waiting",
      required: 3,
    });
    expect(data.summary.byStatus.needs_third).toBe(1);
    expect(data.summary.perAnnotator).toEqual([
      { annotatorId: AGNES, done: 1 },
      { annotatorId: SALEM, done: 1 },
    ]);
    const csv = agreementCsv(data.summary, data.names);
    expect(csv.split("\n")[0]).toBe(
      "section,key,items,items_compared,exact_matches,syllables,syllables_agreed,kappa",
    );
    expect(csv).toContain("pair,Marker One + Marker Two,1,1,0,4,,");
    expect(csv).toContain("cell,mono:du,1,1,0,4,3,");
  });
});

describe("exports", () => {
  it("research: pass 1, every pass 2 with its marker, and the agreed text, each named by its layer", async () => {
    await save(AGNES, { itemId: "i1", text: TONED });
    await save(SALEM, { itemId: "i1", text: TONED });
    const lines = (await exportTonePass()).split("\n");
    expect(lines[0]).toBe(
      "item_id,tone_set,source_type,source_id,prompt_ref,layer,igala_text,consent_training,consent_benchmark,marker_id,agreed_method,flagged_correction,proposed_correction,unsure_word_positions,coverage_cells,split,is_holdout,at",
    );
    const cells = lines
      .slice(1)
      .filter((l) => l.length > 0)
      .map((l) => l.split(","));
    expect(cells.map((c) => `${c[0]}:${c[5]}:${c[9]}:${c[10]}`)).toEqual([
      "i1:pass1::",
      `i1:pass2:${AGNES}:`,
      `i1:pass2:${SALEM}:`,
      "i1:agreed::exact",
      // an item nobody marked yet carries its pass 1 alone
      "i2:pass1::",
    ]);
    // consent and the split travel with every row
    expect(cells[0].slice(7, 9)).toEqual(["true", "false"]);
    expect(cells[3].slice(7, 9)).toEqual(["true", "false"]);
    expect(cells[0][15]).toBe("train");
    // pass 1 is exported exactly as it was shown, not re-normalised
    expect(cells[0][6]).toBe(PASS1);
    expect(cells[1][6]).toBe(TONED.normalize("NFC"));
  });

  it("the pure row builder marks a flagged correction and keeps it out of the tone text", () => {
    const rows = toneLayerRows([
      {
        id: "i9",
        setName: "tone-set-v1",
        sourceType: "cold",
        sourceId: "c9",
        sourceTextSnapshot: "babe",
        cells: [],
        createdAt: new Date("2026-11-13T10:00:00Z"),
        promptRef: "ig_test_009",
        consentTraining: true,
        consentBenchmark: true,
        split: "train",
        isHoldout: false,
        passes: [
          {
            annotatorId: "m1",
            toneMarkedText: `ba${H}be`,
            flaggedNonToneChange: true,
            flagText: `ba${H}bo`,
            unsureWords: [0],
            updatedAt: new Date("2026-11-14T10:00:00Z"),
          },
        ],
        agreed: null,
      },
    ]);
    expect(rows.map((r) => r.layer)).toEqual(["pass1", "pass2"]);
    expect(rows[1]).toMatchObject({
      text: `ba${H}be`,
      flaggedCorrection: true,
      flagText: `ba${H}bo`,
      unsureWords: [0],
      annotatorId: "m1",
    });
  });

  const sftRow = (over: Partial<SftSourceRow> = {}): SftSourceRow => ({
    source: { type: "cold", id: "c1" },
    promptId: "p1",
    promptText: "First question?",
    correctedText: PASS1,
    bucket: null,
    isHoldout: false,
    verificationStatus: "single_annotator",
    provenance: "cold_sourcefree",
    ...over,
  });

  it("training: an answer with no second pass exports exactly as it does today", async () => {
    const rows = await attachToneLayers([
      sftRow(),
      sftRow({ source: { type: "cold", id: "c-other" } }),
    ]);
    const examples = buildSftExamples(rows);
    for (const e of examples) {
      expect(Object.keys(e)).toEqual(["messages", "bucket", "provenance"]);
    }
    expect(JSON.stringify(examples)).toBe(
      JSON.stringify(buildSftExamples([sftRow(), sftRow()])),
    );
  });

  it("training: an answer with a second pass carries its layers beside the pass-1 completion", async () => {
    await save(AGNES, { itemId: "i1", text: TONED });
    await save(SALEM, { itemId: "i1", text: TONED });
    const rows = await attachToneLayers([
      sftRow(),
      sftRow({ source: { type: "cold", id: "c-other" } }),
    ]);
    const [withTone, without] = buildSftExamples(rows);
    expect(withTone.messages[1].content).toBe(PASS1); // still pass 1
    expect(withTone.tone).toEqual({
      layer: "pass1",
      pass2: [
        { layer: "pass2", annotatorId: AGNES, text: TONED.normalize("NFC") },
        { layer: "pass2", annotatorId: SALEM, text: TONED.normalize("NFC") },
      ],
      agreed: {
        layer: "agreed",
        text: TONED.normalize("NFC"),
        method: "exact",
      },
    });
    expect("tone" in without).toBe(false);
  });

  it("training: if the tone tables cannot be read, every row exports as before", async () => {
    db.tonePassItem.findMany = async () => {
      throw Object.assign(new Error("no table"), { code: "P2021" });
    };
    const rows = [sftRow()];
    expect(await attachToneLayers(rows)).toBe(rows);
  });
});

describe("the instruction and the migration", () => {
  it("the instruction is Halim's wording, word for word", () => {
    expect(TONE_INSTRUCTION).toBe(
      "Pass 2: add tone marks. This is a second pass over answers that are already done. Some are yours, some are from other people. Add tone marks only. The first version stays saved.",
    );
  });

  const root = join(__dirname, "..", "..", "..", "prisma");
  const dir = join(root, "migrations", "20261113150000_tone_pass");
  const up = readFileSync(join(dir, "migration.sql"), "utf8");
  const down = readFileSync(join(dir, "down.sql"), "utf8");
  const schema = readFileSync(join(root, "schema.prisma"), "utf8");
  const tables = [
    "TonePassItem",
    "TonePassAssignment",
    "TonePass",
    "TonePassAgreed",
  ];

  it("up creates the four tables and alters nothing that exists", () => {
    expect(up).toContain(
      'SET search_path TO "wikitongues", "extensions", "public"',
    );
    for (const t of tables) {
      expect(up).toContain(`CREATE TABLE "${t}"`);
      expect(schema).toContain(`model ${t} {`);
    }
    expect(up.match(/CREATE TABLE/g)).toHaveLength(4);
    expect(up).not.toMatch(/ALTER TABLE|DROP\s+(TABLE|COLUMN|INDEX)|RENAME/i);
    expect(up).not.toMatch(/ColdAuthorAnswer"|OutputEdit"/);
  });

  it("carries the columns the brief names", () => {
    for (const col of [
      "sourceType",
      "sourceId",
      "passNumber",
      "annotatorId",
      "toneMarkedText",
      "sourceTextSnapshot",
      "note",
      "flaggedNonToneChange",
      "flagText",
      "createdAt",
      "updatedAt",
      "activeSeconds",
      "agreedText",
      "method",
      "adjudicatorId",
      "agreedAt",
    ]) {
      expect(up, col).toContain(`"${col}"`);
    }
    expect(up).toContain('"TonePass_sourceType_sourceId_idx"');
    expect(up).toContain('"TonePass_itemId_annotatorId_key"');
    expect(up).toContain('"TonePassAssignment_itemId_annotatorId_key"');
  });

  it("down removes exactly those four tables", () => {
    for (const t of tables)
      expect(down).toContain(`DROP TABLE IF EXISTS "${t}"`);
    expect(down.match(/DROP TABLE/g)).toHaveLength(4);
    expect(down).not.toMatch(/ColdAuthorAnswer|OutputEdit/);
  });
});
