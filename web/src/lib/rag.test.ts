import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The v1 RagEntry search must never return the v4.5-only grammar rows: they
 * are served by the rag-v4-5 grammar block alone, and seeding them must not
 * change any rag-v1 column. Both paths are pinned: the pgvector query binds
 * the excluded chunkTypes as a parameter, and both keyword findMany calls
 * filter them out.
 */
const { mockPrisma, mockEmbed } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRawUnsafe: vi.fn(),
    ragEntry: { findMany: vi.fn() },
  },
  mockEmbed: vi.fn(),
}));

vi.mock("./prisma", () => ({ prisma: mockPrisma }));
vi.mock("openai", () => ({
  default: class {
    embeddings = { create: mockEmbed };
  },
}));

import { searchRag } from "./rag";
import { V4_5_ONLY_CHUNK_TYPES } from "./arena/grammar-chunk-types";

beforeEach(() => {
  vi.clearAllMocks();
  mockEmbed.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });
  mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  mockPrisma.ragEntry.findMany.mockResolvedValue([]);
});

describe("searchRag excludes the v4.5-only chunkTypes", () => {
  it("names both v4.5 chunkTypes", () => {
    expect([...V4_5_ONLY_CHUNK_TYPES]).toEqual([
      "grammar_rule_v4_5",
      "grammar_rule_v4_5_tone",
    ]);
  });

  it("vector path: the SQL excludes them, bound as a parameter", async () => {
    await searchRag("water", "igala", 5);
    const [sql, ...params] = mockPrisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain(`AND NOT ("chunkType" = ANY($4::text[]))`);
    expect(params[3]).toEqual([...V4_5_ONLY_CHUNK_TYPES]);
    expect(mockPrisma.ragEntry.findMany).not.toHaveBeenCalled();
  });

  it("keyword fallback, with words: chunkType notIn the v4.5 types", async () => {
    mockPrisma.$queryRawUnsafe.mockRejectedValueOnce(new Error("no pgvector"));
    await searchRag("water and fire", "igala", 5);
    const args = mockPrisma.ragEntry.findMany.mock.calls[0][0];
    expect(args.where.chunkType).toEqual({ notIn: [...V4_5_ONLY_CHUNK_TYPES] });
    expect(args.where.language).toBe("igala");
  });

  it("keyword fallback, no usable words: still excludes them", async () => {
    mockPrisma.$queryRawUnsafe.mockRejectedValueOnce(new Error("no pgvector"));
    await searchRag("a b", "igala", 5);
    const args = mockPrisma.ragEntry.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      language: "igala",
      chunkType: { notIn: [...V4_5_ONLY_CHUNK_TYPES] },
    });
  });
});
