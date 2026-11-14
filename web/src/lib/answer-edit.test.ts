import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakePrisma } from "./answer-edit.fake";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, key) => (holder.db as Record<string | symbol, unknown>)[key] },
  ),
}));

import { applyAnswerEdit, loadEditEpisode } from "./answer-edit";
import { firstVersion } from "./answer-revisions";

/**
 * The edit rule, end to end over real (in-memory) rows:
 *   you can edit what you wrote, you cannot change what you judged.
 *
 * AGNES holds the RESEARCHER role, CHARITY the ANNOTATOR role. On Nov 10
 * Agnes could not edit the meaning or the reason on her own rows: the only
 * edit route accepted the answer text alone, and an ANNOTATOR had no edit
 * route at all. The first two blocks are the proof that both now can.
 * The texts are invented placeholders, not annotator data.
 */

const AGNES = "u-agnes";
const CHARITY = "u-charity";
const NFD = "zz e\u0323\u0301 zz"; // one decomposed letter inside a non-word
const NFC = NFD.normalize("NFC");

const at = (n: number) => new Date(Date.UTC(2026, 9, 12, 8, 0, n));

function seed() {
  return fakePrisma({
    prompts: [{ id: "p1", promptId: "ig_test_001", text: "A test question?" }],
    cold: [
      {
        id: "c-agnes",
        annotatorId: AGNES,
        isDemo: false,
        answerText: "alpha beta",
        englishGloss: "First meaning.",
        dialect: null,
        instructionIg: null,
        provenance: "speaker_authored_sourcefree",
        promptId: "p1",
        prompt: { promptId: "ig_test_001" },
        createdAt: at(1),
      },
      {
        id: "c-charity",
        annotatorId: CHARITY,
        isDemo: false,
        answerText: "gamma delta",
        englishGloss: null,
        dialect: null,
        instructionIg: null,
        provenance: "speaker_authored_sourcefree",
        promptId: "p1",
        prompt: { promptId: "ig_test_001" },
        createdAt: at(2),
      },
      {
        id: "c-demo",
        annotatorId: CHARITY,
        isDemo: true,
        answerText: "demo words",
        englishGloss: null,
        dialect: null,
        instructionIg: null,
        provenance: "speaker_authored_sourcefree",
        promptId: "p1",
        prompt: { promptId: "ig_test_001" },
        createdAt: at(3),
      },
    ],
    pairwise: [
      {
        id: "pw-agnes",
        annotatorId: AGNES,
        isDemo: false,
        winner: "b",
        explanation: "B reads better.",
        promptId: "ig_test_001",
        modelOutputAId: "moA",
        modelOutputBId: "moB",
        createdAt: at(4),
      },
      {
        id: "pw-charity",
        annotatorId: CHARITY,
        isDemo: false,
        winner: "a",
        explanation: "A is right.",
        promptId: "ig_test_001",
        modelOutputAId: "moA",
        modelOutputBId: "moB",
        createdAt: at(5),
      },
    ],
    edits: [
      {
        id: "e-agnes",
        annotatorId: AGNES,
        isDemo: false,
        modelOutputId: "moB",
        originalText: "one two three",
        correctedText: "one TWO three",
        rationale: "Short.",
        segments: {
          v: 1,
          segments: [
            {
              start: 4,
              end: 7,
              original: "two",
              replacement: "TWO",
              reason: "wrong word",
            },
          ],
        },
        promptId: "p1",
        createdAt: at(6),
      },
      {
        id: "e-charity",
        annotatorId: CHARITY,
        isDemo: false,
        modelOutputId: "moA",
        originalText: "four five",
        correctedText: "four FIVE",
        rationale: null,
        segments: null,
        promptId: "p1",
        createdAt: at(7),
      },
    ],
    listen: [
      {
        id: "l-agnes",
        annotatorId: AGNES,
        isDemo: false,
        winner: "a",
        note: "A sounds like a person.",
        promptId: "p1",
        prompt: { text: "A test question?" },
        createdAt: at(8),
      },
    ],
    clips: [
      {
        id: "clip-ig",
        coldAuthorAnswerId: "c-agnes",
        annotatorId: AGNES,
        language: "igala",
        durationMs: 6100,
        createdAt: at(9),
      },
      {
        id: "clip-en",
        coldAuthorAnswerId: "c-agnes",
        annotatorId: AGNES,
        language: "english",
        durationMs: 4000,
        createdAt: at(9),
      },
    ],
  });
}

let db: ReturnType<typeof seed>;
beforeEach(() => {
  db = seed();
  holder.db = db;
});

const revs = () => db.answerRevision.rows;
const row = (t: { rows: Record<string, unknown>[] }, id: string) =>
  t.rows.find((r) => r.id === id) as Record<string, unknown>;

const edit = (
  who: { userId: string; role: string | null },
  type: "cold" | "edit" | "pairwise" | "listen",
  id: string,
  body: Record<string, unknown>,
) => applyAnswerEdit({ type, id, body, ...who });

const agnes = { userId: AGNES, role: "RESEARCHER" };
const charity = { userId: CHARITY, role: "ANNOTATOR" };

describe("the fix for Nov 10: the meaning and the reason are editable on your own rows", () => {
  it("RESEARCHER role (Agnes): meaning, reason and the written why all save", async () => {
    const meaning = await edit(agnes, "cold", "c-agnes", {
      englishGloss: "A fuller meaning.",
    });
    const reason = await edit(agnes, "edit", "e-agnes", {
      rationale: "The second word must be capital here.",
    });
    const why = await edit(agnes, "pairwise", "pw-agnes", {
      explanation: "B keeps the respect form. A drops it.",
    });
    expect([meaning.status, reason.status, why.status]).toEqual([200, 200, 200]);
    expect(row(db.coldAuthorAnswer, "c-agnes").englishGloss).toBe(
      "A fuller meaning.",
    );
    expect(row(db.outputEdit, "e-agnes").rationale).toBe(
      "The second word must be capital here.",
    );
    expect(row(db.pairwiseComparison, "pw-agnes").explanation).toBe(
      "B keeps the respect form. A drops it.",
    );
    expect(revs().map((r) => `${r.targetType}.${r.field}`)).toEqual([
      "cold.englishGloss",
      "edit.rationale",
      "pairwise.explanation",
    ]);
  });

  it("ANNOTATOR role (Charity): the same three, and a missing meaning can be added", async () => {
    const meaning = await edit(charity, "cold", "c-charity", {
      englishGloss: "Now it has a meaning.",
    });
    const reason = await edit(charity, "edit", "e-charity", {
      rationale: "This reason was missing before.",
    });
    const why = await edit(charity, "pairwise", "pw-charity", {
      explanation: "A is right because the tone is kept.",
    });
    expect([meaning.status, reason.status, why.status]).toEqual([200, 200, 200]);
    expect(row(db.coldAuthorAnswer, "c-charity").englishGloss).toBe(
      "Now it has a meaning.",
    );
    expect(row(db.outputEdit, "e-charity").rationale).toBe(
      "This reason was missing before.",
    );
    expect(revs()).toHaveLength(3);
    expect(revs().every((r) => r.editorId === CHARITY && r.authorId === CHARITY))
      .toBe(true);
  });
});

describe("owner only", () => {
  it("an annotator editing another person's row is refused (403), nothing written", async () => {
    for (const [type, id, body] of [
      ["cold", "c-agnes", { answerText: "mine now" }],
      ["cold", "c-agnes", { englishGloss: "mine now" }],
      ["edit", "e-agnes", { correctedText: "one two three four" }],
      ["pairwise", "pw-agnes", { explanation: "mine now" }],
      ["listen", "l-agnes", { note: "mine now" }],
    ] as const) {
      const res = await edit(charity, type, id, body);
      expect(res.status).toBe(403);
    }
    expect(revs()).toHaveLength(0);
    expect(row(db.coldAuthorAnswer, "c-agnes").answerText).toBe("alpha beta");
  });

  it("a researcher may still change another person's answer text, now logged", async () => {
    const res = await edit(agnes, "cold", "c-charity", {
      answerText: "gamma DELTA",
    });
    expect(res.status).toBe(200);
    expect(revs()).toHaveLength(1);
    expect(revs()[0]).toMatchObject({
      targetType: "cold",
      targetId: "c-charity",
      field: "answerText",
      before: "gamma delta",
      after: "gamma DELTA",
      editorId: AGNES,
      authorId: CHARITY,
    });
  });

  it("a researcher may not change another person's meaning, reason or why (403)", async () => {
    expect(
      (await edit(agnes, "cold", "c-charity", { englishGloss: "x" })).status,
    ).toBe(403);
    expect(
      (await edit(agnes, "edit", "e-charity", { rationale: "x" })).status,
    ).toBe(403);
    expect(
      (await edit(agnes, "pairwise", "pw-charity", { explanation: "x" })).status,
    ).toBe(403);
    expect(revs()).toHaveLength(0);
  });
});

describe("the judgment cannot be changed (405), for every role", () => {
  const locked: [
    "cold" | "edit" | "pairwise" | "listen",
    string,
    Record<string, unknown>,
  ][] = [
    ["pairwise", "pw-agnes", { winner: "a" }],
    ["pairwise", "pw-agnes", { explanation: "ok text", winner: "a" }],
    ["pairwise", "pw-agnes", { confidence: 4 }],
    ["pairwise", "pw-agnes", { failureTagsA: ["tone_marks"] }],
    ["pairwise", "pw-agnes", { axisScores: [{ axis: "syntax", score: 5 }] }],
    ["edit", "e-agnes", { score: 5 }],
    ["cold", "c-agnes", { rubric: { syntax: 5 } }],
    ["listen", "l-agnes", { winner: "b" }],
    ["listen", "l-agnes", { axes: { natural: 5 } }],
    ["listen", "l-agnes", { reasonTags: ["robotic"] }],
  ];

  it("the author, as RESEARCHER and as ANNOTATOR", async () => {
    for (const [type, id, body] of locked) {
      expect((await edit(agnes, type, id, body)).status).toBe(405);
    }
    expect(
      (await edit(charity, "pairwise", "pw-charity", { winner: "b" })).status,
    ).toBe(405);
    expect(row(db.pairwiseComparison, "pw-agnes").winner).toBe("b");
    expect(row(db.pairwiseComparison, "pw-charity").winner).toBe("a");
    expect(revs()).toHaveLength(0);
  });

  it("someone else, and a row that does not exist", async () => {
    expect(
      (await edit(agnes, "pairwise", "pw-charity", { winner: "b" })).status,
    ).toBe(405);
    expect(
      (await edit(charity, "pairwise", "nope", { winner: "b" })).status,
    ).toBe(405);
  });
});

describe("what a save writes", () => {
  it("one revision per changed field, with the exact before and after, under one save id", async () => {
    const res = await edit(agnes, "cold", "c-agnes", {
      answerText: "alpha BETA",
      englishGloss: "Second meaning.",
      dialect: null,
      saveId: "save-0001-abcd",
    });
    expect(res.body.changed).toEqual(["answerText", "englishGloss"]);
    expect(revs()).toHaveLength(2);
    expect(revs().map((r) => [r.field, r.before, r.after, r.saveId])).toEqual([
      ["answerText", "alpha beta", "alpha BETA", "save-0001-abcd"],
      ["englishGloss", "First meaning.", "Second meaning.", "save-0001-abcd"],
    ]);
  });

  it("a save with no change writes none and says so", async () => {
    const res = await edit(agnes, "cold", "c-agnes", {
      answerText: "alpha beta",
      englishGloss: " First meaning. ",
    });
    expect(res.status).toBe(200);
    expect(res.body.changed).toEqual([]);
    expect(revs()).toHaveLength(0);
  });

  it("text is stored in NFC, and a change of Unicode form alone writes none", async () => {
    await edit(agnes, "cold", "c-agnes", { answerText: NFD });
    expect(row(db.coldAuthorAnswer, "c-agnes").answerText).toBe(NFC);
    expect(revs()).toHaveLength(1);
    expect(revs()[0].after).toBe(NFC);
    const again = await edit(agnes, "cold", "c-agnes", { answerText: NFD });
    expect(again.body.changed).toEqual([]);
    expect(revs()).toHaveLength(1);
  });

  it("the first locked text is retrievable after three edits", async () => {
    for (const text of ["second", "third", "fourth"]) {
      await edit(agnes, "cold", "c-agnes", { answerText: text });
    }
    expect(row(db.coldAuthorAnswer, "c-agnes").answerText).toBe("fourth");
    expect(
      firstVersion(
        revs() as never,
        "answerText",
        row(db.coldAuthorAnswer, "c-agnes").answerText as string,
      ),
    ).toEqual({ text: "alpha beta", edited: true, editCount: 3 });
    // and the drawer reads it back through the same path
    const ep = await loadEditEpisode({
      type: "cold",
      id: "c-agnes",
      userId: AGNES,
      withClips: false,
    });
    const cold = (ep.body.items as { type: string; firstVersion: unknown }[])
      .find((i) => i.type === "cold");
    expect(cold?.firstVersion).toMatchObject({ text: "alpha beta" });
  });

  it("demo rows stay demo: the flag is never written, and the log copies it", async () => {
    const res = await edit(charity, "cold", "c-demo", {
      answerText: "demo words again",
    });
    expect(res.status).toBe(200);
    expect(row(db.coldAuthorAnswer, "c-demo").isDemo).toBe(true);
    expect(revs()[0].isDemo).toBe(true);
    // a request cannot name the flag at all
    expect(
      (await edit(charity, "cold", "c-demo", { isDemo: false })).status,
    ).toBe(400);
    expect(
      (await edit(agnes, "cold", "c-agnes", { answerText: "x y", isDemo: true }))
        .status,
    ).toBe(400);
    expect(row(db.coldAuthorAnswer, "c-agnes").isDemo).toBe(false);
  });

  it("afterReveal: yes once the author has a comparison on the prompt, no before", async () => {
    await edit(agnes, "cold", "c-agnes", { answerText: "after reveal" });
    expect(revs()[0].afterReveal).toBe(true);
    db.pairwiseComparison.rows.splice(
      db.pairwiseComparison.rows.findIndex((r) => r.id === "pw-charity"),
      1,
    );
    await edit(charity, "cold", "c-charity", { answerText: "before reveal" });
    expect(revs()[1].afterReveal).toBe(false);
    await edit(agnes, "pairwise", "pw-agnes", { explanation: "Always after." });
    expect(revs()[2].afterReveal).toBe(true);
  });

  it("a required text cannot be emptied, a non-text value is refused", async () => {
    expect(
      (await edit(agnes, "cold", "c-agnes", { answerText: "  " })).status,
    ).toBe(400);
    expect(
      (await edit(agnes, "edit", "e-agnes", { rationale: "" })).status,
    ).toBe(400);
    expect(
      (await edit(agnes, "pairwise", "pw-agnes", { explanation: null })).status,
    ).toBe(400);
    expect(
      (await edit(agnes, "cold", "c-agnes", { englishGloss: 7 })).status,
    ).toBe(400);
    expect((await edit(agnes, "cold", "c-agnes", {})).status).toBe(400);
    expect((await edit(agnes, "cold", "missing", { answerText: "x" })).status)
      .toBe(404);
    expect(revs()).toHaveLength(0);
  });

  it("an unknown variety is stored as not given, never as free text", async () => {
    await edit(agnes, "cold", "c-agnes", { dialect: "ankpa" });
    expect(row(db.coldAuthorAnswer, "c-agnes").dialect).toBe("ankpa");
    await edit(agnes, "cold", "c-agnes", { dialect: "made-up" });
    expect(row(db.coldAuthorAnswer, "c-agnes").dialect).toBeNull();
  });

  it("answers 503, not 500, while the log table is not there yet", async () => {
    db.answerRevision.createMany = async () => {
      throw Object.assign(new Error("no table"), { code: "P2021" });
    };
    const res = await edit(agnes, "pairwise", "pw-agnes", {
      explanation: "Table missing.",
    });
    expect(res.status).toBe(503);
  });
});

describe("a correction keeps its spans true", () => {
  it("a rewrite re-derives the spans and keeps the reason on a span that still exists", async () => {
    const res = await edit(agnes, "edit", "e-agnes", {
      correctedText: "one TWO three four",
    });
    expect(res.body.changed).toEqual(["correctedText", "segments"]);
    const stored = row(db.outputEdit, "e-agnes").segments as {
      segments: { original: string; replacement: string; reason?: string }[];
    };
    expect(stored.segments.map((s) => [s.original, s.replacement])).toEqual([
      ["two", "TWO"],
      ["", " four"],
    ]);
    expect(stored.segments[0].reason).toBe("wrong word");
  });

  it("the author can change a reason alone; spans that do not fit the text are refused", async () => {
    const ok = await edit(agnes, "edit", "e-agnes", {
      segments: [
        {
          start: 4,
          end: 7,
          original: "two",
          replacement: "TWO",
          reason: "A fuller reason for this word.",
        },
      ],
    });
    expect(ok.body.changed).toEqual(["segments"]);
    expect(row(db.outputEdit, "e-agnes").correctedText).toBe("one TWO three");
    const bad = await edit(agnes, "edit", "e-agnes", {
      segments: [{ start: 0, end: 3, original: "xxx", replacement: "y" }],
    });
    expect(bad.status).toBe(400);
  });

  it("the same reasons sent again write nothing", async () => {
    const res = await edit(agnes, "edit", "e-agnes", {
      segments: [
        {
          start: 4,
          end: 7,
          original: "two",
          replacement: "TWO",
          reason: "wrong word",
        },
      ],
    });
    expect(res.body.changed).toEqual([]);
    expect(revs()).toHaveLength(0);
  });
});

describe("clips and the episode", () => {
  it("changing the words says the Igala clip may no longer match; the clip is kept", async () => {
    const res = await edit(agnes, "cold", "c-agnes", { answerText: "new words" });
    expect(res.body.clipsStale).toBe(true);
    expect(db.speechRecording.rows).toHaveLength(2);
    const quiet = await edit(agnes, "cold", "c-agnes", { dialect: "ankpa" });
    expect(quiet.body.clipsStale).toBe(false);
  });

  it("the drawer gets the whole episode of its owner, with the stale clip marked", async () => {
    // the fake stamps revisions on Nov 13, after the Oct 12 clips
    await edit(agnes, "cold", "c-agnes", { answerText: "new words" });
    const ep = await loadEditEpisode({
      type: "pairwise",
      id: "pw-agnes",
      userId: AGNES,
      withClips: true,
    });
    expect(ep.status).toBe(200);
    expect(ep.body.promptText).toBe("A test question?");
    const items = ep.body.items as Record<string, unknown>[];
    expect(items.map((i) => `${i.type}:${i.id}`)).toEqual([
      "cold:c-agnes",
      "pairwise:pw-agnes",
      "edit:e-agnes",
    ]);
    expect(items[0].clips).toEqual([
      { id: "clip-ig", language: "igala", durationMs: 6100, stale: true },
      { id: "clip-en", language: "english", durationMs: 4000, stale: false },
    ]);
    expect(items[2]).toMatchObject({ onOutput: "B", needsFix: true });
  });

  it("someone else's episode is refused (403), for a researcher too", async () => {
    const res = await loadEditEpisode({
      type: "cold",
      id: "c-charity",
      userId: AGNES,
      withClips: false,
    });
    expect(res.status).toBe(403);
  });

  it("a Listen judgment: the reason is editable by its author, alone", async () => {
    expect(
      (await edit(agnes, "listen", "l-agnes", { note: "B has a hiss in it." }))
        .status,
    ).toBe(200);
    expect(row(db.speechComparison, "l-agnes").note).toBe("B has a hiss in it.");
    expect(row(db.speechComparison, "l-agnes").winner).toBe("a");
    expect(revs()[0]).toMatchObject({ targetType: "listen", field: "note" });
  });
});
