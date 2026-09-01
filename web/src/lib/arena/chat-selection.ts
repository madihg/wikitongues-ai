/**
 * Which models a chat session is pointed at, and how that survives being sent
 * to someone else.
 *
 * THE REQUIREMENT THIS SOLVES
 * ---------------------------
 * A researcher curates a set of models, then hands the page to a native
 * speaker for feedback. She must land on exactly the set that was chosen for
 * her - not on a default, not on whatever her own browser last held.
 *
 * That rules out localStorage, which is per-browser and would silently give her
 * a different set. The selection therefore lives in the URL query string, which
 * is shareable, bookmarkable, survives a reload, and makes the shared state
 * visible rather than hidden. `?models=a,b,c` IS the state.
 *
 * When the URL names no models, this module does NOT supply a default: the
 * default is the current leading model by live agreement score, which only the
 * picker (chat-picker.ts) can know once scores load. A hardcoded default slug
 * list lived here once and went stale the week a new arm took the lead.
 */

/**
 * Hard cap on models one legacy link may resolve: each is a separate billed
 * API call. New selections are assembled by the picker under the tighter
 * MAX_COMPARE_MODELS (chat-picker.ts); this looser bound survives so links
 * shared before that cap existed still open on their full set.
 */
export const MAX_CHAT_MODELS = 6;

export const MODELS_PARAM = "models";

/**
 * Read the selection out of a query string.
 *
 * `available` is the set of slugs that actually exist and are chattable. Slugs
 * that do not resolve are dropped rather than erroring: a link can outlive a
 * candidate being archived, and a stale link should degrade to the models that
 * still exist instead of showing a broken page.
 */
export function parseChatSelection(
  search: string | URLSearchParams,
  available: readonly string[],
): { slugs: string[]; droppedUnknown: string[]; usedDefault: boolean } {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const raw = params.get(MODELS_PARAM);
  const availableSet = new Set(available);

  if (raw === null || raw.trim() === "") {
    // No selection in the URL: signal it and let the caller pick the default
    // (the live leading model, which requires scores this module cannot see).
    return { slugs: [], droppedUnknown: [], usedDefault: true };
  }

  const requested = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const slugs: string[] = [];
  const droppedUnknown: string[] = [];
  for (const slug of requested) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (!availableSet.has(slug)) {
      droppedUnknown.push(slug);
      continue;
    }
    if (slugs.length < MAX_CHAT_MODELS) slugs.push(slug);
  }

  return { slugs, droppedUnknown, usedDefault: false };
}

/**
 * Serialise a selection back into a query string.
 *
 * Order is preserved, because the columns a reviewer sees left-to-right should
 * be the order the curator chose. An empty selection produces an empty string
 * rather than `?models=`, so a cleared selection falls back to the default
 * instead of rendering nothing.
 */
export function serializeChatSelection(slugs: readonly string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const s of slugs) {
    if (!s || seen.has(s)) continue;
    seen.add(s);
    unique.push(s);
    if (unique.length >= MAX_CHAT_MODELS) break;
  }
  if (unique.length === 0) return "";
  return `${MODELS_PARAM}=${unique.map(encodeURIComponent).join(",")}`;
}

/**
 * The absolute link to hand to a reviewer.
 *
 * Always emits an explicit `?models=`, even when the selection matches the
 * default. A shared link must pin what the recipient sees: if it relied on the
 * default, changing the default later would silently change what she opens.
 */
export function buildShareUrl(
  origin: string,
  pathname: string,
  slugs: readonly string[],
): string {
  const qs = serializeChatSelection(slugs);
  const base = `${origin.replace(/\/$/, "")}${pathname}`;
  return qs ? `${base}?${qs}` : base;
}
