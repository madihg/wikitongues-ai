/**
 * The August 2026 frontier arms: Gemini 3.1 Pro and Claude Opus 5, each in the
 * three shapes every base model in this arena gets - plain baseline, v1 RAG
 * (gold exemplars + curated RagEntry chunks), and the rag-v2 serving path.
 *
 * This lives in src/lib rather than inside scripts/frontier-fill.ts because
 * the shape rules are the part worth unit-testing: a candidate whose
 * versionLabel and ragEnabled disagree with its serving path would generate
 * outputs under a composition nobody registered, and that mistake is invisible
 * once the rows are in the database.
 *
 * WHY temperature 0 EVERYWHERE: these arms exist to be compared against the
 * frozen benchmark and against each other's serving paths. Sampling variance
 * on top of that comparison is pure noise, and for the v2 path ("use the
 * attested form, copy the attested spelling") it is precisely the failure the
 * method targets - same rationale as scripts/register-rag-v2.ts.
 *
 * WHY maxTokens 4096: both Gemini 3.1 Pro and (potentially) Claude Opus 5 are
 * reasoning models whose hidden thinking trace bills against the completion
 * budget. Gemma at the 1024 default returned 16/43 empty strings because the
 * trace consumed the whole budget; 4096 leaves the answer room after the
 * trace. Same trap, same fix.
 */

import type { CandidateKind } from "@prisma/client";

export type ServingMode =
  "baseline" | "rag-v1" | "rag-v2" | "rag-v3" | "rag-v4";

export interface FrontierTarget {
  slug: string;
  name: string;
  family: string;
  provider: string;
  baseModelId: string;
  kind: CandidateKind;
  ragEnabled: boolean;
  versionLabel: string | null;
  decodingParams: { temperature: number; maxTokens: number };
  color: string;
  /**
   * Slug of the sibling this row descends from. Only rag-v2 rows carry
   * lineage (v2 -> v1), mirroring register-rag-v2.ts, so the arena UI can
   * show the v2 row as a versioned descendant rather than an unrelated model.
   */
  parentSlug: string | null;
}

const DECODING = { temperature: 0, maxTokens: 4096 };

export const FRONTIER_TARGETS: FrontierTarget[] = [
  // ─── Gemini 3.1 Pro ───────────────────────────────────────────────────────
  {
    slug: "gemini-3-1-pro",
    name: "Gemini 3.1 Pro",
    family: "gemini",
    provider: "google",
    baseModelId: "gemini-3.1-pro-preview",
    kind: "baseline",
    ragEnabled: false,
    versionLabel: null,
    decodingParams: DECODING,
    color: "#16407c",
    parentSlug: null,
  },
  {
    slug: "gemini-3-1-pro-rag",
    name: "Gemini 3.1 Pro + Igala RAG",
    family: "gemini",
    provider: "google",
    baseModelId: "gemini-3.1-pro-preview",
    kind: "rag",
    ragEnabled: true,
    versionLabel: "rag",
    decodingParams: DECODING,
    color: "#4a6fb5",
    parentSlug: null,
  },
  {
    slug: "gemini-3-1-pro-rag-v2",
    name: "Gemini 3.1 Pro + Igala RAG v2",
    family: "gemini",
    provider: "google",
    baseModelId: "gemini-3.1-pro-preview",
    kind: "rag",
    ragEnabled: true,
    versionLabel: "rag-v2",
    decodingParams: DECODING,
    color: "#7d97d6",
    parentSlug: "gemini-3-1-pro-rag",
  },
  // ─── Claude Opus 5 ────────────────────────────────────────────────────────
  // Registered now so the rows exist and the comparison slots are visible;
  // generation is skipped while the Anthropic key is dead, and the runner
  // must report that skip rather than fail the other arms.
  {
    slug: "claude-opus-5",
    name: "Claude Opus 5",
    family: "claude",
    provider: "anthropic",
    baseModelId: "claude-opus-5",
    kind: "baseline",
    ragEnabled: false,
    versionLabel: null,
    decodingParams: DECODING,
    color: "#7c2d12",
    parentSlug: null,
  },
  {
    slug: "claude-opus-5-rag",
    name: "Claude Opus 5 + Igala RAG",
    family: "claude",
    provider: "anthropic",
    baseModelId: "claude-opus-5",
    kind: "rag",
    ragEnabled: true,
    versionLabel: "rag",
    decodingParams: DECODING,
    color: "#c2661f",
    parentSlug: null,
  },
  {
    slug: "claude-opus-5-rag-v2",
    name: "Claude Opus 5 + Igala RAG v2",
    family: "claude",
    provider: "anthropic",
    baseModelId: "claude-opus-5",
    kind: "rag",
    ragEnabled: true,
    versionLabel: "rag-v2",
    decodingParams: DECODING,
    color: "#e09a58",
    parentSlug: "claude-opus-5-rag",
  },
];

/** Every frontier slug, in registration order - the runner's default worklist. */
export const FRONTIER_SLUGS = FRONTIER_TARGETS.map((t) => t.slug);

/**
 * Which serving path a candidate gets, mirroring the branch in
 * src/app/api/arena/chat/route.ts: versionLabel 'rag-v4', 'rag-v3' or
 * 'rag-v2' selects that composition unconditionally (v2/v3 share the v2
 * retrieval and differ only in system prompt; v4 has its own retrieval -
 * corrections + source-diversified pairs - plus IGALA_SYSTEM_V4); otherwise
 * ragEnabled selects v1; otherwise the candidate is a plain baseline. Kept
 * as one function so the runner and any future caller cannot drift from the
 * route's rule.
 */
export function servingModeFor(candidate: {
  ragEnabled: boolean;
  versionLabel: string | null;
}): ServingMode {
  if (candidate.versionLabel === "rag-v4") return "rag-v4";
  if (candidate.versionLabel === "rag-v3") return "rag-v3";
  if (candidate.versionLabel === "rag-v2") return "rag-v2";
  return candidate.ragEnabled ? "rag-v1" : "baseline";
}
