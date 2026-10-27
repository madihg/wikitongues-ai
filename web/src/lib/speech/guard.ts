/**
 * The Speech Lab guards, as code. Two kinds, both pure:
 *
 *  - a WRITE guard: nothing is recorded, stored or served for a frozen exam
 *    prompt (assertRecordable);
 *  - EXPORT predicates: what may leave the platform, and what never does
 *    (canExportOpen, canExportLicensed, neverLeaves).
 *
 * Every export path in the lab (the manifest builder, the export route, the
 * export script) filters through these and nowhere else; the test in
 * export-paths.test.ts imports each of them and proves a community_only row
 * and a test-set row are refused by all. Design:
 * tasks/speech/lab-design-2026-10-19.md, "Guards as code".
 */

/** The two fields that make a prompt part of the frozen exam. */
export interface PromptFreezeFields {
  isHoldout: boolean;
  split: string; // PromptSplit: "train" | "dev" | "test"
}

/** Thrown when someone tries to record against a frozen prompt. */
export class FrozenPromptError extends Error {
  constructor() {
    // Deliberately no detail: nothing about a frozen question is said beyond
    // the refusal itself (PRD FR-3).
    super("This prompt cannot be recorded.");
    this.name = "FrozenPromptError";
  }
}

/** A frozen prompt is isHoldout OR split "test"; either alone is enough. */
export function isFrozenPrompt(prompt: PromptFreezeFields): boolean {
  return prompt.isHoldout === true || prompt.split === "test";
}

/** Throws FrozenPromptError for a frozen prompt; returns for any other. */
export function assertRecordable(prompt: PromptFreezeFields): void {
  if (isFrozenPrompt(prompt)) throw new FrozenPromptError();
}

/** The fields of a SpeechRecording the export predicates read. */
export interface ExportableRow {
  tier: "open" | "licensed" | "community_only";
  isTestSet: boolean;
  isDemo: boolean;
  rightsStatus: "cleared" | "pending" | "restricted";
  sourceType: "contributor" | "third_party" | "derived";
  publishedOpenAt: Date | null;
  /** Set when the client confirmed the upload; a clip with no file is not data. */
  uploadedAt: Date | null;
  consentId: string | null;
  /** "keep" | "bad_audio" | "wrong_text" | null (not yet reviewed). */
  reviewStatus: string | null;
  voiceCloningOptIn: boolean;
  /** The row's prompt, when the caller loaded it: re-checked, never trusted. */
  prompt?: PromptFreezeFields | null;
}

/** Review verdicts that keep a clip out of every export. */
const REJECTED_REVIEWS = new Set(["bad_audio", "wrong_text"]);

/**
 * Rows that leave by NO path, whatever else is true of them: COMMUNITY-ONLY
 * clips (the speaker said it never leaves the Igala tools), test-set clips
 * (the exam), demo clips (not data), and any clip whose prompt is frozen
 * (a second line of defence behind isTestSet).
 */
export function neverLeaves(row: ExportableRow): boolean {
  if (row.tier === "community_only") return true;
  if (row.isTestSet) return true;
  if (row.isDemo) return true;
  if (row.prompt && isFrozenPrompt(row.prompt)) return true;
  return false;
}

/** The checks both export tiers share, after neverLeaves. */
function exportableBasics(row: ExportableRow): boolean {
  if (neverLeaves(row)) return false;
  if (row.rightsStatus !== "cleared") return false;
  if (row.consentId === null) return false; // no consent record, no export
  if (row.uploadedAt === null) return false;
  if (row.reviewStatus !== null && REJECTED_REVIEWS.has(row.reviewStatus)) {
    return false;
  }
  return true;
}

/**
 * OPEN export (CC-BY 4.0, permanent): tier open AND publishedOpenAt set AND
 * not a test set AND rights cleared AND a contributor's own recording,
 * plus the shared basics (consent on record, uploaded, not rejected in review,
 * not demo). publishedOpenAt is set only by the publish step, so the speaker's
 * choice alone never publishes a clip.
 */
export function canExportOpen(row: ExportableRow): boolean {
  if (!exportableBasics(row)) return false;
  return (
    row.tier === "open" &&
    row.publishedOpenAt !== null &&
    row.sourceType === "contributor"
  );
}

/** What the gated delivery path knows about the speaker and the delivery. */
export interface LicensedContext {
  /** The speaker's current ConsentGrant flags, or null when there is none. */
  consent: { commercialLicensing: boolean; crossBorder: boolean } | null;
  /** True only when called from the gated delivery path (a signed contract). */
  gatedDelivery: boolean;
  /** Manifest flag `includeSynthetic` (FR-8): synthesised clips ride along. */
  includeSynthetic?: boolean;
  /** The delivery will train a cloned voice (FR-9: needs the opt-in). */
  forVoiceCloning?: boolean;
}

/**
 * LICENSED export: tier licensed AND the speaker's consent flags allow
 * commercial licensing and cross-border transfer AND not a test set AND
 * rights cleared, and only from the gated delivery path. No route in the
 * first slice calls this; it exists so the rule is written once, tested, and
 * ready for the delivery path.
 */
export function canExportLicensed(
  row: ExportableRow,
  ctx: LicensedContext,
): boolean {
  if (!ctx.gatedDelivery) return false;
  if (!exportableBasics(row)) return false;
  if (row.tier !== "licensed") return false;
  if (!ctx.consent) return false;
  if (!ctx.consent.commercialLicensing || !ctx.consent.crossBorder) {
    return false;
  }
  if (row.sourceType === "derived" && !ctx.includeSynthetic) return false;
  if (ctx.forVoiceCloning && !row.voiceCloningOptIn) return false;
  return true;
}
