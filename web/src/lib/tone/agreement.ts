import { storedTone, toneLabels, type ToneLabel } from "@/lib/tone/tone";

/**
 * AGREEMENT BETWEEN TONE MARKERS (tone-mark pass 2). Pure.
 *
 * Per item: an exact match after NFC. Per syllable: the tone label each
 * marker gave (H, L, M, rising, falling, other, unmarked). Unmarked is its
 * own label, never Mid. Overall: Fleiss' kappa over syllables, and Cohen's
 * kappa for each pair of markers.
 *
 * Every version of one item is tone-only against the same first version
 * (the save path guarantees it), so the versions have the same letters and
 * their syllables line up by position.
 */

export interface Version {
  annotatorId: string;
  text: string;
}

export type ItemStatus =
  | "waiting" // fewer versions than the item asks for
  | "agreed_exact" // every version is the same text
  | "agreed_majority" // three or more versions, more than half the same
  | "needs_third" // the asked-for versions are in and they differ
  | "needs_adjudication"; // three or more versions and no majority

export interface ItemOutcome {
  status: ItemStatus;
  /** The agreed text, when there is one. */
  agreedText: string | null;
  method: "exact" | "majority" | null;
}

/** True when every text is the same after NFC and trimming. */
export function exactMatch(texts: string[]): boolean {
  if (texts.length === 0) return false;
  const first = storedTone(texts[0]);
  return texts.every((t) => storedTone(t) === first);
}

/**
 * Where one item stands. `required` is how many markers the item asks for
 * (2 by default, 3 proposed for homographs and minimal pairs).
 */
export function itemOutcome(texts: string[], required = 2): ItemOutcome {
  const need = Math.max(2, required);
  if (texts.length < need) {
    return { status: "waiting", agreedText: null, method: null };
  }
  if (exactMatch(texts)) {
    return {
      status: "agreed_exact",
      agreedText: storedTone(texts[0]),
      method: "exact",
    };
  }
  if (texts.length >= 3) {
    const counts = new Map<string, number>();
    for (const t of texts.map(storedTone)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n > texts.length / 2) {
      return { status: "agreed_majority", agreedText: top, method: "majority" };
    }
    return { status: "needs_adjudication", agreedText: null, method: null };
  }
  return { status: "needs_third", agreedText: null, method: null };
}

export interface SyllableRow {
  /** Position of the syllable among the letters of the text. */
  position: number;
  /** One label per version, in the order the versions were given. */
  labels: ToneLabel[];
  agreed: boolean;
}

/** The label each version gives to each syllable of one item. */
export function syllableRows(versions: Version[]): SyllableRow[] {
  const maps = versions.map((v) => toneLabels(v.text));
  const positions = [...new Set(maps.flatMap((m) => [...m.keys()]))].sort(
    (a, b) => a - b,
  );
  return positions.map((position) => {
    // A nasal one marker toned and another did not: unmarked for the other.
    const labels = maps.map((m) => m.get(position) ?? "U");
    return { position, labels, agreed: labels.every((l) => l === labels[0]) };
  });
}

/** Share of syllables on which every version gives the same label. */
export function syllableAgreement(versions: Version[]): {
  agreed: number;
  total: number;
  share: number | null;
} {
  const rows = syllableRows(versions);
  const agreed = rows.filter((r) => r.agreed).length;
  return {
    agreed,
    total: rows.length,
    share: rows.length === 0 ? null : agreed / rows.length,
  };
}

/**
 * Fleiss' kappa over rated units, in the form that allows a different
 * number of raters per unit (each unit needs at least two):
 *   P_i = (sum_j n_ij^2 - n_i) / (n_i (n_i - 1))
 *   P_e = sum_j p_j^2, with p_j the share of all ratings in category j.
 * Null when there is nothing to rate or when chance agreement is 1 (every
 * rating in one category: kappa is undefined, not zero).
 */
export function fleissKappa(units: string[][]): number | null {
  const rated = units.filter((u) => u.length >= 2);
  if (rated.length === 0) return null;
  const totals = new Map<string, number>();
  let ratings = 0;
  let sumP = 0;
  for (const u of rated) {
    const counts = new Map<string, number>();
    for (const label of u) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
      totals.set(label, (totals.get(label) ?? 0) + 1);
    }
    ratings += u.length;
    let squares = 0;
    for (const c of counts.values()) squares += c * c;
    sumP += (squares - u.length) / (u.length * (u.length - 1));
  }
  const pBar = sumP / rated.length;
  let pe = 0;
  for (const c of totals.values()) pe += (c / ratings) ** 2;
  if (pe >= 1) return null;
  return (pBar - pe) / (1 - pe);
}

/** Cohen's kappa for two raters over the units both rated. Null when there
 *  are none or when chance agreement is 1. */
export function cohenKappa(pairs: [string, string][]): number | null {
  const n = pairs.length;
  if (n === 0) return null;
  const a = new Map<string, number>();
  const b = new Map<string, number>();
  let same = 0;
  for (const [x, y] of pairs) {
    if (x === y) same++;
    a.set(x, (a.get(x) ?? 0) + 1);
    b.set(y, (b.get(y) ?? 0) + 1);
  }
  const po = same / n;
  let pe = 0;
  for (const [label, count] of a) pe += (count / n) * ((b.get(label) ?? 0) / n);
  if (pe >= 1) return null;
  return (po - pe) / (1 - pe);
}

export interface ItemVersions {
  itemId: string;
  cells: string[];
  required: number;
  versions: Version[];
}

export interface PairAgreement {
  a: string;
  b: string;
  items: number;
  exact: number;
  syllables: number;
  kappa: number | null;
}

export interface AgreementSummary {
  items: number;
  /** Items with at least two versions. */
  compared: number;
  exact: number;
  byStatus: Record<ItemStatus, number>;
  syllables: number;
  syllablesAgreed: number;
  fleiss: number | null;
  perAnnotator: { annotatorId: string; done: number }[];
  pairs: PairAgreement[];
  perCell: {
    cell: string;
    items: number;
    compared: number;
    exact: number;
    syllables: number;
    syllablesAgreed: number;
  }[];
}

/** Everything the admin view and its CSV show, from the raw versions. */
export function summarise(items: ItemVersions[]): AgreementSummary {
  const byStatus: Record<ItemStatus, number> = {
    waiting: 0,
    agreed_exact: 0,
    agreed_majority: 0,
    needs_third: 0,
    needs_adjudication: 0,
  };
  const done = new Map<string, number>();
  const units: string[][] = [];
  const pairUnits = new Map<string, [string, string][]>();
  const pairItems = new Map<string, { items: number; exact: number }>();
  const cells = new Map<
    string,
    { items: number; compared: number; exact: number; syl: number; ok: number }
  >();
  let compared = 0;
  let exact = 0;
  let syllables = 0;
  let syllablesAgreed = 0;

  for (const item of items) {
    const texts = item.versions.map((v) => v.text);
    byStatus[itemOutcome(texts, item.required).status]++;
    for (const v of item.versions) {
      done.set(v.annotatorId, (done.get(v.annotatorId) ?? 0) + 1);
    }
    const isCompared = item.versions.length >= 2;
    const isExact = isCompared && exactMatch(texts);
    const rows = isCompared ? syllableRows(item.versions) : [];
    const ok = rows.filter((r) => r.agreed).length;
    if (isCompared) {
      compared++;
      if (isExact) exact++;
      syllables += rows.length;
      syllablesAgreed += ok;
      for (const r of rows) units.push(r.labels);
      for (let i = 0; i < item.versions.length; i++) {
        for (let j = i + 1; j < item.versions.length; j++) {
          const [x, y] = [item.versions[i], item.versions[j]];
          const flip = x.annotatorId > y.annotatorId;
          const key = flip
            ? `${y.annotatorId}|${x.annotatorId}`
            : `${x.annotatorId}|${y.annotatorId}`;
          const list = pairUnits.get(key) ?? [];
          for (const r of rows) {
            list.push(
              flip ? [r.labels[j], r.labels[i]] : [r.labels[i], r.labels[j]],
            );
          }
          pairUnits.set(key, list);
          const tally = pairItems.get(key) ?? { items: 0, exact: 0 };
          tally.items++;
          if (storedTone(x.text) === storedTone(y.text)) tally.exact++;
          pairItems.set(key, tally);
        }
      }
    }
    for (const cell of item.cells) {
      const c = cells.get(cell) ?? {
        items: 0,
        compared: 0,
        exact: 0,
        syl: 0,
        ok: 0,
      };
      c.items++;
      if (isCompared) {
        c.compared++;
        if (isExact) c.exact++;
        c.syl += rows.length;
        c.ok += ok;
      }
      cells.set(cell, c);
    }
  }

  return {
    items: items.length,
    compared,
    exact,
    byStatus,
    syllables,
    syllablesAgreed,
    fleiss: fleissKappa(units),
    perAnnotator: [...done.entries()]
      .map(([annotatorId, n]) => ({ annotatorId, done: n }))
      .sort(
        (x, y) => y.done - x.done || x.annotatorId.localeCompare(y.annotatorId),
      ),
    pairs: [...pairUnits.entries()]
      .map(([key, list]) => {
        const [a, b] = key.split("|");
        const tally = pairItems.get(key) ?? { items: 0, exact: 0 };
        return {
          a,
          b,
          items: tally.items,
          exact: tally.exact,
          syllables: list.length,
          kappa: cohenKappa(list),
        };
      })
      .sort((x, y) => `${x.a}|${x.b}`.localeCompare(`${y.a}|${y.b}`)),
    perCell: [...cells.entries()]
      .map(([cell, c]) => ({
        cell,
        items: c.items,
        compared: c.compared,
        exact: c.exact,
        syllables: c.syl,
        syllablesAgreed: c.ok,
      }))
      .sort((x, y) => x.cell.localeCompare(y.cell)),
  };
}
