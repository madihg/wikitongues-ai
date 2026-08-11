import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { ModelChat, type ChatCandidate } from "@/components/arena/model-chat";
import { HelpButton } from "@/components/help-button";
import { InfoTip } from "@/components/info-tip";

/**
 * Talk to the candidates. The surface that exists because the metrics cannot
 * answer the question that matters.
 *
 * chrF on an 18-character target says nothing about whether a greeting is
 * usable, whether the register is right for an elder, or whether an answer is
 * fluent Yoruba in Igala spelling. Across 781 blind comparisons the annotators
 * called both answers inadequate 775 times, which tells us the output is bad
 * but not HOW. A speaker in conversation finds that out in one exchange.
 *
 * The model selection lives in the URL so a curated set can be handed over as
 * a link: whoever opens it lands on exactly the models that were chosen.
 */
export const dynamic = "force-dynamic";

async function ChatSurface() {
  const candidates = await prisma.candidateModel.findMany({
    where: { archived: false, language: "igala" },
    select: { slug: true, name: true, kind: true, ragEnabled: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  // Order the picker the way a curator thinks: the adapted candidates first,
  // untouched baselines last, since baselines are mostly there as a control.
  const rank = (k: string) => (k === "rag" ? 0 : k === "sft" ? 1 : 2);
  const list: ChatCandidate[] = candidates
    .map((c) => ({ ...c, score: null }))
    .sort(
      (a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name),
    );

  return <ModelChat candidates={list} />;
}

export default function ArenaChatPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl text-text-primary">
          Chat with the models
          <InfoTip label="About this page" width="w-96">
            Every selected model answers the same question at once, side by
            side. This is for the judgement automatic scoring cannot make:
            whether an answer is usable Igala, whether the register fits, and
            whether a fluent-looking answer is actually Yoruba. Retrieval-backed
            candidates receive the same community exemplars and reference
            material here as they do on the benchmark, so what you read is the
            system we measure and would deploy - not a different one.
          </InfoTip>
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-text-secondary">
          Pick the models, ask a question, compare the answers. The selection is
          stored in the page address, so &ldquo;Copy link to share&rdquo; hands
          someone else exactly the set you chose.
        </p>
      </div>

      <Suspense
        fallback={
          <p className="text-sm text-text-tertiary">Loading candidates…</p>
        }
      >
        <ChatSurface />
      </Suspense>

      <HelpButton
        title="Chat with the models"
        description="A side-by-side conversation with several registered candidates at once. Every model receives the identical question and, for retrieval-backed candidates, the identical retrieved context - the same eight community gold exemplars and four reference chunks the benchmark serves them, so a verdict here transfers to the numbers on the Automatic eval tab. Each model keeps its own conversation history, so the models never see each other's answers and the comparison stays independent. Gold answers from the frozen benchmark are excluded from retrieval here, so this page cannot display a held-out answer to the people whose independent judgement that benchmark depends on. Nothing typed here is recorded as annotation data: it does not enter training, the leaderboard, or any fine-tune source. Each message costs a real API call per selected model, which is why at most six can be selected at once."
      />
    </div>
  );
}
