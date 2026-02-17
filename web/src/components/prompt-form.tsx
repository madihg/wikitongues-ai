"use client";

import { useState, useEffect } from "react";

interface PromptData {
  id?: string;
  promptId?: string;
  category: string;
  language: string;
  text: string;
  sourceLanguage: string | null;
  targetCulture: string | null;
  expectedCulturalContext: string | null;
  difficultyLevel: string;
}

interface PromptFormProps {
  prompt?: PromptData | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = [
  { value: "real_world_use", label: "Real World Use" },
  { value: "words_concepts", label: "Words & Concepts" },
  { value: "frontier_aspirations", label: "Frontier Aspirations" },
  { value: "abstract_vs_everyday", label: "Abstract vs Everyday" },
];

const DIFFICULTIES = [
  { value: "basic", label: "Basic" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export function PromptForm({
  prompt,
  open,
  onClose,
  onSuccess,
}: PromptFormProps) {
  const [category, setCategory] = useState("real_world_use");
  const [language, setLanguage] = useState("");
  const [text, setText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [targetCulture, setTargetCulture] = useState("");
  const [expectedCulturalContext, setExpectedCulturalContext] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState("intermediate");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!prompt?.id;

  useEffect(() => {
    if (prompt) {
      setCategory(prompt.category);
      setLanguage(prompt.language);
      setText(prompt.text);
      setSourceLanguage(prompt.sourceLanguage ?? "");
      setTargetCulture(prompt.targetCulture ?? "");
      setExpectedCulturalContext(prompt.expectedCulturalContext ?? "");
      setDifficultyLevel(prompt.difficultyLevel ?? "intermediate");
    } else {
      setCategory("real_world_use");
      setLanguage("");
      setText("");
      setSourceLanguage("");
      setTargetCulture("");
      setExpectedCulturalContext("");
      setDifficultyLevel("intermediate");
    }
    setError("");
  }, [prompt, open]);

  if (!open) return null;

  const isArabic = language === "lebanese_arabic";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!category || !language || !text.trim()) {
      setError("Category, language, and text are required.");
      return;
    }

    setSaving(true);
    try {
      const url = isEditing ? `/api/prompts/${prompt!.id}` : "/api/prompts";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          language,
          text: text.trim(),
          sourceLanguage: sourceLanguage || undefined,
          targetCulture: targetCulture || undefined,
          expectedCulturalContext: expectedCulturalContext || undefined,
          difficultyLevel,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save prompt");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? "Edit Prompt" : "Create Prompt"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          {error && (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Language <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="e.g. igala, lebanese_arabic"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Prompt Text <span className="text-red-500">*</span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              dir={isArabic ? "rtl" : "ltr"}
              placeholder="Enter the prompt text..."
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Source Language
              </label>
              <input
                type="text"
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Target Culture
              </label>
              <input
                type="text"
                value={targetCulture}
                onChange={(e) => setTargetCulture(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Expected Cultural Context
            </label>
            <textarea
              value={expectedCulturalContext}
              onChange={(e) => setExpectedCulturalContext(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Difficulty Level
            </label>
            <select
              value={difficultyLevel}
              onChange={(e) => setDifficultyLevel(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : isEditing
                  ? "Update Prompt"
                  : "Create Prompt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
