import { describe, it, expect } from "vitest";
import {
  applyLeakAllowList,
  neutraliseEscapes,
  type LeakAllowEntry,
} from "./leak-allow";
import { buildProtectedSet, checkStatic } from "./leak-guard";

// Every word here is invented: "kọlẹ" plays a protected answer, and the
// allowed token is a same-fold spelling of it, as the real seed words are.
const PROTECTED = buildProtectedSet([{ promptId: "ig_x_001", answerText: "kọlẹ" }]);
const FILE = "src/lib/fake.ts";
const ENTRY: LeakAllowEntry = {
  file: FILE,
  token: "kólé",
  count: 1,
  reason: "invented test word",
};
const pass = (text: string) =>
  checkStatic([{ where: "t", text }], PROTECTED).pass;

describe("applyLeakAllowList", () => {
  it("masks exactly the allowed token, so the file passes", () => {
    const src = "const SEED = `mo kólé ni`;";
    expect(pass(src)).toBe(false);
    const r = applyLeakAllowList(FILE, src, [ENTRY]);
    expect(r.problems).toEqual([]);
    expect(pass(r.text)).toBe(true);
    expect(r.text).toHaveLength(src.length);
  });

  it("never masks another spelling of the same word", () => {
    const src = "const SEED = `mo kólé ni`; // and Kọlẹ here";
    const r = applyLeakAllowList(FILE, src, [ENTRY]);
    expect(r.problems).toEqual([]);
    expect(pass(r.text)).toBe(false);
  });

  it("fails when the token appears more often than the entry allows", () => {
    const src = "const SEED = `mo kólé ni`; // kólé again";
    const r = applyLeakAllowList(FILE, src, [ENTRY]);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/expects 1 occurrence\(s\), found 2/);
  });

  it("fails when the entry is stale (the token is gone)", () => {
    const r = applyLeakAllowList(FILE, "const SEED = `mo ni`;", [ENTRY]);
    expect(r.problems[0]).toMatch(/found 0/);
  });

  it("applies only to the file it names", () => {
    const src = "mo kólé ni";
    const r = applyLeakAllowList("src/lib/other.ts", src, [ENTRY]);
    expect(r.problems).toEqual([]);
    expect(r.text).toBe(src);
  });

  it("keeps the words either side apart, so a phrase cannot form across the mask", () => {
    const phrase = buildProtectedSet([{ promptId: "ig_x_002", answerText: "mo ni" }]);
    const r = applyLeakAllowList(FILE, "mo kólé ni", [ENTRY]);
    expect(checkStatic([{ where: "t", text: r.text }], phrase).pass).toBe(true);
  });
});

describe("neutraliseEscapes", () => {
  it("unglues a word written right after a newline escape", () => {
    const src = String.raw`const s = "wrong\nkọlẹ\nfix";`;
    expect(pass(src)).toBe(true); // the blind spot: one token, nkọlẹ
    const fixed = neutraliseEscapes(src);
    expect(pass(fixed)).toBe(false);
    expect(fixed).toHaveLength(src.length);
  });

  it("leaves text without escapes unchanged", () => {
    expect(neutraliseEscapes("mo kọlẹ ni")).toBe("mo kọlẹ ni");
  });
});
