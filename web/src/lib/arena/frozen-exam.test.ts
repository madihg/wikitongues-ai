import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildV4FamilyTurn,
  isV4FamilyVersionLabel,
  runsRepairRound,
  systemPromptForVersion,
  V4_FAMILY_VERSION_LABELS,
} from "./frozen-exam";
import { REPAIR_ROUND_VERSION_LABEL } from "./repair-round";
import { buildUserTurnV4, IGALA_SYSTEM_V4 } from "@/lib/generation-prompt-v4";
import { IGALA_SYSTEM_V4_1 } from "@/lib/generation-prompt-v4-1";
import type { RetrievalV4Result } from "./retrieval-v4";

/** A retrieval result with every block distinguishable, so the assembled user
 * turn can be compared against the route's own composition, not a stub. */
function retrieval(): RetrievalV4Result {
  return {
    correctionsBlock: "CORRECTIONS BLOCK",
    parallelBlock: "PARALLEL BLOCK",
    dictionaryBlock: "DICTIONARY BLOCK",
    exampleTurns: [{ question: "q1", answer: "a1" }],
    contextIds: ["lex:1", "pp:2", "gold:3"],
  } as RetrievalV4Result;
}

const PROMPT = { text: "How do you say water?", bucket: "lexical" };

describe("v4-family label switch", () => {
  it("serves the v4 prompt for rag-v4 and the v4.1 prompt for rag-v4-1", () => {
    expect(systemPromptForVersion("rag-v4")).toBe(IGALA_SYSTEM_V4);
    expect(systemPromptForVersion("rag-v4-1")).toBe(IGALA_SYSTEM_V4_1);
    // The two prompts are genuinely different text, so the assertion above is
    // not trivially satisfied by an aliased constant.
    expect(IGALA_SYSTEM_V4_1).not.toBe(IGALA_SYSTEM_V4);
  });

  it("runs the repair round for exactly the label the serving wrapper does", () => {
    for (const label of V4_FAMILY_VERSION_LABELS) {
      expect(runsRepairRound(label)).toBe(label === REPAIR_ROUND_VERSION_LABEL);
    }
    expect(runsRepairRound("rag-v4")).toBe(false);
  });

  it("recognises only the v4 family", () => {
    expect(isV4FamilyVersionLabel("rag-v4")).toBe(true);
    expect(isV4FamilyVersionLabel("rag-v4-1")).toBe(true);
    expect(isV4FamilyVersionLabel("rag-v3")).toBe(false);
    expect(isV4FamilyVersionLabel(null)).toBe(false);
    expect(isV4FamilyVersionLabel(undefined)).toBe(false);
  });
});

describe("buildV4FamilyTurn", () => {
  it("assembles the route's user turn, exemplars and system prompt", () => {
    const r = retrieval();
    const v41 = buildV4FamilyTurn("rag-v4-1", PROMPT, r);
    // The route: buildUserTurnV4(prompt.text, v4, prompt.bucket).
    expect(v41.args.userMessage).toBe(
      buildUserTurnV4(PROMPT.text, r, PROMPT.bucket),
    );
    expect(v41.args.goldExamples).toBe(r.exampleTurns);
    expect(v41.args.systemPromptOverride).toBe(IGALA_SYSTEM_V4_1);

    const v4 = buildV4FamilyTurn("rag-v4", PROMPT, r);
    // Retrieval and user turn are IDENTICAL across the two labels; only the
    // system prompt moves. That is the whole v4 -> v4.1 delta on the request.
    expect(v4.args.userMessage).toBe(v41.args.userMessage);
    expect(v4.args.goldExamples).toBe(v41.args.goldExamples);
    expect(v4.args.systemPromptOverride).toBe(IGALA_SYSTEM_V4);
  });

  it("allows tone saturation only when the question asks about tone", () => {
    const r = retrieval();
    for (const label of V4_FAMILY_VERSION_LABELS) {
      expect(
        buildV4FamilyTurn(
          label,
          { text: "Mark the tone on this", bucket: null },
          r,
        ).opts.allowTone,
      ).toBe(true);
      expect(
        buildV4FamilyTurn(label, { text: "Say hello", bucket: null }, r).opts
          .allowTone,
      ).toBe(false);
      // Word boundary, same as the routes: "monotone" is not a tone request.
      expect(
        buildV4FamilyTurn(label, { text: "a monotone voice", bucket: null }, r)
          .opts.allowTone,
      ).toBe(false);
    }
  });
});

/**
 * The reason this module exists is that three call sites must agree. The
 * route and the generic exam runner import buildV4FamilyTurn, so they agree
 * by construction. scripts/exam-rag-v4-1.ts is deliberately LEFT UNTOUCHED as
 * the frozen reference implementation of the v4.1 assembly - this test reads
 * its source and pins the four decisions it makes, so if the shared builder
 * ever drifts from the script the gemini-3-1-pro-rag-v4-1 numbers were
 * produced by, a test fails instead of a silent incomparability.
 */
describe("the untouched v4.1 exam script still describes this assembly", () => {
  const src = readFileSync(
    join(process.cwd(), "scripts", "exam-rag-v4-1.ts"),
    "utf8",
  );

  it("builds the user turn from buildUserTurnV4 over buildRetrievalV4", () => {
    expect(src).toContain("await buildRetrievalV4(prisma, {");
    expect(src).toContain(
      "userMessage: buildUserTurnV4(prompt.text, v4, prompt.bucket)",
    );
    expect(src).toContain("goldExamples: v4.exampleTurns");
  });

  it("serves IGALA_SYSTEM_V4_1", () => {
    expect(src).toContain("systemPromptOverride: IGALA_SYSTEM_V4_1");
  });

  it("gates tone on the same regex over the raw question", () => {
    expect(src).toContain("allowTone: /\\btone/i.test(prompt.text)");
  });

  it("goes through generateWithRepairRound", () => {
    expect(src).toContain("generateWithRepairRound(");
  });
});

/**
 * BUFFERED FOR THE EXAM, STREAMED FOR THE CHAT - and the same request either
 * way.
 *
 * The chat route stopped buffering rag-v4-1 (a 30-60s blank panel on the
 * default-selected column) and now streams both attempts of the repair round.
 * That is a DELIVERY change and must stay one: the exam and the eval route
 * keep the buffered call, and all three assemble the request through
 * buildV4FamilyTurn, so the answer a reviewer reads is the answer the frozen
 * numbers describe. These tests read the three sources and pin exactly that
 * split - a copy-paste divergence fails here instead of silently making the
 * scoreboard describe a different system.
 */
describe("the streamed chat path and the buffered exam path stay one system", () => {
  const read = (...parts: string[]) =>
    readFileSync(join(process.cwd(), ...parts), "utf8");
  const chatRoute = read("src", "app", "api", "arena", "chat", "route.ts");
  const evalRoute = read(
    "src",
    "app",
    "api",
    "arena",
    "eval-runs",
    "[id]",
    "generate",
    "route.ts",
  );
  const examScript = read("scripts", "exam-rag-v4-1.ts");

  it("the eval route and the exam script are still BUFFERED", () => {
    for (const src of [evalRoute, examScript]) {
      expect(src).toContain("generateWithRepairRound(");
      expect(src).not.toContain("streamWithRepairRound");
    }
  });

  it("the chat route streams the round instead of buffering it", () => {
    expect(chatRoute).toContain("streamWithRepairRound(");
    // The old buffered CALLS are gone: no path in chat may hold a v4.1 column
    // back until the repair round finishes. (Call sites, not prose - the
    // route's comment names the buffered twin to explain the split.)
    expect(chatRoute).not.toContain("generateWithRepairRound(");
    expect(chatRoute).not.toContain("generateForCandidate(");
  });

  it("chat and the eval route assemble the request through the SAME builder", () => {
    for (const src of [chatRoute, evalRoute]) {
      expect(src).toContain("buildV4FamilyTurn(");
      expect(src).toContain('from "@/lib/arena/frozen-exam"');
    }
  });

  it("the only difference chat adds is the conversation - nothing about the request", () => {
    // What chat builds for a free-text question, versus what the exam builds
    // for the same text as a prompt. Identical user turn, exemplars, system
    // prompt and tone gate; chat then spreads conversationHistory on top, the
    // one field a multi-turn chat has and a one-shot exam does not.
    const r = retrieval();
    const question = "How do you greet in the morning?";
    const exam = buildV4FamilyTurn(
      "rag-v4-1",
      { text: question, bucket: null },
      r,
    );
    const chat = {
      ...buildV4FamilyTurn("rag-v4-1", { text: question, bucket: null }, r)
        .args,
      conversationHistory: [{ role: "user", content: "an earlier turn" }],
    };
    const { conversationHistory, ...rest } = chat;
    expect(rest).toEqual(exam.args);
    expect(conversationHistory).toHaveLength(1);
  });
});
