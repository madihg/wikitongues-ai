import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  candidateModel: { count: vi.fn() },
  prompt: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  QUEUE_PROMPT_ORDER,
  compareQueuePromptRows,
  loadQueueInputs,
} from "./queue-input";
import { computeQueueState, type QueuePrompt } from "./pairing";
import {
  V46_PROMPTS,
  isSpeechPrompt,
  v46ServingOrder,
  v46StampBase,
  v46Stamps,
} from "./prompt-bank-v46";

/**
 * The queue walks the prompt catalogue in an explicit order since 2026-11-13
 * (createdAt, then id). These tests pin what that change may and may not do:
 *  (a) the set of prompts an annotator still has to do is the same whatever
 *      order the database used to return; only the order is now stable;
 *  (b) nothing judged, skipped or open for correction is served again;
 *  (c) the v4.6 mix comes out as designed, including when rows would
 *      otherwise share a creation time.
 */

interface Row {
  id: string;
  createdAt: Date;
  q: QueuePrompt;
}

/** Small deterministic generator, so a failure reproduces. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function shuffled<T>(xs: T[], seed: number): T[] {
  const r = rng(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A catalogue with every lane, a frozen prompt, an unpairable one, a single-output one and two creation ties. */
function catalogue(): Row[] {
  const rows: Row[] = [];
  const base = Date.UTC(2026, 9, 1);
  for (let i = 0; i < 60; i++) {
    rows.push({
      // ids deliberately do not follow creation order
      id: `c${String((i * 37) % 60).padStart(3, "0")}`,
      // rows 10/11 and 40/41 share a creation time
      createdAt: new Date(base + (i === 11 ? 10 : i === 41 ? 40 : i) * 1000),
      q: {
        promptId: `p_${String(i).padStart(3, "0")}`,
        outputCount: i === 5 ? 1 : 2 + (i % 3),
        pairable: i !== 7,
        goldCount: i % 4 === 0 ? 0 : i % 4 === 1 ? 1 : 3,
        isLongForm: i % 9 === 0,
        isHoldout: i === 3 || i === 30,
      },
    });
  }
  return rows;
}

const ANNOTATORS = [
  { name: "nothing done", done: new Set<string>(), skipped: new Set<string>() },
  {
    name: "mid-queue",
    done: new Set(["p_000", "p_001", "p_002", "p_010", "p_020", "p_021", "p_044"]),
    skipped: new Set(["p_004", "p_033"]),
  },
  {
    name: "nearly finished",
    done: new Set(catalogue().map((r) => r.q.promptId).filter((_, i) => i % 10 !== 9)),
    skipped: new Set(["p_009"]),
  },
];

const sorted = (rows: Row[]) => [...rows].sort(compareQueuePromptRows).map((r) => r.q);
const ids = (ps: QueuePrompt[]) => ps.map((p) => p.promptId);

describe("the explicit prompt order of the queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is asked of the database: createdAt, then id", async () => {
    mockPrisma.candidateModel.count.mockResolvedValue(0);
    mockPrisma.prompt.findMany.mockResolvedValue([]);
    await loadQueueInputs();
    expect(QUEUE_PROMPT_ORDER).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(mockPrisma.prompt.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.prompt.findMany.mock.calls[0][0].orderBy).toBe(QUEUE_PROMPT_ORDER);
  });

  it("keeps the rows in the order the database returns them", async () => {
    const row = (promptId: string) => ({
      id: `id_${promptId}`,
      promptId,
      bucket: null,
      language: "igala",
      text: "t",
      targetCulture: null,
      expectedCulturalContext: null,
      isHoldout: false,
      provenance: null,
      modelOutputs: [],
      _count: { coldAuthorAnswers: 0 },
    });
    mockPrisma.candidateModel.count.mockResolvedValue(0);
    mockPrisma.prompt.findMany.mockResolvedValue([row("b"), row("a"), row("c")]);
    const { queuePrompts, byPromptId } = await loadQueueInputs();
    expect(ids(queuePrompts)).toEqual(["b", "a", "c"]);
    expect([...byPromptId.keys()]).toEqual(["b", "a", "c"]);
  });

  it("sorts by creation time and breaks a tie by id, the same way from any starting order", () => {
    const rows = catalogue();
    const want = ids(sorted(rows));
    for (let seed = 1; seed <= 25; seed++) {
      expect(ids(sorted(shuffled(rows, seed)))).toEqual(want);
    }
    // The two ties are decided by id, not by arrival.
    const at = (p: string) => want.indexOf(p);
    const byPrompt = new Map(rows.map((r) => [r.q.promptId, r]));
    for (const [x, y] of [["p_010", "p_011"], ["p_040", "p_041"]] as const) {
      const first = byPrompt.get(x)!.id < byPrompt.get(y)!.id ? x : y;
      const second = first === x ? y : x;
      expect(at(first)).toBeLessThan(at(second));
    }
    expect(compareQueuePromptRows(rows[0], rows[0])).toBe(0);
  });

  it("(a) leaves every annotator the same set of prompts to do, the same totals, and one stable order", () => {
    const rows = catalogue();
    for (const a of ANNOTATORS) {
      const after = computeQueueState(sorted(rows), a.done, a.skipped);
      for (let seed = 1; seed <= 25; seed++) {
        // "before": whatever order the database happened to return
        const before = computeQueueState(shuffled(rows, seed).map((r) => r.q), a.done, a.skipped);
        expect(new Set(ids(before.remaining)), a.name).toEqual(new Set(ids(after.remaining)));
        expect(before.remaining.length, a.name).toBe(after.remaining.length);
        expect(before.total, a.name).toBe(after.total);
        expect(before.completed, a.name).toBe(after.completed);
        // "after": the same list from any starting order
        const again = computeQueueState(sorted(shuffled(rows, seed)), a.done, a.skipped);
        expect(ids(again.remaining), a.name).toEqual(ids(after.remaining));
      }
    }
    // The check is alive: the old behaviour really did give different orders.
    const a = ANNOTATORS[0];
    const o1 = ids(computeQueueState(shuffled(rows, 1).map((r) => r.q), a.done, a.skipped).remaining);
    const o2 = ids(computeQueueState(shuffled(rows, 2).map((r) => r.q), a.done, a.skipped).remaining);
    expect(o1).not.toEqual(o2);
  });

  it("(b) never serves again a prompt that was judged or skipped, nor a frozen, unpairable or single-answer one", () => {
    const rows = catalogue();
    for (const a of ANNOTATORS) {
      const state = computeQueueState(sorted(rows), a.done, a.skipped);
      const left = new Set(ids(state.remaining));
      for (const p of a.done) expect(left.has(p), `${a.name}: ${p}`).toBe(false);
      for (const p of a.skipped) expect(left.has(p), `${a.name}: ${p}`).toBe(false);
      for (const p of ["p_003", "p_030", "p_005", "p_007"]) expect(left.has(p), p).toBe(false);
      expect(new Set(ids(state.remaining)).size).toBe(state.remaining.length);
    }
  });

  it("(b) leaves the corrections lane untouched: it follows the age of the judgment, not the catalogue", () => {
    const rows = catalogue();
    const a = ANNOTATORS[1];
    // Open corrections on judged prompts, oldest judgment first; one is edit-skipped, one is frozen.
    const corrections = {
      editableByPromptId: new Map([
        ["p_044", 2],
        ["p_002", 1],
        ["p_020", 1],
        ["p_010", 0],
        ["p_030", 1],
        ["p_021", 1],
      ]),
      editSkippedPromptIds: new Set(["p_021"]),
    };
    const after = computeQueueState(sorted(rows), a.done, a.skipped, corrections);
    expect(ids(after.corrections)).toEqual(["p_044", "p_002", "p_020"]);
    for (let seed = 1; seed <= 10; seed++) {
      const before = computeQueueState(shuffled(rows, seed).map((r) => r.q), a.done, a.skipped, corrections);
      expect(ids(before.corrections)).toEqual(ids(after.corrections));
    }
    // A prompt open for correction is already judged, so it is not in the pairwise queue.
    const left = new Set(ids(after.remaining));
    for (const p of ids(after.corrections)) expect(left.has(p)).toBe(false);
  });

  it("keeps creation order inside the group of prompts nobody has answered", () => {
    const rows = catalogue();
    const state = computeQueueState(sorted(rows), new Set(), new Set());
    const zeroGold = state.remaining.filter((p) => p.goldCount === 0);
    // They lead the queue...
    expect(ids(state.remaining.slice(0, zeroGold.length))).toEqual(ids(zeroGold));
    // ...in creation order.
    expect(ids(zeroGold)).toEqual([...ids(zeroGold)].sort());
  });
});

describe("(c) the v4.6 mix under the explicit order", () => {
  const order = v46ServingOrder();
  const designed = order.map((p) => p.promptId);
  const base = new Date(Date.UTC(2026, 10, 14, 9, 0, 0));
  const stamps = v46Stamps(base);

  /** v4.6 rows as the seed writes them, with ids that have nothing to do with the order. */
  function seededRows(idSeed: number, stampOf: (promptId: string) => Date): Row[] {
    const r = rng(idSeed);
    return V46_PROMPTS.map((p) => ({
      id: `c${Math.floor(r() * 1e9).toString(36)}_${p.promptId}`,
      createdAt: stampOf(p.promptId),
      q: { promptId: p.promptId, outputCount: 2, pairable: true, goldCount: 0, isLongForm: false, isHoldout: false },
    }));
  }

  it("stamps every row one millisecond apart, so no two share a creation time", () => {
    expect(stamps.size).toBe(320);
    const times = designed.map((id) => stamps.get(id)!.getTime());
    expect(times[0]).toBe(base.getTime());
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBe(1);
    expect(new Set(times).size).toBe(320);
  });

  it("is served in the designed order whatever ids the rows get and whatever order the database held them in", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rows = shuffled(seededRows(seed, (id) => stamps.get(id)!), seed + 100);
      const state = computeQueueState(sorted(rows), new Set(), new Set());
      expect(ids(state.remaining)).toEqual(designed);
    }
  });

  it("would lose the mix if the rows shared one creation time, which is why the seed stamps them", () => {
    // All 320 rows at the same instant: the order falls to id, which knows nothing of the design.
    const rows = seededRows(7, () => base);
    const got = ids(computeQueueState(sorted(rows), new Set(), new Set()).remaining);
    expect(new Set(got)).toEqual(new Set(designed));
    expect(got).not.toEqual(designed);
    // With the stamps the same rows come out as designed.
    const stamped = rows.map((r) => ({ ...r, createdAt: stamps.get(r.q.promptId)! }));
    expect(ids(computeQueueState(sorted(stamped), new Set(), new Set()).remaining)).toEqual(designed);
  });

  it("lands after every prompt that already exists, and a speaker's own progress does not disturb the mix", () => {
    const older: Row[] = Array.from({ length: 12 }, (_, i) => ({
      id: `z${i}`, // ids that would sort last
      createdAt: new Date(base.getTime() - 86_400_000 + i),
      q: { promptId: `old_${String(i).padStart(2, "0")}`, outputCount: 2, pairable: true, goldCount: 0, isLongForm: false, isHoldout: false },
    }));
    const rows = shuffled([...older, ...seededRows(3, (id) => stamps.get(id)!)], 9);
    const done = new Set([designed[0], designed[5], designed[17], "old_03"]);
    const got = ids(computeQueueState(sorted(rows), done, new Set()).remaining);
    expect(got.slice(0, 11)).toEqual(older.map((r) => r.q.promptId).filter((p) => p !== "old_03"));
    expect(got.slice(11)).toEqual(designed.filter((p) => !done.has(p)));
    // Still a mix: about three speech prompts in every eight.
    const speech = new Set(V46_PROMPTS.filter(isSpeechPrompt).map((p) => p.promptId));
    const first40 = got.slice(11, 51).filter((p) => speech.has(p)).length;
    expect(first40).toBeGreaterThanOrEqual(13);
    expect(first40).toBeLessThanOrEqual(17);
  });

  it("puts missing rows back at their designed places on a second run", () => {
    // A first run that stopped after 100 rows, or seeded the text set alone.
    const firstRun = order.filter((p, i) => i < 100 || !isSpeechPrompt(p));
    const existing = firstRun.map((p) => ({ promptId: p.promptId, createdAt: stamps.get(p.promptId)! }));
    const later = new Date(base.getTime() + 3_600_000);
    // The base is read back from any row that exists, not taken from the clock.
    expect(v46StampBase(existing, later).getTime()).toBe(base.getTime());
    expect(v46StampBase([existing[57]], later).getTime()).toBe(base.getTime());
    expect(v46StampBase(shuffled(existing, 4), later).getTime()).toBe(base.getTime());
    const second = v46Stamps(v46StampBase(existing, later));
    for (const p of order) expect(second.get(p.promptId)!.getTime()).toBe(stamps.get(p.promptId)!.getTime());
    // With nothing seeded, and with rows that are not ours, the base is the clock.
    expect(v46StampBase([], later)).toBe(later);
    expect(v46StampBase([{ promptId: "ig_v45_ling_001", createdAt: base }], later)).toBe(later);
  });
});
