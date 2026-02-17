export interface AgentContext {
  language: string;
  conversationHistory?: { role: string; content: string }[];
}
