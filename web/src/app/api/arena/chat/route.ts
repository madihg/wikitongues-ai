import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { generateForCandidate, type RagChunk } from "@/lib/arena/providers";
import { searchRag } from "@/lib/rag";
import {
  retrieveGoldExamples,
  type GoldPoolEntry,
} from "@/lib/arena/gold-retrieval";
import { MAX_CHAT_MODELS } from "@/lib/arena/chat-selection";

/**
 * POST /api/arena/chat - talk to several registered candidates at once.
 *
 * Built so a native speaker can judge candidates conversationally. Automatic
 * scoring cannot see most of what is wrong with this output: chrF on an
 * 18-character target says nothing about whether a greeting is usable, whether
 * the register is right, or whether an answer is fluent Yoruba wearing Igala
 * spelling. A speaker finds that in one exchange.
 *
 * WHY THE RETRIEVAL IS ASSEMBLED THE SAME WAY AS THE BENCHMARK
 * ------------------------------------------------------------
 * A "+ Igala RAG" candidate scored on the frozen bank receives BOTH retrieved
 * knowledge chunks and retrieved community gold exemplars. If chat served only
 * one of those, the reviewer would be judging a system we never measured and
 * do not deploy, and her verdict would not transfer to the numbers. So this
 * route reproduces the same composition.
 *
 * TWO GUARDS THAT MATTER HERE
 * ---------------------------
 * 1. Holdout-sourced gold is excluded. Nothing here is scored, so this is not
 *    contamination in the strict sense - but it stops a chat window from
 *    displaying a frozen benchmark answer to the very people whose independent
 *    judgement the benchmark depends on.
 * 2. consentTraining is honoured on the exemplar pool, because using a
 *    speaker's answer as an in-context demonstration is exactly the use that
 *    flag governs.
 */

export const maxDuration = 120;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** How many exemplars and knowledge chunks a RAG candidate receives. */
const GOLD_K = 8;
const RAG_K = 4;

/** Cached across models within one request - the pool is identical for each. */
async function loadGoldPool(): Promise<GoldPoolEntry[]> {
  const rows = await prisma.coldAuthorAnswer.findMany({
    where: { isDemo: false, consentTraining: true },
    select: {
      id: true,
      promptId: true,
      answerText: true,
      bucket: true,
      consentTraining: true,
      isDemo: true,
      verificationStatus: true,
      prompt: {
        select: { promptId: true, text: true, isHoldout: true, bucket: true },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    promptId: r.promptId,
    promptRef: r.prompt.promptId,
    promptText: r.prompt.text,
    answerText: r.answerText,
    bucket: r.bucket ?? r.prompt.bucket,
    isHoldout: r.prompt.isHoldout,
    isDemo: r.isDemo,
    consentTraining: r.consentTraining,
    verificationStatus: r.verificationStatus,
  }));
}

export async function POST(req: Request) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  let body: { slugs?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slugs = Array.isArray(body.slugs)
    ? body.slugs.filter((s): s is string => typeof s === "string")
    : [];
  const messages = Array.isArray(body.messages)
    ? (body.messages.filter(
        (m): m is ChatTurn =>
          !!m &&
          typeof m === "object" &&
          (m as ChatTurn).role !== undefined &&
          typeof (m as ChatTurn).content === "string",
      ) as ChatTurn[])
    : [];

  if (slugs.length === 0) {
    return NextResponse.json({ error: "No models selected" }, { status: 400 });
  }
  if (slugs.length > MAX_CHAT_MODELS) {
    return NextResponse.json(
      { error: `At most ${MAX_CHAT_MODELS} models per message` },
      { status: 400 },
    );
  }

  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last?.content.trim()) {
    return NextResponse.json({ error: "No user message" }, { status: 400 });
  }
  const userMessage = last.content.trim();
  // Everything before the final user turn is prior conversation.
  const history = messages.slice(0, messages.lastIndexOf(last));

  const candidates = await prisma.candidateModel.findMany({
    where: { slug: { in: slugs }, archived: false },
  });
  if (candidates.length === 0) {
    return NextResponse.json({ error: "No such candidates" }, { status: 404 });
  }

  const needsRetrieval = candidates.some((c) => c.ragEnabled);
  const goldPool = needsRetrieval ? await loadGoldPool() : [];

  let ragContext: RagChunk[] = [];
  let goldExamples: { id: string; question: string; answer: string }[] = [];
  if (needsRetrieval) {
    try {
      const entries = await searchRag(userMessage, "igala", RAG_K);
      ragContext = entries.map((e) => ({
        id: e.id,
        content: e.content,
        topic: e.topic,
        chunkType: e.chunkType,
      }));
    } catch {
      // Degrade loudly in the response rather than silently serving nothing.
      ragContext = [];
    }
    const retrieved = retrieveGoldExamples(
      // A free-text question belongs to no prompt. Marking it holdout keeps the
      // guard at its strictest, so no frozen-bank answer can be displayed here.
      {
        promptId: "__chat__",
        text: userMessage,
        bucket: null,
        isHoldout: true,
      },
      goldPool,
      { k: GOLD_K },
    );
    goldExamples = retrieved.examples.map((e) => ({
      id: e.id,
      question: e.question,
      answer: e.answer,
    }));
  }

  // Order the answers the way the caller listed the models, so the columns a
  // reviewer reads left-to-right match the order that was chosen for her.
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const ordered = slugs
    .map((s) => bySlug.get(s))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const replies = await Promise.all(
    ordered.map(async (candidate) => {
      const started = Date.now();
      try {
        const result = await generateForCandidate(candidate, {
          userMessage,
          conversationHistory: history,
          ragContext,
          goldExamples,
        });
        return {
          slug: candidate.slug,
          name: candidate.name,
          text: result.text,
          latencyMs: result.latencyMs,
          tokensIn: result.tokensIn ?? null,
          tokensOut: result.tokensOut ?? null,
          retrievedChunks: candidate.ragEnabled ? ragContext.length : 0,
          retrievedExemplars: candidate.ragEnabled ? goldExamples.length : 0,
          error: null as string | null,
        };
      } catch (e) {
        // One dead provider key must not blank the whole comparison - the other
        // models still have something worth reading.
        return {
          slug: candidate.slug,
          name: candidate.name,
          text: "",
          latencyMs: Date.now() - started,
          tokensIn: null,
          tokensOut: null,
          retrievedChunks: 0,
          retrievedExemplars: 0,
          error: (e as Error).message.slice(0, 300),
        };
      }
    }),
  );

  return NextResponse.json({ replies });
}
