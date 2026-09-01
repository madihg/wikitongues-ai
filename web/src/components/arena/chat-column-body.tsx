import { REASK_SKIPPED_NOTICE } from "@/lib/arena/turn-budget";
import type { StreamingReply } from "@/lib/arena/chat-stream";

/**
 * What one chat column SAYS: the repair-round note, the answer, and - when
 * there is one - the failure.
 *
 * WHY THIS IS ITS OWN COMPONENT
 * -----------------------------
 * It used to be an inline ternary in model-chat.tsx that read
 * `r.error ? <the error> : <the text>`, and that ternary is the reason the
 * incident looked the way it did. A turn killed by the platform time limit has
 * BOTH: real partial output the model produced, and an explanation for why it
 * stops mid-sentence. Rendering them as alternatives threw the answer away at
 * the last possible moment - after it had crossed the network and reached the
 * component that was about to display it.
 *
 * Text and error are therefore independent here, and the whole thing is
 * extracted so every state a column can be in is a two-line test instead of a
 * browser session: empty and waiting, empty and finished, streaming, finished,
 * failed outright, cut short with text, rewritten, and flagged-but-not-
 * rewritten.
 */
export function ChatColumnBody({ reply }: { reply: StreamingReply }) {
  return (
    <>
      {/* The repair round rewrote this column: say so, and say why, rather
          than letting the text silently change under a reviewer who was
          already reading it. When the turn ran out of budget to rewrite, the
          flagged FIRST answer is what she is reading, and she has to be told
          that too - a silent pass would be the worst of the three. */}
      {reply.revisedFor && (
        <p className="mb-2 text-[11px] text-text-tertiary">
          {reply.revisionApplied ? (
            <>
              {reply.done ? "Rewrote" : "Rewriting"} its answer
              {reply.revisedFor.length > 0
                ? `: the first attempt used ${reply.revisedFor.join(", ")}.`
                : "."}
            </>
          ) : (
            <>
              The check flagged this answer
              {reply.revisedFor.length > 0
                ? ` for ${reply.revisedFor.join(", ")}`
                : ""}
              , and {REASK_SKIPPED_NOTICE}.
            </>
          )}
        </p>
      )}

      {/* Text and error are NOT alternatives - see the note above. */}
      {reply.text ? (
        <p className="flex-1 whitespace-pre-wrap text-base leading-relaxed text-text-primary">
          {reply.text}
        </p>
      ) : !reply.error ? (
        <p className="flex-1 text-base leading-relaxed text-text-tertiary">
          {reply.done ? "(empty response)" : "…"}
        </p>
      ) : null}

      {reply.error && (
        <p className={`text-xs text-danger${reply.text ? " mt-2" : ""}`}>
          {reply.error}
        </p>
      )}
    </>
  );
}
