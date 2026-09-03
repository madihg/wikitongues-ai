import { describe, it, expect, vi } from "vitest";
import {
  REPAIR_ROUND_VERSION_LABEL,
  REPAIR_VIOLATION_LABELS,
  checkIgalaOutput,
  describeViolations,
  findAllowlistViolations,
  findHyphenPrefixViolations,
  isToneSaturated,
  buildRepairInstruction,
  generateWithRepairRound,
  streamWithRepairRound,
  type RepairViolation,
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
    // Clean first pass IS the served text - nothing was discarded.
    expect(result.firstPassText).toBeNull();
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
    // The discarded first pass is kept, separately from the served text.
    expect(result.firstPassText).toBe("é-jẹu ádṣa");
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

// ─── plain-language labels ──────────────────────────────────────────────────

describe("describeViolations", () => {
  it("names each rule family once, in check order", () => {
    expect(describeViolations(checkIgalaOutput("é-jẹu ádṣa Àgbá Ọ́jọ́"))).toEqual(
      [
        REPAIR_VIOLATION_LABELS["banned-character"],
        REPAIR_VIOLATION_LABELS["hyphenated-prefix"],
        REPAIR_VIOLATION_LABELS["tone-saturation"],
      ],
    );
  });

  it("says nothing about the offending words - they are about to vanish", () => {
    // The detail lines are written for the MODEL and quote its own output; the
    // reviewer is told the category while the text is being replaced.
    for (const label of Object.values(REPAIR_VIOLATION_LABELS)) {
      expect(label).not.toContain("ádṣa");
      expect(label.length).toBeLessThan(60);
    }
    expect(describeViolations(checkIgalaOutput("ádṣa"))).toEqual([
      "letters that are not in the Igala alphabet",
    ]);
  });

  it("collapses repeats to one label per kind", () => {
    const twice: RepairViolation[] = [
      { kind: "tone-saturation", detail: "a" },
      { kind: "tone-saturation", detail: "b" },
    ];
    expect(describeViolations(twice)).toEqual([
      REPAIR_VIOLATION_LABELS["tone-saturation"],
    ]);
  });

  it("is empty for a clean answer, so no revision can be announced", () => {
    expect(describeViolations(checkIgalaOutput("Wọla ọdudu"))).toEqual([]);
  });
});

// ─── the streaming twin ─────────────────────────────────────────────────────

/**
 * streamWithRepairRound is what the chat route serves rag-v4-1 through, so the
 * default-selected column shows tokens immediately instead of a blank panel
 * for two full generations. The contract it must hold: the FINAL text equals
 * what the buffered round (the exam's path) would have produced, because that
 * is what the exam measures. It holds by construction - both entry points call
 * one core - and these tests pin it anyway.
 */

/** Record every generation this fake model is asked for, and its deltas. */
function scriptedModel(...texts: string[]) {
  const calls: GenerateArgs[] = [];
  const deltas: string[] = [];
  let i = 0;
  const next = () => texts[Math.min(i++, texts.length - 1)];
  return {
    calls,
    deltas,
    /** Buffered form, as the exam and eval route call it. */
    generate: async (a: GenerateArgs) => {
      calls.push(a);
      return gen(next());
    },
    /** Streaming form, chunked into thirds so the deltas are observable. */
    stream: async (a: GenerateArgs, onDelta: (d: string) => void) => {
      calls.push(a);
      const text = next();
      const size = Math.max(1, Math.ceil(text.length / 3));
      for (let at = 0; at < text.length; at += size) {
        const piece = text.slice(at, at + size);
        deltas.push(piece);
        onDelta(piece);
      }
      return gen(text);
    },
  };
}

describe("streamWithRepairRound", () => {
  it("a clean answer streams once and announces nothing", async () => {
    const m = scriptedModel("Wọla ọdudu");
    const onRevision = vi.fn();
    const result = await streamWithRepairRound(
      { versionLabel: REPAIR_ROUND_VERSION_LABEL },
      baseArgs,
      m.stream,
      { onDelta: () => {}, onRevision },
    );
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]).toBe(baseArgs);
    expect(onRevision).not.toHaveBeenCalled();
    expect(m.deltas.join("")).toBe("Wọla ọdudu");
    expect(result.text).toBe("Wọla ọdudu");
    expect(result.repaired).toBe(false);
  });

  it("a dirty answer streams, announces the revision, then streams the repair", async () => {
    const m = scriptedModel("é-jẹu ádṣa", "Jẹñwu aja");
    const seen: string[] = [];
    const order: string[] = [];
    let announced: string[] = [];
    const result = await streamWithRepairRound(
      { versionLabel: "rag-v4-1" },
      baseArgs,
      m.stream,
      {
        onDelta: (d) => {
          seen.push(d);
          order.push("delta");
        },
        onRevision: (violations) => {
          announced = describeViolations(violations);
          order.push("revision");
        },
      },
    );

    // The first attempt is delivered in full BEFORE the revision fires - the
    // whole point: the reviewer reads tokens instead of a spinner.
    const at = order.indexOf("revision");
    expect(at).toBeGreaterThan(0);
    expect(announced).toContain(REPAIR_VIOLATION_LABELS["banned-character"]);
    expect(announced).toContain(REPAIR_VIOLATION_LABELS["hyphenated-prefix"]);
    expect(order.slice(0, at).every((o) => o === "delta")).toBe(true);
    expect(order.slice(at + 1).every((o) => o === "delta")).toBe(true);
    // Both attempts' tokens crossed the wire, in order.
    expect(seen.join("")).toBe("é-jẹu ádṣaJẹñwu aja");
    // And the served answer is the repaired one.
    expect(result.text).toBe("Jẹñwu aja");
    expect(result.repaired).toBe(true);
    expect(m.calls).toHaveLength(2);
    expect(m.calls[1].userMessage).toContain("ádṣa");
  });

  it("announces exactly the violations the checker found", async () => {
    const m = scriptedModel("Àgbá Ọ́jọ́", "Agba Ojo");
    const onRevision = vi.fn();
    await streamWithRepairRound(
      { versionLabel: "rag-v4-1" },
      baseArgs,
      m.stream,
      { onDelta: () => {}, onRevision },
    );
    expect(onRevision).toHaveBeenCalledTimes(1);
    expect(describeViolations(onRevision.mock.calls[0][0])).toEqual([
      REPAIR_VIOLATION_LABELS["tone-saturation"],
    ]);
  });

  it("never announces a revision for another arm, however dirty (the no-op guarantee)", async () => {
    for (const label of ["rag-v4", "rag-v3", "baseline", null, undefined]) {
      const m = scriptedModel("é-jẹu ádṣa Àgbá Ọ́jọ́");
      const onRevision = vi.fn();
      const result = await streamWithRepairRound(
        { versionLabel: label },
        baseArgs,
        m.stream,
        { onDelta: () => {}, onRevision },
      );
      expect(m.calls).toHaveLength(1);
      expect(m.calls[0]).toBe(baseArgs);
      expect(onRevision).not.toHaveBeenCalled();
      expect(result.repaired).toBe(false);
      expect(result.repairViolations).toBeNull();
    }
  });

  it("propagates a failure on the SECOND attempt after the revision fired", async () => {
    // The route's per-candidate catch turns this into an error reply for that
    // column alone. The revision already reached the client, which is why the
    // client-side fold must survive revision-then-error (chat-stream.test.ts).
    const onRevision = vi.fn();
    const stream = vi
      .fn<
        (
          a: GenerateArgs,
          onDelta: (d: string) => void,
        ) => Promise<CandidateGeneration>
      >()
      .mockImplementationOnce(async (_a, onDelta) => {
        onDelta("é-jẹu ádṣa");
        return gen("é-jẹu ádṣa");
      })
      .mockRejectedValueOnce(new Error("provider 503 on the re-ask"));

    await expect(
      streamWithRepairRound({ versionLabel: "rag-v4-1" }, baseArgs, stream, {
        onDelta: () => {},
        onRevision,
      }),
    ).rejects.toThrow("provider 503 on the re-ask");
    expect(onRevision).toHaveBeenCalledTimes(1);
  });
});

/**
 * THE INVARIANT THE EXAM DEPENDS ON. The frozen numbers were produced by the
 * buffered path (scripts/exam-rag-v4-1.ts and the eval-generation route, both
 * on generateWithRepairRound). Chat now streams the same round. If the two
 * could disagree on the final text - or on what they ask the model - the chat
 * column would stop being the thing the scoreboard describes.
 */
describe("streamed and buffered rounds are the same round", () => {
  const scripts: [string, string[]][] = [
    ["clean first answer", ["Wọla ọdudu"]],
    ["dirty then clean", ["é-jẹu ádṣa", "Jẹñwu aja"]],
    ["dirty then still dirty (kept regardless)", ["é-jẹu", "ádṣa still bad"]],
    ["tone-saturated then bare", ["Àgbá Ọ́jọ́", "Agba Ojo"]],
  ];

  for (const [name, texts] of scripts) {
    it(`${name}: identical result and identical requests`, async () => {
      const buffered = scriptedModel(...texts);
      const streamed = scriptedModel(...texts);
      const label = { versionLabel: REPAIR_ROUND_VERSION_LABEL };

      const a = await generateWithRepairRound(
        label,
        baseArgs,
        buffered.generate,
      );
      const b = await streamWithRepairRound(label, baseArgs, streamed.stream, {
        onDelta: () => {},
        onRevision: () => {},
      });

      // Same served answer, same accounting, same repair bookkeeping.
      expect(b).toEqual(a);
      // Same number of model calls, with byte-identical assembled requests -
      // including the re-ask turn, which is where a divergence would hide.
      expect(streamed.calls).toEqual(buffered.calls);
      // And the streamed column's rendered text (the last attempt's deltas,
      // after the revision cleared what came before) is that same answer.
      expect(streamed.deltas.join("").endsWith(a.text)).toBe(true);
    });
  }

  it("holds for every other versionLabel too - one untouched call either way", async () => {
    for (const label of ["rag-v4", "rag-v2", null]) {
      const buffered = scriptedModel("é-jẹu ádṣa Àgbá Ọ́jọ́");
      const streamed = scriptedModel("é-jẹu ádṣa Àgbá Ọ́jọ́");
      const a = await generateWithRepairRound(
        { versionLabel: label },
        baseArgs,
        buffered.generate,
      );
      const b = await streamWithRepairRound(
        { versionLabel: label },
        baseArgs,
        streamed.stream,
        { onDelta: () => {}, onRevision: () => {} },
      );
      expect(b).toEqual(a);
      expect(streamed.calls).toEqual(buffered.calls);
    }
  });
});
