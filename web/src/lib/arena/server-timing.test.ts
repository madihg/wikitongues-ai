import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  SERVER_TIMING_STAGE_NAMES,
  formatServerTiming,
  timeStage,
  type TimedStage,
} from "./server-timing";

/**
 * A Server-Timing header is read by every proxy, extension and log on the path,
 * so this file pins BOTH halves of the contract: the stage names the chat route
 * promises to publish (so "why is this slow" stays answerable from the network
 * tab), and the guarantee that a header entry can only ever be a name and a
 * number. The second half is the one that matters if this route ever grows a
 * stage named after something the caller typed.
 */

/** Exactly what the chat route emits, with plausible durations. */
const ROUTE_STAGES: TimedStage[] = SERVER_TIMING_STAGE_NAMES.map((name, i) => ({
  name,
  durMs: i * 7,
}));

describe("formatServerTiming", () => {
  it("publishes every stage name the chat route measures", () => {
    const header = formatServerTiming(ROUTE_STAGES);
    for (const name of SERVER_TIMING_STAGE_NAMES) {
      expect(header).toContain(`${name};dur=`);
    }
    // The stages a latency question actually turns on, spelled out: retrieval
    // is timed per version, never as one lump.
    expect(SERVER_TIMING_STAGE_NAMES).toContain("retrieval-v2");
    expect(SERVER_TIMING_STAGE_NAMES).toContain("retrieval-v4");
    expect(SERVER_TIMING_STAGE_NAMES).toContain("total");
  });

  it("emits names and integer durations and NOTHING else", () => {
    const header = formatServerTiming(ROUTE_STAGES);
    // Every entry: a lowercase token name, then dur=<integer>. No `desc`, no
    // quoted string, no field that could carry a prompt or a model id.
    expect(header).toMatch(
      /^[a-z][a-z0-9-]*;dur=\d+(, [a-z][a-z0-9-]*;dur=\d+)*$/,
    );
    expect(header).not.toContain("desc");
    expect(header).not.toContain('"');
  });

  it("drops any stage name that is not on the allowlist", () => {
    // The failure this guards: someone times a stage per candidate or per
    // question and names it after the input. Note that a candidate slug passes
    // every plausible "is this a safe token" pattern - only the allowlist
    // stops it, which is why the guard is an allowlist.
    const header = formatServerTiming([
      { name: "auth", durMs: 3 },
      ...([
        { name: "gpt-4o-igala-rag-v4-1", durMs: 40 },
        { name: "How do I greet an elder?", durMs: 50 },
        { name: "retrieval v4 (igala)", durMs: 60 },
        { name: "A".repeat(64), durMs: 70 },
      ] as unknown as TimedStage[]),
    ]);
    expect(header).toBe("auth;dur=3");
  });

  it("drops durations that are not real measurements", () => {
    const header = formatServerTiming([
      { name: "auth", durMs: Number.NaN },
      { name: "candidates", durMs: Number.POSITIVE_INFINITY },
      { name: "total", durMs: -1 },
      { name: "retrieval-v4", durMs: 12.6 },
    ]);
    expect(header).toBe("retrieval-v4;dur=13");
  });

  it("produces an empty header value rather than a malformed one", () => {
    expect(formatServerTiming([])).toBe("");
  });

  it("survives being set as a real response header", () => {
    // Anything that would need escaping in a header value would throw here.
    const res = new Response(null, {
      headers: { "Server-Timing": formatServerTiming(ROUTE_STAGES) },
    });
    expect(res.headers.get("Server-Timing")).toContain("total;dur=");
  });
});

describe("the chat route's header", () => {
  const routeSource = readFileSync(
    fileURLToPath(
      new URL("../../app/api/arena/chat/route.ts", import.meta.url),
    ),
    "utf8",
  );

  it("is built by formatServerTiming, never hand-assembled", () => {
    expect(routeSource).toContain('"Server-Timing": formatServerTiming(');
  });

  it("names exactly the allowlisted stages, and gives none of them a desc", () => {
    // Every `{ name: "..." }` the route hands to the builder.
    const named = [...routeSource.matchAll(/\{ name: "([^"]+)", durMs:/g)].map(
      (m) => m[1],
    );
    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named)).toEqual(new Set(SERVER_TIMING_STAGE_NAMES));
    // A `desc` is the only Server-Timing field that carries free text. The
    // route must never grow one - it would be the leak path for the reviewer's
    // question or a candidate's model id.
    expect(routeSource).not.toContain("desc=");
  });
});

describe("timeStage", () => {
  it("reports the elapsed time and passes the value through", async () => {
    let reported = -1;
    const value = await timeStage(
      async () => {
        await new Promise((r) => setTimeout(r, 12));
        return "built";
      },
      (ms) => (reported = ms),
    );
    expect(value).toBe("built");
    expect(reported).toBeGreaterThanOrEqual(10);
  });

  it("still reports when the stage rejects - a slow failure is the finding", async () => {
    let reported = -1;
    await expect(
      timeStage(
        () => Promise.reject(new Error("retrieval down")),
        (ms) => (reported = ms),
      ),
    ).rejects.toThrow("retrieval down");
    expect(reported).toBeGreaterThanOrEqual(0);
  });
});
