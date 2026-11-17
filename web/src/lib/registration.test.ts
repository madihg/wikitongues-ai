import { describe, it, expect } from "vitest";
import { inviteCodes, isValidInvite } from "./registration";

describe("invite codes", () => {
  it("reads a comma separated list, trimmed, with empty entries dropped", () => {
    expect(inviteCodes(" a , ,b,")).toEqual(["a", "b"]);
    expect(inviteCodes(undefined)).toEqual([]);
  });

  it("refuses everything when no invite is configured", () => {
    for (const code of [undefined, null, "", "anything", 7]) {
      expect(isValidInvite(code, [])).toBe(false);
    }
  });

  it("refuses a missing or empty invite even when codes exist", () => {
    for (const code of [undefined, null, "", "   "]) {
      expect(isValidInvite(code, ["real-code"])).toBe(false);
    }
  });
});
