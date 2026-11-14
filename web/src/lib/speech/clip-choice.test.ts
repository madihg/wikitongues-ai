import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TIER_TITLE,
  currentClipChoice,
  parseClipChoice,
  resolveClipChoice,
  type GrantForChoice,
  type StoredClipChoice,
} from "./clip-choice";

const V = "2026-10-19-v1";
const grant = (over: Partial<GrantForChoice> = {}): GrantForChoice => ({
  grantedAt: new Date("2026-11-01T10:00:00Z"),
  withdrawn: false,
  version: V,
  commercialLicensing: true,
  voiceCloning: true,
  ...over,
});
const stored = (over: Partial<StoredClipChoice> = {}): StoredClipChoice => ({
  defaultTier: "community_only",
  defaultVoiceCloning: false,
  tierChosenAt: new Date("2026-11-01T10:05:00Z"),
  ...over,
});

describe("currentClipChoice: when the speaker is asked", () => {
  it("a choice made after the current consent is remembered", () => {
    expect(currentClipChoice(stored(), grant(), V)).toEqual({
      tier: "community_only",
      voiceCloning: false,
    });
    expect(
      currentClipChoice(
        stored({ defaultTier: "open", defaultVoiceCloning: true }),
        grant(),
        V,
      ),
    ).toEqual({ tier: "open", voiceCloning: true });
  });

  it("never chosen: asked, whatever else is stored", () => {
    expect(currentClipChoice(null, grant(), V)).toBeNull();
    expect(currentClipChoice(undefined, grant(), V)).toBeNull();
    expect(
      currentClipChoice(stored({ defaultTier: null }), grant(), V),
    ).toBeNull();
    expect(
      currentClipChoice(stored({ tierChosenAt: null }), grant(), V),
    ).toBeNull();
    // A value that is not one of the three tiers is not a choice.
    expect(
      currentClipChoice(stored({ defaultTier: "public" }), grant(), V),
    ).toBeNull();
  });

  it("no consent, a withdrawal or an older consent text: asked again", () => {
    expect(currentClipChoice(stored(), null, V)).toBeNull();
    expect(
      currentClipChoice(stored(), grant({ withdrawn: true }), V),
    ).toBeNull();
    expect(
      currentClipChoice(stored(), grant({ version: "2026-01-01-v0" }), V),
    ).toBeNull();
  });

  it("a new consent grant (new text version, or consenting again after withdrawing) asks again", () => {
    const later = grant({ grantedAt: new Date("2026-11-20T09:00:00Z") });
    expect(currentClipChoice(stored(), later, V)).toBeNull();
    // Chosen again after that grant: remembered again.
    expect(
      currentClipChoice(
        stored({ tierChosenAt: "2026-11-20T09:01:00Z" }),
        later,
        V,
      ),
    ).not.toBeNull();
  });

  it("a choice the consent answers no longer allow is never applied silently", () => {
    expect(
      currentClipChoice(
        stored({ defaultTier: "licensed" }),
        grant({ commercialLicensing: false }),
        V,
      ),
    ).toBeNull();
    expect(
      currentClipChoice(
        stored({ defaultVoiceCloning: true }),
        grant({ voiceCloning: false }),
        V,
      ),
    ).toEqual({ tier: "community_only", voiceCloning: false });
  });
});

describe("parseClipChoice", () => {
  const g = { commercialLicensing: true, voiceCloning: true };

  it("accepts each tier, with cloning off unless ticked", () => {
    for (const tier of ["open", "licensed", "community_only"] as const) {
      expect(parseClipChoice({ tier }, g)).toEqual({
        ok: true,
        value: { tier, voiceCloning: false },
      });
    }
    expect(parseClipChoice({ tier: "open", voiceCloning: true }, g)).toEqual({
      ok: true,
      value: { tier: "open", voiceCloning: true },
    });
  });

  it("there is no default: a missing or unknown tier is refused", () => {
    for (const body of [null, "x", {}, { tier: null }, { tier: "" }]) {
      expect(parseClipChoice(body, g).ok, JSON.stringify(body)).toBe(false);
    }
    expect(parseClipChoice({ tier: "public" }, g).ok).toBe(false);
    expect(parseClipChoice({ tier: "open", voiceCloning: "true" }, g).ok).toBe(
      false,
    );
  });

  it("refuses what the consent answers do not allow, in the screen's words", () => {
    expect(
      parseClipChoice(
        { tier: "licensed" },
        { commercialLicensing: false, voiceCloning: true },
      ),
    ).toEqual({
      ok: false,
      error: "Your consent answers do not allow licensing.",
    });
    expect(
      parseClipChoice(
        { tier: "open", voiceCloning: true },
        { commercialLicensing: true, voiceCloning: false },
      ),
    ).toEqual({
      ok: false,
      error: "Your consent answers do not allow voice cloning.",
    });
  });
});

describe("resolveClipChoice", () => {
  const remembered = { tier: "community_only", voiceCloning: false } as const;

  it("ten clips in a row are saved with the remembered choice, none asking", () => {
    for (let clip = 0; clip < 10; clip++) {
      expect(resolveClipChoice(null, remembered)).toEqual(remembered);
    }
  });

  it("Only this clip wins for that clip and leaves the remembered choice as it was", () => {
    const only = { tier: "open", voiceCloning: false } as const;
    expect(resolveClipChoice(only, remembered)).toEqual(only);
    expect(remembered).toEqual({ tier: "community_only", voiceCloning: false });
    // The next clip has no choice of its own, so it is back on the remembered one.
    expect(resolveClipChoice(null, remembered)).toEqual(remembered);
  });

  it("with nothing chosen anywhere there is no tier, so nothing can be saved", () => {
    expect(resolveClipChoice(null, null)).toBeNull();
  });
});

describe("the titles are the ones the cards have always carried", () => {
  it("matches the three cards", () => {
    expect(TIER_TITLE).toEqual({
      community_only: "Stays with my community",
      licensed: "Licensed to AI labs",
      open: "Open to everyone",
    });
  });
});

describe("migration 20261113160000_speaker_clip_choice", () => {
  const root = join(__dirname, "..", "..", "..", "prisma");
  const dir = join(root, "migrations", "20261113160000_speaker_clip_choice");
  const up = readFileSync(join(dir, "migration.sql"), "utf8");
  const down = readFileSync(join(dir, "down.sql"), "utf8");
  const schema = readFileSync(join(root, "schema.prisma"), "utf8");
  const sql = (s: string) =>
    s
      .split("\n")
      .filter((l) => !l.startsWith("--"))
      .join("\n");

  it("starts with the search path and is additive", () => {
    for (const f of [up, down]) {
      expect(f).toContain(
        'SET search_path TO "wikitongues", "extensions", "public"',
      );
    }
    expect(sql(up)).not.toMatch(/DROP|ALTER COLUMN|RENAME|NOT NULL|UPDATE|DELETE/i);
  });

  it("adds three nullable columns to SpeakerProfile and nothing else", () => {
    const alters = [...up.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]);
    expect(alters).toEqual(["SpeakerProfile"]);
    expect(up).toContain('"defaultTier" "DataTier"');
    expect(up).toContain('"defaultVoiceCloning" BOOLEAN');
    expect(up).toContain('"tierChosenAt" TIMESTAMP(3)');
    expect(sql(up)).not.toMatch(/\sDEFAULT\s/); // no default tier, ever
  });

  it("the schema declares them nullable, with no default", () => {
    expect(schema).toMatch(/defaultTier\s+DataTier\?\n/);
    expect(schema).toMatch(/defaultVoiceCloning\s+Boolean\?\n/);
    expect(schema).toMatch(/tierChosenAt\s+DateTime\?\n/);
  });

  it("down.sql drops exactly those columns", () => {
    for (const col of ["defaultTier", "defaultVoiceCloning", "tierChosenAt"]) {
      expect(down).toContain(
        `ALTER TABLE "SpeakerProfile" DROP COLUMN IF EXISTS "${col}"`,
      );
    }
    expect(sql(down).match(/DROP/g)).toHaveLength(3);
  });
});
