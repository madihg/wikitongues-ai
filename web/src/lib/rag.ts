import { prisma } from "./prisma";
import type { RagEntry } from "@prisma/client";
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

// ─── Embedding ───────────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

// ─── Search ──────────────────────────────────────────────────

/**
 * Search RAG entries by semantic similarity (pgvector) with a keyword fallback.
 */
export async function searchRag(
  query: string,
  language: string,
  limit = 5,
): Promise<RagEntry[]> {
  try {
    return await searchRagVector(query, language, limit);
  } catch {
    // pgvector not available or no embeddings — fall back to keyword search
    return searchRagKeyword(query, language, limit);
  }
}

async function searchRagVector(
  query: string,
  language: string,
  limit: number,
): Promise<RagEntry[]> {
  const queryEmbedding = await embedText(query);
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  const results = await prisma.$queryRawUnsafe<RagEntry[]>(
    `SELECT id, language, "chunkType", topic, content, source,
            "verificationStatus", "annotatorId", "createdAt", "updatedAt"
     FROM "RagEntry"
     WHERE language = $1
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    language,
    vectorLiteral,
    limit,
  );

  return results;
}

async function searchRagKeyword(
  query: string,
  language: string,
  limit: number,
): Promise<RagEntry[]> {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) {
    return prisma.ragEntry.findMany({
      where: { language },
      take: limit,
      orderBy: { updatedAt: "desc" },
    });
  }

  return prisma.ragEntry.findMany({
    where: {
      language,
      OR: words.flatMap((word) => [
        { content: { contains: word, mode: "insensitive" } },
        { topic: { contains: word, mode: "insensitive" } },
      ]),
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
}

// ─── Ingest ──────────────────────────────────────────────────

export async function ingestRagEntry(data: {
  language: string;
  chunkType: string;
  topic: string;
  content: string;
  source: string;
  annotatorId?: string;
}): Promise<RagEntry> {
  let embeddingVector: number[] | null = null;
  try {
    embeddingVector = await embedText(`${data.topic}\n${data.content}`);
  } catch {
    // OpenAI key missing or API unavailable — store without embedding
  }

  if (embeddingVector) {
    const vectorLiteral = `[${embeddingVector.join(",")}]`;
    const [entry] = await prisma.$queryRawUnsafe<RagEntry[]>(
      `INSERT INTO "RagEntry" (id, language, "chunkType", topic, content, source, "verificationStatus", "annotatorId", embedding, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'seed', $6, $7::vector, now(), now())
       RETURNING id, language, "chunkType", topic, content, source, "verificationStatus", "annotatorId", "createdAt", "updatedAt"`,
      data.language,
      data.chunkType,
      data.topic,
      data.content,
      data.source,
      data.annotatorId ?? null,
      vectorLiteral,
    );
    return entry;
  }

  return prisma.ragEntry.create({ data });
}

// ─── Update ──────────────────────────────────────────────────

export async function updateRagEntry(
  id: string,
  content: string,
  editedById: string,
  reason: string,
): Promise<RagEntry> {
  const existing = await prisma.ragEntry.findUniqueOrThrow({ where: { id } });

  // Save history
  await prisma.ragEntryHistory.create({
    data: {
      ragEntryId: id,
      content: existing.content,
      editedById,
      reason,
    },
  });

  // Recompute embedding if possible
  let embeddingVector: number[] | null = null;
  try {
    embeddingVector = await embedText(`${existing.topic}\n${content}`);
  } catch {
    // Skip embedding update
  }

  if (embeddingVector) {
    const vectorLiteral = `[${embeddingVector.join(",")}]`;
    const [updated] = await prisma.$queryRawUnsafe<RagEntry[]>(
      `UPDATE "RagEntry"
       SET content = $1, embedding = $2::vector, "updatedAt" = now()
       WHERE id = $3
       RETURNING id, language, "chunkType", topic, content, source, "verificationStatus", "annotatorId", "createdAt", "updatedAt"`,
      content,
      vectorLiteral,
      id,
    );
    return updated;
  }

  return prisma.ragEntry.update({
    where: { id },
    data: { content },
  });
}
