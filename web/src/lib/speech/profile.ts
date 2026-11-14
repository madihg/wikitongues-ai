import { sanitizeDialect } from "@/lib/dialects";

/**
 * The speaker profile form (US-016): every field optional, each with a
 * "prefer not to say" that stores null. Client-safe (no server imports) so
 * the form and the route read the same option lists. The age band and gender
 * lists are provisional and kept short on purpose.
 */

export const AGE_BANDS = ["under_18", "18_29", "30_44", "45_59", "60_plus"] as const;
export const AGE_BAND_LABEL: Record<(typeof AGE_BANDS)[number], string> = {
  under_18: "Under 18",
  "18_29": "18 to 29",
  "30_44": "30 to 44",
  "45_59": "45 to 59",
  "60_plus": "60 or over",
};

export const GENDERS = ["woman", "man", "non_binary", "self_described"] as const;
export const GENDER_LABEL: Record<(typeof GENDERS)[number], string> = {
  woman: "Woman",
  man: "Man",
  non_binary: "Non-binary",
  self_described: "Another description",
};

export interface SpeakerProfileInput {
  dialect: string | null;
  ageBand: string | null;
  gender: string | null;
  mayShareDemographics: boolean;
}

/**
 * Validate a PUT body. A missing, null or empty field is "prefer not to say"
 * (null). A value outside the lists is an error rather than silently dropped,
 * so a typo never reads as a choice. `mayShareDemographics` must be a boolean
 * (the form always sends it; false is the default).
 */
export function parseProfile(
  body: unknown,
): { ok: true; value: SpeakerProfileInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }
  const b = body as Record<string, unknown>;
  const empty = (v: unknown) => v === undefined || v === null || v === "";

  if (typeof b.mayShareDemographics !== "boolean") {
    return { ok: false, error: "mayShareDemographics must be true or false" };
  }
  let dialect: string | null = null;
  if (!empty(b.dialect)) {
    dialect = sanitizeDialect(b.dialect);
    if (dialect === null) return { ok: false, error: "Unknown dialect" };
  }
  const pick = <T extends string>(
    v: unknown,
    list: readonly T[],
    name: string,
  ): { v: T | null } | { error: string } =>
    empty(v)
      ? { v: null }
      : typeof v === "string" && (list as readonly string[]).includes(v)
        ? { v: v as T }
        : { error: `Unknown ${name}` };
  const age = pick(b.ageBand, AGE_BANDS, "age band");
  if ("error" in age) return { ok: false, error: age.error };
  const gender = pick(b.gender, GENDERS, "gender");
  if ("error" in gender) return { ok: false, error: gender.error };

  return {
    ok: true,
    value: {
      dialect,
      ageBand: age.v,
      gender: gender.v,
      mayShareDemographics: b.mayShareDemographics,
    },
  };
}
