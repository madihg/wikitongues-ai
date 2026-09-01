import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * THE MEASURED PATH IS STILL BUFFERED.
 *
 * The chat route now STREAMS rag-v4-1 and applies the repair round after. The
 * exam and this eval-generation route must not have moved an inch: an output
 * stored here is scored, and a stored output has to be the one a buffered,
 * fully-checked round produced. The refactor that made both entry points share
 * one core (repair-round.ts) and one request builder (frozen-exam.ts) is only
 * safe if this route's observable behaviour is unchanged, so this file runs the
 * real handler and pins it:
 *
 *   - generateForCandidate, never streamForCandidate - no partial output can
 *     escape, because there is no delta channel at all;
 *   - the request assembled for rag-v4 / rag-v4-1 recomputed independently from
 *     the unchanged prompt modules, not copied out of the new builder;
 *   - the repair round still re-asks once and stores the SECOND answer, with
 *     latency and tokens summed across both calls.
 */

const {
  mockPrisma,
  mockRequireResearcher,
  mockGenerateForCandidate,
  mockBuildRetrievalV2,
  mockBuildRetrievalV4,
  mockSearchRag,
} = vi.hoisted(() => ({
  mockPrisma: {
    evalRun: { findUnique: vi.fn(), update: vi.fn() },
    prompt: { findMany: vi.fn() },
    modelOutput: { create: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
  mockGenerateForCandidate: vi.fn(),
  mockBuildRetrievalV2: vi.fn(),
  mockBuildRetrievalV4: vi.fn(),
  mockSearchRag: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));
vi.mock("@/lib/arena/providers", () => ({
  generateForCandidate: mockGenerateForCandidate,
  // Present so an accidental import would resolve - and immediately fail the
  // "never streamed" assertion below rather than silently working.
  streamForCandidate: vi.fn(),
}));
vi.mock("@/lib/arena/retrieval-v2", () => ({
  buildRetrievalV2: mockBuildRetrievalV2,
}));
vi.mock("@/lib/arena/retrieval-v4", () => ({
  buildRetrievalV4: mockBuildRetrievalV4,
}));
vi.mock("@/lib/rag", () => ({ searchRag: mockSearchRag }));

import { POST } from "./route";
import { streamForCandidate } from "@/lib/arena/providers";
import { buildUserTurnV4, IGALA_SYSTEM_V4 } from "@/lib/generation-prompt-v4";
import { IGALA_SYSTEM_V4_1 } from "@/lib/generation-prompt-v4-1";

const V4 = {
  dictionaryBlock: "DICTIONARY\nabc = thing",
  parallelBlock: "PARALLEL\nx = y",
  correctionsBlock: "CORRECTIONS\nnot z",
  exampleTurns: [{ question: "q1", answer: "a1" }],
  contextIds: ["lex:1", "pp:2", "edit:3", "gold:4"],
  leakReport: { pass: true, hitCount: 0, hits: [] },
};

const PROMPT = {
  id: "p-cuid",
  promptId: "P-001",
  text: "How do I greet an elder?",
  bucket: "greeting",
  isHoldout: true,
};

function setRun(versionLabel: string) {
  mockPrisma.evalRun.findUnique.mockResolvedValue({
    id: "run-1",
    epochId: "e1",
    holdoutPromptIds: [PROMPT.id],
    candidateModel: {
      id: "c1",
      slug: "s",
      family: "gpt",
      ragEnabled: true,
      versionLabel,
    },
  });
}

/** Script one buffered generation per call, in call order. */
function scriptGenerations(texts: string[]) {
  let n = 0;
  mockGenerateForCandidate.mockImplementation(async () => {
    n += 1;
    return {
      text: texts[n - 1] ?? "",
      modelId: "gpt-x",
      latencyMs: 7 * n,
      tokensIn: 100 * n,
      tokensOut: 10 * n,
      ragContextIds: [],
    };
  });
}

const params = Promise.resolve({ id: "run-1" });
const call = () => POST(new Request("http://localhost/x"), { params });

const storedOutput = () => mockPrisma.modelOutput.create.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "u1",
    role: "RESEARCHER",
  });
  mockPrisma.prompt.findMany.mockResolvedValue([PROMPT]);
  mockPrisma.evalRun.update.mockResolvedValue({});
  mockPrisma.modelOutput.create.mockResolvedValue({});
  mockBuildRetrievalV4.mockResolvedValue(V4);
  mockBuildRetrievalV2.mockResolvedValue(V4);
  mockSearchRag.mockResolvedValue([]);
  scriptGenerations(["ojo daa"]);
});

describe("the eval-generation route is still buffered", () => {
  it("never streams - rag-v4-1 included", async () => {
    setRun("rag-v4-1");
    await call();
    expect(mockGenerateForCandidate).toHaveBeenCalled();
    expect(streamForCandidate).not.toHaveBeenCalled();
  });

  it("assembles rag-v4-1 exactly as it did before the shared builder", async () => {
    setRun("rag-v4-1");
    await call();
    // Recomputed from the unchanged prompt modules, so this is an independent
    // check on buildV4FamilyTurn rather than a restatement of it.
    expect(mockGenerateForCandidate.mock.calls[0][1]).toEqual({
      userMessage: buildUserTurnV4(PROMPT.text, V4, PROMPT.bucket),
      goldExamples: V4.exampleTurns,
      systemPromptOverride: IGALA_SYSTEM_V4_1,
    });
    // No conversationHistory: the exam is one prompt, not a conversation.
    expect(
      "conversationHistory" in mockGenerateForCandidate.mock.calls[0][1],
    ).toBe(false);
  });

  it("assembles rag-v4 exactly as it did before, with no repair round", async () => {
    setRun("rag-v4");
    // A first answer that WOULD be dirty on the v4.1 arm - proof the round is
    // keyed on the label and not on the text.
    scriptGenerations(["sooro", "ojo daa"]);
    await call();

    expect(mockGenerateForCandidate).toHaveBeenCalledTimes(1);
    expect(mockGenerateForCandidate.mock.calls[0][1]).toEqual({
      userMessage: buildUserTurnV4(PROMPT.text, V4, PROMPT.bucket),
      goldExamples: V4.exampleTurns,
      systemPromptOverride: IGALA_SYSTEM_V4,
    });
    expect(storedOutput()).toMatchObject({
      outputText: "sooro",
      latencyMs: 7,
      tokenCountIn: 100,
      tokenCountOut: 10,
      ragContextIds: V4.contextIds,
    });
  });

  it("still re-asks once and STORES the repaired answer on rag-v4-1", async () => {
    setRun("rag-v4-1");
    scriptGenerations(["sooro", "ojo daa"]);
    await call();

    expect(mockGenerateForCandidate).toHaveBeenCalledTimes(2);
    const second = mockGenerateForCandidate.mock.calls[1][1];
    expect(second.conversationHistory).toEqual([
      {
        role: "user",
        content: buildUserTurnV4(PROMPT.text, V4, PROMPT.bucket),
      },
      { role: "assistant", content: "sooro" },
    ]);
    expect(second.userMessage).toContain("sooro");

    expect(storedOutput()).toMatchObject({
      outputText: "ojo daa",
      // Serve what you measure: the stored row is billed for BOTH calls.
      latencyMs: 7 + 14,
      tokenCountIn: 100 + 200,
      tokenCountOut: 10 + 20,
    });
  });

  it("keeps the R8.3 tone gate on the raw question", async () => {
    setRun("rag-v4-1");
    mockPrisma.prompt.findMany.mockResolvedValue([
      { ...PROMPT, text: "Which tone marks does this word carry?" },
    ]);
    // Fully tone-saturated, and therefore a violation UNLESS the question asked.
    scriptGenerations(["Àgbá Ọ́jọ́"]);
    await call();

    expect(mockGenerateForCandidate).toHaveBeenCalledTimes(1);
    expect(storedOutput()).toMatchObject({ outputText: "Àgbá Ọ́jọ́" });
  });

  it("re-asks when the same saturated answer was NOT asked for", async () => {
    setRun("rag-v4-1");
    scriptGenerations(["Àgbá Ọ́jọ́", "Agba Ojo"]);
    await call();

    expect(mockGenerateForCandidate).toHaveBeenCalledTimes(2);
    expect(storedOutput()).toMatchObject({ outputText: "Agba Ojo" });
  });
});
