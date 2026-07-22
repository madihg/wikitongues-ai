/**
 * Shared Igala-forcing generation instruction and few-shot scaffold.
 *
 * Every path that asks a model to answer an Igala prompt and stores the
 * result as a ModelOutput row - prisma/seed-outputs.ts (bulk backfill) and
 * the arena eval-run generator (src/app/api/arena/eval-runs/[id]/generate) -
 * flows through generateForCandidate() in src/lib/arena/providers.ts, which
 * imports this module. Fix generation here once and every path picks it up.
 * (The live translator/tutor chat in src/lib/agents/translator.ts also calls
 * generateForCandidate(), so it gets the same fix for free.)
 */

/**
 * Hard language-forcing system instruction. Verbatim text agreed after
 * Agnes caught pure Yoruba/Igbo outputs on a live annotation call, and
 * annotators were grading English scaffolding wrapped around Igala
 * fragments instead of Igala itself.
 *
 * Applied as the system message on every provider wired in this app
 * (Anthropic, OpenAI, Google, and OpenAI-compatible endpoints all accept a
 * system message through the Vercel AI SDK's generateText - see
 * providers.ts#resolveModel) - never a plain-text prepend to the user
 * message, since none of the providers used here need that fallback.
 */
export const IGALA_FORCING_INSTRUCTION =
  "You are answering as a fluent native speaker of Igala, the Yoruboid language of Kogi State, Nigeria. " +
  "Igala is NOT Yoruba, NOT Igbo, and NOT Nigerian Pidgin - answer in Igala specifically. " +
  "Write your entire answer in Igala, using standard Igala orthography with tone marks and dotted vowels (ẹ, ọ) where they belong. " +
  "Always give your best attempt in Igala even if you are unsure - do not switch to English to explain uncertainty, and do not wrap the answer in English framing such as 'The Igala word is...'. " +
  "Include English ONLY if the prompt explicitly asks for an English explanation or translation - and then give the Igala first, followed by the minimal English requested. " +
  "Output only the answer itself - no preamble, no meta-commentary, no unrequested translations.";

export interface FewShotExample {
  question: string;
  answer: string;
}

/**
 * Community-vetted Igala Q/A pairs used as few-shot exemplars ahead of the
 * real prompt. In-language few-shot exemplars are the strongest known lever
 * for forcing target-language-only output, stronger than a system prompt
 * alone - but a bad exemplar teaches the model a bad habit just as fast, so
 * this list must only ever contain examples that have cleared community
 * review (Agnes-verified cold answers), never something drafted to fill the
 * slot.
 *
 * EMPTY BY DESIGN. We have roughly 4 candidate gold answers today and none
 * have been verified yet, so this stays empty and generation runs on the
 * system-prompt-only design (see buildFewShotTurns below). Fill it in once
 * vetting lands, one {question, answer} pair per verified example. Never add
 * an example whose question is the same prompt being generated for -
 * buildFewShotTurns guards against that at runtime, but do not rely on the
 * runtime guard when curating this list; check it by hand too.
 */
export const IGALA_FEW_SHOT_EXAMPLES: FewShotExample[] = [];

/**
 * Turn IGALA_FEW_SHOT_EXAMPLES into prior user/assistant chat turns to
 * prepend before the real prompt. Every provider wired in providers.ts
 * (Anthropic, OpenAI, Google, OpenAI-compatible) takes multi-turn chat
 * messages via the AI SDK, so exemplars are modeled as real prior turns -
 * there is no single-turn/completion-only provider in this app that would
 * need a formatted-block fallback instead.
 *
 * Returns [] whenever IGALA_FEW_SHOT_EXAMPLES is empty, so behavior is
 * exactly the current system-prompt-only design until the list is filled.
 *
 * Defensively drops any example whose question exactly matches the prompt
 * currently being generated for, so a leaked answer can never appear both as
 * exemplar and as the thing being graded.
 */
export function buildFewShotTurns(
  currentUserMessage: string,
): { role: "user" | "assistant"; content: string }[] {
  const current = currentUserMessage.trim();
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const ex of IGALA_FEW_SHOT_EXAMPLES) {
    if (ex.question.trim() === current) continue; // never echo the answer being graded
    turns.push({ role: "user", content: ex.question });
    turns.push({ role: "assistant", content: ex.answer });
  }
  return turns;
}
