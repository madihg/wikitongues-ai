import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_DROPPED_SHARE,
  REFERENCE_CAP_MARGIN,
  REFERENCE_FORM_LABELS,
  REFERENCE_FORM_SYSTEM,
  REFERENCE_MAX_TOKENS_GOOGLE,
  buildReferenceFormTurn,
  isReferenceFormReport,
  referenceFormCandidate,
  referenceFormRefusal,
  referenceFormReport,
  referenceMaxTokensFor,
  renderReferenceForm,
  rendersReferenceForm,
  summarizeReferenceReport,
  type ReferenceFormResult,
} from "./reference-form";
import type {
  CandidateGeneration,
  CandidateLike,
  GenerateArgs,
} from "./providers";

/**
 * The second pass, pinned: which label gets it, what the instruction does
 * and does not assert, what the mechanical report can see, and that the pass
 * is pure over the injected generate. Every Igala string below is synthetic
 * or the write-up's own example (ki ọla / k'ọla); no gold answer and no
 * annotator's text appears here. Where a synthetic form stands in for a
 * mechanism (a restored dotted vowel, a nasal letter), it pins the mechanism,
 * never a claim that the form is Igala.
 */

const cp = (...points: number[]) => String.fromCodePoint(...points);
/** En and em dash, built from code points so the source carries neither. */
const DASHES = new RegExp(`[${cp(0x2013, 0x2014)}]`);
const TONE = new RegExp(`[${cp(0x300, 0x301, 0x302, 0x304, 0x30c)}]`, "u");
const hasToneMark = (s: string) => TONE.test(s.normalize("NFD"));

describe("the labels that get the second pass", () => {
  it("is rag-v4-5 and nothing else", () => {
    expect(REFERENCE_FORM_LABELS).toEqual(["rag-v4-5"]);
    expect(rendersReferenceForm("rag-v4-5")).toBe(true);
    for (const l of [
      "rag-v4-4",
      "rag-v4",
      "rag-v3",
      "rag-v4-5x",
      "",
      null,
      undefined,
    ])
      expect(rendersReferenceForm(l)).toBe(false);
  });
});

describe("REFERENCE_FORM_SYSTEM", () => {
  it("cites the authors' pair, and no other Igala word with a dotted vowel", () => {
    expect(REFERENCE_FORM_SYSTEM).toContain("ki ọla");
    expect(REFERENCE_FORM_SYSTEM).toContain("k'ọla");
    const dotted = new Set(
      (REFERENCE_FORM_SYSTEM.normalize("NFC").match(/[\p{L}']+/gu) ?? [])
        .filter((w) => /[ẹọ]/iu.test(w))
        .map((w) => w.replace(/^k'/, "").toLowerCase()),
    );
    expect([...dotted]).toEqual(["ọla"]);
  });

  it("asserts no tone of any Igala word: the instruction itself carries no tone mark", () => {
    expect(hasToneMark(REFERENCE_FORM_SYSTEM)).toBe(false);
  });

  it("tells the model to leave an unknown tone unmarked rather than guess", () => {
    expect(REFERENCE_FORM_SYSTEM).toMatch(
      /leave that word exactly as it is, unmarked/,
    );
    expect(REFERENCE_FORM_SYSTEM).toMatch(/Never guess a tone/);
  });

  it("states the five rules: tone, no elision, same words, same letters, one variety", () => {
    expect(REFERENCE_FORM_SYSTEM).toMatch(/Every word carries its tone marks/);
    expect(REFERENCE_FORM_SYSTEM).toMatch(
      /No elision where the full form is certain/,
    );
    expect(REFERENCE_FORM_SYSTEM).toMatch(
      /restoring the vowel the apostrophe stands for/,
    );
    expect(REFERENCE_FORM_SYSTEM).toMatch(
      /Nothing added, nothing dropped, nothing reordered, nothing translated/,
    );
    expect(REFERENCE_FORM_SYSTEM).toMatch(
      /copy every word's letters unchanged: a dotted vowel stays dotted, an undotted vowel stays undotted, ñ stays ñ/,
    );
    expect(REFERENCE_FORM_SYSTEM).toMatch(
      /Names and borrowed words keep their s/,
    );
    expect(REFERENCE_FORM_SYSTEM).toMatch(/One variety of Igala throughout/);
    expect(REFERENCE_FORM_SYSTEM).toMatch(/Output the rendered Igala only/);
  });

  it("restores a vowel only where the full word is attested, keeps the apostrophe otherwise, and never splits a fused word", () => {
    // After the first 20 samples guessed restorations and split fused words.
    expect(REFERENCE_FORM_SYSTEM).toMatch(
      /only where that full word appears elsewhere in this same answer, or is the authors' example/,
    );
    expect(REFERENCE_FORM_SYSTEM).toMatch(
      /Otherwise keep the apostrophe exactly as written/,
    );
    expect(REFERENCE_FORM_SYSTEM).toMatch(
      /A word written without an apostrophe is one word: never split it/,
    );
    expect(REFERENCE_FORM_SYSTEM).toMatch(
      /a tone mark goes on top of a letter, never in place of one/,
    );
  });

  it("licenses no letter change beyond the restored vowel: no s-to-ch respelling, no added initial vowel", () => {
    // A respelling rule would contradict rule 3 (same words); an
    // initial-vowel rule would invite the vowel the served prompt and the
    // community both say never to add.
    expect(REFERENCE_FORM_SYSTEM).not.toMatch(/with ch/);
    expect(REFERENCE_FORM_SYSTEM).not.toMatch(/initial vowel/);
  });

  it("says the text is to be rendered, not answered, in both the system and the user turn", () => {
    expect(REFERENCE_FORM_SYSTEM).toMatch(/not answering it/);
    expect(buildReferenceFormTurn("x").userMessage).toMatch(/Do not answer it/);
  });

  it("carries no em or en dash anywhere the model reads", () => {
    expect(REFERENCE_FORM_SYSTEM).not.toMatch(DASHES);
    expect(buildReferenceFormTurn("x").userMessage).not.toMatch(DASHES);
  });
});

describe("buildReferenceFormTurn", () => {
  it("sends the trimmed answer under the frame, the instruction verbatim, and nothing else", () => {
    const turn = buildReferenceFormTurn("  Ma k'ọla wa.\n");
    expect(turn.systemPromptOverride).toBe(REFERENCE_FORM_SYSTEM);
    // Verbatim: the forcing instruction's "best attempt even if unsure"
    // would contradict "never guess a tone" (providers.test.ts pins that the
    // flag changes nothing for any other arm).
    expect(turn.systemPromptExact).toBe(true);
    expect(turn.userMessage.endsWith("\n\nMa k'ọla wa.")).toBe(true);
    expect(
      turn.userMessage.startsWith("Render the following Igala answer"),
    ).toBe(true);
    // No exemplars, no chunks, no history: the pass sees the answer alone.
    expect(Object.keys(turn).sort()).toEqual([
      "systemPromptExact",
      "systemPromptOverride",
      "userMessage",
    ]);
  });
});

describe("referenceFormCandidate", () => {
  const base: CandidateLike = {
    provider: "google",
    baseModelId: "gemini-3.1-pro-preview",
    ragEnabled: true,
    decodingParams: { temperature: 0.7, maxTokens: 4096 },
  };

  it("keeps the model, turns retrieval off, sets temperature 0 and the reference budget", () => {
    const c = referenceFormCandidate(base);
    expect(c.provider).toBe("google");
    expect(c.baseModelId).toBe("gemini-3.1-pro-preview");
    expect(c.ragEnabled).toBe(false);
    // Google's hidden reasoning bills against the completion budget: 8,192,
    // not the candidate's 4,096 that truncated a sample.
    expect(c.decodingParams).toEqual({ temperature: 0, maxTokens: 8192 });
    // The input is not mutated.
    expect(base.ragEnabled).toBe(true);
    expect(base.decodingParams).toEqual({ temperature: 0.7, maxTokens: 4096 });
  });

  it("keeps the explicit null temperature opt-out", () => {
    const c = referenceFormCandidate({
      ...base,
      decodingParams: { temperature: null, maxTokens: 1024 },
    });
    expect(c.decodingParams).toEqual({ temperature: null, maxTokens: 8192 });
  });

  it("copes with no decoding params at all", () => {
    expect(
      referenceFormCandidate({ ...base, decodingParams: undefined })
        .decodingParams,
    ).toEqual({ temperature: 0, maxTokens: 8192 });
  });
});

describe("referenceMaxTokensFor", () => {
  it("is 8192 for google and the candidate's own budget otherwise, 1024 when it sets none", () => {
    const g: CandidateLike = { provider: "google", baseModelId: "g" };
    const o: CandidateLike = { provider: "openai", baseModelId: "o" };
    expect(referenceMaxTokensFor(g)).toBe(REFERENCE_MAX_TOKENS_GOOGLE);
    expect(REFERENCE_MAX_TOKENS_GOOGLE).toBe(8192);
    expect(
      referenceMaxTokensFor({ ...o, decodingParams: { maxTokens: 4096 } }),
    ).toBe(4096);
    expect(referenceMaxTokensFor(o)).toBe(1024);
    expect(
      referenceFormCandidate({ ...o, decodingParams: { maxTokens: 2048 } })
        .decodingParams,
    ).toEqual({ temperature: 0, maxTokens: 2048 });
  });
});

describe("referenceFormReport", () => {
  it("a full rendering of the authors' pair: every word toned, the contraction matched to its expansion", () => {
    expect(referenceFormReport("Ma k'ọla wa.", "Mà kí ọ́lá wà.")).toEqual({
      communityWords: 3,
      referenceWords: 4,
      tonedWords: 4,
      partiallyTonedWords: 0,
      unmarkedWords: 0,
      tonedShare: 1,
      apostrophesLeft: 0,
      dropped: [],
      added: [],
      changed: [],
      lettersChanged: 0,
      vowelsRestored: 1,
      newSWords: [],
    });
  });

  it("a dropped word is named, as the community wrote it", () => {
    const r = referenceFormReport("Ma k'ọla wa dẹ", "Mà kí ọ́lá wà");
    expect(r.dropped).toEqual(["dẹ"]);
    expect(r.added).toEqual([]);
  });

  it("an added word is named, as the rendering wrote it", () => {
    const r = referenceFormReport("Ma k'ọla", "Mà kí ọ́lá wà");
    expect(r.dropped).toEqual([]);
    expect(r.added).toEqual(["wà"]);
  });

  it("an apostrophe the rendering kept is counted, and the fused word still matches", () => {
    const r = referenceFormReport("Ma k'ọla wa", "Mà k'ọ́lá wà");
    expect(r.apostrophesLeft).toBe(1);
    expect(r.dropped).toEqual([]);
    expect(r.added).toEqual([]);
    // The curly apostrophe counts the same.
    expect(
      referenceFormReport("Ma k'ọla wa", `Mà k${cp(0x2019)}ọ́lá wà`)
        .apostrophesLeft,
    ).toBe(1);
  });

  it("does not count an apostrophe before a lone word-final n or ñ (the attached negator)", () => {
    expect(referenceFormReport("wa'ñ", "wà'ñ").apostrophesLeft).toBe(0);
    expect(referenceFormReport("wa'n", "wà'n").apostrophesLeft).toBe(0);
    // A real joint before a longer word still counts.
    expect(referenceFormReport("k'ọla", "k'ọla").apostrophesLeft).toBe(1);
    expect(referenceFormReport("wa'ña", "wà'ña").apostrophesLeft).toBe(1);
  });

  it("counts the words that came back unmarked", () => {
    const r = referenceFormReport("Ma k'ọla wa", "Mà ki ọla wa");
    expect(r.tonedWords).toBe(1);
    expect(r.unmarkedWords).toBe(3);
    expect(r.tonedShare).toBeCloseTo(0.25);
  });

  it("counts a word marked on some vowels but not all as partly toned", () => {
    const r = referenceFormReport("Ma k'ọla", "Mà kí ọ́la");
    expect(r.tonedWords).toBe(3);
    expect(r.partiallyTonedWords).toBe(1);
    expect(r.unmarkedWords).toBe(0);
  });

  it("flags an s the rendering brought in, capitalised or not, and never an s the answer already had", () => {
    // Copied: a name and a lowercase loan keep their s and are not flagged.
    expect(referenceFormReport("Sarah sukulu", "Sarah sukulù").newSWords).toEqual(
      [],
    );
    // New: ch became s, mid-sentence and sentence-initially.
    expect(referenceFormReport("Ma cho wa", "Mà só wà").newSWords).toEqual([
      "só",
    ]);
    expect(referenceFormReport("Cho wa", "Só wà").newSWords).toEqual(["Só"]);
  });

  it("ignores edge quotes and number tokens", () => {
    const r = referenceFormReport("'ọdọ 2021'", "ọ́dọ̀ 2021");
    expect(r.apostrophesLeft).toBe(0);
    expect(r.communityWords).toBe(1);
    expect(r.referenceWords).toBe(1);
    expect(r.dropped).toEqual([]);
    expect(r.added).toEqual([]);
  });

  it("matches a clipped piece only to a word one vowel longer: ef' is efu, not efẹwọ", () => {
    expect(referenceFormReport("ef'ọdọ", "efu ọdọ")).toMatchObject({
      dropped: [],
      added: [],
      changed: [],
      vowelsRestored: 1,
    });
    // The contraction is ONE community word: when its clipped piece is not a
    // one-vowel restoration, the whole word is a change, shown with what it
    // became, never a partial credit.
    expect(referenceFormReport("ef'ọdọ", "efẹwọ ọdọ")).toMatchObject({
      dropped: [],
      added: [],
      changed: [{ community: "ef'ọdọ", reference: "efẹwọ ọdọ" }],
      lettersChanged: 1,
      vowelsRestored: 0,
    });
  });

  it("accepts a restored dotted vowel: k' may be ki, ka or another word, as the authors say", () => {
    // The write-up's own pair first, then the mechanism with ọ and ẹ as the
    // restored vowel (one letter plus its dot below, three code points in
    // NFD), toned and untoned. A mechanism test, not a claim about Igala.
    for (const rendered of [
      "ki ọla",
      "kí ọ́lá",
      "kọ ọla",
      "kọ́ ọ́lá",
      "kẹ ọla",
    ]) {
      expect(referenceFormReport("k'ọla", rendered)).toMatchObject({
        dropped: [],
        added: [],
      });
    }
  });

  it("accepts the second vowel elided instead (ki'la is ki ọla), but never two vowels at one joint", () => {
    expect(referenceFormReport("ki'la", "kí ọ́lá")).toMatchObject({
      dropped: [],
      added: [],
    });
    expect(referenceFormReport("k'la", "ki ọla")).toMatchObject({
      dropped: [],
      added: [],
      changed: [{ community: "k'la", reference: "ki ọla" }],
    });
  });

  it("a changed dotted vowel is a changed word, not a tone mark, in either direction", () => {
    expect(referenceFormReport("ọla", "ólá")).toMatchObject({
      changed: [{ community: "ọla", reference: "ólá" }],
      lettersChanged: 1,
      dropped: [],
      added: [],
    });
    expect(referenceFormReport("ẹla", "ela").changed).toEqual([
      { community: "ẹla", reference: "ela" },
    ]);
    // A dot below ADDED is as much a change as one removed (the e -> ẹ the
    // first samples made), tone marks or not.
    expect(referenceFormReport("abe", "àbẹ̀").changed).toEqual([
      { community: "abe", reference: "àbẹ̀" },
    ]);
  });

  it("a changed nasal letter is a changed word: ñ and n are not folded, and ñ is not a toned n", () => {
    expect(referenceFormReport("ñaka", "naka").changed).toEqual([
      { community: "ñaka", reference: "naka" },
    ]);
    expect(referenceFormReport("wa ñ", `wà n${cp(0x301)}`).changed).toEqual([
      { community: "ñ", reference: "ń" },
    ]);
    expect(referenceFormReport("ñaka", "ñàkà")).toMatchObject({
      changed: [],
      dropped: [],
      added: [],
    });
  });

  it("a fused word split in two is a change, and a genuinely added word is not absorbed as a split", () => {
    expect(referenceFormReport("Ma kpadu wa", "Mà kpà dù wà")).toMatchObject({
      changed: [{ community: "kpadu", reference: "kpà dù" }],
      dropped: [],
      added: [],
    });
    expect(referenceFormReport("Ma wa", "Mà wà dẹ")).toMatchObject({
      changed: [],
      added: ["dẹ"],
    });
  });

  it("aligns in order, so a truncated rendering shows as its missing tail", () => {
    const r = referenceFormReport(
      "ma ka wa la da fa ta na",
      "mà kà wà là",
    );
    expect(r.dropped).toEqual(["da", "fa", "ta", "na"]);
    expect(r.changed).toEqual([]);
    expect(r.added).toEqual([]);
  });

  it("pairs a changed word with its closest counterpart rather than an arbitrary one", () => {
    const r = referenceFormReport("Ma wa dẹ cho", "Mà wà só");
    expect(r.changed).toEqual([{ community: "cho", reference: "só" }]);
    expect(r.dropped).toEqual(["dẹ"]);
  });

  it("counts no restored vowel when the contraction is kept", () => {
    expect(referenceFormReport("Ma k'ọla wa", "Mà k'ọ́lá wà").vowelsRestored).toBe(
      0,
    );
  });

  it("compares as a multiset, so a repeated word must come back repeated", () => {
    expect(referenceFormReport("wa wa", "wà").dropped).toEqual(["wa"]);
  });

  it("reads precomposed and decomposed spellings as the same text", () => {
    const precomposed = cp(0x1ecd, 0x301) + "l" + cp(0xe1); // ọ + acute (no single code point exists), l, á
    const decomposed = "o" + cp(0x323, 0x301) + "la" + cp(0x301);
    expect(referenceFormReport("ọla", precomposed)).toEqual(
      referenceFormReport("ọla", decomposed),
    );
    expect(referenceFormReport("ọla", precomposed).dropped).toEqual([]);
  });

  it("an empty rendering drops everything and has no toned share", () => {
    const r = referenceFormReport("Ma k'ọla wa", "");
    expect(r.referenceWords).toBe(0);
    expect(r.tonedShare).toBe(0);
    expect(r.dropped).toEqual(["Ma", "k'ọla", "wa"]);
  });
});

describe("isReferenceFormReport", () => {
  const good = referenceFormReport("Ma k'ọla wa", "Mà kí ọ́lá wà");

  it("accepts a report the module produced", () => {
    expect(isReferenceFormReport(good)).toBe(true);
    expect(isReferenceFormReport(JSON.parse(JSON.stringify(good)))).toBe(true);
  });

  it("rejects anything a client could not render safely", () => {
    expect(isReferenceFormReport(null)).toBe(false);
    expect(isReferenceFormReport("junk")).toBe(false);
    expect(isReferenceFormReport({ ...good, tonedShare: "1" })).toBe(false);
    expect(isReferenceFormReport({ ...good, tonedShare: Number.NaN })).toBe(
      false,
    );
    expect(isReferenceFormReport({ ...good, dropped: "dẹ" })).toBe(false);
    expect(isReferenceFormReport({ ...good, added: [1] })).toBe(false);
    expect(isReferenceFormReport({ ...good, changed: [{ community: "a" }] })).toBe(
      false,
    );
    expect(isReferenceFormReport({ ...good, lettersChanged: null })).toBe(false);
    const missing: Record<string, unknown> = { ...good };
    delete missing.newSWords;
    expect(isReferenceFormReport(missing)).toBe(false);
  });
});

describe("summarizeReferenceReport", () => {
  it("reads the numbers out in one line, naming partly toned, restored, changed, dropped and new-s words", () => {
    const line = summarizeReferenceReport(
      referenceFormReport("Ma k'ọla wa dẹ cho", "Mà kí ọ́la wà só"),
    );
    expect(line).toBe(
      "100% of 5 words toned (1 partly) · 0 apostrophes left · 1 vowel restored · " +
        "letters changed in 1 word (cho → só) · 1 word dropped (dẹ) · new s in só",
    );
    expect(line).not.toMatch(DASHES);
  });

  it("says only what happened on a clean rendering", () => {
    expect(
      summarizeReferenceReport(referenceFormReport("Ma k'ọla", "Mà k'ọ́lá")),
    ).toBe("100% of 2 words toned · 1 apostrophe left");
  });
});

describe("referenceFormRefusal", () => {
  const result = (over: Partial<ReferenceFormResult> = {}): ReferenceFormResult => ({
    text: "Mà kí ọ́lá wà",
    modelId: "gemini-3.1-pro-preview",
    tokensIn: 400,
    tokensOut: 3000,
    latencyMs: 20_000,
    maxTokens: 4096,
    report: referenceFormReport("Ma k'ọla wa", "Mà kí ọ́lá wà"),
    ...over,
  });

  it("shows an ordinary rendering", () => {
    expect(referenceFormRefusal(result())).toBeNull();
    // A provider that reports no usage cannot be judged truncated.
    expect(referenceFormRefusal(result({ tokensOut: null }))).toBeNull();
  });

  it("refuses an empty rendering", () => {
    expect(referenceFormRefusal(result({ text: "" }))).toMatch(/empty/);
  });

  it("refuses a pass pinned within 8 tokens of its cap, and nothing below", () => {
    expect(referenceFormRefusal(result({ tokensOut: 4092 }))).toMatch(
      /truncated \(tokensOut 4092 hit the 4096 cap\)/,
    );
    expect(referenceFormRefusal(result({ tokensOut: 4088 }))).toMatch(
      /truncated/,
    );
    expect(referenceFormRefusal(result({ tokensOut: 4087 }))).toBeNull();
    expect(REFERENCE_CAP_MARGIN).toBe(8);
  });

  it("refuses a rendering missing more than a quarter of the answer's words, and not one missing a quarter", () => {
    const eight = "ma ka wa la da fa ta na";
    const missingThree = referenceFormReport(eight, "mà kà wà là dà");
    const missingTwo = referenceFormReport(eight, "mà kà wà là dà fà");
    expect(missingThree.dropped).toHaveLength(3);
    expect(referenceFormRefusal(result({ report: missingThree }))).toMatch(
      /dropped 3 of 8 words/,
    );
    expect(missingTwo.dropped).toHaveLength(2);
    expect(referenceFormRefusal(result({ report: missingTwo }))).toBeNull();
    expect(MAX_DROPPED_SHARE).toBe(0.25);
  });
});

describe("renderReferenceForm", () => {
  const candidate: CandidateLike = {
    provider: "google",
    baseModelId: "gemini-3.1-pro-preview",
    ragEnabled: true,
    decodingParams: { temperature: 0, maxTokens: 4096 },
  };
  const generation = (
    over: Partial<CandidateGeneration> = {},
  ): CandidateGeneration => ({
    text: "  Mà kí ọ́lá wà.\n",
    modelId: "gemini-3.1-pro-preview",
    latencyMs: 321,
    tokensIn: 40,
    tokensOut: 12,
    ragContextIds: [],
    ...over,
  });

  it("calls generate once with the rendering candidate and the rendering turn, and reports on the trimmed text", async () => {
    const calls: { candidate: CandidateLike; args: GenerateArgs }[] = [];
    const generate = vi.fn(async (c: CandidateLike, a: GenerateArgs) => {
      calls.push({ candidate: c, args: a });
      return generation();
    });
    const res = await renderReferenceForm(candidate, "Ma k'ọla wa.", generate);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(calls[0].candidate).toMatchObject({
      provider: "google",
      baseModelId: "gemini-3.1-pro-preview",
      ragEnabled: false,
      // The reference budget reaches the provider, not the candidate's 4,096.
      decodingParams: { temperature: 0, maxTokens: 8192 },
    });
    expect(calls[0].args).toEqual(buildReferenceFormTurn("Ma k'ọla wa."));
    expect(calls[0].args.systemPromptExact).toBe(true);
    expect(calls[0].args.goldExamples).toBeUndefined();
    expect(calls[0].args.conversationHistory).toBeUndefined();

    expect(res.text).toBe("Mà kí ọ́lá wà.");
    expect(res.modelId).toBe("gemini-3.1-pro-preview");
    expect(res.latencyMs).toBe(321);
    expect(res.tokensIn).toBe(40);
    expect(res.tokensOut).toBe(12);
    expect(res.maxTokens).toBe(8192);
    expect(res.report.tonedShare).toBe(1);
    expect(res.report.dropped).toEqual([]);
  });

  it("records missing token counts as null, never as zero", async () => {
    const res = await renderReferenceForm(candidate, "Ma k'ọla", async () =>
      generation({ tokensIn: undefined, tokensOut: undefined }),
    );
    expect(res.tokensIn).toBeNull();
    expect(res.tokensOut).toBeNull();
  });

  it("refuses an empty answer without spending a call", async () => {
    const generate = vi.fn(async () => generation());
    await expect(renderReferenceForm(candidate, "   ", generate)).rejects.toThrow(
      /nothing to render/,
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("lets a provider failure propagate, for the caller to catch", async () => {
    await expect(
      renderReferenceForm(candidate, "Ma k'ọla", async () => {
        throw new Error("quota");
      }),
    ).rejects.toThrow("quota");
  });
});

/**
 * FR-10: the pass changes no served answer, no exam score, no queue. The
 * paths that store, score or pair outputs must not even import this module;
 * only the chat route does. A grep over their sources, so a future import is
 * a failing test and not a quiet change to a measured arm.
 */
describe("nothing that scores, pairs or fills imports the second pass", () => {
  const read = (...parts: string[]) =>
    readFileSync(join(process.cwd(), ...parts), "utf8");
  const untouched = [
    ["scripts", "train-queue-fill.ts"],
    ["scripts", "train-fill-arm.ts"],
    ["scripts", "exam-frozen-arm.ts"],
    ["scripts", "regenerate-train-outputs.ts"],
    ["src", "lib", "pairing.ts"],
    ["src", "lib", "queue-input.ts"],
    ["src", "app", "api", "annotations", "next", "route.ts"],
    ["src", "lib", "arena", "frozen-exam.ts"],
    ["src", "lib", "arena", "repair-round.ts"],
    ["src", "lib", "arena", "v4-family-train.ts"],
    ["src", "app", "api", "arena", "eval-runs", "[id]", "generate", "route.ts"],
  ];

  it.each(untouched)("%s/%s... does not import reference-form", (...parts) => {
    expect(read(...parts)).not.toContain("reference-form");
  });

  it("the chat route is the one served path that does", () => {
    const src = read("src", "app", "api", "arena", "chat", "route.ts");
    expect(src).toContain('from "@/lib/arena/reference-form"');
    expect(src).toContain("rendersReferenceForm(candidate.versionLabel)");
  });

  it("nothing stores a rendering: no ModelOutput column for it exists", () => {
    // Persistence is a follow-up; until a home is picked, the schema must not
    // carry columns that every select-all ModelOutput query would read.
    expect(read("prisma", "schema.prisma")).not.toMatch(/referenceForm/i);
  });
});
