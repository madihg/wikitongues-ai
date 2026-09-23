import { POOL_ROUNDS, type PoolRoundDef } from "@/lib/arena/era";

/**
 * THE HUMAN VERDICT, ROUND BY ROUND - the data behind the public "out of
 * every 10 questions" chart.
 *
 * WHY THIS SHAPE. The project's stance is that blind native-speaker judgment,
 * not chrF, is the result. But the only figure the public page carried for it
 * was a single all-time rate, and a rate hides movement. Halim's ask
 * (2026-09-23) was a picture a non-technical reader can follow: how the model
 * is doing against the plain model in the LATEST round, and how that has
 * moved. So this groups every pool judgment by the pair of arms compared and
 * by the round it fell in (era.ts POOL_ROUNDS), and expresses each round as
 * "out of every 10 questions": how many did speakers hand to each side, how
 * many were a draw, how many they rejected outright.
 *
 * WHY NOT "HOW OFTEN AN ANSWER WAS NOT CORRECTED". It was the first idea, and
 * it would mislead: annotators can only correct an answer AFTER choosing it
 * as the better one, so the arm that wins more is corrected more (125 edits
 * on the retrieval arm against 53 on the plain one, as of 2026-09-23). A
 * "not corrected" chart would rank the loser above the winner.
 *
 * Pure: takes flattened rows, returns numbers. The database read lives in
 * computeMethodMetrics; the fixtures in human-rounds.test.ts pin the
 * arithmetic, the round assignment and the pair symmetry.
 */

export interface HumanRoundRow {
  createdAt: Date;
  /** "a" | "b" | "tie" | "both_inadequate" as stored. */
  winner: string;
  a: HumanRoundArm;
  b: HumanRoundArm;
}

export interface HumanRoundArm {
  name: string;
  kind: string;
  versionLabel: string | null;
  provider: string | null;
}

export interface PerTen {
  /** Judgments the first arm won, per 10. */
  a: number;
  b: number;
  tie: number;
  /** "Both inadequate": speakers rejected both answers. */
  neither: number;
}

export interface HumanRoundCounts {
  key: string;
  label: string;
  from: string;
  to: string | null;
  n: number;
  aWins: number;
  bWins: number;
  ties: number;
  bothInadequate: number;
  /** Each count scaled to a base of 10, one decimal, or all zeros when n = 0. */
  perTen: PerTen;
}

export interface HumanRoundsPair {
  /** Raw arm identity; the approach label is applied by the metrics layer
   * (method-metrics.ts owns approachLabel) so this module has no upward
   * import. */
  a: HumanRoundArm;
  b: HumanRoundArm;
  rounds: HumanRoundCounts[];
  all: HumanRoundCounts;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function perTen(c: {
  n: number;
  aWins: number;
  bWins: number;
  ties: number;
  bothInadequate: number;
}): PerTen {
  if (c.n === 0) return { a: 0, b: 0, tie: 0, neither: 0 };
  return {
    a: round1((10 * c.aWins) / c.n),
    b: round1((10 * c.bWins) / c.n),
    tie: round1((10 * c.ties) / c.n),
    neither: round1((10 * c.bothInadequate) / c.n),
  };
}

function inRound(t: number, r: PoolRoundDef): boolean {
  const from = Date.parse(r.from);
  const to = r.to === null ? Number.POSITIVE_INFINITY : Date.parse(r.to);
  return t >= from && t < to;
}

/**
 * Group judgments by unordered pair of arms, then by round. The pair's "a"
 * side is the arm whose name sorts first, so the same two arms always land in
 * the same slot no matter which side the annotator saw them on - the stored
 * A/B position is random by design (position bias).
 */
export function buildHumanRounds(
  rows: HumanRoundRow[],
  rounds: readonly PoolRoundDef[] = POOL_ROUNDS,
): HumanRoundsPair[] {
  type Acc = {
    a: HumanRoundArm;
    b: HumanRoundArm;
    byRound: Map<string, Omit<HumanRoundCounts, "perTen">>;
    all: Omit<HumanRoundCounts, "perTen">;
  };
  const empty = (
    key: string,
    label: string,
    from: string,
    to: string | null,
  ): Omit<HumanRoundCounts, "perTen"> => ({
    key,
    label,
    from,
    to,
    n: 0,
    aWins: 0,
    bWins: 0,
    ties: 0,
    bothInadequate: 0,
  });
  const pairs = new Map<string, Acc>();

  for (const r of rows) {
    if (r.a.name === r.b.name) continue;
    const flipped = r.a.name.localeCompare(r.b.name) > 0;
    const a = flipped ? r.b : r.a;
    const b = flipped ? r.a : r.b;
    const key = `${a.name}\u0000${b.name}`;
    let acc = pairs.get(key);
    if (!acc) {
      acc = {
        a,
        b,
        byRound: new Map(
          rounds.map((rd) => [rd.key, empty(rd.key, rd.label, rd.from, rd.to)]),
        ),
        all: empty("all", "All rounds", rounds[0]?.from ?? "", null),
      };
      pairs.set(key, acc);
    }
    // Which side won, in the PAIR's orientation, not the stored A/B.
    let outcome: "a" | "b" | "tie" | "neither";
    if (r.winner === "a") outcome = flipped ? "b" : "a";
    else if (r.winner === "b") outcome = flipped ? "a" : "b";
    else if (r.winner === "tie") outcome = "tie";
    else outcome = "neither";

    const t = r.createdAt.getTime();
    const targets = [acc.all];
    for (const rd of rounds) {
      if (inRound(t, rd)) targets.push(acc.byRound.get(rd.key)!);
    }
    for (const c of targets) {
      c.n += 1;
      if (outcome === "a") c.aWins += 1;
      else if (outcome === "b") c.bWins += 1;
      else if (outcome === "tie") c.ties += 1;
      else c.bothInadequate += 1;
    }
  }

  const out: HumanRoundsPair[] = [];
  for (const acc of pairs.values()) {
    out.push({
      a: acc.a,
      b: acc.b,
      rounds: rounds.map((rd) => {
        const c = acc.byRound.get(rd.key)!;
        return { ...c, perTen: perTen(c) };
      }),
      all: { ...acc.all, perTen: perTen(acc.all) },
    });
  }
  // Busiest pair first - the one the public chart draws.
  out.sort((x, y) => y.all.n - x.all.n || x.a.name.localeCompare(y.a.name));
  return out;
}
