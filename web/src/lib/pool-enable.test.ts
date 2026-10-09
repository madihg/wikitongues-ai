import { describe, it, expect } from "vitest";
import { ALLOWED_PAIRINGS, assignedPair } from "./pairing";
import {
  pairKey,
  servedSlugs,
  tallyDraws,
  whitelistProblemsFor,
} from "./pool-enable";

const V45 = "gemini-3-1-pro-rag-v4-5";
const V44 = "gemini-3-1-pro-rag-v4-4";
const V3 = "gemini-3-1-pro-rag-v3";
const BARE = "gemini-3-1-pro";
const V45_EXPECTED = [pairKey(V44, V45), pairKey(BARE, V45)];

describe("pairKey", () => {
  it("is order-free, sorted keys", () => {
    expect(pairKey(V45, V44)).toBe(`${V44}|${V45}`);
    expect(pairKey(V45, BARE)).toBe(`${BARE}|${V45}`);
    expect(pairKey(BARE, V45)).toBe(pairKey(V45, BARE));
  });
});

describe("whitelistProblemsFor (enable-v45-pool.ts precondition)", () => {
  it("the shipped whitelist names exactly {v4-4|v4-5, bare|v4-5}", () => {
    expect(V45_EXPECTED).toEqual([
      "gemini-3-1-pro-rag-v4-4|gemini-3-1-pro-rag-v4-5",
      "gemini-3-1-pro|gemini-3-1-pro-rag-v4-5",
    ]);
    expect(whitelistProblemsFor(V45, V45_EXPECTED)).toEqual([]);
  });

  it("refuses an extra v4.5 pair", () => {
    const allowed = [...ALLOWED_PAIRINGS, [V45, V3] as const];
    expect(whitelistProblemsFor(V45, V45_EXPECTED, allowed)).toEqual([
      `extra ${pairKey(V3, V45)}`,
    ]);
  });

  it("refuses a duplicate, including one written the other way round", () => {
    const allowed = [...ALLOWED_PAIRINGS, [BARE, V45] as const];
    expect(whitelistProblemsFor(V45, V45_EXPECTED, allowed)).toEqual([
      `duplicate ${pairKey(BARE, V45)}`,
    ]);
  });

  it("refuses a missing pair and a self-pair", () => {
    const allowed = ALLOWED_PAIRINGS.filter(
      ([a, b]) => !(a === V45 && b === BARE),
    ).concat([[V45, V45] as const]);
    expect(whitelistProblemsFor(V45, V45_EXPECTED, allowed)).toEqual([
      `self-pair ${V45}|${V45}`,
      `missing ${pairKey(BARE, V45)}`,
      `extra ${V45}|${V45}`,
    ]);
  });
});

describe("servedSlugs", () => {
  it("keeps the database order and drops arms outside the pool", () => {
    const pool = new Set([V3, BARE, V44, V45]);
    expect(
      servedSlugs([V44, "claude-opus-5-rag", BARE, V45, V3], pool),
    ).toEqual([V44, BARE, V45, V3]);
  });
});

describe("tallyDraws", () => {
  const annotators = Array.from({ length: 12 }, (_, i) => `ann_${i}`);
  const prompts = Array.from({ length: 40 }, (_, i) => ({
    code: `ig_v45_${String(i).padStart(3, "0")}`,
    slugs: [V3, BARE, V44, V45],
  }));

  it("draws both v4.5 pairs, and only whitelisted pairs, over the post-flip pool", () => {
    const { byPair, total } = tallyDraws(prompts, annotators);
    expect(total).toBe(prompts.length * annotators.length);
    for (const k of V45_EXPECTED) expect(byPair.get(k) ?? 0).toBeGreaterThan(0);
    const allowedKeys = new Set(ALLOWED_PAIRINGS.map(([a, b]) => pairKey(a, b)));
    for (const k of byPair.keys()) expect(allowedKeys.has(k)).toBe(true);
    expect([...byPair.values()].reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("hashes the public prompt code it is given, as /next does", () => {
    const p = prompts[0];
    const [i, j] = assignedPair("ann_0", p.code, p.slugs.length, [...p.slugs])!;
    const { byPair } = tallyDraws([p], ["ann_0"]);
    expect([...byPair.keys()]).toEqual([pairKey(p.slugs[i], p.slugs[j])]);
  });

  it("skips a prompt with no whitelisted pair", () => {
    expect(tallyDraws([{ code: "x", slugs: [V3, V45] }], annotators).total).toBe(0);
  });
});
