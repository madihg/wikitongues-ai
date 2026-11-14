import { TIERS, type Tier } from "./limits";

/**
 * The clip choice, asked once and remembered (story C1). Pure and client-safe
 * (no server imports), so the screen and the route read the same rules.
 *
 * What does not change: every recording still stores its own tier, consent
 * id and version, and no clip is ever saved without a tier. What changes: the
 * speaker is asked "What happens to your clips?" once, straight after
 * consent, and that answer is used for each clip until they change it. The
 * platform never picks for them: there is no default tier anywhere.
 */

/** The speaker's remembered answer. */
export interface ClipChoice {
  tier: Tier;
  voiceCloning: boolean;
}

/** The three columns on SpeakerProfile, as stored. All null until chosen. */
export interface StoredClipChoice {
  defaultTier: string | null;
  defaultVoiceCloning: boolean | null;
  tierChosenAt: Date | string | null;
}

/** The speaker's latest consent grant, as the rules need it. */
export interface GrantForChoice {
  grantedAt: Date | string;
  withdrawn: boolean;
  version: string;
  commercialLicensing: boolean;
  voiceCloning: boolean;
}

export function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

const time = (v: Date | string) => new Date(v).getTime();

/**
 * The remembered choice, or null when the speaker must be asked. It is asked
 * again whenever consent is asked again: no grant, a withdrawal, an older
 * consent text version, or a choice made BEFORE the current grant (a new
 * version, or consenting again after withdrawing, makes a newer grant). A
 * stored choice the current consent answers no longer allow also reads as
 * not chosen, so it can never be applied silently.
 */
export function currentClipChoice(
  stored: StoredClipChoice | null | undefined,
  grant: GrantForChoice | null | undefined,
  currentVersion: string,
): ClipChoice | null {
  if (!stored || !grant) return null;
  if (grant.withdrawn || grant.version !== currentVersion) return null;
  if (!isTier(stored.defaultTier) || stored.tierChosenAt === null) return null;
  if (time(stored.tierChosenAt) < time(grant.grantedAt)) return null;
  if (stored.defaultTier === "licensed" && !grant.commercialLicensing) {
    return null;
  }
  return {
    tier: stored.defaultTier,
    // Cloning is only ever what the speaker ticked AND consent still allows.
    voiceCloning: stored.defaultVoiceCloning === true && grant.voiceCloning,
  };
}

/**
 * Validate a choice the speaker is saving. A missing tier is an error (there
 * is no default); a tier or opt-in the consent answers do not allow is an
 * error, in the words the record screen already uses.
 */
export function parseClipChoice(
  body: unknown,
  grant: Pick<GrantForChoice, "commercialLicensing" | "voiceCloning">,
): { ok: true; value: ClipChoice } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }
  const b = body as Record<string, unknown>;
  if (b.tier === undefined || b.tier === null || b.tier === "") {
    return {
      ok: false,
      error: "tier is required: open, licensed or community_only",
    };
  }
  if (!isTier(b.tier)) {
    return { ok: false, error: "tier must be open, licensed or community_only" };
  }
  if (b.voiceCloning !== undefined && typeof b.voiceCloning !== "boolean") {
    return { ok: false, error: "voiceCloning must be true or false" };
  }
  if (b.tier === "licensed" && !grant.commercialLicensing) {
    return {
      ok: false,
      error: "Your consent answers do not allow licensing.",
    };
  }
  if (b.voiceCloning === true && !grant.voiceCloning) {
    return {
      ok: false,
      error: "Your consent answers do not allow voice cloning.",
    };
  }
  return { ok: true, value: { tier: b.tier, voiceCloning: b.voiceCloning === true } };
}

/**
 * What one clip is saved with. A choice made for this clip alone ("Only this
 * clip", or the per-clip cards when nothing is remembered) wins; otherwise the
 * remembered choice; otherwise nothing, and the clip cannot be saved.
 */
export function resolveClipChoice(
  thisClip: ClipChoice | null,
  remembered: ClipChoice | null,
): ClipChoice | null {
  return thisClip ?? remembered;
}

/** The card titles, shared by the cards and the one-line summary on a clip. */
export const TIER_TITLE: Record<Tier, string> = {
  community_only: "Stays with my community",
  licensed: "Licensed to AI labs",
  open: "Open to everyone",
};
