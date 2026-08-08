import { describe, it, expect } from "vitest";
import {
  DIALECT_KEYS,
  IGALA_DIALECTS,
  dialectLabel,
  isDialect,
  sanitizeDialect,
} from "./dialects";

describe("IGALA_DIALECTS config", () => {
  it("has unique keys", () => {
    expect(new Set(DIALECT_KEYS).size).toBe(DIALECT_KEYS.length);
  });

  it("matches the provisional option list", () => {
    expect(DIALECT_KEYS).toEqual([
      "not_sure",
      "general_idah",
      "ibaji",
      "ankpa",
      "dekina",
      "bassa",
      "ogugu",
      "other",
    ]);
  });

  it("offers an explicit 'not sure' and 'other', so nobody is forced to guess", () => {
    expect(DIALECT_KEYS).toContain("not_sure");
    expect(DIALECT_KEYS).toContain("other");
  });

  it("gives every option a non-empty label without em dashes", () => {
    for (const d of IGALA_DIALECTS) {
      expect(d.label.trim().length).toBeGreaterThan(0);
      expect(d.label).not.toContain("—");
    }
  });
});

describe("isDialect", () => {
  it("accepts every configured key", () => {
    for (const k of DIALECT_KEYS) expect(isDialect(k)).toBe(true);
  });

  it("rejects unknown keys and non-strings", () => {
    for (const v of ["Idah", "", "IBAJI", null, undefined, 3, {}, ["ibaji"]]) {
      expect(isDialect(v)).toBe(false);
    }
  });
});

describe("sanitizeDialect", () => {
  it("passes through a known key", () => {
    expect(sanitizeDialect("ibaji")).toBe("ibaji");
    expect(sanitizeDialect("not_sure")).toBe("not_sure");
  });

  it("turns anything unknown into null rather than failing the write", () => {
    for (const v of [null, undefined, "", "kogi", 5, {}, []]) {
      expect(sanitizeDialect(v)).toBeNull();
    }
  });
});

describe("dialectLabel", () => {
  it("resolves known keys", () => {
    expect(dialectLabel("general_idah")).toBe("General / Idah");
    expect(dialectLabel("not_sure")).toBe("Not sure");
  });

  it("reads as 'Not recorded' when absent", () => {
    expect(dialectLabel(null)).toBe("Not recorded");
    expect(dialectLabel(undefined)).toBe("Not recorded");
    expect(dialectLabel("")).toBe("Not recorded");
  });

  it("falls back to the raw value if the list is revised under existing rows", () => {
    expect(dialectLabel("retired_variety")).toBe("retired_variety");
  });
});
