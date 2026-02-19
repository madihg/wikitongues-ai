import { PromptList } from "@/components/prompt-list";
import { HelpButton } from "@/components/help-button";

export default function PromptsPage() {
  return (
    <>
      <PromptList />
      <HelpButton
        title="Prompts"
        description="This screen lists all the prompts in the evaluation catalogue. Prompts are the questions and tasks used to test AI models on their knowledge of languages and cultures. You can browse, search, and manage prompts here. Well-crafted prompts are essential to generating meaningful annotations and accurate benchmark results."
      />
    </>
  );
}
