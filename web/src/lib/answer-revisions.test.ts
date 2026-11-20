import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EDITABLE_FIELDS,
  LOCKED_KEYS,
  canEditField,
  changedFields,
  cleanSaveId,
  firstVersion,
  lockedKeysIn,
  needsFix,
  clipTextField,
  spokenTextMatches,
  staleClipIds,
  checkFixSaveId,
  storedText,
} from "./answer-revisions";

const NFC_E = "\u1EB9\u0301"; // e with dot below, then a combining acute
const NFD_E = "e\u0323\u0301"; // the same letter, fully decomposed

describe("who may change which field", () => {
  it("an author changes everything they wrote, whatever their role", () => {
    for (const role of ["ANNOTATOR", "RESEARCHER"]) {
      for (const [type, fields] of Object.entries(EDITABLE_FIELDS)) {
        for (const field of fields) {
          expect(
            canEditField({
              role,
              isAuthor: true,
              type: type as keyof typeof EDITABLE_FIELDS,
              field,
            }),
          ).toBe(true);
        }
      }
    }
  });

  it("a researcher changes only the answer text on another person's row", () => {
    const r = (type: "cold" | "edit" | "pairwise" | "listen", field: string) =>
      canEditField({ role: "RESEARCHER", isAuthor: false, type, field });
    expect(r("cold", "answerText")).toBe(true);
    expect(r("edit", "correctedText")).toBe(true);
    expect(r("cold", "englishGloss")).toBe(false);
    expect(r("cold", "dialect")).toBe(false);
    expect(r("edit", "rationale")).toBe(false);
    expect(r("edit", "segments")).toBe(false);
    expect(r("pairwise", "explanation")).toBe(false);
    expect(r("listen", "note")).toBe(false);
  });

  it("an annotator changes nothing on another person's row", () => {
    for (const [type, fields] of Object.entries(EDITABLE_FIELDS)) {
      for (const field of fields) {
        expect(
          canEditField({
            role: "ANNOTATOR",
            isAuthor: false,
            type: type as keyof typeof EDITABLE_FIELDS,
            field,
          }),
        ).toBe(false);
      }
    }
  });

  it("the judgment is in no editable list, for any row", () => {
    for (const fields of Object.values(EDITABLE_FIELDS)) {
      for (const k of LOCKED_KEYS) expect(fields).not.toContain(k);
    }
    expect(lockedKeysIn({ explanation: "x", winner: "a" })).toEqual(["winner"]);
    expect(lockedKeysIn({ explanation: "x" })).toEqual([]);
  });
});

describe("what counts as a change", () => {
  it("stores NFC, trimmed, and null when empty", () => {
    expect(storedText(`  ${NFD_E}  `)).toBe(NFC_E.normalize("NFC"));
    expect(storedText("   ")).toBeNull();
    expect(storedText(null)).toBeNull();
  });

  it("a change that differs only by Unicode form or outer space is no change", () => {
    expect(changedFields({ answerText: NFC_E }, { answerText: NFD_E })).toEqual(
      [],
    );
    expect(
      changedFields({ englishGloss: "A cup" }, { englishGloss: " A cup " }),
    ).toEqual([]);
    expect(changedFields({ englishGloss: null }, { englishGloss: "" })).toEqual(
      [],
    );
  });

  it("one change per field that really changed, with the exact before and after", () => {
    expect(
      changedFields(
        { answerText: "one", englishGloss: null, dialect: "ankpa" },
        { answerText: "two", englishGloss: "It is two.", dialect: "ankpa" },
      ),
    ).toEqual([
      { field: "answerText", before: "one", after: "two" },
      { field: "englishGloss", before: null, after: "It is two." },
    ]);
  });
});

describe("the first version", () => {
  const rev = (field: string, before: string, after: string, ms: number) => ({
    field,
    before,
    after,
    createdAt: new Date(ms),
  });

  it("is the current text when nothing was edited", () => {
    expect(firstVersion([], "answerText", "now")).toEqual({
      text: "now",
      edited: false,
      editCount: 0,
    });
  });

  it("is the before of the oldest revision, whatever order they arrive in", () => {
    const revs = [
      rev("answerText", "v3", "v4", 3000),
      rev("answerText", "v1", "v2", 1000),
      rev("englishGloss", "g1", "g2", 500),
      rev("answerText", "v2", "v3", 2000),
    ];
    expect(firstVersion(revs, "answerText", "v4")).toEqual({
      text: "v1",
      edited: true,
      editCount: 3,
    });
  });
});

describe("clips after a text change", () => {
  const clip = (id: string, language: string, ms: number) => ({
    id,
    coldAuthorAnswerId: "c1",
    language,
    createdAt: new Date(ms),
  });
  const rev = (field: string, ms: number) => ({
    targetId: "c1",
    field,
    before: "a",
    after: "b",
    createdAt: new Date(ms),
  });

  it("an Igala clip is out of date when the answer changed after it", () => {
    const stale = staleClipIds(
      [clip("ig", "igala", 1000), clip("en", "english", 1000)],
      [rev("answerText", 2000)],
    );
    expect([...stale]).toEqual(["ig"]);
  });

  it("an English clip follows the meaning, not the answer", () => {
    const stale = staleClipIds(
      [clip("ig", "igala", 1000), clip("en", "english", 1000)],
      [rev("englishGloss", 2000)],
    );
    expect([...stale]).toEqual(["en"]);
  });

  it("a clip recorded after the change is fine, and other fields never matter", () => {
    const stale = staleClipIds(
      [clip("new", "igala", 3000)],
      [rev("answerText", 2000), rev("dialect", 4000)],
    );
    expect(stale.size).toBe(0);
  });
});

describe("a clip is used only while its spoken text matches the current text", () => {
  const clip = (
    id: string,
    language: string,
    ms: number,
    spokenText: string | null = null,
  ) => ({
    id,
    coldAuthorAnswerId: "c1",
    language,
    spokenText,
    createdAt: new Date(ms),
  });
  const rev = (
    field: string,
    before: string | null,
    after: string | null,
    ms: number,
  ) => ({ targetId: "c1", field, before, after, createdAt: new Date(ms) });

  it("the short English translation is a field its author may change", () => {
    expect(EDITABLE_FIELDS.cold).toContain("englishTranslation");
    const can = (role: string, isAuthor: boolean) =>
      canEditField({
        role,
        isAuthor,
        type: "cold",
        field: "englishTranslation",
      });
    expect(can("ANNOTATOR", true)).toBe(true);
    expect(can("RESEARCHER", true)).toBe(true);
    // Decision 4: not on another person's row, for a researcher either.
    expect(can("RESEARCHER", false)).toBe(false);
    expect(can("ANNOTATOR", false)).toBe(false);
  });

  it("which text a clip read", () => {
    expect(clipTextField({ language: "igala" })).toBe("answerText");
    expect(clipTextField({ language: "english", spokenText: null })).toBe(
      "englishGloss",
    );
    expect(clipTextField({ language: "english", spokenText: "  " })).toBe(
      "englishGloss",
    );
    expect(clipTextField({ language: "english", spokenText: "Go." })).toBe(
      "englishTranslation",
    );
  });

  it("an answer changed after the clip leaves the clip out", () => {
    const stale = staleClipIds(
      [clip("ig", "igala", 1000)],
      [rev("answerText", "old words", "new words", 2000)],
    );
    expect([...stale]).toEqual(["ig"]);
  });

  it("a change that was put back leaves the clip usable", () => {
    const stale = staleClipIds(
      [clip("ig", "igala", 1000)],
      [
        rev("answerText", "old words", "new words", 2000),
        rev("answerText", "new words", "old words", 3000),
      ],
    );
    expect(stale.size).toBe(0);
  });

  it("the comparison is in stored shape: Unicode form and outer spaces alone do not count", () => {
    const stale = staleClipIds(
      [clip("ig", "igala", 1000)],
      [
        rev("answerText", NFC_E, "x", 2000),
        rev("answerText", "x", ` ${NFD_E} `, 3000),
      ],
    );
    expect(stale.size).toBe(0);
  });

  it("edits made before the clip do not count; the clip read the text as it stood", () => {
    const stale = staleClipIds(
      [clip("ig", "igala", 5000)],
      [
        rev("answerText", "v1", "v2", 1000),
        rev("answerText", "v2", "v3", 2000),
      ],
    );
    expect(stale.size).toBe(0);
  });

  it("an English clip that recorded its words follows the short translation, not the meaning", () => {
    const clips = [
      clip("old-en", "english", 1000),
      clip("new-en", "english", 1000, "Good morning."),
    ];
    expect([
      ...staleClipIds(clips, [rev("englishGloss", "m1", "m2", 2000)]),
    ]).toEqual(["old-en"]);
    expect([
      ...staleClipIds(clips, [
        rev("englishTranslation", "Good morning.", "Morning, elder.", 2000),
      ]),
    ]).toEqual(["new-en"]);
  });

  it("the direct check: an English clip's own words against the translation as it stands", () => {
    const en = { language: "english", spokenText: "Good morning." };
    expect(spokenTextMatches(en, { englishTranslation: "Good morning." })).toBe(
      true,
    );
    expect(
      spokenTextMatches(en, { englishTranslation: " Good morning. " }),
    ).toBe(true);
    expect(
      spokenTextMatches(en, { englishTranslation: "Morning, elder." }),
    ).toBe(false);
    // Nothing to compare with: the clip's own record stands.
    expect(spokenTextMatches(en, { englishTranslation: null })).toBe(true);
    expect(spokenTextMatches(en, null)).toBe(true);
    // Igala clips and older English clips are checked through the edit log.
    expect(
      spokenTextMatches(
        { language: "igala", spokenText: null },
        { englishTranslation: "x" },
      ),
    ).toBe(true);
    expect(
      spokenTextMatches(
        { language: "english", spokenText: null },
        { englishTranslation: "x" },
      ),
    ).toBe(true);
  });
});

describe("small rules", () => {
  it("your answers to fix: no meaning, or a reason under 20 characters", () => {
    expect(needsFix({ kind: "cold", englishGloss: "  " })).toBe(true);
    expect(needsFix({ kind: "cold", englishGloss: "It means go." })).toBe(
      false,
    );
    expect(needsFix({ kind: "edit", rationale: null })).toBe(true);
    expect(needsFix({ kind: "edit", rationale: "tone" })).toBe(true);
    expect(
      needsFix({ kind: "edit", rationale: "The verb needs a low tone here." }),
    ).toBe(false);
    expect(needsFix({ kind: "pairwise" })).toBe(false);
  });

  it("a save id is a plain token or it is replaced", () => {
    expect(cleanSaveId("abc12345-def")).toBe("abc12345-def");
    expect(cleanSaveId("short")).toBeNull();
    expect(cleanSaveId("has space in it")).toBeNull();
    expect(cleanSaveId(42)).toBeNull();
  });
});

describe("the AnswerRevision migration", () => {
  const root = join(__dirname, "..", "..", "prisma");
  const dir = join(root, "migrations", "20261113141000_answer_revision");
  const up = readFileSync(join(dir, "migration.sql"), "utf8");
  const down = readFileSync(join(dir, "down.sql"), "utf8");
  const schema = readFileSync(join(root, "schema.prisma"), "utf8");
  const columns = [
    "id",
    "saveId",
    "targetType",
    "targetId",
    "field",
    "before",
    "after",
    "editorId",
    "authorId",
    "afterReveal",
    "isDemo",
    "createdAt",
  ];

  it("up creates one table and alters nothing that exists", () => {
    expect(up).toContain(
      'SET search_path TO "wikitongues", "extensions", "public"',
    );
    expect(up).toContain('CREATE TABLE "AnswerRevision"');
    expect(up.match(/CREATE TABLE/g)).toHaveLength(1);
    expect(up).not.toMatch(/ALTER TABLE|DROP\s+(TABLE|COLUMN|INDEX)|RENAME/i);
  });

  it("carries every column of the contract, and the schema declares them", () => {
    const model = schema.slice(schema.indexOf("model AnswerRevision {"));
    for (const col of columns) {
      expect(up).toContain(`"${col}"`);
      expect(model).toMatch(new RegExp(`\\n\\s+${col}\\s`));
    }
    // before and after are the only nullable columns
    expect(up).toMatch(/"before" TEXT,/);
    expect(up).toMatch(/"after" TEXT,/);
  });

  it("down removes exactly that table", () => {
    expect(down).toContain(
      'SET search_path TO "wikitongues", "extensions", "public"',
    );
    expect(down).toContain('DROP TABLE IF EXISTS "AnswerRevision"');
    expect(down.match(/DROP TABLE/g)).toHaveLength(1);
  });
});

describe("a lead's fix in Check (Nov 20 rule)", () => {
  const clip = (id: string, ms: number) => ({
    id,
    coldAuthorAnswerId: "c1",
    language: "igala",
    createdAt: new Date(ms),
  });
  const rev = (ms: number, before: string, after: string, saveId?: string) => ({
    targetId: "c1",
    field: "answerText",
    before,
    after,
    createdAt: new Date(ms),
    saveId,
  });

  it("the clip the lead listened to matches the fixed text", () => {
    const stale = staleClipIds(
      [clip("heard", 1000), clip("other", 1000)],
      [rev(2000, "a", "b", checkFixSaveId("heard", "r1234567"))],
    );
    // The clip the fix was made for is fine; another old clip still is not.
    expect([...stale]).toEqual(["other"]);
  });

  it("a later change after the fix makes that clip stale again", () => {
    const stale = staleClipIds(
      [clip("heard", 1000)],
      [
        rev(2000, "a", "b", checkFixSaveId("heard", "r1234567")),
        rev(3000, "b", "c"),
      ],
    );
    expect([...stale]).toEqual(["heard"]);
  });

  it("the save id names the clip and passes the save id rule", () => {
    const id = checkFixSaveId("cmt8ju5a40005kw04s9wi1b6n", "abcd1234");
    expect(cleanSaveId(id)).toBe(id);
  });
});
