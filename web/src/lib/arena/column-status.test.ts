import { describe, it, expect } from "vitest";
import {
  COLUMN_PHASE_LABELS,
  ELAPSED_VISIBLE_AFTER_MS,
  applyStatusEvents,
  formatElapsed,
  initColumnPhases,
  isColumnActive,
  setPendingPhases,
  shouldShowElapsed,
  type ColumnPhase,
} from "./column-status";
import type { ChatReply, ChatStreamEvent } from "./chat-stream";

/**
 * The status machine is the thing standing between a reviewer and the belief
 * that the page is broken, so what these tests pin is exactly what could
 * mislead her: a column must never report a phase it is not in, a finished
 * column must never go back to work, and an event this build has never seen
 * must cost a status transition and nothing else.
 */

function reply(slug: string, error: string | null = null): ChatReply {
  return {
    slug,
    name: slug,
    text: error ? "" : "answer",
    latencyMs: 1200,
    tokensIn: 10,
    tokensOut: 20,
    retrievedChunks: 4,
    retrievedExemplars: 8,
    error,
  };
}

describe("column phase machine", () => {
  it("starts every column waiting to start", () => {
    const phases = initColumnPhases(["a", "b"]);
    expect(phases).toEqual({ a: "waiting", b: "waiting" });
  });

  it("walks one column through the whole repaired-arm sequence", () => {
    let phases = initColumnPhases(["a"]);
    expect(phases.a).toBe("waiting");

    // The request goes out: the server is authenticating and building
    // retrieval, which is what the client calls "retrieving context".
    phases = setPendingPhases(phases, "retrieving");
    expect(phases.a).toBe("retrieving");

    phases = applyStatusEvents(phases, [
      { type: "stage", slug: "a", stage: "writing" },
    ]);
    expect(phases.a).toBe("writing");

    phases = applyStatusEvents(phases, [
      { type: "stage", slug: "a", stage: "checking" },
    ]);
    expect(phases.a).toBe("checking");

    // The repair round's own event drives the revising phase, so the status
    // line and the "rewrote its answer" note cannot disagree.
    phases = applyStatusEvents(phases, [
      { type: "revision", slug: "a", reasons: ["letters Igala does not have"] },
    ]);
    expect(phases.a).toBe("revising");

    // The repaired attempt streams: deltas put it back to writing.
    phases = applyStatusEvents(phases, [
      { type: "delta", slug: "a", text: "Ẹ" },
    ]);
    expect(phases.a).toBe("writing");

    phases = applyStatusEvents(phases, [{ type: "reply", reply: reply("a") }]);
    expect(phases.a).toBe("done");
  });

  it("moves a column to writing on its first delta", () => {
    const phases = applyStatusEvents(initColumnPhases(["a", "b"]), [
      { type: "delta", slug: "a", text: "hello" },
    ]);
    expect(phases.a).toBe("writing");
    // Interleaved columns are independent: b heard nothing and moved nowhere.
    expect(phases.b).toBe("waiting");
  });

  it("reports a reply carrying an error as failed, not done", () => {
    const phases = applyStatusEvents(initColumnPhases(["a"]), [
      { type: "reply", reply: reply("a", "provider key rejected") },
    ]);
    expect(phases.a).toBe("failed");
  });

  it("keeps terminal phases sticky against late stragglers", () => {
    const done = applyStatusEvents(initColumnPhases(["a"]), [
      { type: "reply", reply: reply("a") },
    ]);
    const after = applyStatusEvents(done, [
      { type: "delta", slug: "a", text: "late" },
      { type: "stage", slug: "a", stage: "writing" },
    ]);
    expect(after.a).toBe("done");
    // Nothing changed, so the identical object comes back and React skips the
    // re-render.
    expect(after).toBe(done);
  });

  it("fails only the columns that never finished", () => {
    const phases = applyStatusEvents(initColumnPhases(["a", "b"]), [
      { type: "reply", reply: reply("a") },
      { type: "stage", slug: "b", stage: "writing" },
    ]);
    const cut = setPendingPhases(phases, "failed");
    expect(cut).toEqual({ a: "done", b: "failed" });
  });

  it("ignores events for a column this exchange does not have", () => {
    const phases = initColumnPhases(["a"]);
    const after = applyStatusEvents(phases, [
      { type: "delta", slug: "ghost", text: "x" },
      { type: "reply", reply: reply("ghost") },
    ]);
    expect(after).toEqual({ a: "waiting" });
  });

  it("ignores an event type it has never heard of instead of crashing", () => {
    const phases = applyStatusEvents(initColumnPhases(["a"]), [
      { type: "stage", slug: "a", stage: "writing" },
    ]);
    // Exactly the shape a newer server could send: unknown type, no `reply`
    // field for the reducer to reach into.
    const unknown = {
      type: "usage",
      slug: "a",
      tokens: 42,
    } as unknown as ChatStreamEvent;
    let after: Record<string, ColumnPhase> = {};
    expect(() => {
      after = applyStatusEvents(phases, [unknown]) as Record<
        string,
        ColumnPhase
      >;
    }).not.toThrow();
    expect(after.a).toBe("writing");
    // Nothing moved, so the same object is returned.
    expect(after).toBe(phases);
  });

  it("still processes known events sitting beside an unknown one", () => {
    const after = applyStatusEvents(initColumnPhases(["a"]), [
      { type: "flush" } as unknown as ChatStreamEvent,
      { type: "delta", slug: "a", text: "hi" },
    ]);
    expect(after.a).toBe("writing");
  });

  it("gives every phase a label and marks only the live ones active", () => {
    const phases: ColumnPhase[] = [
      "waiting",
      "retrieving",
      "writing",
      "checking",
      "revising",
      "done",
      "failed",
    ];
    for (const phase of phases) {
      expect(COLUMN_PHASE_LABELS[phase].length).toBeGreaterThan(0);
    }
    expect(phases.filter((p) => !isColumnActive(p))).toEqual([
      "done",
      "failed",
    ]);
  });
});

describe("elapsed counter", () => {
  it("stays hidden until the wait is worth counting", () => {
    expect(shouldShowElapsed("writing", 0)).toBe(false);
    expect(shouldShowElapsed("writing", ELAPSED_VISIBLE_AFTER_MS - 1)).toBe(
      false,
    );
    expect(shouldShowElapsed("writing", ELAPSED_VISIBLE_AFTER_MS)).toBe(true);
    expect(shouldShowElapsed("retrieving", 30_000)).toBe(true);
  });

  it("never counts on a finished column", () => {
    expect(shouldShowElapsed("done", 60_000)).toBe(false);
    expect(shouldShowElapsed("failed", 60_000)).toBe(false);
  });

  it("shows whole seconds and never a negative clock", () => {
    expect(formatElapsed(3999)).toBe("3s");
    expect(formatElapsed(12_000)).toBe("12s");
    // The clock state starts at 0 before the first tick; a column must not
    // briefly display "-1758…s".
    expect(formatElapsed(-500)).toBe("0s");
  });
});
