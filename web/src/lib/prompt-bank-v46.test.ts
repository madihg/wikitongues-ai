import { describe, it, expect } from "vitest";
import { EvalBucket } from "@prisma/client";
import {
  V46_PROMPTS,
  V46_PROVENANCE,
  V46_SPEECH_PROVENANCE,
  V46_GAPS,
  V46_FAMILIES,
  V46_SPEECH_FAMILIES,
  MEASURED_MINUTES_PER_TEXT_PROMPT,
  findNearDuplicates,
  isSpeechPrompt,
  provenanceFor,
  sameDeclaredPair,
  speechCoverage,
  speechYield,
  v46SpeechEnglish,
} from "./prompt-bank-v46";
import { V45_PROMPTS } from "./prompt-bank-v45";

/**
 * The v4.6 bank's invariants, checked without a database. The seed
 * (prisma/seed-prompt-bank-v46.ts) re-checks namespace, length, dashes,
 * near-duplicates against the live bank and Scope A against the frozen gold
 * before it writes; these tests pin what can be pinned offline.
 */

// Family sizes from the design (tasks/prompt-bank-v46-evidence-2026-11.md).
const FAMILY_COUNTS: Record<string, number> = {
  aspec: 10, negq: 10, concd: 8, order: 10, chain: 10,
  tonew: 14, homog: 12, formu: 22, spell: 12, lexi: 16, inten: 20,
  engl: 14, neigh: 6, names: 6, vari: 6, numb: 10, idiom: 8, cult: 6,
  spnum: 20, spcar: 30, sppair: 16, spdig: 14, spvow: 7, spname: 10, speng: 10, splong: 13,
};

// Tone marks: a toned letter can only come from an Igala word.
const TONE_MARKS = /[̀́̂̄̌]/u;
// The three Igala letters outside the English alphabet.
const IGALA_LETTERS = /[ẹọñẸỌÑ]/u;

const text = V46_PROMPTS.filter((p) => !isSpeechPrompt(p));
const speech = V46_PROMPTS.filter(isSpeechPrompt);

describe("the v4.6 prompt bank", () => {
  it("has 200 text and 120 speech prompts in the 26 families of the design, numbered without gaps", () => {
    expect(V46_PROMPTS).toHaveLength(320);
    expect(text).toHaveLength(200);
    expect(speech).toHaveLength(120);
    const byFamily = new Map<string, string[]>();
    for (const p of V46_PROMPTS) {
      byFamily.set(p.family, [...(byFamily.get(p.family) ?? []), p.promptId]);
    }
    expect(Object.fromEntries([...byFamily].map(([k, v]) => [k, v.length]))).toEqual(FAMILY_COUNTS);
    for (const [family, ids] of byFamily) {
      const expected = ids.map((_, i) => `ig_v46_${family}_${String(i + 1).padStart(3, "0")}`);
      expect([...ids].sort()).toEqual(expected);
    }
  });

  it("uses unique ids in the v46 namespace, valid buckets, and one provenance per set", () => {
    const ids = V46_PROMPTS.map((p) => p.promptId);
    expect(new Set(ids).size).toBe(ids.length);
    const buckets = new Set(Object.values(EvalBucket));
    for (const p of V46_PROMPTS) {
      expect(p.promptId).toMatch(/^ig_v46_[a-z]{3,6}_\d{3}$/);
      expect(buckets.has(p.bucket)).toBe(true);
      expect(["basic", "intermediate", "advanced"]).toContain(p.difficultyLevel);
      expect(p.bucket).toBe(V46_FAMILIES[p.family].bucket);
    }
    expect(V46_PROVENANCE).toBe("claude_authored_v46_2026_11_13");
    expect(V46_SPEECH_PROVENANCE).toBe("claude_authored_v46_speech_2026_11_13");
    // The annotation queue treats a provenance containing "longform" as long form.
    expect(V46_PROVENANCE + V46_SPEECH_PROVENANCE).not.toMatch(/longform/);
    for (const p of text) expect(provenanceFor(p)).toBe(V46_PROVENANCE);
    for (const p of speech) expect(provenanceFor(p)).toBe(V46_SPEECH_PROVENANCE);
    expect(new Set(speech.map((p) => p.family))).toEqual(new Set(V46_SPEECH_FAMILIES));
  });

  it("keeps every text 25 to 420 characters, with no dash, emoji or 'please'", () => {
    for (const p of V46_PROMPTS) {
      expect(p.text.length, p.promptId).toBeGreaterThanOrEqual(25);
      expect(p.text.length, p.promptId).toBeLessThanOrEqual(420);
      const all = `${p.text}\n${p.expectedCulturalContext ?? ""}\n${p.rationale}\n${p.targetRule}`;
      expect(all, p.promptId).not.toMatch(/[—–]/);
      expect(all, p.promptId).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(p.text.toLowerCase(), p.promptId).not.toMatch(/\bplease\b/);
    }
  });

  it("quotes no Igala word: no tone mark anywhere, and Igala letters only as single letters in four speech prompts", () => {
    for (const p of V46_PROMPTS) {
      const all = `${p.text}\n${p.expectedCulturalContext ?? ""}\n${p.rationale}\n${p.targetRule}\n${p.igalaSources.join(" ")}`;
      expect(all.normalize("NFD"), p.promptId).not.toMatch(TONE_MARKS);
      expect(p.igalaSources.length, p.promptId).toBeGreaterThan(0);
      expect(p.igalaSources.join(" ").toLowerCase(), p.promptId).not.toMatch(/frozen|holdout/);
      // A note is shown to annotators in the factual buckets: English only.
      expect(p.expectedCulturalContext ?? "", p.promptId).not.toMatch(IGALA_LETTERS);
    }
    const withLetters = V46_PROMPTS.filter((p) => IGALA_LETTERS.test(p.text));
    expect(withLetters.map((p) => p.promptId).sort()).toEqual([
      "ig_v46_spdig_004",
      "ig_v46_spdig_005",
      "ig_v46_spvow_003",
      "ig_v46_spvow_006",
    ]);
    for (const p of withLetters) {
      // The letter stands alone (or as the two-letter nasal), never inside a word.
      const tokens = p.text.split(/[^\p{L}\p{M}]+/u).filter((w) => IGALA_LETTERS.test(w));
      for (const w of tokens) expect(["ẹ", "ọ", "ñ", "ñw"], `${p.promptId}: ${w}`).toContain(w);
    }
  });

  it("names no arm and no speaker in a note", () => {
    for (const p of V46_PROMPTS) {
      const note = p.expectedCulturalContext ?? "";
      expect(note, p.promptId).not.toMatch(/annotator_\d|annotators? \d|v4\.\d|rag-v|gemini|retrieval arm|agnes|ajuma|salem|lydia/i);
    }
  });

  it("ties every prompt to a measured gap", () => {
    for (const g of Object.values(V46_GAPS)) {
      // Every size line carries at least one count from the data.
      expect(g.size, g.title).toMatch(/\d/);
      expect(g.rank).toBeGreaterThan(0);
    }
    for (const p of V46_PROMPTS) {
      expect(V46_GAPS[p.gap], p.promptId).toBeDefined();
      expect(p.gap, p.promptId).toBe(V46_FAMILIES[p.family].gap);
      expect(p.rationale, p.promptId).toMatch(/\d/);
    }
    // Every gap has at least one prompt.
    const used = new Set(V46_PROMPTS.map((p) => p.gap));
    expect([...used].sort()).toEqual(Object.keys(V46_GAPS).sort());
  });

  it("has no near-duplicate inside the bank or against the v4.5 bank", () => {
    const r = findNearDuplicates(
      V46_PROMPTS,
      V45_PROMPTS.map((p) => ({ promptId: p.promptId, text: p.text, isHoldout: false })),
    );
    expect(r.dupes).toEqual([]);
    expect(r.maxInternal).toBeLessThan(0.55);
    expect(r.maxTrain).toBeLessThan(0.55);
  });

  it("exempts only the members of one declared pair from the inside check", () => {
    expect(sameDeclaredPair("ig_v46_sppair_006", "ig_v46_sppair_007")).toBe(true);
    expect(sameDeclaredPair("ig_v46_sppair_006", "ig_v46_sppair_008")).toBe(false);
    expect(sameDeclaredPair("ig_v46_spcar_001", "ig_v46_spcar_002")).toBe(false);
    // With the exemption off, the pairs are caught: the check is alive.
    const strict = findNearDuplicates(V46_PROMPTS, [], () => false);
    expect(strict.dupes.length).toBeGreaterThan(0);
    for (const d of strict.dupes) expect(sameDeclaredPair(d.a, d.b), `${d.a} ~ ${d.b}`).toBe(true);
  });

  it("catches a restated prompt, and holds frozen prompts to the stricter line", () => {
    const fresh = [{ promptId: "new_1", text: "Tell your sister that the goat ate the yam in the barn today." }];
    const same = "Tell your sister that the goat ate the yam in the barn today.";
    // Shares 4 of 8 content words with the fresh prompt: 0.50, between the two lines.
    const half = "Tell your sister that the goat ate the yam near the river.";
    expect(findNearDuplicates(fresh, [{ promptId: "old", text: same, isHoldout: false }]).dupes).toHaveLength(1);
    const asTrain = findNearDuplicates(fresh, [{ promptId: "old", text: half, isHoldout: false }]);
    const asFrozen = findNearDuplicates(fresh, [{ promptId: "old", text: half, isHoldout: true }]);
    expect(asTrain.maxTrain).toBeGreaterThanOrEqual(0.45);
    expect(asTrain.maxTrain).toBeLessThan(0.55);
    expect(asTrain.dupes).toHaveLength(0);
    expect(asFrozen.dupes).toHaveLength(1);
    expect(asFrozen.dupes[0].against).toBe("frozen");
    // A rerun sees its own rows and does not call them duplicates.
    expect(findNearDuplicates(fresh, [{ promptId: "new_1", text: same, isHoldout: false }]).dupes).toHaveLength(0);
  });

  it("tells the speaker no Igala form is correct: the prompts ask", () => {
    for (const p of V46_PROMPTS) {
      expect(p.text, p.promptId).not.toMatch(/\bthe (correct|right) (word|form) (is|for)\b/i);
      expect(p.text, p.promptId).not.toMatch(/\bthe igala word for [a-z ]+ is\b/i);
    }
  });

  it("gives each of the two annotators at least 30 hours of text work at the measured pace", () => {
    for (const minutes of Object.values(MEASURED_MINUTES_PER_TEXT_PROMPT)) {
      expect((text.length * minutes) / 60).toBeGreaterThanOrEqual(30);
    }
  });
});

describe("the v4.6 speech set", () => {
  const words = (s: string) => s.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;

  it("gives every carrier a direct English translation that is the sentence in the prompt", () => {
    const carriers = speech.filter((p) => p.speech!.kind === "carrier");
    expect(carriers.length).toBe(92);
    for (const p of carriers) {
      const english = p.speech!.english!;
      expect(p.text, p.promptId).toContain(`'${english}'`);
      expect(v46SpeechEnglish(p.promptId)).toBe(english);
      // A translation, not an explanation.
      expect(english, p.promptId).not.toMatch(/\b(means?|meaning|refers to|is used|in igala)\b/i);
      expect(english, p.promptId).toMatch(/^[A-Z].*[.?!]$/);
    }
  });

  it("asks the speaker for her own direct translation where she makes the sentence", () => {
    const opens = speech.filter((p) => p.speech!.kind === "open");
    expect(opens.length).toBe(28);
    for (const p of opens) {
      expect(p.speech!.english, p.promptId).toBeNull();
      expect(v46SpeechEnglish(p.promptId)).toBeNull();
      expect(p.text, p.promptId).toMatch(/English|translat/i);
      expect(p.text, p.promptId).toMatch(/tone/i);
    }
    expect(v46SpeechEnglish("ig_v46_aspec_001")).toBeNull();
    expect(v46SpeechEnglish("not_a_prompt")).toBeNull();
  });

  it("keeps clips inside the voice script bounds: short sentences and longer connected ones", () => {
    for (const p of speech) {
      const s = p.speech!;
      if (s.kind !== "carrier") continue;
      const n = words(s.english!);
      if (s.length === "long") {
        expect(n, p.promptId).toBeGreaterThanOrEqual(12);
        expect(n, p.promptId).toBeLessThanOrEqual(21);
      } else {
        expect(n, p.promptId).toBeGreaterThanOrEqual(4);
        expect(n, p.promptId).toBeLessThanOrEqual(10);
      }
    }
    expect(speech.filter((p) => p.speech!.length === "long")).toHaveLength(13);
  });

  it("covers every tone on every vowel, the dotted vowels, the two-letter sounds and the nasals", () => {
    const cells = speechCoverage();
    for (const tone of ["H", "M", "L"]) {
      for (const vowel of ["a", "e", "ed", "i", "o", "od", "u"]) {
        expect(cells.get(`${tone}-${vowel}`) ?? 0, `${tone}-${vowel}`).toBeGreaterThan(0);
      }
    }
    for (const cell of ["kp", "gb", "ny", "gw", "kw", "ch", "j", "pal", "r", "f", "h", "p"]) {
      expect(cells.get(cell) ?? 0, cell).toBeGreaterThan(0);
    }
    for (const cell of ["velar-nasal", "nw", "final-nasal"]) {
      expect(cells.get(cell) ?? 0, cell).toBeGreaterThan(0);
    }
    // The three sounds the brief names are each in at least six prompts.
    for (const cell of ["kp", "gb", "ny"]) expect(cells.get(cell)!, cell).toBeGreaterThanOrEqual(6);
  });

  it("holds tone pairs with a clip per member, numbers, names and English terms", () => {
    const cells = speechCoverage();
    const declared = [...cells].filter(([c, n]) => c.startsWith("pair:") && !c.startsWith("pair:own") && n >= 2);
    expect(declared.map(([c]) => c).sort()).toEqual([
      "pair:close-pick-drum",
      "pair:say-shout",
      "pair:sit-rejoice",
      "pair:that-who",
    ]);
    expect([...cells].filter(([c]) => c.startsWith("pair:own")).length).toBe(7);
    expect(speech.filter((p) => p.family === "spnum")).toHaveLength(20);
    expect(cells.get("name")!).toBeGreaterThanOrEqual(9);
    expect(cells.get("english-term")!).toBe(10);
    expect(cells.get("connected")!).toBe(13);
  });

  it("reports the clips and minutes it yields", () => {
    const y = speechYield();
    expect(y.prompts).toBe(120);
    expect(y.clips).toBe(240);
    expect(y.igalaMinutes).toBeGreaterThan(10);
    expect(y.igalaMinutes).toBeLessThan(25);
    expect(y.totalMinutes).toBeCloseTo(y.igalaMinutes * 2, 5);
    expect(speechYield(text)).toEqual({ prompts: 0, clips: 0, igalaMinutes: 0, totalMinutes: 0 });
  });
});
