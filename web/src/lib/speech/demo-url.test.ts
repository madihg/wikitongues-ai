import { describe, it, expect } from "vitest";
import { demoFromSearch, withDemo } from "./demo-url";

describe("demo on the Speech pages", () => {
  it("reads the session id from the address", () => {
    expect(demoFromSearch("?demo=abc")).toBe("abc");
    expect(demoFromSearch("?x=1&demo=abc")).toBe("abc");
    expect(demoFromSearch("")).toBeNull();
    expect(demoFromSearch("?demo=")).toBeNull();
  });

  it("carries the id to another tab, and adds nothing when demo is off", () => {
    expect(withDemo("/speak/check", "a b")).toBe("/speak/check?demo=a%20b");
    expect(withDemo("/speak?x=1", "abc")).toBe("/speak?x=1&demo=abc");
    expect(withDemo("/speak/listen", null)).toBe("/speak/listen");
  });
});
