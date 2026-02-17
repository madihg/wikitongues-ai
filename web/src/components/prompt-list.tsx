"use client";

import { useState, useEffect, useCallback } from "react";
import { PromptForm } from "./prompt-form";

interface Prompt {
  id: string;
  promptId: string;
  category: string;
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

const CATEGORY_LABELS: Record<string, string> = {
  real_world_use: "Real World Use",
  words_concepts: "Words & Concepts",
  frontier_aspirations: "Frontier Aspirations",
  abstract_vs_everyday: "Abstract vs Everyday",
};

const CATEGORY_COLORS: Record<string, string> = {
  real_world_use: "bg-blue-100 text-blue-700",
  words_concepts: "bg-green-100 text-green-700",
  frontier_aspirations: "bg-purple-100 text-purple-700",
  abstract_vs_everyday: "bg-orange-100 text-orange-700",
};

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
  const [categoryFilter, setCategoryFilter] = useState("");
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
    if (categoryFilter) params.set("category", categoryFilter);
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
  }, [categoryFilter, languageFilter, difficultyFilter, search, page]);

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

  const isArabicLang = (lang: string) => lang === "lebanese_arabic";

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed right-6 top-6 z-50 rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Prompt Catalogue
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} prompt{total !== 1 ? "s" : ""} total
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Prompt
        </button>
      </div>

      {/* Filter bar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={categoryFilter}
          onChange={(e) =>
            handleFilterChange(setCategoryFilter, e.target.value)
          }
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All Categories</option>
          <option value="real_world_use">Real World Use</option>
          <option value="words_concepts">Words & Concepts</option>
          <option value="frontier_aspirations">Frontier Aspirations</option>
          <option value="abstract_vs_everyday">Abstract vs Everyday</option>
        </select>

        <select
          value={languageFilter}
          onChange={(e) =>
            handleFilterChange(setLanguageFilter, e.target.value)
          }
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All Languages</option>
          <option value="igala">Igala</option>
          <option value="lebanese_arabic">Lebanese Arabic</option>
        </select>

        <select
          value={difficultyFilter}
          onChange={(e) =>
            handleFilterChange(setDifficultyFilter, e.target.value)
          }
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
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
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="mt-8 text-center text-sm text-gray-500">Loading...</div>
      ) : prompts.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-sm text-gray-500">
            No prompts found. Create your first prompt.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Category</th>
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
                    className={`cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                      i % 2 === 1 ? "bg-gray-50/50" : ""
                    } ${expandedId === prompt.id ? "bg-blue-50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">
                      {prompt.promptId}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[prompt.category] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {CATEGORY_LABELS[prompt.category] ?? prompt.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {prompt.language.replace(/_/g, " ")}
                    </td>
                    <td
                      className="max-w-xs truncate px-4 py-3 text-gray-700"
                      dir={isArabicLang(prompt.language) ? "rtl" : "ltr"}
                    >
                      {prompt.text.length > 80
                        ? prompt.text.slice(0, 80) + "..."
                        : prompt.text}
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-600">
                      {DIFFICULTY_LABELS[prompt.difficultyLevel] ??
                        prompt.difficultyLevel}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {prompt.createdBy?.name ?? prompt.createdBy?.email ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(prompt);
                          }}
                          className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(prompt.id);
                          }}
                          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {expandedId === prompt.id && expandedPrompt && (
                    <tr key={`${prompt.id}-detail`} className="bg-blue-50/30">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <h4 className="text-xs font-medium uppercase text-gray-500">
                              Full Text
                            </h4>
                            <p
                              className="mt-1 whitespace-pre-wrap text-sm text-gray-800"
                              dir={
                                isArabicLang(prompt.language) ? "rtl" : "ltr"
                              }
                            >
                              {expandedPrompt.text}
                            </p>
                          </div>
                          <div className="space-y-3">
                            {expandedPrompt.sourceLanguage && (
                              <div>
                                <h4 className="text-xs font-medium uppercase text-gray-500">
                                  Source Language
                                </h4>
                                <p className="mt-1 text-sm text-gray-700">
                                  {expandedPrompt.sourceLanguage}
                                </p>
                              </div>
                            )}
                            {expandedPrompt.targetCulture && (
                              <div>
                                <h4 className="text-xs font-medium uppercase text-gray-500">
                                  Target Culture
                                </h4>
                                <p className="mt-1 text-sm text-gray-700">
                                  {expandedPrompt.targetCulture}
                                </p>
                              </div>
                            )}
                            {expandedPrompt.expectedCulturalContext && (
                              <div>
                                <h4 className="text-xs font-medium uppercase text-gray-500">
                                  Expected Cultural Context
                                </h4>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                                  {expandedPrompt.expectedCulturalContext}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Edit history */}
                        {expandedPrompt.edits.length > 0 && (
                          <div className="mt-4 border-t border-gray-200 pt-4">
                            <h4 className="text-xs font-medium uppercase text-gray-500">
                              Edit History
                            </h4>
                            <div className="mt-2 space-y-2">
                              {expandedPrompt.edits.map((edit) => (
                                <div
                                  key={edit.id}
                                  className="rounded bg-white px-3 py-2 text-xs text-gray-600"
                                >
                                  <span className="font-medium text-gray-800">
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
                                      <span className="text-red-600 line-through">
                                        {edit.oldValue.length > 50
                                          ? edit.oldValue.slice(0, 50) + "..."
                                          : edit.oldValue}
                                      </span>
                                    </>
                                  )}{" "}
                                  to{" "}
                                  <span className="text-green-600">
                                    {edit.newValue.length > 50
                                      ? edit.newValue.slice(0, 50) + "..."
                                      : edit.newValue}
                                  </span>{" "}
                                  <span className="text-gray-400">
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
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
