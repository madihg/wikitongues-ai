import { describe, it, expect } from "vitest";
import { tonePositionErrors } from "../../../scripts/speech/eval-tone-restore";

// Invented words; acute U+0301, grave U+0300, dot below U+0323.
describe("tonePositionErrors (local TER stub)", () => {
  it("is zero for an identical answer", () => {
    expect(tonePositionErrors("kápo", "kápo")).toEqual([0, 4]);
  });

  it("counts a letter whose tone differs, or is missing", () => {
    expect(tonePositionErrors("kápo", "kàpo")).toEqual([1, 4]);
    expect(tonePositionErrors("kápo", "kapo")).toEqual([1, 4]);
  });

  it("does not count a dot below as a tone", () => {
    expect(tonePositionErrors("kọ́", "kọ́")).toEqual([0, 2]);
    expect(tonePositionErrors("kọ́", "kọ")).toEqual([1, 2]);
  });

  it("scores every letter wrong when the letters do not align", () => {
    expect(tonePositionErrors("kapo", "kapoo")).toEqual([4, 4]);
  });
});
