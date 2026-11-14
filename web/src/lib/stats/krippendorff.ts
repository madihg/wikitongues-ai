/**
 * Krippendorff's alpha: how far a group of judges agree, corrected for the
 * agreement luck alone would give. 1 is full agreement, 0 is what luck gives,
 * below 0 is systematic disagreement. It takes any number of judges per item
 * and tolerates missing judgments, which is why it suits a small panel where
 * not everyone judges everything.
 *
 * Pure. Built from the coincidence matrix (Krippendorff 2011, "Computing
 * Krippendorff's Alpha-Reliability"). Two difference functions: "nominal"
 * for labels (the Listen and Check verdicts) and "interval" for scores.
 */

export type AlphaMetric = "nominal" | "interval";

export interface AlphaResult {
  /** Null when it cannot be computed: no item with two judgments, or no variation at all. */
  alpha: number | null;
  /** Items with at least two judgments. Only these carry information. */
  units: number;
  /** Judgments inside those items. */
  judgments: number;
}

const delta = (metric: AlphaMetric, a: number | string, b: number | string) => {
  if (metric === "nominal") return a === b ? 0 : 1;
  const d = Number(a) - Number(b);
  return d * d;
};

/**
 * `units` holds, per item, the values its judges gave (missing judgments
 * simply absent). Items with fewer than two values are ignored.
 */
export function krippendorffAlpha(
  units: Array<Array<number | string>>,
  metric: AlphaMetric,
): AlphaResult {
  const usable = units.filter((u) => u.length >= 2);
  const judgments = usable.reduce((n, u) => n + u.length, 0);
  if (usable.length === 0) return { alpha: null, units: 0, judgments: 0 };

  // Coincidence matrix: every ordered pair of values inside an item counts
  // 1 / (m - 1), where m is the number of judgments on that item.
  const values = [...new Set(usable.flat())];
  const index = new Map(values.map((v, i) => [v, i]));
  const k = values.length;
  const o: number[][] = Array.from({ length: k }, () =>
    new Array<number>(k).fill(0),
  );
  for (const u of usable) {
    const w = 1 / (u.length - 1);
    for (let i = 0; i < u.length; i++) {
      for (let j = 0; j < u.length; j++) {
        if (i === j) continue;
        o[index.get(u[i])!][index.get(u[j])!] += w;
      }
    }
  }
  const nc = o.map((row) => row.reduce((s, x) => s + x, 0));
  const n = nc.reduce((s, x) => s + x, 0);
  if (n <= 1) return { alpha: null, units: usable.length, judgments };

  let observed = 0;
  let expected = 0;
  for (let c = 0; c < k; c++) {
    for (let d = 0; d < k; d++) {
      if (c === d) continue;
      const dist = delta(metric, values[c], values[d]);
      observed += o[c][d] * dist;
      expected += nc[c] * nc[d] * dist;
    }
  }
  // Everyone gave the same value everywhere: agreement is total but alpha is
  // undefined (0 over 0). Report null rather than a made-up 1.
  if (expected === 0) return { alpha: null, units: usable.length, judgments };
  const alpha = 1 - ((n - 1) * observed) / expected;
  return { alpha, units: usable.length, judgments };
}
