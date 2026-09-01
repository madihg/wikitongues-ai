import { describe, it, expect, vi } from "vitest";
import {
  REPAIR_ROUND_VERSION_LABEL,
  checkIgalaOutput,
  findAllowlistViolations,
  findHyphenPrefixViolations,
  isToneSaturated,
  buildRepairInstruction,
  generateWithRepairRound,
} from "./repair-round";
import type { CandidateGeneration, GenerateArgs } from "@/lib/arena/providers";

/**
 * The repair round is the serving-side lint the failure analysis called for
 * (section 3.5): deterministic checks over a finished output, one named
 * re-ask, second answer kept regardless. The tests pin four contracts:
 * each detector's hits and non-hits, clean-text passthrough (no second
 * call), the single-retry mechanics (violations named, first answer in
 * context, accounting summed), and the NO-OP GUARANTEE - every versionLabel
 * other than rag-v4-1 gets exactly one untouched generate call, so no other
 * arm's serving can drift.
 */

// ─── detector (a): character allowlist ──────────────────────────────────────

describe("findAllowlistViolations", () => {
  it("flags s-with-dot (the ádṣa family)", () => {
    expect(findAllowlistViolations("u la ádṣa")).toEqual(["ádṣa"]);
  });

  it("flags c-hacek - the letter that evaded every ban list", () => {
    expect(findAllowlistViolations("íčí de")).toEqual(["íčí"]);
  });

  it("flags dotted i and u (ị, ụ) while dotted e and o stay legal", () => {
    expect(findAllowlistViolations("mị̀ ọlụ̀mẹ́")).toEqual(["mị̀", "ọlụ̀mẹ́"]);
    expect(findAllowlistViolations("ẹnyọ ọjọ")).toEqual([]);
  });

  it("flags plain letters Igala lacks (s, z, x, q, v)", () => {
    expect(findAllowlistViolations("se")).toEqual(["se"]);
    expect(findAllowlistViolations("zaki exact")).toEqual(["zaki", "exact"]);
  });

  it("passes clean community Igala: digraphs, engma, elision, tone, digits", () => {
    expect(
      findAllowlistViolations(
        "Ẹnẹ ẹnyọ, wọla ọdudu! Ọjọ kì d'ẹnyọ ñwu ọma. Ochu ẹkẹta, 1999. Àgbá.",
      ),
    ).toEqual([]);
  });

  it("reports each offending word once", () => {
    expect(findAllowlistViolations("ádṣa lẹ ádṣa")).toEqual(["ádṣa"]);
  });
});

// ─── detector (b): hyphenated prefix ────────────────────────────────────────

describe("findHyphenPrefixViolations", () => {
  it("flags the é- tic fused to a word", () => {
    expect(findHyphenPrefixViolations("Ọjọ é-gbítì wa")).toEqual(["é-gbítì"]);
    expect(findHyphenPrefixViolations("é-jẹu")).toEqual(["é-jẹu"]);
  });

  it("flags any single letter + hyphen, not just é", () => {
    expect(findHyphenPrefixViolations("a-jẹ")).toEqual(["a-jẹ"]);
  });

  it("passes community-attested multi-letter hyphen compounds", () => {
    expect(findHyphenPrefixViolations("ugbo-wn de")).toEqual([]);
    expect(findHyphenPrefixViolations("Ọjọ kì danyedo-we")).toEqual([]);
  });

  it("passes a trailing hyphen and hyphen-free text", () => {
    expect(findHyphenPrefixViolations("ẹkẹ- mẹta wọla")).toEqual([]);
  });
});

// ─── detector (c): tone saturation ──────────────────────────────────────────

describe("isToneSaturated", () => {
  it("flags a fully tone-marked short answer (pattern 4's shape)", () => {
    expect(isToneSaturated("Àgbá Ọ́jọ́")).toBe(true);
  });

  it("flags a saturated sentence", () => {
    expect(isToneSaturated("Ọ́jọ́ kì d'ẹ́nyọ́ ñwú ẹ̀")).toBe(true);
  });

  it("does not flag a single stray accent (edit nit, not saturation)", () => {
    expect(isToneSaturated("Wọla ọ́ma tito ẹnẹ")).toBe(false);
  });

  it("does not flag clean unmarked community writing", () => {
    expect(isToneSaturated("Wọla ọma tito. Ẹnẹ ẹnyọ ñwu wa.")).toBe(false);
  });

  it("counts the macron as a tone mark", () => {
    expect(isToneSaturated("mā lìa ā")).toBe(true);
  });
});

// ─── the checker and the instruction ────────────────────────────────────────

describe("checkIgalaOutput", () => {
  it("returns one violation per failing check, all three at once when earned", () => {
    const v = checkIgalaOutput("é-jẹu ádṣa Àgbá Ọ́jọ́");
    expect(v.map((x) => x.kind).sort()).toEqual([
      "banned-character",
      "hyphenated-prefix",
      "tone-saturation",
    ]);
  });

  it("names the offending words in the detail lines", () => {
    const v = checkIgalaOutput("é-jẹu ádṣa");
    expect(v.find((x) => x.kind === "banned-character")!.detail).toContain(
      "ádṣa",
    );
    expect(v.find((x) => x.kind === "hyphenated-prefix")!.detail).toContain(
      "é-jẹu",
    );
  });

  it("clean text passes with zero violations", () => {
    expect(checkIgalaOutput("Wọla ọdudu. Ẹnẹ ẹnyọ ñwu wa.")).toEqual([]);
  });

  it("allowTone suppresses ONLY the saturation check (R8.3: on request)", () => {
    expect(checkIgalaOutput("Àgbá Ọ́jọ́", { allowTone: true })).toEqual([]);
    const v = checkIgalaOutput("ádṣa Ọ́jọ́ Àgbá", { allowTone: true });
    expect(v.map((x) => x.kind)).toEqual(["banned-character"]);
  });
});

describe("buildRepairInstruction", () => {
  it("names every violation and restates the output contract", () => {
    const text = buildRepairInstruction(
      checkIgalaOutput("é-jẹu ádṣa Àgbá Ọ́jọ́"),
    );
    expect(text).toContain("Your answer breaks these Igala writing rules:");
    expect(text).toContain("ádṣa");
    expect(text).toContain("é-jẹu");
    expect(text).toContain("tone marks");
    expect(text).toContain("Answer in Igala only.");
  });
});

// ─── the integration ────────────────────────────────────────────────────────

const gen = (text: string): CandidateGeneration => ({
  text,
  modelId: "gemini-3.1-pro",
  latencyMs: 100,
  tokensIn: 1000,
  tokensOut: 20,
  ragContextIds: ["pp:1", "gold:2"],
});

const baseArgs: GenerateArgs = {
  userMessage: "CORR\n\nPAIRS\n\nDICT\n\nHow do you greet in the morning?",
  conversationHistory: [{ role: "user", content: "earlier turn" }],
  goldExamples: [{ id: "g1", question: "q", answer: "a" }],
  systemPromptOverride: "SYSTEM",
};

describe("generateWithRepairRound - rag-v4-1", () => {
  it("clean first answer: one call, no repair, violations recorded as empty", async () => {
    const generate = vi.fn(async () => gen("Wọla ọdudu"));
    const result = await generateWithRepairRound(
      { versionLabel: REPAIR_ROUND_VERSION_LABEL },
      baseArgs,
      generate,
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(baseArgs);
    expect(result.text).toBe("Wọla ọdudu");
    expect(result.repaired).toBe(false);
    expect(result.repairViolations).toEqual([]);
  });

  it("dirty first answer: re-asks ONCE with the violations named and the first answer in context", async () => {
    const generate = vi
      .fn<(a: GenerateArgs) => Promise<CandidateGeneration>>()
      .mockResolvedValueOnce(gen("é-jẹu ádṣa"))
      .mockResolvedValueOnce(gen("Jẹñwu aja"));
    const result = await generateWithRepairRound(
      { versionLabel: "rag-v4-1" },
      baseArgs,
      generate,
    );
    expect(generate).toHaveBeenCalledTimes(2);

    const second = generate.mock.calls[1][0];
    // The repair turn names the violations...
    expect(second.userMessage).toContain("ádṣa");
    expect(second.userMessage).toContain("é-jẹu");
    expect(second.userMessage).toContain("Answer in Igala only.");
    // ...and the model sees its own first answer as a prior turn, after the
    // original retrieval-laden user turn, after the untouched history.
    expect(second.conversationHistory).toEqual([
      { role: "user", content: "earlier turn" },
      { role: "user", content: baseArgs.userMessage },
      { role: "assistant", content: "é-jẹu ádṣa" },
    ]);
    // Retrieval material and system prompt are unchanged on the re-ask.
    expect(second.systemPromptOverride).toBe("SYSTEM");
    expect(second.goldExamples).toBe(baseArgs.goldExamples);

    expect(result.repaired).toBe(true);
    expect(result.repairViolations!.length).toBeGreaterThan(0);
    expect(result.text).toBe("Jẹñwu aja");
  });

  it("keeps the second answer even when it is still dirty - one repair, never a loop", async () => {
    const generate = vi
      .fn<(a: GenerateArgs) => Promise<CandidateGeneration>>()
      .mockResolvedValueOnce(gen("é-jẹu"))
      .mockResolvedValueOnce(gen("ádṣa still bad"));
    const result = await generateWithRepairRound(
      { versionLabel: "rag-v4-1" },
      baseArgs,
      generate,
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("ádṣa still bad");
  });

  it("sums latency and token accounting across both calls (serve what you measure)", async () => {
    const generate = vi
      .fn<(a: GenerateArgs) => Promise<CandidateGeneration>>()
      .mockResolvedValueOnce({
        ...gen("é-jẹu"),
        latencyMs: 100,
        tokensIn: 1000,
        tokensOut: 20,
      })
      .mockResolvedValueOnce({
        ...gen("Wọla"),
        latencyMs: 40,
        tokensIn: 1100,
        tokensOut: 5,
      });
    const result = await generateWithRepairRound(
      { versionLabel: "rag-v4-1" },
      baseArgs,
      generate,
    );
    expect(result.latencyMs).toBe(140);
    expect(result.tokensIn).toBe(2100);
    expect(result.tokensOut).toBe(25);
  });

  it("leaves token fields undefined when neither call reported usage", async () => {
    const noUsage = (text: string): CandidateGeneration => ({
      text,
      modelId: "m",
      latencyMs: 1,
      ragContextIds: [],
    });
    const generate = vi
      .fn<(a: GenerateArgs) => Promise<CandidateGeneration>>()
      .mockResolvedValueOnce(noUsage("é-jẹu"))
      .mockResolvedValueOnce(noUsage("Wọla"));
    const result = await generateWithRepairRound(
      { versionLabel: "rag-v4-1" },
      baseArgs,
      generate,
    );
    expect(result.tokensIn).toBeUndefined();
    expect(result.tokensOut).toBeUndefined();
  });

  it("honours allowTone: a tone-saturated answer is not repaired when tone was requested", async () => {
    const generate = vi.fn(async () => gen("Àgbá Ọ́jọ́"));
    const result = await generateWithRepairRound(
      { versionLabel: "rag-v4-1" },
      baseArgs,
      generate,
      { allowTone: true },
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.repaired).toBe(false);
  });
});

describe("generateWithRepairRound - the no-op guarantee for every other arm", () => {
  const labels: (string | null | undefined)[] = [
    "rag-v4",
    "rag-v3",
    "rag-v2",
    "rag",
    "baseline",
    null,
    undefined,
  ];

  for (const label of labels) {
    it(`versionLabel ${String(label)}: one untouched call, result unchanged, even on dirty output`, async () => {
      // The dirtiest possible output - and still no second call, because the
      // repair round belongs to rag-v4-1 alone. Other arms' serving must stay
      // byte-identical to what their registration measured.
      const generate = vi.fn<(a: GenerateArgs) => Promise<CandidateGeneration>>(
        async () => gen("é-jẹu ádṣa Àgbá Ọ́jọ́"),
      );
      const result = await generateWithRepairRound(
        { versionLabel: label },
        baseArgs,
        generate,
      );
      expect(generate).toHaveBeenCalledTimes(1);
      // Args object passed through by REFERENCE - nothing rebuilt, nothing
      // reordered, so the assembled request is provably the same.
      expect(generate.mock.calls[0][0]).toBe(baseArgs);
      expect(result.text).toBe("é-jẹu ádṣa Àgbá Ọ́jọ́");
      expect(result.latencyMs).toBe(100);
      expect(result.repaired).toBe(false);
      expect(result.repairViolations).toBeNull();
    });
  }
});
