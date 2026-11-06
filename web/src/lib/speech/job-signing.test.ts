import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signBody, verifySignature, timestampFresh } from "./job-signing";

// The vector the Python side tests too: worker/tests/fixtures/hmac.json.
const vector = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", "..", "..", "worker", "tests", "fixtures", "hmac.json"),
    "utf8",
  ),
);

describe("job signing", () => {
  it("gives the same signature as the Python worker on the shared vector", () => {
    expect(signBody(vector.secret, vector.timestamp, vector.body)).toBe(
      vector.signature,
    );
  });

  it("verifies a good signature and rejects a changed body, secret or empty value", () => {
    expect(
      verifySignature(vector.secret, vector.timestamp, vector.body, vector.signature),
    ).toBe(true);
    expect(
      verifySignature(vector.secret, vector.timestamp, vector.body + " ", vector.signature),
    ).toBe(false);
    expect(
      verifySignature("other", vector.timestamp, vector.body, vector.signature),
    ).toBe(false);
    expect(verifySignature(vector.secret, vector.timestamp, vector.body, "")).toBe(false);
    expect(verifySignature(vector.secret, vector.timestamp, vector.body, "zz")).toBe(false);
  });

  it("accepts a timestamp within 300 seconds either way and nothing else", () => {
    const now = 1_000_000_000_000;
    const sec = String(now / 1000);
    expect(timestampFresh(sec, now)).toBe(true);
    expect(timestampFresh(String(now / 1000 - 300), now)).toBe(true);
    expect(timestampFresh(String(now / 1000 - 301), now)).toBe(false);
    expect(timestampFresh(String(now / 1000 + 301), now)).toBe(false);
    expect(timestampFresh("abc", now)).toBe(false);
    expect(timestampFresh(null, now)).toBe(false);
  });
});
