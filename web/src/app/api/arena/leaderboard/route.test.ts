import { describe, it, expect, vi, beforeEach } from "vitest";
import { bradleyTerry } from "@/lib/arena/bradley-terry";
import { MIN_DECIDED_PER_CANDIDATE, POOL_PIVOT_AT } from "@/lib/arena/era";

/**
 * End-to-end proof for the windowed rubric arena, taken at the seam the UI
 * actually consumes: the route, not the pure helper underneath it.
 *
 * A 25-row fixture stands in for the shape of the real corpus - a long era
 * before the pivot where speakers rejected both answers, a decided era after
 * it, ties, both-inadequate verdicts, a retired off-pool arm still being
 * compared after the pivot, one candidate a single vote below the sparsity
 * gate and one exactly on it - plus the four rows that must never be counted
 * at all: a demo session, a seed test account, a self-matchup, and a matchup
 * against an archived candidate. Two of those four sit BEFORE the real pivot
 * and would drag the derived date backwards if they leaked in.
 *
 * Every expectation below is hand-computed from that fixture in the comments
 * and asserted against the route's output, including the Bradley-Terry
 * observation list, which is rebuilt here by hand rather than derived from the
 * fixture by the same code under test.
 */

// The window boundary is now the PINNED POOL_PIVOT_AT constant, not a value
// derived from the fixture. `day(10)` is defined to land exactly on it (a
// day is >= its own start, so it counts as "since"), and every other `day(d)`
// keeps its old relative position - `d < 10` before the pivot, `d > 10`
// after - so the rest of the fixture and its comments need no other change.
const PIVOT = new Date(POOL_PIVOT_AT);
const DAY_MS = 24 * 60 * 60 * 1000;
const day = (d: number) => new Date(PIVOT.getTime() + (d - 10) * DAY_MS);

interface Cand {
  id: string;
  name: string;
  archived: boolean;
  inPairingPool: boolean;
}

/** The registry. `gone` is archived, so the route must drop any comparison
 * touching it; `never-run` has no comparisons at all and must still be listed
 * as a counted shortfall rather than vanishing. */
function registry(): Cand[] {
  return [
    {
      id: "pool-a",
      name: "Gemini + RAG v4",
      archived: false,
      inPairingPool: true,
    },
    { id: "pool-b", name: "Bare Gemini", archived: false, inPairingPool: true },
    { id: "old-x", name: "Old Claude", archived: false, inPairingPool: false },
    { id: "old-y", name: "Old GPT", archived: false, inPairingPool: false },
    {
      id: "edge-hi",
      name: "Edge Above",
      archived: false,
      inPairingPool: false,
    },
    {
      id: "edge-lo",
      name: "Edge Below",
      archived: false,
      inPairingPool: false,
    },
    {
      id: "never-run",
      name: "Registered But Unrun",
      archived: false,
      inPairingPool: false,
    },
    { id: "gone", name: "Archived Arm", archived: true, inPairingPool: false },
  ];
}

interface Fix {
  a: string;
  b: string;
  winner: string;
  d: number;
  bucket: string;
  isDemo?: boolean;
  email?: string;
}

const REAL = "speaker@wikitongues.org";
const SEED = "bringup@test.com";

/** The 25 rows. Order is the order the route reads them in. */
function fixture(): Fix[] {
  return [
    // ── before the pivot: retired arms only, speakers rejecting both ───────
    {
      a: "old-x",
      b: "old-y",
      winner: "both_inadequate",
      d: 1,
      bucket: "orthography",
    },
    { a: "old-x", b: "old-y", winner: "tie", d: 2, bucket: "orthography" },
    { a: "old-x", b: "old-y", winner: "a", d: 4, bucket: "orthography" },
    { a: "edge-hi", b: "old-y", winner: "a", d: 5, bucket: "orthography" },
    // ── the four that must never count. The first two involve pool arms and
    //    predate the real pivot, so a leak would move the derived date. ─────
    {
      a: "pool-a",
      b: "pool-b",
      winner: "a",
      d: 6,
      bucket: "authenticity",
      isDemo: true,
    },
    {
      a: "pool-a",
      b: "pool-b",
      winner: "a",
      d: 7,
      bucket: "authenticity",
      email: SEED,
    },
    // ── the pivot, and the decided era after it ───────────────────────────
    { a: "pool-a", b: "pool-b", winner: "a", d: 10, bucket: "authenticity" },
    { a: "pool-a", b: "pool-b", winner: "a", d: 11, bucket: "authenticity" },
    { a: "pool-a", b: "pool-b", winner: "a", d: 12, bucket: "authenticity" },
    { a: "pool-a", b: "pool-b", winner: "b", d: 13, bucket: "authenticity" },
    { a: "pool-a", b: "pool-b", winner: "b", d: 14, bucket: "authenticity" },
    { a: "pool-a", b: "pool-b", winner: "tie", d: 15, bucket: "authenticity" },
    {
      a: "pool-a",
      b: "pool-b",
      winner: "both_inadequate",
      d: 16,
      bucket: "authenticity",
    },
    { a: "pool-a", b: "pool-b", winner: "a", d: 17, bucket: "authenticity" },
    { a: "pool-a", b: "pool-a", winner: "a", d: 18, bucket: "authenticity" },
    { a: "pool-a", b: "gone", winner: "a", d: 18, bucket: "authenticity" },
    // edge-hi: five decided votes inside the window, exactly on the gate.
    {
      a: "edge-hi",
      b: "pool-a",
      winner: "a",
      d: 18,
      bucket: "cultural_values",
    },
    {
      a: "edge-hi",
      b: "pool-a",
      winner: "a",
      d: 19,
      bucket: "cultural_values",
    },
    {
      a: "edge-hi",
      b: "pool-a",
      winner: "b",
      d: 20,
      bucket: "cultural_values",
    },
    {
      a: "edge-hi",
      b: "pool-a",
      winner: "a",
      d: 21,
      bucket: "cultural_values",
    },
    {
      a: "edge-hi",
      b: "pool-a",
      winner: "b",
      d: 22,
      bucket: "cultural_values",
    },
    // edge-lo: four decided votes, one below the gate.
    { a: "edge-lo", b: "pool-b", winner: "a", d: 23, bucket: "authenticity" },
    { a: "edge-lo", b: "pool-b", winner: "b", d: 24, bucket: "authenticity" },
    { a: "edge-lo", b: "pool-b", winner: "a", d: 25, bucket: "authenticity" },
    { a: "edge-lo", b: "pool-b", winner: "b", d: 26, bucket: "authenticity" },
  ];
}

const world = vi.hoisted(() => ({
  candidates: [] as unknown[],
  comparisons: [] as unknown[],
  lastComparisonWhere: null as unknown,
}));

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    candidateModel: { findMany: vi.fn() },
    pairwiseComparison: { findMany: vi.fn() },
    prompt: { count: vi.fn() },
    rubricAxisScore: { count: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET } from "./route";

/** A fake prisma that HONOURS the route's where clause, so "the demo row is
 * excluded" is a claim about the route's query and not about the fixture. */
function install(cands: Cand[], rows: Fix[]) {
  world.candidates = cands;
  world.comparisons = rows;
  mockPrisma.candidateModel.findMany.mockImplementation(
    async (args: { where?: { archived?: boolean } }) =>
      cands.filter((c) =>
        args.where?.archived === false ? !c.archived : true,
      ),
  );
  mockPrisma.pairwiseComparison.findMany.mockImplementation(
    async (args: {
      where?: {
        isDemo?: boolean;
        annotator?: { email?: { not?: { endsWith?: string } } };
      };
    }) => {
      world.lastComparisonWhere = args.where;
      const suffix = args.where?.annotator?.email?.not?.endsWith;
      return rows
        .filter((r) => (args.where?.isDemo === false ? !r.isDemo : true))
        .filter((r) => (suffix ? !(r.email ?? REAL).endsWith(suffix) : true))
        .map((r) => ({
          winner: r.winner,
          bucket: r.bucket,
          createdAt: day(r.d),
          modelOutputA: { candidateModelId: r.a, bucket: r.bucket },
          modelOutputB: { candidateModelId: r.b, bucket: r.bucket },
        }));
    },
  );
}

interface Payload {
  pivotAt: string | null;
  eras: Record<
    "since_pivot" | "all_time",
    {
      comparisons: number;
      decided: number;
      ties: number;
      bothInadequate: number;
      windowStart: string | null;
      minDecided: number;
      rows: Array<{
        candidateId: string;
        decided: number;
        games: number;
        cells: Array<{
          bucket: string;
          strength: number | null;
          rank: number | null;
          games: number;
          decided: number;
        }>;
      }>;
      belowGate: Array<{ candidateId: string; decided: number; games: number }>;
      bucketsWithVotes: string[];
      bucketsWithoutVotes: string[];
    }
  >;
  split: {
    sinceComparisons: number;
    sinceDecided: number;
    beforeComparisons: number;
    beforeDecided: number;
    allComparisons: number;
    allDecided: number;
  };
  totals: { candidates: number; pairwise: number };
}

async function payload(): Promise<Payload> {
  const res = await GET();
  return (await res.json()) as Payload;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "u1",
    role: "RESEARCHER",
  });
  mockPrisma.prompt.count.mockResolvedValue(0);
  mockPrisma.rubricAxisScore.count.mockResolvedValue(0);
  install(registry(), fixture());
});

describe("GET /api/arena/leaderboard - what counts as a comparison", () => {
  it("drops the demo row, the seed account, the self-matchup and the archived arm", async () => {
    const p = await payload();
    // 25 fixture rows minus demo, seed, self and archived = 21.
    expect(p.eras.all_time.comparisons).toBe(21);
    expect(p.totals.pairwise).toBe(21);
    // The exclusions are the query's, not the fixture's.
    expect(world.lastComparisonWhere).toEqual({
      isDemo: false,
      annotator: { email: { not: { endsWith: "@test.com" } } },
    });
  });

  it("counts the same population the Overview's own sentence counts", async () => {
    // The page quotes computeAnnotationInsights, which excludes demo rows and
    // @test.com seed accounts. A table that counted seed logins would print a
    // different all-time total three lines below that sentence.
    const withSeedKept = fixture().filter((r) => !r.isDemo && r.email !== SEED);
    install(registry(), withSeedKept);
    const p = await payload();
    expect(p.eras.all_time.comparisons).toBe(21);
  });
});

describe("GET /api/arena/leaderboard - the era filter", () => {
  it("uses the pinned POOL_PIVOT_AT as the window start", async () => {
    const p = await payload();
    expect(p.pivotAt).toBe(POOL_PIVOT_AT);
    expect(p.eras.since_pivot.windowStart).toBe(POOL_PIVOT_AT);
    expect(p.eras.all_time.windowStart).toBeNull();
  });

  it("splits the corpus the way the counts do, and reconciles", async () => {
    const p = await payload();
    // Since the pivot: 8 pool matchups + 5 edge-hi + 4 edge-lo = 17, of which
    // 6 + 5 + 4 = 15 decided, 1 tie, 1 both-inadequate.
    expect(p.eras.since_pivot).toMatchObject({
      comparisons: 17,
      decided: 15,
      ties: 1,
      bothInadequate: 1,
    });
    // All time adds the 4 pre-pivot rows: 2 decided, 1 tie, 1 both-inadequate.
    expect(p.eras.all_time).toMatchObject({
      comparisons: 21,
      decided: 17,
      ties: 2,
      bothInadequate: 2,
    });
    expect(p.split).toEqual({
      sinceComparisons: 17,
      sinceDecided: 15,
      beforeComparisons: 4,
      beforeDecided: 2,
      allComparisons: 21,
      allDecided: 17,
    });
    expect(p.split.beforeComparisons + p.split.sinceComparisons).toBe(
      p.split.allComparisons,
    );
    expect(p.split.beforeDecided + p.split.sinceDecided).toBe(
      p.split.allDecided,
    );
  });

  it("keeps the pre-pivot categories out of the post-pivot window", async () => {
    const p = await payload();
    // Only the retired arms were ever compared on spelling, all pre-pivot.
    expect(p.eras.since_pivot.bucketsWithVotes.sort()).toEqual([
      "authenticity",
      "cultural_values",
    ]);
    expect(p.eras.since_pivot.bucketsWithoutVotes).toContain("orthography");
    expect(p.eras.all_time.bucketsWithVotes).toContain("orthography");
  });
});

describe("GET /api/arena/leaderboard - the pinned pivot no longer moves with the pool", () => {
  it("stays put when a retired arm is put into the pairing pool", async () => {
    const before = await payload();
    expect(before.pivotAt).toBe(POOL_PIVOT_AT);

    // Before the fix this would have moved the derived pivot back to day 1
    // (old-y's earliest comparison). Now pool membership cannot move the
    // window at all - it is a decision (annotation-pivot-decision.md), not a
    // side effect of which arms happen to be in the pool right now.
    const mutated = registry().map((c) =>
      c.id === "old-y" ? { ...c, inPairingPool: true } : c,
    );
    install(mutated, fixture());
    const after = await payload();

    expect(after.pivotAt).toBe(POOL_PIVOT_AT);
    expect(after.pivotAt).toBe(before.pivotAt);
  });

  it("stays put when the current pool arms leave it", async () => {
    const mutated = registry().map((c) =>
      c.id === "pool-a" || c.id === "pool-b"
        ? { ...c, inPairingPool: false }
        : c.id === "edge-hi"
          ? { ...c, inPairingPool: true }
          : c,
    );
    install(mutated, fixture());
    const p = await payload();
    expect(p.pivotAt).toBe(POOL_PIVOT_AT);
  });

  it("stays put even when nothing is in the pool", async () => {
    const mutated = registry().map((c) => ({ ...c, inPairingPool: false }));
    install(mutated, fixture());
    const p = await payload();
    expect(p.pivotAt).toBe(POOL_PIVOT_AT);
    expect(p.eras.since_pivot.windowStart).toBe(POOL_PIVOT_AT);
    // The since-pivot window is unaffected by the pool flag now too.
    expect(p.eras.since_pivot.comparisons).toBe(17);
    // All time is untouched by the pool flag, as always.
    expect(p.eras.all_time.comparisons).toBe(21);
  });
});

describe("GET /api/arena/leaderboard - the sparsity gate", () => {
  it("gives a row to the candidate exactly on the threshold and not to the one below", async () => {
    const p = await payload();
    const s = p.eras.since_pivot;
    expect(s.minDecided).toBe(MIN_DECIDED_PER_CANDIDATE);
    // pool-a 11 decided of 13, pool-b 10 of 12, edge-hi 5 of 5.
    expect(s.rows.map((r) => r.candidateId).sort()).toEqual([
      "edge-hi",
      "pool-a",
      "pool-b",
    ]);
    const byId = new Map(s.rows.map((r) => [r.candidateId, r]));
    expect(byId.get("pool-a")).toMatchObject({ decided: 11, games: 13 });
    expect(byId.get("pool-b")).toMatchObject({ decided: 10, games: 12 });
    expect(byId.get("edge-hi")).toMatchObject({ decided: 5, games: 5 });
    // edge-lo misses by exactly one vote and is shown as a count.
    expect(
      s.belowGate.map(({ candidateId, decided, games }) => ({
        candidateId,
        decided,
        games,
      })),
    ).toEqual([
      { candidateId: "edge-lo", decided: 4, games: 4 },
      { candidateId: "never-run", decided: 0, games: 0 },
      { candidateId: "old-x", decided: 0, games: 0 },
      { candidateId: "old-y", decided: 0, games: 0 },
    ]);
  });

  it("accounts for every registered candidate as either a row or a count", async () => {
    const p = await payload();
    const live = registry()
      .filter((c) => !c.archived)
      .map((c) => c.id)
      .sort();
    for (const era of ["since_pivot", "all_time"] as const) {
      const seen = [
        ...p.eras[era].rows.map((r) => r.candidateId),
        ...p.eras[era].belowGate.map((s) => s.candidateId),
      ].sort();
      expect(seen).toEqual(live);
    }
  });

  it("counts a pre-pivot decided vote in all time and not in the window", async () => {
    const p = await payload();
    const hiSince = p.eras.since_pivot.rows.find(
      (r) => r.candidateId === "edge-hi",
    );
    const hiAll = p.eras.all_time.rows.find((r) => r.candidateId === "edge-hi");
    // Its pre-pivot win over old-y is the sixth decided vote, all-time only.
    expect(hiSince).toMatchObject({ decided: 5, games: 5 });
    expect(hiAll).toMatchObject({ decided: 6, games: 6 });
    // old-y's pre-pivot record is real but still under the gate all-time.
    expect(
      p.eras.all_time.belowGate.find((s) => s.candidateId === "old-y"),
    ).toMatchObject({ candidateId: "old-y", decided: 2, games: 4 });
  });
});

describe("GET /api/arena/leaderboard - the Bradley-Terry inputs", () => {
  /** The authenticity observations inside the window, written out by hand in
   * the order the route reads them, with both_inadequate folded to a tie the
   * way a fit with no third outcome must. edge-lo is below the gate and gets
   * no row, but its four votes are evidence about pool-b and belong here. */
  const authenticityObs = [
    { a: "pool-a", b: "pool-b", winner: "a" as const },
    { a: "pool-a", b: "pool-b", winner: "a" as const },
    { a: "pool-a", b: "pool-b", winner: "a" as const },
    { a: "pool-a", b: "pool-b", winner: "b" as const },
    { a: "pool-a", b: "pool-b", winner: "b" as const },
    { a: "pool-a", b: "pool-b", winner: "tie" as const },
    { a: "pool-a", b: "pool-b", winner: "tie" as const }, // both_inadequate
    { a: "pool-a", b: "pool-b", winner: "a" as const },
    { a: "edge-lo", b: "pool-b", winner: "a" as const },
    { a: "edge-lo", b: "pool-b", winner: "b" as const },
    { a: "edge-lo", b: "pool-b", winner: "a" as const },
    { a: "edge-lo", b: "pool-b", winner: "b" as const },
  ];

  it("fits each category on exactly the windowed rows of that category", async () => {
    const p = await payload();
    const expected = bradleyTerry(authenticityObs);
    const cellOf = (id: string, bucket: string) =>
      p.eras.since_pivot.rows
        .find((r) => r.candidateId === id)
        ?.cells.find((c) => c.bucket === bucket);

    for (const id of ["pool-a", "pool-b"]) {
      const cell = cellOf(id, "authenticity");
      const want = expected.candidates.find((c) => c.id === id);
      expect(cell?.strength).toBeCloseTo(want?.strength as number, 10);
      expect(cell?.rank).toBe(want?.rank);
    }
    // Counts on the cell are the decided/total for that candidate in that
    // category: pool-b played all 12 authenticity rows, 10 of them decided.
    expect(cellOf("pool-b", "authenticity")).toMatchObject({
      games: 12,
      decided: 10,
    });
    expect(cellOf("pool-a", "authenticity")).toMatchObject({
      games: 8,
      decided: 6,
    });
  });

  it("lets a below-gate candidate's votes into the fit, which is what makes them differ", async () => {
    const withoutEdgeLo = bradleyTerry(
      authenticityObs.filter((o) => o.a !== "edge-lo"),
    );
    const withEdgeLo = bradleyTerry(authenticityObs);
    const poolB = (r: ReturnType<typeof bradleyTerry>) =>
      r.candidates.find((c) => c.id === "pool-b")?.strength as number;
    // If the gate had removed edge-lo's rows from the fit, pool-b's cell would
    // read this other number instead.
    expect(poolB(withEdgeLo)).not.toBeCloseTo(poolB(withoutEdgeLo), 6);

    const p = await payload();
    const cell = p.eras.since_pivot.rows
      .find((r) => r.candidateId === "pool-b")
      ?.cells.find((c) => c.bucket === "authenticity");
    expect(cell?.strength).toBeCloseTo(poolB(withEdgeLo), 10);
  });

  it("never counts a rejection of both answers as evidence for either side", async () => {
    const p = await payload();
    const s = p.eras.since_pivot;
    // The one both-inadequate row is in the comparison count and the tie-folded
    // fit, but in nobody's decided count: 6 decided of 8 pool matchups.
    const cell = s.rows
      .find((r) => r.candidateId === "pool-a")
      ?.cells.find((c) => c.bucket === "authenticity");
    expect(cell?.games).toBe(8);
    expect(cell?.decided).toBe(6);
    expect(s.bothInadequate).toBe(1);
  });

  it("leaves a category with no votes in the window as a null, never a neutral 50", async () => {
    const p = await payload();
    const cell = p.eras.since_pivot.rows
      .find((r) => r.candidateId === "pool-a")
      ?.cells.find((c) => c.bucket === "orthography");
    expect(cell?.strength).toBeNull();
    expect(cell?.games).toBe(0);
  });
});
