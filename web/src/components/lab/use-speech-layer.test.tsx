import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { probeSpeechLayer, useSpeechLayer } from "./use-speech-layer";

/**
 * Parity with the annotator layer flag unset: the hook reads false for an
 * annotator, the episode renders as it always has, and no /api/lab/speech
 * request is made. (Server rendering runs no effects, so the first test is
 * the first paint; the probe tests cover the one request the layer ever
 * makes before it is on.)
 */

afterEach(() => vi.unstubAllGlobals());

function Probe({ eligible }: { eligible: boolean }) {
  return <span data-on={String(useSpeechLayer(eligible))} />;
}

describe("useSpeechLayer", () => {
  it("is false on first paint for an eligible role, and makes no request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(renderToStaticMarkup(<Probe eligible />)).toContain('data-on="false"');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is false for an ineligible role", () => {
    expect(renderToStaticMarkup(<Probe eligible={false} />)).toContain(
      'data-on="false"',
    );
  });
});

describe("probeSpeechLayer", () => {
  const answer = (body: unknown, ok = true) =>
    vi.fn().mockResolvedValue({ ok, json: async () => body });

  it("with the layer flag unset the server says false, and nothing but /api/lab/flags is fetched", async () => {
    const f = answer({ speech: false, layer: false });
    expect(await probeSpeechLayer(f as unknown as typeof fetch)).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("/api/lab/flags");
    expect(
      f.mock.calls.some(([u]) => String(u).startsWith("/api/lab/speech")),
    ).toBe(false);
  });

  it("is true only when the server says speech is on", async () => {
    expect(
      await probeSpeechLayer(answer({ speech: true, layer: true }) as unknown as typeof fetch),
    ).toBe(true);
  });

  it("any failure reads as off", async () => {
    expect(
      await probeSpeechLayer(answer({ speech: true }, false) as unknown as typeof fetch),
    ).toBe(false);
    expect(
      await probeSpeechLayer(
        vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch,
      ),
    ).toBe(false);
  });
});
