"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: "ai" | "human" | "ai_pending_review";
  confidenceScore?: number | null;
  createdAt?: string;
}

export function ChatInterface() {
  const [language, setLanguage] = useState<string>("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isRtl = language === "lebanese_arabic";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !language || loading) return;

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: userMessage.content,
          language,
        }),
      });

      if (res.status === 429) {
        setError("Rate limit exceeded. Please wait a moment.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (data.isNewConversation) {
        setConversationId(data.conversationId);
      }

      const assistantMessage: Message = {
        id: data.message?.id ?? `msg-${Date.now()}`,
        role: "assistant",
        content: data.message?.content ?? data.responseText,
        source: data.message?.source ?? "ai",
        confidenceScore: data.message?.confidenceScore ?? null,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setError("Failed to send message. Please try again.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
    setError(null);
  }

  // Language selection screen
  if (!language) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="mb-2 text-2xl font-semibold text-gray-900">
            Choose Your Language
          </h2>
          <p className="mb-8 text-gray-500">
            Select the language you want to practice
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => setLanguage("igala")}
              className="flex-1 rounded-lg border-2 border-gray-200 px-6 py-8 transition-all hover:border-gray-900 hover:shadow-md"
            >
              <div className="text-3xl mb-2">🇳🇬</div>
              <div className="font-semibold text-gray-900">Igala</div>
              <div className="mt-1 text-sm text-gray-500">
                Kogi State, Nigeria
              </div>
            </button>
            <button
              onClick={() => setLanguage("lebanese_arabic")}
              className="flex-1 rounded-lg border-2 border-gray-200 px-6 py-8 transition-all hover:border-gray-900 hover:shadow-md"
            >
              <div className="text-3xl mb-2">🇱🇧</div>
              <div className="font-semibold text-gray-900">Lebanese Arabic</div>
              <div className="mt-1 text-sm text-gray-500">
                Levantine dialect
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg">{language === "igala" ? "🇳🇬" : "🇱🇧"}</span>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {language === "igala" ? "Igala" : "Lebanese Arabic"}
            </h2>
            <p className="text-xs text-gray-500">Language Learning Chat</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={startNewConversation}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            New Chat
          </button>
          <button
            onClick={() => {
              setLanguage("");
              startNewConversation();
            }}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Switch Language
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium text-gray-900">
                {language === "igala"
                  ? "Ene o! Start practicing Igala"
                  : "!أهلا وسهلا Start practicing Lebanese Arabic"}
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Type a message to begin your conversation
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
                dir={isRtl ? "rtl" : "ltr"}
              >
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>

                {/* Source indicator */}
                {msg.role === "assistant" && msg.source && (
                  <div className="mt-2 flex items-center gap-2">
                    {msg.source === "ai" && (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        AI Verified
                      </span>
                    )}
                    {msg.source === "ai_pending_review" && (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                        Pending Human Review
                      </span>
                    )}
                    {msg.source === "human" && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        Human Reviewed
                      </span>
                    )}
                    {msg.confidenceScore != null && (
                      <span className="text-xs text-gray-400">
                        {Math.round(msg.confidenceScore)}% confidence
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-gray-100 px-4 py-3">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mb-2 rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={sendMessage}
        className="border-t border-gray-200 px-6 py-4"
      >
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(e);
              }
            }}
            placeholder={
              language === "igala"
                ? "Type your message in English or Igala..."
                : "...اكتب رسالتك بالعربي أو بالإنكليزي"
            }
            dir={isRtl ? "rtl" : "ltr"}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-gray-500 focus:ring-0 focus:outline-none"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
