import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { streamForCandidate, type RagChunk } from "@/lib/arena/providers";
import {
  describeViolations,
  streamWithRepairRound,
} from "@/lib/arena/repair-round";
import { buildV4FamilyTurn } from "@/lib/arena/frozen-exam";
import {
  encodeChatEvent,
  type ChatReply,
  type ChatStreamEvent,
  type ColumnStage,
} from "@/lib/arena/chat-stream";
import {
  formatServerTiming,
  timeStage,
  type TimedStage,
} from "@/lib/arena/server-timing";
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
import {
  CHAT_MAX_DURATION_S,
  deadlineAlarm,
  turnDeadlineFrom,
  TURN_CUTOFF_NOTICE,
} from "@/lib/arena/turn-budget";

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

/**
 * Next reads this at build time, so it must be a literal `export const` here -
 * but the NUMBER comes from turn-budget.ts, which also owns the ceiling the
 * platform actually enforces and the deadline every column is held to. The
 * incident that motivated all of this was exactly a declared number the
 * platform never honoured; one module now knows both figures and their
 * difference.
 */
export const maxDuration = CHAT_MAX_DURATION_S;

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

/**
 * The stream a turn returns when the deadline arrived before any model could
 * be called - during retrieval, the one pre-flush stage slow enough to spend a
 * whole budget.
 *
 * It is the ORDINARY wire format, not a special case: one `reply` per selected
 * column, each closed, each carrying the same plain-language cutoff notice a
 * mid-stream cutoff carries. A client needs no new code to render it, and the
 * reviewer gets a sentence instead of a bodiless gateway error.
 */
function cutoffOnlyStream(
  ordered: { slug: string; name: string }[],
  requestStart: number,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const candidate of ordered) {
        controller.enqueue(
          encoder.encode(
            encodeChatEvent({
              type: "reply",
              reply: {
                slug: candidate.slug,
                name: candidate.name,
                // Nothing was generated, so there is nothing to keep and
                // nothing to account for. The notice is the whole answer.
                text: "",
                latencyMs: Date.now() - requestStart,
                tokensIn: null,
                tokensOut: null,
                retrievedChunks: 0,
                retrievedExemplars: 0,
                error: TURN_CUTOFF_NOTICE,
              },
            }),
          ),
        );
      }
      controller.close();
    },
  });
}

export async function POST(req: Request) {
  // Server-Timing instrumentation. Every stage measured here is one that
  // completes BEFORE the response head is flushed, which on a streaming
  // response is the only thing a header can honestly report - see
  // server-timing.ts for what that excludes and where those numbers live
  // instead. The point is that "why is the chat slow" becomes a question you
  // answer from the network tab: retrieval build per version, separately
  // timed, next to the total time before the first byte.
  const requestStart = Date.now();
  // The whole turn is on one clock from here. Everything downstream - the
  // repair round's re-ask decision, the mid-stream cutoff - measures against
  // this single absolute moment rather than its own timer.
  const deadlineAt = turnDeadlineFrom(requestStart);
  let authMs = 0;
  let candidatesMs = 0;
  let retrievalV1Ms = 0;
  let retrievalV2Ms = 0;
  let retrievalV4Ms = 0;

  // The response head, built the same way whichever of the two streams below
  // is returned. Names and durations only, never a `desc` - the only free text
  // in reach of this route is the reviewer's question and the candidate
  // registry, and neither belongs in a response header. The stage SET is fixed
  // rather than conditional on the selection, so the header's shape describes
  // the route, not the request. formatServerTiming enforces an allowlist of
  // stage names, so a stage timed per candidate or per question could not
  // reach the wire even if someone added one - a candidate slug looks exactly
  // like a safe token, and only enumeration stops it.
  const chatStreamHeaders = (): HeadersInit => {
    const timingStages: TimedStage[] = [
      { name: "auth", durMs: authMs },
      { name: "candidates", durMs: candidatesMs },
      { name: "retrieval-v1", durMs: retrievalV1Ms },
      { name: "retrieval-v2", durMs: retrievalV2Ms },
      { name: "retrieval-v4", durMs: retrievalV4Ms },
      { name: "total", durMs: Date.now() - requestStart },
    ];
    return {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Server-Timing": formatServerTiming(timingStages),
    };
  };

  const guard = await timeStage(
    () => requireResearcher(),
    (ms) => (authMs = ms),
  );
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

  const candidates = await timeStage(
    () =>
      prisma.candidateModel.findMany({
        where: { slug: { in: slugs }, archived: false },
      }),
    (ms) => (candidatesMs = ms),
  );
  if (candidates.length === 0) {
    return NextResponse.json({ error: "No such candidates" }, { status: 404 });
  }

  // Order the answers the way the caller listed the models, so the columns a
  // reviewer reads left-to-right match the order that was chosen for her.
  // Decided BEFORE retrieval, because the deadline can arrive during retrieval
  // too and the cutoff response below has to know which columns to close.
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const ordered = slugs
    .map((s) => bySlug.get(s))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  // rag-v2/rag-v3/rag-v4/rag-v4-1 candidates use their versioned retrieval
  // paths exclusively, so the v1 retrieval below only runs when a v1 RAG
  // candidate is actually selected - v1 composition for v1 candidates stays
  // byte-identical either way.
  const needsRetrieval = candidates.some(
    (c) =>
      c.ragEnabled &&
      c.versionLabel !== "rag-v2" &&
      c.versionLabel !== "rag-v3" &&
      c.versionLabel !== "rag-v4" &&
      c.versionLabel !== "rag-v4-1",
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
  // rag-v4-1 SHARES the v4 build: v4.1 changes only the system prompt and
  // adds the repair round, never the retrieval composition (the spec pins
  // retrieval-v4.ts unchanged), so the two labels share one build the same
  // way rag-v2 and rag-v3 share the v2 build.
  const chatQuery = {
    promptId: "__chat__",
    text: userMessage,
    bucket: null,
    isHoldout: true,
  };
  //
  // Each leg is timed SEPARATELY even though they run concurrently: they are
  // the stages a "the v4 arm feels slow" report needs disambiguated, and a
  // single combined number would only ever report the slowest one.
  //
  // AND THE DEADLINE APPLIES HERE TOO. Retrieval runs BEFORE the response head
  // is flushed, so a turn that spends its whole budget assembling references
  // has no open stream to explain itself down - it is exactly the bodiless
  // gateway error again, one stage earlier. So the build races the same
  // deadline, and if the deadline wins the route answers with the ordinary
  // NDJSON stream: one closed column per model, each carrying the cutoff
  // notice. The abandoned queries finish into nothing, as they do when a
  // client disconnects.
  const retrievalAlarm = deadlineAlarm(deadlineAt);
  const built = await Promise.race([
    Promise.all([
      candidates.some(
        (c) => c.versionLabel === "rag-v2" || c.versionLabel === "rag-v3",
      )
        ? timeStage(
            () => buildRetrievalV2(prisma, chatQuery),
            (ms) => (retrievalV2Ms = ms),
          )
        : Promise.resolve<RetrievalV2Result | null>(null),
      candidates.some(
        (c) => c.versionLabel === "rag-v4" || c.versionLabel === "rag-v4-1",
      )
        ? timeStage(
            () => buildRetrievalV4(prisma, chatQuery),
            (ms) => (retrievalV4Ms = ms),
          )
        : Promise.resolve<RetrievalV4Result | null>(null),
      needsRetrieval
        ? timeStage(
            () => loadV1Context(userMessage),
            (ms) => (retrievalV1Ms = ms),
          )
        : Promise.resolve({
            ragContext: [] as RagChunk[],
            goldExamples: [] as {
              id: string;
              question: string;
              answer: string;
            }[],
          }),
    ]),
    retrievalAlarm.reached,
  ]);
  // Unconditional, on both outcomes: a live timer holds the event loop open
  // for the rest of the budget.
  retrievalAlarm.cancel();

  if (built === "deadline") {
    return new Response(cutoffOnlyStream(ordered, requestStart), {
      headers: chatStreamHeaders(),
    });
  }
  const [v2, v4, v1] = built;
  const { ragContext, goldExamples } = v1;

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

      // Per-column state the DEADLINE has to be able to reach: what has
      // already gone out on the wire for this column, and whether the column
      // has closed itself yet. Without this the cutoff below could only close
      // columns by throwing away everything they had streamed, which is the
      // half-fix - a red card instead of a red card with the answer in it.
      const columns = ordered.map((candidate) => ({
        candidate,
        started: Date.now(),
        streamed: "",
        settled: false,
      }));
      type Column = (typeof columns)[number];

      // A column closes EXACTLY ONCE, by whichever arrives first: its model,
      // a provider error, or the turn deadline.
      const settle = (column: Column, reply: ChatReply) => {
        if (column.settled) return;
        column.settled = true;
        send({ type: "reply", reply });
      };

      const runColumn = async (column: Column) => {
        const candidate = column.candidate;
        // Advisory progress for this column. A streaming column narrates
        // itself through its deltas; these events cover the gaps where it
        // cannot - the seconds before the first token, and the pause on the
        // repaired arm while the serving lint reads a finished attempt.
        // Fixed enum values only: no prompt text, no model id, nothing a
        // client could render as content.
        const sendStage = (stage: ColumnStage) =>
          send({ type: "stage", slug: candidate.slug, stage });
        const isV2 =
          (candidate.versionLabel === "rag-v2" ||
            candidate.versionLabel === "rag-v3") &&
          v2 !== null;
        const isV4 = candidate.versionLabel === "rag-v4" && v4 !== null;
        const isV41 = candidate.versionLabel === "rag-v4-1" && v4 !== null;
        // Every delta is BOTH sent and remembered: the remembered copy is
        // what a deadline-cut column serves as its partial answer, so the
        // reviewer keeps the text she was already reading.
        const onDelta = (delta: string) => {
          column.streamed += delta;
          send({ type: "delta", slug: candidate.slug, text: delta });
        };
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
          //
          // rag-v4-1 STREAMS TOO, repair applied after. It used to be the
          // one buffered column, because the repair round must see a
          // complete answer before it can judge it. But v4.1 is the
          // default-selected model, so buffering made the first thing every
          // reviewer saw a blank panel for the length of TWO generations -
          // 30-60s on an open-ended question, with no feedback. Now the
          // first attempt streams like any other column; if the checker
          // finds violations, a `revision` event tells the client to discard
          // what it has and names the rule families in plain language, and
          // the repaired attempt streams in its place. The closing `reply`
          // still carries the final text, so the FINAL RENDERED TEXT is
          // exactly what the buffered round would have produced - which is
          // what the exam measures (streamWithRepairRound and
          // generateWithRepairRound share one core, pinned by test).
          //
          // Both v4-family labels assemble their request through
          // buildV4FamilyTurn, the same builder the eval-generation route
          // and the frozen exam use, so chat cannot drift from the measured
          // composition. The only addition is conversationHistory: chat is a
          // conversation, the exam is one prompt.
          const v4Turn =
            isV4 || isV41
              ? buildV4FamilyTurn(
                  isV41 ? "rag-v4-1" : "rag-v4",
                  { text: userMessage, bucket: null },
                  v4!,
                )
              : null;
          // Every arm announces that its provider call has started, so a
          // column that has not produced a token yet still says something
          // truer than nothing. On the repaired arm the wrapper below also
          // marks the gap between attempts: attempt one returns, the lint
          // runs (`checking`), and if it re-asks, attempt two announces
          // `writing` again as it goes out.
          sendStage("writing");
          let attempt = 0;
          const result = isV41
            ? await streamWithRepairRound(
                candidate,
                { ...v4Turn!.args, conversationHistory: history },
                async (a, onAttemptDelta) => {
                  attempt += 1;
                  if (attempt > 1) sendStage("writing");
                  const generated = await streamForCandidate(
                    candidate,
                    a,
                    onAttemptDelta,
                  );
                  // Only the FIRST attempt is checked; after the second the
                  // column is finished and the `reply` event says so.
                  if (attempt === 1) sendStage("checking");
                  return generated;
                },
                {
                  onDelta,
                  onRevision: (violations, applied) => {
                    // An APPLIED revision replaces the column, so the
                    // partial text held for the deadline is superseded too:
                    // a cutoff during the rewrite must show the rewrite's
                    // prefix, never the abandoned first attempt.
                    if (applied) column.streamed = "";
                    send({
                      type: "revision",
                      slug: candidate.slug,
                      reasons: describeViolations(violations),
                      // Absent means applied - the historical meaning, and
                      // what every client already does with it.
                      ...(applied ? {} : { applied: false }),
                    });
                  },
                },
                // R8.3: saturation is requested behavior when the question
                // itself asks about tone. Same gate as the exam's.
                v4Turn!.opts,
                // THE ONLY CALLER THAT PASSES A BUDGET. The exam and the
                // eval route pass none and keep their exact behaviour; here
                // a lint violation found with no time left to rewrite keeps
                // the first answer instead of losing both to a 504.
                { deadlineMs: deadlineAt },
              )
            : isV4
              ? await streamForCandidate(
                  candidate,
                  { ...v4Turn!.args, conversationHistory: history },
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
            retrievedChunks:
              isV4 || isV41
                ? v4!.contextIds.filter((id) => !id.startsWith("gold:")).length
                : isV2
                  ? v2!.contextIds.filter((id) => !id.startsWith("gold:"))
                      .length
                  : candidate.ragEnabled
                    ? ragContext.length
                    : 0,
            retrievedExemplars:
              isV4 || isV41
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
          //
          // The partial text is KEPT here for the same reason the deadline
          // path keeps it: a provider that dies mid-stream (a 5xx from the
          // host, a dropped socket) has already put real tokens on the
          // reviewer's screen, and replacing them with a bare error string is
          // the empty-card failure again, one layer down. Text and error are
          // independent all the way to the component that renders them.
          reply = {
            slug: candidate.slug,
            name: candidate.name,
            text: column.streamed,
            latencyMs: Date.now() - column.started,
            tokensIn: null,
            tokensOut: null,
            retrievedChunks: 0,
            retrievedExemplars: 0,
            error: (e as Error).message.slice(0, 300),
          };
        }
        settle(column, reply);
      };

      // THE DEADLINE, ENFORCED.
      //
      // Past this point the platform is going to kill the function, and when
      // it does the client gets a gateway error with no body: no partial text,
      // no reason, nothing to render but an empty red card. So the route stops
      // FIRST, on its own terms, and spends its remaining margin saying what
      // happened through the wire format the client already speaks - one
      // `reply` per unfinished column, carrying the text that column had
      // already streamed plus a plain-language note in `error`.
      //
      // The abandoned provider calls keep running to completion in the
      // background; there is simply nobody left to tell, exactly as when a
      // client disconnects mid-stream.
      const alarm = deadlineAlarm(deadlineAt);
      const cutOff = alarm.reached.then(() => {
        for (const column of columns) {
          if (column.settled) continue;
          settle(column, {
            slug: column.candidate.slug,
            name: column.candidate.name,
            // The partial answer is KEPT. It is real output from the model
            // the reviewer asked, and it was already on her screen.
            text: column.streamed,
            latencyMs: Date.now() - column.started,
            // Nothing final to report: the generation never finished, and
            // inventing a token count for a cut-off answer would be a lie in
            // the one place the cost ledger reads from.
            tokensIn: null,
            tokensOut: null,
            retrievedChunks: 0,
            retrievedExemplars: 0,
            error: TURN_CUTOFF_NOTICE,
          });
        }
      });

      void Promise.race([Promise.all(columns.map(runColumn)), cutOff]).finally(
        () => {
          // Cancel unconditionally: a live timer for the length of the budget
          // would hold the event loop open long after the answer was served.
          alarm.cancel();
          try {
            controller.close();
          } catch {
            // Already closed by cancellation.
          }
        },
      );
    },
  });

  // The same head the cutoff-only response uses - see chatStreamHeaders above
  // for why the stage set is fixed and why no stage may carry free text.
  return new Response(stream, { headers: chatStreamHeaders() });
}
