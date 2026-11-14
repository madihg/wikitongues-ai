import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockChat } = vi.hoisted(() => ({ mockChat: vi.fn() }));
vi.mock("@/lib/llm/openrouter", () => ({ chat: mockChat }));

import {
  restoreTones,
  violations,
  ToneRestoreViolation,
  TONE_RESTORE_SYSTEM,
} from "./tone-restore";
import { LLM_CONFIG } from "./llm-config";

// Invented words only. Marks are escapes: acute U+0301, grave U+0300,
// macron U+0304, dot below U+0323.
const A_ACUTE = "á";
const BARE = "kapo mado";
const MARKED = `k${A_ACUTE}po màdo`;

beforeEach(() => vi.clearAllMocks());

describe("violations", () => {
  it("passes when only combining tone marks are added", () => {
    expect(violations(BARE, MARKED)).toEqual([]);
  });

  it("passes when only combining tone marks are removed or swapped", () => {
    expect(violations(MARKED, BARE)).toEqual([]);
    expect(violations(MARKED, "kāpo mádo")).toEqual([]);
  });

  it("passes a precomposed vs decomposed spelling of the same marks", () => {
    expect(violations(BARE, "kápo màdo")).toEqual([]);
  });

  it("catches a letter changed", () => {
    const v = violations(BARE, "kepo mado");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "changed" });
  });

  it("catches a letter added and a letter removed", () => {
    expect(violations(BARE, "kapoo mado")[0].kind).toBe("added");
    expect(violations(BARE, "kap mado")[0].kind).toBe("removed");
  });

  it("catches letters reordered", () => {
    expect(violations(BARE, "kapo damo")).not.toEqual([]);
  });

  it("catches a dot below added, removed or changed (it is a letter)", () => {
    expect(violations("kopo", "kọpo")).not.toEqual([]);
    expect(violations("kọpo", "kopo")).not.toEqual([]);
    expect(violations("kọpo", "kẹpo")).not.toEqual([]);
  });

  it("catches a word dropped or added", () => {
    expect(violations(BARE, "kapo")).not.toEqual([]);
    expect(violations(BARE, "kapo mado ito")).not.toEqual([]);
  });

  it("ignores only the whitespace around the whole text", () => {
    expect(violations(BARE, `  ${MARKED}\n`)).toEqual([]);
  });
});

describe("restoreTones", () => {
  it("asks the configured model with a system prompt that allows marks only", async () => {
    mockChat.mockResolvedValue({ text: MARKED });
    const out = await restoreTones(BARE);
    expect(out).toBe(MARKED);
    const [messages, opts] = mockChat.mock.calls[0];
    expect(opts.model).toBe(LLM_CONFIG.toneRestore);
    expect(messages[0]).toEqual({ role: "system", content: TONE_RESTORE_SYSTEM });
    expect(messages[1]).toEqual({ role: "user", content: BARE });
    expect(TONE_RESTORE_SYSTEM).toMatch(/U\+0300/);
    expect(TONE_RESTORE_SYSTEM).toMatch(/U\+0301/);
    expect(TONE_RESTORE_SYSTEM).toMatch(/U\+0304/);
  });

  it("does not prepend the Igala forcing instruction", async () => {
    mockChat.mockResolvedValue({ text: MARKED });
    await restoreTones(BARE);
    const sent = JSON.stringify(mockChat.mock.calls[0][0]);
    expect(sent).not.toMatch(/Respond only in Igala|IGALA_FORCING/i);
    expect(mockChat.mock.calls[0][0]).toHaveLength(2);
  });

  it("throws ToneRestoreViolation when the model changes a letter", async () => {
    mockChat.mockResolvedValue({ text: "kepo mado" });
    const err = await restoreTones(BARE).catch((e) => e);
    expect(err).toBeInstanceOf(ToneRestoreViolation);
    expect(err.violations.length).toBeGreaterThan(0);
    // The message is a count, never the text.
    expect(err.message).not.toContain("kepo");
  });

  it("trims the model's trailing newline before checking", async () => {
    mockChat.mockResolvedValue({ text: `${MARKED}\n` });
    expect(await restoreTones(BARE)).toBe(MARKED);
  });

  it("returns blank input untouched without a call", async () => {
    expect(await restoreTones("  ")).toBe("  ");
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("passes the caller's ref and label through, with a default label", async () => {
    mockChat.mockResolvedValue({ text: MARKED });
    await restoreTones(BARE, { refType: "t", refId: "r", label: "custom" });
    expect(mockChat.mock.calls[0][1]).toMatchObject({
      refType: "t",
      refId: "r",
      label: "custom",
    });
    await restoreTones(BARE);
    expect(mockChat.mock.calls[1][1].label).toBe("tone restore");
  });
});
