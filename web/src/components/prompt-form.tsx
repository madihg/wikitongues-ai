"use client";

import { useState, useEffect } from "react";
import { BUCKETS } from "@/lib/buckets";

interface PromptData {
  id?: string;
  promptId?: string;
  bucket: string;
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
  const [bucket, setBucket] = useState<string>(BUCKETS[0].key);
  const [language, setLanguage] = useState("");
  const [text, setText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [targetCulture, setTargetCulture] = useState("");
  const [expectedCulturalContext, setExpectedCulturalContext] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState("intermediate");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!prompt?.id;

  // Escape closes the modal from anywhere.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (prompt) {
      setBucket(prompt.bucket);
      setLanguage(prompt.language);
      setText(prompt.text);
      setSourceLanguage(prompt.sourceLanguage ?? "");
      setTargetCulture(prompt.targetCulture ?? "");
      setExpectedCulturalContext(prompt.expectedCulturalContext ?? "");
      setDifficultyLevel(prompt.difficultyLevel ?? "intermediate");
    } else {
      setBucket(BUCKETS[0].key);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!bucket || !language || !text.trim()) {
      setError("Bucket, language, and text are required.");
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
          bucket,
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
    // Backdrop click and Escape both dismiss (2026-07-02 call: Agnes couldn't
    // close the modal by clicking outside it).
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-surface shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {isEditing ? "Edit Prompt" : "Create Prompt"}
          </h2>
          <button
            onClick={onClose}
            className="cursor-pointer text-text-muted hover:text-text-secondary"
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
            <div className="rounded-md bg-danger-subtle px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary">
                Bucket <span className="text-danger">*</span>
              </label>
              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none"
              >
                {BUCKETS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary">
                Language <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="igala"
                className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary">
              Prompt Text <span className="text-danger">*</span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              dir="ltr"
              placeholder="Enter the prompt text..."
              className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary">
                Source Language
              </label>
              <input
                type="text"
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary">
                Target Culture
              </label>
              <input
                type="text"
                value={targetCulture}
                onChange={(e) => setTargetCulture(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary">
              Expected Cultural Context
            </label>
            <textarea
              value={expectedCulturalContext}
              onChange={(e) => setExpectedCulturalContext(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border border-border-strong px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary">
              Difficulty Level
            </label>
            <select
              value={difficultyLevel}
              onChange={(e) => setDifficultyLevel(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
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
