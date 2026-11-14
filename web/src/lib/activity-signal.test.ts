import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  onBusy,
  onSurface,
  openSurface,
  signalBusy,
  surfaceOverride,
} from "./activity-signal";

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

describe("a part of a page that is its own kind of work", () => {
  it("the edit drawer names its work while it is open, and hands the page back when it closes", () => {
    const seen = vi.fn();
    const off = onSurface(seen);
    expect(surfaceOverride()).toBeNull();
    const close = openSurface("edit");
    expect(surfaceOverride()).toBe("edit");
    close();
    expect(surfaceOverride()).toBeNull();
    // Closing twice (React runs a cleanup once, but a caller may not) is harmless.
    close();
    expect(seen.mock.calls).toEqual([["edit"], [null]]);
    off();
    openSurface("edit")();
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("the newest one still open wins, and closing out of order is safe", () => {
    const closeFirst = openSurface("edit");
    const closeSecond = openSurface("tone");
    expect(surfaceOverride()).toBe("tone");
    closeFirst();
    expect(surfaceOverride()).toBe("tone");
    closeSecond();
    expect(surfaceOverride()).toBeNull();
  });

  it("the drawer says so when it opens, and the beat listens", () => {
    const read = (...parts: string[]) =>
      readFileSync(join(__dirname, "..", ...parts), "utf8");
    expect(read("components", "answer-editor.tsx")).toContain(
      'useEffect(() => openSurface("edit"), []);',
    );
    const hook = read("components", "use-activity.ts");
    expect(hook).toContain("onSurface(");
    expect(hook).toContain("surfaceFor(pathname, surfaceOverride())");
    // The path alone is never asked any more: every reading goes through
    // the one function that knows about the drawer.
    expect(hook).not.toContain("surfaceForPath(");
  });
});

