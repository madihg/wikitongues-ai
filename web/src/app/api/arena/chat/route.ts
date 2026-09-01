import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { streamForCandidate, type RagChunk } from "@/lib/arena/providers";
import {
  encodeChatEvent,
  type ChatReply,
  type ChatStreamEvent,
} from "@/lib/arena/chat-stream";
import { searchRag } from "@/lib/rag";
import {
  retrieveGoldExamples,
  type GoldPoolEntry,
} from "@/lib/arena/gold-retrieval";
import { MAX_CHAT_MODELS } from "@/lib/arena/chat-selection";
import {
  buildRetrievalV2,
  type RetrievalV2Result,
} from "@/lib/arena/retrieval-v2";
import {
  buildRetrievalV4,
  type RetrievalV4Result,
} from "@/lib/arena/retrieval-v4";
import { IGALA_SYSTEM_V2, buildUserTurnV2 } from "@/lib/generation-prompt-v2";
import { IGALA_SYSTEM_V3 } from "@/lib/generation-prompt-v3";
import { IGALA_SYSTEM_V4, buildUserTurnV4 } from "@/lib/generation-prompt-v4";

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

/**
 * The v1 retrieval context: encyclopedic chunks and gold exemplars for
 * candidates still on the original composition. The two legs are independent,
 * so they run concurrently.
 */
async function loadV1Context(userMessage: string): Promise<{
  ragContext: RagChunk[];
  goldExamples: { id: string; question: string; answer: string }[];
}> {
  const [ragContext, goldPool] = await Promise.all([
    searchRag(userMessage, "igala", RAG_K)
      .then((entries) =>
        entries.map((e) => ({
          id: e.id,
          content: e.content,
          topic: e.topic,
          chunkType: e.chunkType,
        })),
      )
      // Degrade loudly in the response rather than silently serving nothing.
      .catch(() => [] as RagChunk[]),
    loadGoldPool(),
  ]);
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
  return {
    ragContext,
    goldExamples: retrieved.examples.map((e) => ({
      id: e.id,
      question: e.question,
      answer: e.answer,
    })),
  };
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

  // rag-v2/rag-v3/rag-v4 candidates use their versioned retrieval paths
  // exclusively, so the v1 retrieval below only runs when a v1 RAG candidate
  // is actually selected - v1 composition for v1 candidates stays
  // byte-identical either way.
  const needsRetrieval = candidates.some(
    (c) =>
      c.ragEnabled &&
      c.versionLabel !== "rag-v2" &&
      c.versionLabel !== "rag-v3" &&
      c.versionLabel !== "rag-v4",
  );

  // The three per-version context builds are independent of each other, so
  // they run CONCURRENTLY - a mixed selection (a v1 candidate beside a v3 and
  // a v4) used to pay for all three sequentially before any model was even
  // called. Each build keeps its exact former inputs, so every version's
  // composition stays byte-identical.
  //
  // One v2 context per request, shared by every rag-v2 AND rag-v3 candidate -
  // v3 changes only the system prompt (the enshrined grammar), never the
  // retrieval composition, so the two labels share one build. A free-text
  // chat question belongs to no prompt, so promptId is synthetic and
  // isHoldout is forced true: the strictest guard, so no frozen-bank answer
  // can ever be displayed to the very reviewers whose independent judgement
  // the benchmark depends on.
  //
  // rag-v4 gets its OWN build (never shared with v2/v3): its retrieval
  // composition differs - source-diversified parallel pairs plus the
  // corrections block - so sharing would either change the v2/v3 serving
  // (forbidden: those paths are frozen for comparability) or serve v4
  // candidates a context nobody registered. Same synthetic-holdout guard.
  const chatQuery = {
    promptId: "__chat__",
    text: userMessage,
    bucket: null,
    isHoldout: true,
  };
  const [v2, v4, v1] = await Promise.all([
    candidates.some(
      (c) => c.versionLabel === "rag-v2" || c.versionLabel === "rag-v3",
    )
      ? buildRetrievalV2(prisma, chatQuery)
      : Promise.resolve<RetrievalV2Result | null>(null),
    candidates.some((c) => c.versionLabel === "rag-v4")
      ? buildRetrievalV4(prisma, chatQuery)
      : Promise.resolve<RetrievalV4Result | null>(null),
    needsRetrieval
      ? loadV1Context(userMessage)
      : Promise.resolve({
          ragContext: [] as RagChunk[],
          goldExamples: [] as {
            id: string;
            question: string;
            answer: string;
          }[],
        }),
  ]);
  const { ragContext, goldExamples } = v1;

  // Order the answers the way the caller listed the models, so the columns a
  // reviewer reads left-to-right match the order that was chosen for her.
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const ordered = slugs
    .map((s) => bySlug.get(s))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  // STREAMING, NOT BUFFERING. The buffered version held the response until
  // the SLOWEST provider finished its LAST token - the reviewer stared at a
  // spinner for the entire completion time, which is what "the v3 arm is
  // slow" mostly was. Now every model's tokens are forwarded as they arrive,
  // multiplexed over one NDJSON response (see chat-stream.ts). Each model's
  // closing `reply` event carries the exact object the buffered contract
  // returned, so accounting and error semantics are unchanged - one dead
  // provider key still must not blank the whole comparison.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeChatEvent(event)));
        } catch {
          // The client went away mid-stream; the providers' own iteration
          // still runs to completion, there is just nobody left to tell.
        }
      };

      void Promise.all(
        ordered.map(async (candidate) => {
          const started = Date.now();
          const isV2 =
            (candidate.versionLabel === "rag-v2" ||
              candidate.versionLabel === "rag-v3") &&
            v2 !== null;
          const isV4 = candidate.versionLabel === "rag-v4" && v4 !== null;
          const onDelta = (delta: string) =>
            send({ type: "delta", slug: candidate.slug, text: delta });
          let reply: ChatReply;
          try {
            // The v2/v3 path swaps all three levers at once: dictionary +
            // parallel examples appended to the user turn (dictionary last,
            // immediately above the question - the DiPMT position), gold
            // exemplars as prior turns, and the version's system prompt - the
            // ONLY thing that differs between rag-v2 and rag-v3. The v4 path
            // is the same shape with its own retrieval build (corrections
            // block + register-guarded, source-diversified pairs) and
            // IGALA_SYSTEM_V4. Everything flows through the same
            // streamForCandidate call so latency/token accounting and error
            // handling stay identical.
            const result = isV4
              ? await streamForCandidate(
                  candidate,
                  {
                    userMessage: buildUserTurnV4(userMessage, v4!, null),
                    conversationHistory: history,
                    goldExamples: v4!.exampleTurns,
                    systemPromptOverride: IGALA_SYSTEM_V4,
                  },
                  onDelta,
                )
              : isV2
                ? await streamForCandidate(
                    candidate,
                    {
                      userMessage: buildUserTurnV2(userMessage, v2!, null),
                      conversationHistory: history,
                      goldExamples: v2!.exampleTurns,
                      systemPromptOverride:
                        candidate.versionLabel === "rag-v3"
                          ? IGALA_SYSTEM_V3
                          : IGALA_SYSTEM_V2,
                    },
                    onDelta,
                  )
                : await streamForCandidate(
                    candidate,
                    {
                      userMessage,
                      conversationHistory: history,
                      ragContext,
                      goldExamples,
                    },
                    onDelta,
                  );
            reply = {
              slug: candidate.slug,
              name: candidate.name,
              text: result.text,
              latencyMs: result.latencyMs,
              tokensIn: result.tokensIn ?? null,
              tokensOut: result.tokensOut ?? null,
              // For v2/v4, "chunks" is the served lexicon + parallel (+ v4
              // corrections) material - the audit-trail ids minus the gold
              // exemplars.
              retrievedChunks: isV4
                ? v4!.contextIds.filter((id) => !id.startsWith("gold:")).length
                : isV2
                  ? v2!.contextIds.filter((id) => !id.startsWith("gold:"))
                      .length
                  : candidate.ragEnabled
                    ? ragContext.length
                    : 0,
              retrievedExemplars: isV4
                ? v4!.exampleTurns.length
                : isV2
                  ? v2!.exampleTurns.length
                  : candidate.ragEnabled
                    ? goldExamples.length
                    : 0,
              error: null,
            };
          } catch (e) {
            // One dead provider key must not blank the whole comparison - the
            // other models still have something worth reading.
            reply = {
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
          send({ type: "reply", reply });
        }),
      ).finally(() => {
        try {
          controller.close();
        } catch {
          // Already closed by cancellation.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
