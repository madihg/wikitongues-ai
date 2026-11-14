import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "r-1", role: "RESEARCHER" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/speak" }));

import {
  ENGLISH_CLIP_LABEL,
  EnglishTranslationField,
  MEANING_REMINDER,
  TRANSLATION_HELP,
  TRANSLATION_LABEL,
  TRANSLATION_OFF_REASON,
} from "./english-translation";
import { RecordClip, type RecordClipProps } from "./record-clip";
import {
  MAX_TRANSLATION_CHARS,
  cleanTranslation,
  translationReady,
} from "@/lib/speech/limits";

/**
 * Story C2: the English clip reads a short translation the speaker types,
 * never the longer English meaning. Fixtures are synthetic English.
 */

const dir = __dirname;
const sourceOf = (f: string) => readFileSync(join(dir, f), "utf8");
const noop = () => {};
const DISABLED = /\sdisabled=""/;
function tagsOf(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map(
    (m) => m[0],
  );
}

const MEANING = "It is the respectful morning greeting, used with elders.";

describe("the copy is the spec's, word for word", () => {
  it("labels, help, reminder and the off reason", () => {
    expect(MEANING_REMINDER).toBe("Your English meaning:");
    expect(TRANSLATION_LABEL).toBe("Short English translation");
    expect(TRANSLATION_HELP).toBe(
      "A few words. Say what the Igala says, nothing more.",
    );
    expect(ENGLISH_CLIP_LABEL).toBe("Now say the same thing in English.");
    expect(TRANSLATION_OFF_REASON).toBe(
      "Type the short English translation to turn recording on.",
    );
  });
});

describe("EnglishTranslationField", () => {
  const field = (over: Partial<Parameters<typeof EnglishTranslationField>[0]> = {}) =>
    renderToStaticMarkup(
      <EnglishTranslationField
        id="t"
        meaning={MEANING}
        value=""
        onChange={noop}
        {...over}
      />,
    );

  it("shows the meaning above the box as a read-only reminder", () => {
    const html = field();
    expect(html).toContain("Your English meaning:");
    expect(html).toContain(MEANING);
    expect(html.indexOf(MEANING)).toBeLessThan(html.indexOf("<input"));
    // The meaning is text, not a field: it cannot be edited here.
    expect(tagsOf(html, "input")).toHaveLength(1);
    expect(tagsOf(html, "textarea")).toHaveLength(0);
  });

  it("leaves the reminder out when no meaning was written", () => {
    const html = field({ meaning: "   " });
    expect(html).not.toContain("Your English meaning:");
    expect(html).toContain("Short English translation");
  });

  it("is a labelled, 44px, single-line box capped at a few words", () => {
    const html = field({ value: "good morning" });
    const [input] = tagsOf(html, "input");
    expect(input).toContain('id="t"');
    expect(html).toContain('<label for="t"');
    expect(input).toContain('value="good morning"');
    expect(input).toContain(`maxLength="${MAX_TRANSLATION_CHARS}"`);
    expect(input).toContain("min-h-[44px]");
    expect(html).toContain(TRANSLATION_HELP);
  });

  it("locks while a take exists, so the words stay the ones just said", () => {
    expect(tagsOf(field({ locked: true }), "input")[0]).toMatch(DISABLED);
    expect(tagsOf(field(), "input")[0]).not.toMatch(DISABLED);
  });

  it("a translation already saved with the answer is shown, not edited", () => {
    const html = field({ saved: "good morning, elder" });
    expect(html).toContain("good morning, elder");
    expect(tagsOf(html, "input")).toHaveLength(0);
    expect(html).toContain("Short English translation");
  });
});

describe("the translation rules", () => {
  it("recording turns on at two characters, after trimming", () => {
    expect(translationReady("")).toBe(false);
    expect(translationReady("   ")).toBe(false);
    expect(translationReady(" a ")).toBe(false);
    expect(translationReady("hi")).toBe(true);
    expect(translationReady("good morning, elder")).toBe(true);
  });

  it("is stored trimmed, single-spaced and NFC", () => {
    expect(cleanTranslation("  good   morning \n elder ")).toBe(
      "good morning elder",
    );
    expect(cleanTranslation("café")).toBe("café");
  });
});

describe("the English clip", () => {
  const PROPS: RecordClipProps = {
    language: "english",
    promptCode: "code_001",
    textToRead: "",
    textLabel: ENGLISH_CLIP_LABEL,
    textIsIgala: false,
    syllableText: "",
    answer: null,
    consentOk: true,
    offReason: TRANSLATION_OFF_REASON,
    licensedAllowed: true,
    cloningAllowed: false,
    onSaved: noop,
  };
  const record = (html: string) =>
    tagsOf(html, "button").find((t) => t.includes('data-testid="record-button"'))!;

  it("cannot start with an empty translation box, and says why", () => {
    const html = renderToStaticMarkup(
      <RecordClip
        {...PROPS}
        before={
          <EnglishTranslationField id="t" meaning={MEANING} value="" onChange={noop} />
        }
      />,
    );
    expect(record(html)).toMatch(DISABLED);
    expect(html).toContain(TRANSLATION_OFF_REASON);
    // Nothing to read yet: no words are shown above the button.
    expect(html).not.toContain('data-testid="text-to-read"');
  });

  it("the words above the Record button are the typed translation, never the long meaning", () => {
    const html = renderToStaticMarkup(
      <RecordClip
        {...PROPS}
        textToRead="Good morning, elder"
        offReason={null}
        before={
          <EnglishTranslationField
            id="t"
            meaning={MEANING}
            value="Good morning, elder"
            onChange={noop}
          />
        }
      />,
    );
    const toRead = /data-testid="text-to-read"[^>]*>([^<]*)</.exec(html)?.[1];
    expect(toRead).toBe("Good morning, elder");
    expect(toRead).not.toContain("respectful");
    // Order: the box, then the label, then the words, then the button.
    const at = (needle: string) => html.indexOf(needle);
    expect(at("<input")).toBeLessThan(at(ENGLISH_CLIP_LABEL));
    expect(at(ENGLISH_CLIP_LABEL)).toBeLessThan(at('data-testid="text-to-read"'));
    expect(at('data-testid="text-to-read"')).toBeLessThan(
      at('data-testid="record-button"'),
    );
  });

  it("sends the translation with an English clip only", () => {
    const src = sourceOf("record-clip.tsx");
    expect(src).toMatch(
      /\.\.\.\(language === "english" && englishTranslation\s*\? \{ englishTranslation \}\s*: \{\}\)/,
    );
  });
});

describe("the Record page", () => {
  const src = sourceOf("record-interface.tsx");

  it("the English clip reads the translation: saved with the answer, or the one being typed", () => {
    expect(src).toContain(
      "const englishText = savedTranslation || cleanTranslation(translation);",
    );
    expect(src).toContain("textToRead={englishText}");
    expect(src).toContain("englishTranslation={englishText}");
    expect(src).toContain("textLabel={ENGLISH_CLIP_LABEL}");
    // The meaning is only ever the reminder, and the question is never read.
    expect(src).toContain("meaning={gloss}");
    expect(src).not.toContain("gloss || task.prompt.text");
    expect(src).not.toContain("read the English question instead");
    expect(src).not.toContain("Now say what it means");
  });

  it("the English Record button is off until the box has two characters", () => {
    expect(src).toContain(
      "offReason ?? (translationReady(englishText) ? null : TRANSLATION_OFF_REASON)",
    );
    const english = src.slice(src.indexOf('language="english"'));
    expect(english).toContain("offReason={englishOffReason}");
  });

  it("Next prompt needs both clips; with only the Igala clip saved it does not show", () => {
    expect(src).toContain("const igalaDone = task?.igalaDone === true || savedIgala;");
    expect(src).toContain("const promptDone = igalaDone && savedEnglish;");
    expect(src).toMatch(/\{promptDone && !anyBusy && \(\s*<button type="button" onClick=\{nextPrompt\}/);
    expect(src).not.toContain("{savedIgala && !anyBusy && (");
  });

  it("Skip this prompt stays until the prompt is done", () => {
    expect(src).toContain("{task && !promptDone && !anyBusy && (");
    expect(src).toContain("Skip this prompt");
  });

  it("a prompt that comes back for its English clip shows the Igala part as done", () => {
    expect(src).toContain("Your Igala clip is saved. One more: the English.");
    expect(src).toMatch(/\{task\.igalaDone \? \(\s*<p\s+data-testid="igala-done"/);
  });

  it("the box locks once the English clip holds a take, is saving or is saved", () => {
    expect(src).toContain(
      "locked={englishHasTake || busy.english || savedEnglish}",
    );
    expect(src).toContain("onTakeChange={setEnglishHasTake}");
  });

  it("the next prompt starts with an empty box", () => {
    const next = src.slice(src.indexOf("const nextPrompt"), src.indexOf("const skip"));
    expect(next).toContain('setTranslation("")');
    expect(next).toContain("setSavedEnglish(false)");
  });
});

describe("the Say it block keeps both clips optional", () => {
  const src = sourceOf("say-it-block.tsx");

  it("reads the typed translation, with the same box and label", () => {
    expect(src).toContain("textToRead={englishText}");
    expect(src).toContain("englishTranslation={englishText}");
    expect(src).toContain("textLabel={ENGLISH_CLIP_LABEL}");
    expect(src).toContain("<EnglishTranslationField");
    expect(src).not.toContain("gloss || promptText");
  });

  it("the skip button keeps its wording and never waits for the English clip", () => {
    expect(src).toContain('"Skip, no recording"');
    expect(src).toContain('"Continue to the AI outputs"');
    expect(src).toMatch(/data-testid="say-it-continue"\s+disabled=\{anyBusy\}/);
  });
});

describe("the export carries the translation as its own column", () => {
  it("english_translation keeps its name and meaning; the short one sits beside it", () => {
    const src = readFileSync(
      join(dir, "..", "..", "lib", "exports.ts"),
      "utf8",
    );
    expect(src).toContain(
      '{ key: "english_translation", get: (r) => r.englishGloss },',
    );
    expect(src).toContain(
      '{ key: "english_translation_short", get: (r) => r.englishTranslation },',
    );
    expect(src.indexOf('key: "english_translation_short"')).toBeGreaterThan(
      src.indexOf('key: "english_translation"'),
    );
    expect(src).toContain("| english_translation_short |");
  });
});

describe("migration 20261113151000_english_translation", () => {
  const root = join(dir, "..", "..", "..", "prisma");
  const mdir = join(root, "migrations", "20261113151000_english_translation");
  const up = readFileSync(join(mdir, "migration.sql"), "utf8");
  const down = readFileSync(join(mdir, "down.sql"), "utf8");
  const schema = readFileSync(join(root, "schema.prisma"), "utf8");
  const sql = (s: string) =>
    s
      .split("\n")
      .filter((l) => !l.startsWith("--"))
      .join("\n");

  it("starts with the search path and is additive", () => {
    for (const f of [up, down]) {
      expect(f).toContain(
        'SET search_path TO "wikitongues", "extensions", "public"',
      );
    }
    expect(sql(up)).not.toMatch(/DROP|ALTER COLUMN|RENAME|NOT NULL|UPDATE|DELETE|\sDEFAULT\s/i);
  });

  it("adds one nullable text column to each of two tables, and nothing else", () => {
    const alters = [...up.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]);
    expect(alters).toEqual(["ColdAuthorAnswer", "SpeechRecording"]);
    expect(up).toContain('ALTER TABLE "ColdAuthorAnswer" ADD COLUMN     "englishTranslation" TEXT;');
    expect(up).toContain('ALTER TABLE "SpeechRecording" ADD COLUMN     "spokenText" TEXT;');
  });

  it("the schema declares both nullable", () => {
    expect(schema).toMatch(/englishTranslation\s+String\?\n/);
    expect(schema).toMatch(/spokenText\s+String\?/);
  });

  it("down.sql drops exactly those two columns", () => {
    expect(down).toContain(
      'ALTER TABLE "ColdAuthorAnswer" DROP COLUMN IF EXISTS "englishTranslation"',
    );
    expect(down).toContain(
      'ALTER TABLE "SpeechRecording" DROP COLUMN IF EXISTS "spokenText"',
    );
    expect(sql(down).match(/DROP/g)).toHaveLength(2);
  });
});
