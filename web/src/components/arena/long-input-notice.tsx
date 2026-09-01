import { longInputNotice } from "@/lib/arena/turn-budget";

/**
 * The pre-flight warning under the composer: this passage is long enough that
 * the answer may not finish inside the platform's time limit.
 *
 * WHY IT WARNS AND NEVER BLOCKS
 * ----------------------------
 * The incident behind the turn budget started with a researcher pasting a long
 * English paragraph for translation. She was entitled to do that; the failure
 * was ours, and the honest response is to say what is likely rather than to
 * refuse. Three things this deliberately does NOT do:
 *
 *   - it does not disable the send button. A warning that stops you is a
 *     policy, and we have no basis for one: the long turn might well finish.
 *   - it does not truncate the input. Silently shortening a question and then
 *     answering it confidently is worse than any timeout.
 *   - it does not name a duration. What it can honestly say is that long is
 *     slower and riskier, and that splitting works.
 *
 * A separate component so the rule can be tested without mounting the whole
 * chat page, and so the composer's disabled logic and this notice cannot get
 * tangled together by a later edit.
 */
export function LongInputNotice({ text }: { text: string }) {
  const notice = longInputNotice(text);
  if (notice === null) return null;
  return (
    <p
      className="mt-2 text-xs text-text-secondary"
      role="status"
      aria-live="polite"
      data-testid="long-input-notice"
    >
      {notice}
    </p>
  );
}
