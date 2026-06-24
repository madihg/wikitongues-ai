"use client";

import { useState, useEffect, useCallback } from "react";
import type { EvalBucket } from "@prisma/client";
import { BUCKETS, bucketLabel } from "@/lib/buckets";
import { PromptForm } from "./prompt-form";

interface Prompt {
  id: string;
  promptId: string;
  bucket: EvalBucket;
  language: string;
  text: string;
  sourceLanguage: string | null;
  targetCulture: string | null;
  expectedCulturalContext: string | null;
  difficultyLevel: string;
  createdAt: string;
  createdBy: { name: string | null; email: string } | null;
}

interface PromptEdit {
  id: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string;
  createdAt: string;
  user: { name: string | null; email: string };
}

interface PromptWithEdits extends Prompt {
  edits: PromptEdit[];
}

const DIFFICULTY_LABELS: Record<string, string> = {
  basic: "Basic",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function PromptList() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [bucketFilter, setBucketFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);

  // Detail view
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState<PromptWithEdits | null>(
    null,
  );

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (bucketFilter) params.set("bucket", bucketFilter);
    if (languageFilter) params.set("language", languageFilter);
    if (difficultyFilter) params.set("difficulty", difficultyFilter);
    if (search) params.set("search", search);
    params.set("page", String(page));

    try {
      const res = await fetch(`/api/prompts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPrompts(data.prompts);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [bucketFilter, languageFilter, difficultyFilter, search, page]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function handleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedPrompt(null);
      return;
    }
    setExpandedId(id);
    const res = await fetch(`/api/prompts/${id}`);
    if (res.ok) {
      setExpandedPrompt(await res.json());
    }
  }

  function handleEdit(prompt: Prompt) {
    setEditingPrompt(prompt);
    setFormOpen(true);
  }

  function handleCreate() {
    setEditingPrompt(null);
    setFormOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this prompt?")) return;
    const res = await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Prompt deleted successfully.");
      fetchPrompts();
      if (expandedId === id) {
        setExpandedId(null);
        setExpandedPrompt(null);
      }
    }
  }

  function handleFormSuccess() {
    setFormOpen(false);
    setEditingPrompt(null);
    showToast(
      editingPrompt
        ? "Prompt updated successfully."
        : "Prompt created successfully.",
    );
    fetchPrompts();
  }

  function handleFilterChange(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed right-6 top-6 z-50 rounded-md bg-success px-4 py-3 text-sm font-medium text-white shadow-md">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Prompt Catalogue
          </h1>
          <p className="mt-1 text-sm text-text-tertiary">
            {total} prompt{total !== 1 ? "s" : ""} total
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
        >
          + New Prompt
        </button>
      </div>

      {/* Filter bar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={bucketFilter}
          onChange={(e) => handleFilterChange(setBucketFilter, e.target.value)}
          className="cursor-pointer rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
        >
          <option value="">All Buckets</option>
          {BUCKETS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>

        <select
          value={languageFilter}
          onChange={(e) =>
            handleFilterChange(setLanguageFilter, e.target.value)
          }
          className="cursor-pointer rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
        >
          <option value="">All Languages</option>
          <option value="igala">Igala</option>
        </select>

        <select
          value={difficultyFilter}
          onChange={(e) =>
            handleFilterChange(setDifficultyFilter, e.target.value)
          }
          className="cursor-pointer rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
        >
          <option value="">All Difficulties</option>
          <option value="basic">Basic</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>

        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search prompt text..."
          className="flex-1 rounded-md border border-border-strong px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="mt-8 text-center text-sm text-text-tertiary">
          Loading...
        </div>
      ) : prompts.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border-strong bg-surface p-12 text-center">
          <p className="text-sm text-text-tertiary">
            No prompts found. Create your first prompt.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunken text-xs font-medium uppercase tracking-wider text-text-tertiary">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Bucket</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Text</th>
                <th className="px-4 py-3">Difficulty</th>
                <th className="px-4 py-3">Created By</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((prompt, i) => (
                <>
                  <tr
                    key={prompt.id}
                    onClick={() => handleExpand(prompt.id)}
                    className={`cursor-pointer border-b border-border transition-colors hover:bg-surface-sunken ${
                      i % 2 === 1 ? "bg-surface-sunken/50" : ""
                    } ${expandedId === prompt.id ? "bg-accent-subtle" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-text-secondary">
                      {prompt.promptId}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-secondary">
                        {bucketLabel(prompt.bucket)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {prompt.language.replace(/_/g, " ")}
                    </td>
                    <td
                      className="max-w-xs truncate px-4 py-3 text-text-secondary"
                      dir="ltr"
                    >
                      {prompt.text.length > 80
                        ? prompt.text.slice(0, 80) + "..."
                        : prompt.text}
                    </td>
                    <td className="px-4 py-3 capitalize text-text-secondary">
                      {DIFFICULTY_LABELS[prompt.difficultyLevel] ??
                        prompt.difficultyLevel}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {prompt.createdBy?.name ?? prompt.createdBy?.email ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(prompt);
                          }}
                          className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-accent-text hover:bg-accent-subtle"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(prompt.id);
                          }}
                          className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger-subtle"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {expandedId === prompt.id && expandedPrompt && (
                    <tr
                      key={`${prompt.id}-detail`}
                      className="bg-accent-subtle/30"
                    >
                      <td colSpan={7} className="px-6 py-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <h4 className="text-xs font-medium uppercase text-text-tertiary">
                              Full Text
                            </h4>
                            <p
                              className="mt-1 whitespace-pre-wrap text-sm text-text-secondary"
                              dir="ltr"
                            >
                              {expandedPrompt.text}
                            </p>
                          </div>
                          <div className="space-y-3">
                            {expandedPrompt.sourceLanguage && (
                              <div>
                                <h4 className="text-xs font-medium uppercase text-text-tertiary">
                                  Source Language
                                </h4>
                                <p className="mt-1 text-sm text-text-secondary">
                                  {expandedPrompt.sourceLanguage}
                                </p>
                              </div>
                            )}
                            {expandedPrompt.targetCulture && (
                              <div>
                                <h4 className="text-xs font-medium uppercase text-text-tertiary">
                                  Target Culture
                                </h4>
                                <p className="mt-1 text-sm text-text-secondary">
                                  {expandedPrompt.targetCulture}
                                </p>
                              </div>
                            )}
                            {expandedPrompt.expectedCulturalContext && (
                              <div>
                                <h4 className="text-xs font-medium uppercase text-text-tertiary">
                                  Expected Cultural Context
                                </h4>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                                  {expandedPrompt.expectedCulturalContext}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Edit history */}
                        {expandedPrompt.edits.length > 0 && (
                          <div className="mt-4 border-t border-border pt-4">
                            <h4 className="text-xs font-medium uppercase text-text-tertiary">
                              Edit History
                            </h4>
                            <div className="mt-2 space-y-2">
                              {expandedPrompt.edits.map((edit) => (
                                <div
                                  key={edit.id}
                                  className="rounded-md bg-surface px-3 py-2 text-xs text-text-secondary"
                                >
                                  <span className="font-medium text-text-primary">
                                    {edit.user.name ?? edit.user.email}
                                  </span>{" "}
                                  changed{" "}
                                  <span className="font-mono">
                                    {edit.fieldName}
                                  </span>
                                  {edit.oldValue && (
                                    <>
                                      {" "}
                                      from{" "}
                                      <span className="text-danger line-through">
                                        {edit.oldValue.length > 50
                                          ? edit.oldValue.slice(0, 50) + "..."
                                          : edit.oldValue}
                                      </span>
                                    </>
                                  )}{" "}
                                  to{" "}
                                  <span className="text-success">
                                    {edit.newValue.length > 50
                                      ? edit.newValue.slice(0, 50) + "..."
                                      : edit.newValue}
                                  </span>{" "}
                                  <span className="text-text-muted">
                                    {new Date(
                                      edit.createdAt,
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-text-tertiary">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="cursor-pointer rounded-md border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-sunken disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="cursor-pointer rounded-md border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-sunken disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Form modal */}
      <PromptForm
        prompt={editingPrompt}
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingPrompt(null);
        }}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
