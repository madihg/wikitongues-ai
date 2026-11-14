import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { onBusy, signalBusy } from "./activity-signal";

describe("activity-signal", () => {
  it("tells listeners that a recording started and stopped, and stops telling after unsubscribe", () => {
    const seen = vi.fn();
    const off = onBusy(seen);
    signalBusy("recording", true);
    signalBusy("recording", false);
    expect(seen.mock.calls).toEqual([
      ["recording", true],
      ["recording", false],
    ]);
    off();
    signalBusy("playing", true);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("does nothing with no listener, so the recorder is unchanged where time is not counted", () => {
    expect(() => signalBusy("recording", true)).not.toThrow();
  });

  it("the recorder signals when a take starts and when the microphone is released", () => {
    const src = readFileSync(
      join(__dirname, "..", "components", "lab", "use-recorder.ts"),
      "utf8",
    );
    expect(src).toContain('signalBusy("recording", true)');
    const release = src.slice(src.indexOf("const release = useCallback"));
    expect(release.slice(0, release.indexOf("}, []);"))).toContain(
      'signalBusy("recording", false)',
    );
  });
});
