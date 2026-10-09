import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The chat route with v4.5 columns, end to end through POST with Prisma,
 * auth, providers and retrieval mocked (adapted from the 2026-10-08
 * pre-merge verifier's test). What these pin: one grammar block per row set
 * in a multi-column turn; a v4.4 column's request is exactly the pre-v4.5
 * composition, whether or not a v4.5 column shares the turn; a column that
 * serves no grammar block still gets none; the v4.5 tone row is read only on
 * a tone question; and only the v4.5 column sees an untoned dictionary.
 */

const { mockPrisma, mockRequireResearcher, mockStreamForCandidate, mockBuildRetrievalV2, mockBuildRetrievalV4, mockSearchRag, wheres } =
  vi.hoisted(() => ({
    mockPrisma: {
      candidateModel: { findMany: vi.fn() },
      coldAuthorAnswer: { findMany: vi.fn() },
      ragEntry: { findMany: vi.fn() },
      prompt: { findUnique: vi.fn() },
    },
    mockRequireResearcher: vi.fn(),
    mockStreamForCandidate: vi.fn(),
    mockBuildRetrievalV2: vi.fn(),
    mockBuildRetrievalV4: vi.fn(),
    mockSearchRag: vi.fn(),
    wheres: [] as unknown[],
  }));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));
// generateForCandidate is the buffered call the reference-form second pass
// makes after a rag-v4-5 column's reply (reference-form.ts). Mocked to echo
// the served text, so these tests run a clean pass instead of a failing one;
// what they pin is the grammar composition, which the pass never touches.
vi.mock("@/lib/arena/providers", () => ({
  streamForCandidate: mockStreamForCandidate,
  generateForCandidate: async () => ({
    text: "ugbo daa",
    modelId: "gpt-x",
    latencyMs: 1,
    tokensIn: 1,
    tokensOut: 1,
    ragContextIds: [],
  }),
}));
vi.mock("@/lib/arena/retrieval-v2", async (orig) => ({
  ...(await orig<typeof import("@/lib/arena/retrieval-v2")>()),
  buildRetrievalV2: mockBuildRetrievalV2,
}));
vi.mock("@/lib/arena/retrieval-v4", () => ({ buildRetrievalV4: mockBuildRetrievalV4 }));
vi.mock("@/lib/rag", () => ({ searchRag: mockSearchRag }));

import { POST } from "./route";
import { buildUserTurnV4, buildUserTurnV43 } from "@/lib/generation-prompt-v4";
import { IGALA_SYSTEM_V4_4 } from "@/lib/generation-prompt-v4-4";
import { IGALA_SYSTEM_V4_1 } from "@/lib/generation-prompt-v4-1";
import { igalaSystemV45 } from "@/lib/generation-prompt-v4-5";
import { renderGrammarBlock } from "@/lib/arena/grammar-block";

const V4 = {
  dictionaryBlock: "DICTIONARY\nabc = thing",
  parallelBlock: "PARALLEL\nx = y",
  correctionsBlock: "CORRECTIONS\nnot z",
  exampleTurns: [{ question: "q1", answer: "a1" }],
  contextIds: ["lex:1", "pp:2", "edit:3", "gold:4"],
  leakReport: { pass: true, hitCount: 0, hits: [] },
};
const BASE = { id: "base-1", chunkType: "grammar_rule", topic: "zebra quokka base rule", content: "zebra quokka", verificationStatus: "community_verified" };
const V45ROW = { id: "v45-1", chunkType: "grammar_rule_v4_5", topic: "zebra quokka v45 rule", content: "zebra quokka", verificationStatus: "community_verified" };
const V45TONE = { id: "v45-tone", chunkType: "grammar_rule_v4_5_tone", topic: "zebra quokka tone v45 tone rule", content: "zebra quokka tone", verificationStatus: "community_verified" };
const STORE = [BASE, V45ROW, V45TONE];
const QUESTION = "zebra quokka greeting";

const cand = (slug: string, versionLabel: string) => ({
  id: slug, slug, name: slug, provider: "openai", baseModelId: "gpt-x", ragEnabled: true,
  archived: false, versionLabel, decodingParams: null,
});
const req = (slugs: string[], question: string = QUESTION) =>
  new Request("http://localhost/api/arena/chat", {
    method: "POST",
    body: JSON.stringify({ slugs, messages: [{ role: "user", content: question }] }),
  });
async function drain(res: Response) {
  const r = res.body!.getReader();
  const d = new TextDecoder();
  let s = "";
  for (;;) { const { done, value } = await r.read(); if (done) break; s += d.decode(value, { stream: true }); }
  return s.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}
const firstCallFor = (slug: string) => mockStreamForCandidate.mock.calls.find((c) => c[0].slug === slug)![1];

beforeEach(() => {
  vi.clearAllMocks();
  wheres.length = 0;
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "u1", role: "RESEARCHER" });
  mockPrisma.coldAuthorAnswer.findMany.mockResolvedValue([]);
  mockPrisma.prompt.findUnique.mockResolvedValue(null);
  mockPrisma.ragEntry.findMany.mockImplementation(async (args: { where: { chunkType: string | { in: string[] } } }) => {
    wheres.push(args.where);
    const ct = args.where.chunkType;
    const wanted = typeof ct === "string" ? [ct] : ct.in;
    return STORE.filter((r) => wanted.includes(r.chunkType));
  });
  mockBuildRetrievalV4.mockResolvedValue(V4);
  mockSearchRag.mockResolvedValue([]);
  mockStreamForCandidate.mockImplementation(async (_c: unknown, _a: unknown, onDelta: (d: string) => void) => {
    onDelta("ugbo daa");
    return { text: "ugbo daa", modelId: "gpt-x", latencyMs: 1, tokensIn: 1, tokensOut: 1, ragContextIds: [] };
  });
});

describe("chat route: v4.4 and v4.5 columns in one turn", () => {
  it("each column gets its own row set; v4.4's request equals the pre-v4.5 composition", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([cand("v44", "rag-v4-4"), cand("v45", "rag-v4-5")]);
    const events = await drain(await POST(req(["v44", "v45"])));
    expect(wheres).toHaveLength(2);
    expect(wheres).toContainEqual({ language: "igala", chunkType: "grammar_rule" });
    expect(wheres).toContainEqual({ language: "igala", chunkType: { in: ["grammar_rule", "grammar_rule_v4_5"] } });

    const v44 = firstCallFor("v44");
    const mainBlock = renderGrammarBlock([BASE]);
    expect(v44.userMessage).toBe(buildUserTurnV43(QUESTION, V4, mainBlock, null));
    expect(v44.userMessage).not.toContain("v45 rule");
    expect(v44.systemPromptOverride).toBe(IGALA_SYSTEM_V4_4);

    const v45 = firstCallFor("v45");
    expect(v45.userMessage).toContain("v45 rule");
    expect(v45.userMessage).toContain("base rule");
    expect(v45.systemPromptOverride).toBe(igalaSystemV45());

    const replies = events.filter((e) => e.type === "reply").map((e) => e.reply);
    expect(replies.find((r) => r.slug === "v44").retrievedChunks).toBe(3 + 1);
    expect(replies.find((r) => r.slug === "v45").retrievedChunks).toBe(3 + 2);
  });

  it("v4.4 alone: one query, exactly the pre-v4.5 where", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([cand("v44", "rag-v4-4")]);
    await drain(await POST(req(["v44"])));
    expect(wheres).toEqual([{ language: "igala", chunkType: "grammar_rule" }]);
    expect(firstCallFor("v44").userMessage).toBe(buildUserTurnV43(QUESTION, V4, renderGrammarBlock([BASE]), null));
  });

  it("v4.1 beside v4.5: v4.1 still gets no grammar block, v4.5 gets its own", async () => {
    mockPrisma.candidateModel.findMany.mockResolvedValue([cand("v41", "rag-v4-1"), cand("v45", "rag-v4-5")]);
    await drain(await POST(req(["v41", "v45"])));
    expect(wheres).toEqual([{ language: "igala", chunkType: { in: ["grammar_rule", "grammar_rule_v4_5"] } }]);
    expect(firstCallFor("v41").userMessage).toBe(buildUserTurnV4(QUESTION, V4, null));
    expect(firstCallFor("v41").systemPromptOverride).toBe(IGALA_SYSTEM_V4_1);
  });

  it("a tone question: v4.5 reads its tone row too; v4.4's where and request do not move", async () => {
    const toneQ = "mark the tone: zebra quokka greeting";
    mockPrisma.candidateModel.findMany.mockResolvedValue([cand("v44", "rag-v4-4"), cand("v45", "rag-v4-5")]);
    await drain(await POST(req(["v44", "v45"], toneQ)));
    expect(wheres).toContainEqual({ language: "igala", chunkType: "grammar_rule" });
    expect(wheres).toContainEqual({
      language: "igala",
      chunkType: { in: ["grammar_rule", "grammar_rule_v4_5", "grammar_rule_v4_5_tone"] },
    });
    expect(firstCallFor("v45").userMessage).toContain("v45 tone rule");
    expect(firstCallFor("v44").userMessage).not.toContain("v45 tone rule");
    expect(firstCallFor("v44").userMessage).toBe(
      buildUserTurnV43(toneQ, V4, renderGrammarBlock([BASE]), null),
    );
  });

  it("a toned dictionary reaches v4.4 as is and v4.5 untoned", async () => {
    mockBuildRetrievalV4.mockResolvedValue({ ...V4, dictionaryBlock: "DICTIONARY\nwork = ùkọ́lọ̀" });
    mockPrisma.candidateModel.findMany.mockResolvedValue([cand("v44", "rag-v4-4"), cand("v45", "rag-v4-5")]);
    await drain(await POST(req(["v44", "v45"])));
    expect(firstCallFor("v44").userMessage).toContain("work = ùkọ́lọ̀");
    expect(firstCallFor("v45").userMessage).toContain("work = ukọlọ");
    expect(firstCallFor("v45").userMessage).not.toContain("ùkọ́lọ̀");
  });
});
