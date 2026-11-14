import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHAT_LIMITS,
  budgetFor,
  canReadConversation,
  chatBudget,
} from "./chat-guard";
import { TUTOR_MAX_OUTPUT_TOKENS } from "./agents/limits";
import { DEFAULT_CANDIDATE } from "./agents/translator";

const NOW = new Date("2026-11-14T12:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

describe("budgetFor: one account's messages", () => {
  it("allows the tenth message of a minute and refuses the eleventh", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ago(i + 1));
    expect(budgetFor(nine, NOW)).toEqual({ ok: true });
    const ten = [...nine, ago(50)];
    const refused = budgetFor(ten, NOW);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error).toBe(
        "Rate limit exceeded. Max 10 messages per minute.",
      );
      // The oldest of the ten leaves the window in 10 seconds.
      expect(refused.retryAfterSeconds).toBe(10);
    }
  });

  it("forgets a message after 60 seconds", () => {
    const old = Array.from({ length: 10 }, (_, i) => ago(61 + i));
    expect(budgetFor(old, NOW)).toEqual({ ok: true });
  });

  it("refuses past the daily cap, however slowly the messages came", () => {
    const spread = Array.from({ length: CHAT_LIMITS.perDay }, (_, i) =>
      ago(120 + i * 400),
    );
    const refused = budgetFor(spread, NOW);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/^Daily limit reached/);
    expect(budgetFor(spread.slice(1), NOW)).toEqual({ ok: true });
  });

  it("forgets a message after 24 hours", () => {
    const yesterday = Array.from({ length: CHAT_LIMITS.perDay }, (_, i) =>
      ago(24 * 3600 + 1 + i),
    );
    expect(budgetFor(yesterday, NOW)).toEqual({ ok: true });
  });
});

describe("chatBudget: counted in the database, per account", () => {
  it("asks only for this account's own learner messages of the last day", async () => {
    const findMany = vi.fn(async () => [] as { createdAt: Date }[]);
    await chatBudget({ message: { findMany } } as never, "user-1", NOW);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        role: "user",
        conversation: { learnerId: "user-1" },
        createdAt: { gte: ago(24 * 3600) },
      },
      orderBy: { createdAt: "desc" },
      take: CHAT_LIMITS.perDay,
      select: { createdAt: true },
    });
  });
});

describe("canReadConversation", () => {
  it("the account that started it, and a researcher; nobody else", () => {
    const c = { learnerId: "owner" };
    expect(canReadConversation(c, { id: "owner", role: "LEARNER" })).toBe(true);
    expect(canReadConversation(c, { id: "other", role: "LEARNER" })).toBe(
      false,
    );
    expect(canReadConversation(c, { id: "other", role: "ANNOTATOR" })).toBe(
      false,
    );
    expect(canReadConversation(c, { id: "other", role: "RESEARCHER" })).toBe(
      true,
    );
    // A conversation with no owner on record is nobody's but a researcher's.
    expect(
      canReadConversation({ learnerId: null }, { id: "x", role: "LEARNER" }),
    ).toBe(false);
  });
});

describe("the hard cap on output tokens", () => {
  it("the translator's model call is capped by the shared constant", () => {
    expect(TUTOR_MAX_OUTPUT_TOKENS).toBe(1024);
    expect(DEFAULT_CANDIDATE.decodingParams).toMatchObject({
      maxTokens: TUTOR_MAX_OUTPUT_TOKENS,
    });
  });

  it("the reviewer's model call is capped by the same constant, with no number typed in", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/agents/reviewer.ts"),
      "utf8",
    );
    expect(src).toContain("maxOutputTokens: TUTOR_MAX_OUTPUT_TOKENS");
    expect(src).not.toMatch(/maxOutputTokens:\s*\d/);
    // Every generateText call in the tutor's agents carries a cap.
    for (const f of ["reviewer.ts", "translator.ts"]) {
      const s = readFileSync(join(process.cwd(), "src/lib/agents", f), "utf8");
      const calls = s.match(/generateText\(\{/g)?.length ?? 0;
      const caps = s.match(/maxOutputTokens:/g)?.length ?? 0;
      expect(caps, f).toBeGreaterThanOrEqual(calls);
    }
  });
});
