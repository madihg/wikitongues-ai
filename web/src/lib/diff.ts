/**
 * Token-level diff for the inline edit view. Operates on whole word/whitespace
 * tokens and NEVER strips diacritics — a tone mark added or removed shows up as a
 * changed token, which is exactly the signal the grammar/tone bucket cares about.
 */

export type DiffSeg = { value: string; type: "same" | "added" | "removed" };

function tokenize(s: string): string[] {
  return s.match(/\s+|\S+/g) ?? [];
}

/** A longest-common-subsequence word diff: original -> corrected. */
export function wordDiff(original: string, corrected: string): DiffSeg[] {
  const a = tokenize(original);
  const b = tokenize(corrected);
  const n = a.length;
  const m = b.length;

  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffSeg[] = [];
  const push = (value: string, type: DiffSeg["type"]) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.value += value;
    else out.push({ value, type });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(a[i], "same");
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(a[i], "removed");
      i++;
    } else {
      push(b[j], "added");
      j++;
    }
  }
  while (i < n) push(a[i++], "removed");
  while (j < m) push(b[j++], "added");
  return out;
}
