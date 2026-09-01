import { describe, it, expect, vi } from "vitest";
import type { CandidateGeneration, GenerateArgs } from "@/lib/arena/providers";
import {
  REPAIR_ROUND_VERSION_LABEL,
  describeViolations,
  generateWithRepairRound,
  streamWithRepairRound,
} from "./repair-round";
import { MIN_REASK_BUDGET_MS } from "./turn-budget";

/**
 * THE BUDGET GATE on the repair round.
 *
 * Deliberately a SEPARATE file from repair-round.test.ts. That suite pins the
 * round's original contract, including the equivalence between the buffered
 * and streamed entry points, and it must keep passing UNTOUCHED - it is the
 * evidence that the exam still measures the system chat serves. Everything the
 * deadline adds is additive, so it is tested additively.
 *
 * The behaviour under test, in one sentence: when the first attempt is dirty
 * but the turn has too little time left for a second generation, keep the
 * first answer and say so, instead of starting a rewrite the platform will
 * kill halfway through and losing both.
 */

const baseArgs: GenerateArgs = {
  userMessage: "How do you greet in the morning?",
  conversationHistory: [],
};

const gen = (text: string): CandidateGeneration => ({
  text,
  modelId: "test-model",
  latencyMs: 10,
  tokensIn: 5,
  tokensOut: 7,
  ragContextIds: [],
});

/** A dirty first answer (the s in "sooro" is not in the Igala allowlist). */
const DIRTY = "sooro ada";
const CLEAN = "Wọla ọdudu";

function scriptedModel(...texts: string[]) {
  const calls: GenerateArgs[] = [];
  let i = 0;
  const next = () => texts[Math.min(i++, texts.length - 1)];
  return {
    calls,
    generate: async (a: GenerateArgs) => {
      calls.push(a);
      return gen(next());
    },
    stream: async (a: GenerateArgs, onDelta: (d: string) => void) => {
      calls.push(a);
      const text = next();
      onDelta(text);
      return gen(text);
    },
  };
}

/** A deadline `left` ms in the future, with a frozen clock at `NOW`. */
const NOW = 1_700_000_000_000;
const budgetWith = (left: number) => ({
  deadlineMs: NOW + left,
  now: () => NOW,
});

const AMPLE = budgetWith(MIN_REASK_BUDGET_MS + 1_000);
const SPENT = budgetWith(MIN_REASK_BUDGET_MS - 1_000);

describe("the re-ask is taken when the budget allows it", () => {
  it("runs the second generation and serves the repaired answer", async () => {
    const m = scriptedModel(DIRTY, CLEAN);
    const onRevision = vi.fn();
    const result = await streamWithRepairRound(
      { versionLabel: REPAIR_ROUND_VERSION_LABEL },
      baseArgs,
      m.stream,
      { onDelta: () => {}, onRevision },
      {},
      AMPLE,
    );

    expect(m.calls).toHaveLength(2);
    expect(result.text).toBe(CLEAN);
    expect(result.repaired).toBe(true);
    expect(result.repairSkippedForTime).toBe(false);
    // The client is told the column is being REPLACED, exactly as before.
    expect(onRevision).toHaveBeenCalledTimes(1);
    expect(onRevision.mock.calls[0][1]).toBe(true);
  });

  it("still sums both calls into the accounting", async () => {
    const m = scriptedModel(DIRTY, CLEAN);
    const result = await generateWithRepairRound(
      { versionLabel: REPAIR_ROUND_VERSION_LABEL },
      baseArgs,
      m.generate,
      {},
      AMPLE,
    );
    expect(result.latencyMs).toBe(20);
    expect(result.tokensIn).toBe(10);
    expect(result.tokensOut).toBe(14);
  });
});

describe("the re-ask is skipped when the budget is spent", () => {
  it("keeps the first answer and never starts a second generation", async () => {
    const m = scriptedModel(DIRTY, CLEAN);
    const onRevision = vi.fn();
    const result = await streamWithRepairRound(
      { versionLabel: REPAIR_ROUND_VERSION_LABEL },
      baseArgs,
      m.stream,
      { onDelta: () => {}, onRevision },
      {},
      SPENT,
    );

    // The whole point: ONE model call, and an answer to show for it.
    expect(m.calls).toHaveLength(1);
    expect(result.text).toBe(DIRTY);
    expect(result.repaired).toBe(false);
    expect(result.repairSkippedForTime).toBe(true);
    // Accounting is the first call's alone - nothing was spent on a rewrite.
    expect(result.latencyMs).toBe(10);
    expect(result.tokensIn).toBe(5);
  });

  it("reports the violations through the same channel, marked not-applied", async () => {
    const onRevision = vi.fn();
    const result = await streamWithRepairRound(
      { versionLabel: REPAIR_ROUND_VERSION_LABEL },
      baseArgs,
      scriptedModel(DIRTY, CLEAN).stream,
      { onDelta: () => {}, onRevision },
      {},
      SPENT,
    );

    expect(onRevision).toHaveBeenCalledTimes(1);
    const [violations, applied] = onRevision.mock.calls[0];
    expect(applied).toBe(false);
    // Named, not hidden: a reviewer must never be served a flagged answer
    // without being told it was flagged.
    expect(describeViolations(violations)).toEqual([
      "letters that are not in the Igala alphabet",
    ]);
    expect(result.repairViolations).toEqual(violations);
  });

  it("holds at the exact boundary: one ms under the minimum is a skip", async () => {
    const cases: [number, number][] = [
      [MIN_REASK_BUDGET_MS + 1, 2],
      [MIN_REASK_BUDGET_MS, 2],
      [MIN_REASK_BUDGET_MS - 1, 1],
      [0, 1],
      [-60_000, 1],
    ];
    for (const [left, expectedCalls] of cases) {
      const m = scriptedModel(DIRTY, CLEAN);
      await generateWithRepairRound(
        { versionLabel: REPAIR_ROUND_VERSION_LABEL },
        baseArgs,
        m.generate,
        {},
        budgetWith(left),
      );
      expect(m.calls, `${left}ms left`).toHaveLength(expectedCalls);
    }
  });

  it("never fires for a CLEAN answer, however spent the budget", async () => {
    const m = scriptedModel(CLEAN);
    const onRevision = vi.fn();
    const result = await streamWithRepairRound(
      { versionLabel: REPAIR_ROUND_VERSION_LABEL },
      baseArgs,
      m.stream,
      { onDelta: () => {}, onRevision },
      {},
      SPENT,
    );
    expect(m.calls).toHaveLength(1);
    expect(onRevision).not.toHaveBeenCalled();
    expect(result.repairSkippedForTime).toBe(false);
    expect(result.repairViolations).toEqual([]);
  });

  it("never fires for another arm - the no-op guarantee is untouched", async () => {
    for (const label of ["rag-v4", "rag-v3", "baseline", null, undefined]) {
      const m = scriptedModel(DIRTY);
      const onRevision = vi.fn();
      const result = await streamWithRepairRound(
        { versionLabel: label },
        baseArgs,
        m.stream,
        { onDelta: () => {}, onRevision },
        {},
        SPENT,
      );
      expect(m.calls).toHaveLength(1);
      expect(m.calls[0]).toBe(baseArgs);
      expect(onRevision).not.toHaveBeenCalled();
      expect(result.repairViolations).toBeNull();
      expect(result.repairSkippedForTime).toBe(false);
    }
  });
});

/**
 * THE EXAM PATH, ASSERTED DIRECTLY.
 *
 * repair-round.test.ts already pins buffered/streamed equivalence with no
 * budget in sight. This is the complementary claim the deadline work needs:
 * passing NO budget is not merely the default, it is indistinguishable from
 * the old code even when the clock is far past any deadline a chat turn would
 * have set. The frozen exam and the eval-generation route call exactly this
 * way.
 */
describe("no budget passed = the pre-deadline behaviour, byte for byte", () => {
  const scripts: [string, string[]][] = [
    ["clean first answer", [CLEAN]],
    ["dirty then clean", [DIRTY, CLEAN]],
    ["dirty then still dirty (kept regardless)", [DIRTY, "ádṣa still bad"]],
  ];

  for (const [name, texts] of scripts) {
    it(`${name}: identical to the same call with an explicit undefined`, async () => {
      const implicit = scriptedModel(...texts);
      const explicit = scriptedModel(...texts);
      const label = { versionLabel: REPAIR_ROUND_VERSION_LABEL };

      const a = await generateWithRepairRound(
        label,
        baseArgs,
        implicit.generate,
      );
      const b = await generateWithRepairRound(
        label,
        baseArgs,
        explicit.generate,
        {},
        undefined,
      );

      expect(b).toEqual(a);
      expect(explicit.calls).toEqual(implicit.calls);
      // And the gate cannot have fired: no budget, no skip, ever.
      expect(a.repairSkippedForTime).toBe(false);
      expect(b.repairSkippedForTime).toBe(false);
    });
  }

  it("re-asks even long after any chat turn's deadline would have passed", async () => {
    // Same dirty answer that the SPENT budget above refuses to rewrite. With
    // no deadline there is nothing to be late for: the exam re-asks.
    const m = scriptedModel(DIRTY, CLEAN);
    const result = await generateWithRepairRound(
      { versionLabel: REPAIR_ROUND_VERSION_LABEL },
      baseArgs,
      m.generate,
    );
    expect(m.calls).toHaveLength(2);
    expect(result.text).toBe(CLEAN);
    expect(result.repaired).toBe(true);
  });
});
