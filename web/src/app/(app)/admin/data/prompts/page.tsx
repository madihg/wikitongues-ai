import { PromptList } from "@/components/prompt-list";
import { PromptsLeadBanner } from "@/components/prompts-lead-banner";
import { HelpButton } from "@/components/help-button";

/**
 * Data, Prompts: the question bank, the same list and editor that
 * /annotator/prompts renders (that address still works).
 */
export default function DataPromptsPage() {
  return (
    <>
      <PromptsLeadBanner />
      <PromptList />
      <HelpButton
        title="Prompts"
        description="This screen lists all the prompts in the evaluation catalogue. Prompts are the questions and tasks used to test AI models on their knowledge of languages and cultures. You can browse, search, and manage prompts here. Well-crafted prompts are essential to generating meaningful annotations and accurate benchmark results."
      />
    </>
  );
}
