import type { EditItem } from "@/lib/answer-edit";
import {
  attachReasons,
  diffToSegments,
  reasonKeyFor,
  segmentHasReason,
  type EditSegment,
  type ReasonMap,
} from "@/lib/edit-segments";
import { storedText } from "@/lib/answer-revisions";

/**
 * The edit drawer's pure side (src/components/answer-editor.tsx): the values
 * it starts from, the requests one press of "Save changes" makes, and the
 * fixed lines of copy. Pure so the node test environment can hold them.
 */

/** Editable text of one item, by field. Corrections also carry their
 *  per-change reasons (keyed as the suggesting editor keys them). */
export interface ItemValues {
  fields: Record<string, string>;
  reasons?: ReasonMap;
}
export type EditorValues = Record<string, ItemValues>;

export function itemKey(item: { type: string; id: string }): string {
  return `${item.type}:${item.id}`;
}

export function reasonsOf(segments: EditSegment[]): ReasonMap {
  const map: ReasonMap = {};
  segments.forEach((s, i) => {
    if (segmentHasReason(s)) {
      map[reasonKeyFor(segments, i)] = {
        tags: s.reasonTags ?? [],
        text: s.reason ?? "",
      };
    }
  });
  return map;
}

export function initialValues(items: EditItem[]): EditorValues {
  const out: EditorValues = {};
  for (const item of items) {
    if (item.type === "cold") {
      out[itemKey(item)] = {
        fields: {
          answerText: item.answerText,
          englishGloss: item.englishGloss ?? "",
          englishTranslation: item.englishTranslation ?? "",
          dialect: item.dialect ?? "",
          instructionIg: item.instructionIg ?? "",
        },
      };
    } else if (item.type === "pairwise") {
      out[itemKey(item)] = { fields: { explanation: item.explanation } };
    } else if (item.type === "edit") {
      out[itemKey(item)] = {
        fields: {
          correctedText: item.correctedText,
          rationale: item.rationale ?? "",
        },
        reasons: reasonsOf(item.segments),
      };
    } else {
      out[itemKey(item)] = { fields: { note: item.note } };
    }
  }
  return out;
}

export interface EditRequest {
  type: EditItem["type"];
  id: string;
  body: Record<string, unknown>;
}

function sameReasons(a: ReasonMap, b: ReasonMap): boolean {
  const norm = (m: ReasonMap) =>
    JSON.stringify(
      Object.keys(m)
        .sort()
        .map((k) => [
          k,
          (m[k].text ?? "").trim(),
          [...(m[k].tags ?? [])].sort(),
        ])
        .filter(
          ([, text, tags]) => text !== "" || (tags as string[]).length > 0,
        ),
    );
  return norm(a) === norm(b);
}

/**
 * The requests one save makes: one per item that changed, carrying only the
 * fields that changed. An unchanged drawer makes none ("Nothing to save.").
 */
export function buildRequests(
  items: EditItem[],
  start: EditorValues,
  now: EditorValues,
): EditRequest[] {
  const out: EditRequest[] = [];
  for (const item of items) {
    const key = itemKey(item);
    const before = start[key];
    const after = now[key];
    if (!before || !after) continue;
    const body: Record<string, unknown> = {};
    for (const field of Object.keys(after.fields)) {
      if (
        storedText(after.fields[field]) !== storedText(before.fields[field])
      ) {
        body[field] = storedText(after.fields[field]);
      }
    }
    if (item.type === "edit") {
      const reasonsChanged = !sameReasons(
        before.reasons ?? {},
        after.reasons ?? {},
      );
      if ("correctedText" in body || reasonsChanged) {
        body.segments = attachReasons(
          diffToSegments(item.originalText, after.fields.correctedText),
          after.reasons ?? {},
        );
      }
    }
    if (Object.keys(body).length > 0) {
      out.push({ type: item.type, id: item.id, body });
    }
  }
  return out;
}

/**
 * Which required boxes were emptied, so Save can stay off. A box that was
 * already empty (an old correction with no reason) does not block saving
 * the rest of the episode: it is only asked for, never forced.
 */
export function emptiedRequired(
  items: EditItem[],
  start: EditorValues,
  now: EditorValues,
): string[] {
  const out: string[] = [];
  const need: Record<EditItem["type"], string[]> = {
    cold: ["answerText"],
    edit: ["correctedText", "rationale"],
    pairwise: ["explanation"],
    listen: [],
  };
  for (const item of items) {
    const key = itemKey(item);
    const before = start[key];
    const after = now[key];
    if (!before || !after) continue;
    for (const f of need[item.type]) {
      if (
        storedText(after.fields[f]) === null &&
        storedText(before.fields[f]) !== null
      ) {
        out.push(`${key}.${f}`);
      }
    }
  }
  return out;
}

// ─── Copy (annotator experience spec, 6.3) ──────────────────────────────────

export const EDITOR_COPY = {
  title: "Edit your answer",
  answer: "Your answer in Igala",
  meaning: "What it means / why, in English",
  translation: "Short English translation (for recording)",
  translationHelp: "A few words. Say what the Igala says, nothing more.",
  dialect: "Which Igala is this?",
  instruction: "The question, in Igala",
  why: "Why you chose as you did",
  correction: "Your correction and reasons",
  correctionWhy: "Why did you make these corrections? In English",
  listenReason: "Why you chose as you did",
  locked: "This cannot be changed.",
  firstVersionHelp:
    "Your first version is kept. It was written before you saw the AI answers.",
  clipWarning:
    "You changed the words. The clip may no longer match. Record it again?",
  cancel: "Cancel",
  save: "Save changes",
  saved: "Saved. Your first version is kept.",
  nothing: "Nothing to save.",
} as const;

const TEXT_CHOICE: Record<string, string> = {
  a: "Output A",
  b: "Output B",
  tie: "Tie - both adequate",
  both_inadequate: "Both inadequate",
};
const LISTEN_CHOICE: Record<string, string> = {
  a: "Clip A",
  b: "Clip B",
  tie: "Tie",
  both_unusable: "Both unusable",
};

/** "You picked Output B. This cannot be changed." */
export function choiceLine(
  kind: "pairwise" | "listen",
  winner: string,
): string {
  const label =
    (kind === "pairwise" ? TEXT_CHOICE : LISTEN_CHOICE)[winner] ?? winner;
  return `You picked ${label}. ${EDITOR_COPY.locked}`;
}

/** "First version, saved 12 Oct" */
export function firstVersionLine(savedAtIso: string): string {
  const d = new Date(savedAtIso);
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `First version, saved ${day} ${month}`;
}

/** "Clips: Igala 6.1 s, English 4.0 s" (the newest clip of each language). */
export function clipsLine(
  clips: { language: string; durationMs: number }[],
): string | null {
  if (clips.length === 0) return null;
  const newest = new Map<string, number>();
  for (const c of clips) newest.set(c.language, c.durationMs);
  const part = (lang: string, label: string) =>
    newest.has(lang)
      ? `${label} ${((newest.get(lang) ?? 0) / 1000).toFixed(1)} s`
      : null;
  const parts = [part("igala", "Igala"), part("english", "English")].filter(
    Boolean,
  );
  return parts.length > 0 ? `Clips: ${parts.join(", ")}` : null;
}
