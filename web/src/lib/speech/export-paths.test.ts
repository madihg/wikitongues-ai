import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { canExportLicensed, canExportOpen, neverLeaves } from "./guard";
import { buildOpenManifest } from "./manifest";
import { canTrain, canEvaluate } from "./can-train";
import { buildTrainingManifest, buildEvalManifest } from "./training-manifest";
import { loadTrainableRows, loadTestSetRows } from "./loop-rows";
import { buildSigned } from "./loop-launch";
import { buildFirstModelPlan } from "./first-model-plan";
import { syntheticClipRow } from "../../../scripts/speech/publish-listen-candidates";
import { mockProvider } from "./train-providers";
import { licensedRow, openRow } from "./fixtures";
import type { ManifestRow } from "./manifest";

// The export ROUTE is an entry point too: drive it with the database mocked.
const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findMany: vi.fn() },
    speakerProfile: { findMany: vi.fn().mockResolvedValue([]) },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET as exportRoute } from "@/app/api/lab/speech/export/route";
import { exportOpenManifest } from "../../../scripts/speech/export-manifest";

beforeEach(() => {
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
});

/**
 * THE export-path test (design: "Guards as code"). Every function that can
 * let a clip leave the platform is listed here as an entry point that takes
 * rows and returns the rows (by id) it would release. Each entry point must
 * refuse a COMMUNITY-ONLY row and a TEST-SET row, whatever else is true of
 * them. A new export path is added to ENTRY_POINTS in the same commit that
 * creates it.
 */

type EntryPoint = {
  name: string;
  released: (rows: ManifestRow[]) => Promise<string[]> | string[];
};

const gated = {
  consent: { commercialLicensing: true, crossBorder: true },
  gatedDelivery: true,
};

const ENTRY_POINTS: EntryPoint[] = [
  {
    name: "guard.canExportOpen",
    released: (rows) => rows.filter(canExportOpen).map((r) => r.id),
  },
  {
    name: "guard.canExportLicensed (gated delivery context)",
    released: (rows) =>
      rows.filter((r) => canExportLicensed(r, gated)).map((r) => r.id),
  },
  {
    name: "manifest.buildOpenManifest",
    released: (rows) => {
      // Lines carry no id; tag each row's path with its id to read it back.
      const tagged = rows.map((r) => ({ ...r, storagePath: r.id }));
      return buildOpenManifest(tagged).map((l) => l.clip);
    },
  },
  {
    // The route is handed EVERY row regardless of its query, so only the
    // guard stands between a forbidden row and the response.
    name: "route GET /api/lab/speech/export",
    released: async (rows) => {
      mockPrisma.speechRecording.findMany.mockResolvedValue(
        rows.map((r) => ({ ...r, storagePath: r.id })),
      );
      const text = await (await exportRoute()).text();
      return text
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l).clip as string);
    },
  },
  {
    name: "script scripts/speech/export-manifest.ts (exportOpenManifest)",
    released: (rows) =>
      exportOpenManifest(rows.map((r) => ({ ...r, storagePath: r.id })))
        .jsonl.split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l).clip as string),
  },
];

/** Rows that must never leave, each otherwise perfect for BOTH tiers. */
function forbiddenRows(): ManifestRow[] {
  return [
    openRow({ id: "community-open", tier: "community_only" }),
    openRow({
      id: "community-licensed",
      tier: "community_only",
      publishedOpenAt: null,
    }),
    openRow({ id: "testset-open", isTestSet: true }),
    licensedRow({ id: "testset-licensed", isTestSet: true }),
    // A synthesised clip, otherwise perfect for its tier: consented, rights
    // cleared, published, kept by a reviewer, cloning allowed.
    openRow({ id: "derived-open", sourceType: "derived", voiceCloningOptIn: true }),
    licensedRow({ id: "derived-licensed", sourceType: "derived", voiceCloningOptIn: true }),
    openRow({
      id: "frozen-prompt",
      prompt: { isHoldout: true, split: "test" },
    }),
    // The second-slice columns never weaken a guard: an English clip, a row
    // with take metrics, a row still carrying audio bytes (as a careless query
    // might hand it over) are refused exactly like any other forbidden row.
    {
      ...openRow({ id: "community-english", tier: "community_only" }),
      language: "english",
    },
    {
      ...openRow({ id: "testset-quality", isTestSet: true }),
      quality: { rmsDbfs: -20 },
      bytes: new Uint8Array([1, 2, 3]),
    } as ManifestRow,
    {
      ...openRow({
        id: "frozen-english-bytes",
        prompt: { isHoldout: false, split: "test" },
      }),
      language: "english",
      bytes: new Uint8Array([1, 2, 3]),
    } as ManifestRow,
  ];
}

describe.each(ENTRY_POINTS)("export entry point: $name", (entry) => {
  it("refuses community_only rows", async () => {
    const out = await entry.released(forbiddenRows());
    expect(out.filter((id) => id.startsWith("community"))).toEqual([]);
  });

  it("refuses test-set rows and rows on frozen prompts", async () => {
    const out = await entry.released(forbiddenRows());
    expect(
      out.filter(
        (id) =>
          id.startsWith("testset") ||
          id === "frozen-prompt" ||
          id.startsWith("frozen"),
      ),
    ).toEqual([]);
  });

  it("refuses a synthesised clip that is otherwise perfect for the tier", async () => {
    const out = await entry.released(forbiddenRows());
    expect(out.filter((id) => id.startsWith("derived"))).toEqual([]);
  });

  it("releases nothing when given only forbidden rows", async () => {
    expect(await entry.released(forbiddenRows())).toEqual([]);
  });

  it("still releases an eligible row of its own tier (the guard is not a blanket no)", async () => {
    const eligible = entry.name.includes("canExportLicensed")
      ? licensedRow({ id: "fine" })
      : openRow({ id: "fine" });
    const out = await entry.released([...forbiddenRows(), eligible]);
    expect(out).toEqual(["fine"]);
  });
});

/**
 * The TRAINING paths. A training manifest never carries a test-set row or a
 * frozen-prompt row, on any scope; on the provider scope it also refuses
 * community_only. The EVAL path is the one place test-set rows are allowed and
 * it refuses every row that is not in the test set.
 */
const signedUrl = (k: string) => `https://signed.example/${k}`;
const TRAIN_ENTRY_POINTS: EntryPoint[] = (
  ["internal", "provider"] as const
).flatMap((scope) => [
  {
    name: `can-train.canTrain (${scope})`,
    released: (rows: ManifestRow[]) =>
      rows
        .filter((r) => canTrain(r, { scope, purpose: "asr" }).ok)
        .map((r) => r.id),
  },
  ...(scope === "internal"
    ? [
        {
          // What the nightly run sends the worker: the same builder, signed.
          name: "loop-launch.buildSigned (nightly training manifest)",
          released: async (rows: ManifestRow[]) =>
            (await buildSigned(buildTrainingManifest, rows, "asr", mockProvider)).lines.map(
              (l) => l.id,
            ),
        },
      ]
    : []),
  {
    name: `training-manifest.buildTrainingManifest (${scope})`,
    released: (rows: ManifestRow[]) =>
      buildTrainingManifest(rows, {
        scope,
        purpose: "asr",
        signedUrl,
      }).lines.map((l) => l.id),
  },
]);

describe.each(TRAIN_ENTRY_POINTS)("training entry point: $name", (entry) => {
  it("refuses test-set rows and rows on frozen prompts", async () => {
    const out = await entry.released(forbiddenRows());
    expect(
      out.filter((id) => id.startsWith("testset") || id.startsWith("frozen")),
    ).toEqual([]);
  });

  it("refuses a synthesised clip that is otherwise perfect for training", async () => {
    // Consent on record, a chosen tier, rights cleared, kept, cloning allowed.
    const out = await entry.released(forbiddenRows());
    expect(out.filter((id) => id.startsWith("derived"))).toEqual([]);
    const control = [
      openRow({ id: "person-open", voiceCloningOptIn: true }),
      licensedRow({ id: "person-licensed", voiceCloningOptIn: true }),
    ];
    expect((await entry.released(control)).sort()).toEqual([
      "person-licensed",
      "person-open",
    ]);
  });

  it("refuses demo rows and rejected reviews", async () => {
    const rows = [
      openRow({ id: "demo", isDemo: true }),
      openRow({ id: "bad", reviewStatus: "bad_audio" }),
      openRow({ id: "fine" }),
    ];
    expect(await entry.released(rows)).toEqual(["fine"]);
  });

  it("still releases an eligible row", async () => {
    expect(
      await entry.released([...forbiddenRows(), openRow({ id: "fine" })]),
    ).toContain("fine");
  });
});

/**
 * The first voice model's plan is a training path too, and the narrowest one:
 * the cloning purpose (the clip's own opt-in), one voice, and the Open tier
 * held back until its speaker confirms the choice.
 */
describe("training entry point: first-model-plan.buildFirstModelPlan (voice cloning)", () => {
  const released = (rows: ManifestRow[]) => {
    const plan = buildFirstModelPlan(rows, { signedUrl });
    return [...plan.train, ...plan.heldOut].map((l) => l.id).sort();
  };
  const cloning = (id: string, over: Partial<ManifestRow> = {}) =>
    licensedRow({ id, voiceCloningOptIn: true, ...over });

  it("releases none of the forbidden rows", () => {
    expect(released(forbiddenRows())).toEqual([]);
  });

  it("refuses test, frozen, demo, rejected and unchecked clips even with the cloning opt-in", () => {
    const rows = [
      cloning("testset", { isTestSet: true }),
      cloning("frozen", { prompt: { isHoldout: true, split: "test" } }),
      cloning("demo", { isDemo: true }),
      cloning("bad", { reviewStatus: "bad_audio" }),
      cloning("unchecked", { reviewStatus: null }),
      cloning("no-consent", { consentId: null }),
      cloning("fine"),
    ];
    expect(released(rows)).toEqual(["fine"]);
  });

  it("refuses a clip without the cloning opt-in and holds the Open tier", () => {
    const rows = [
      licensedRow({ id: "no-optin" }),
      openRow({ id: "open-optin", voiceCloningOptIn: true }),
      cloning("fine"),
    ];
    expect(released(rows)).toEqual(["fine"]);
  });
});

/**
 * A synthetic clip published into Listen (scripts/speech/publish-listen-candidates.ts)
 * is a SpeechRecording row. It must never be taken for a person's speech: not
 * by an export, not by a training manifest, not by an exam, whatever a
 * reviewer later does to it. The row is built by the script's own function,
 * so this is the shape that reaches the database.
 */
describe("a synthetic Listen clip never leaves and never trains", () => {
  const synthetic = (id: string, over: Partial<ManifestRow> = {}): ManifestRow => {
    const written = syntheticClipRow({
      id,
      promptId: "p-1",
      systemRef: "mms-tts-yor-unadapted@test",
      mimeType: "audio/webm;codecs=opus",
      durationMs: 3000,
      sampleRate: 48000,
      sizeBytes: 1000,
      checksumSha256: "abc",
    });
    return {
      ...written,
      uploadedAt: new Date("2026-11-13T00:00:00Z"), // as it is once the audio is in place
      publishedOpenAt: null,
      dialect: null,
      consentVersion: null,
      fundingSource: "unknown",
      prompt: { isHoldout: false, split: "train" },
      coldAuthorAnswer: { answerText: "the market opens at dawn" },
      ...over,
    };
  };
  // As written, then with every flag a careless hand could flip, one at a time.
  const variants = (): ManifestRow[] => [
    synthetic("as-written"),
    synthetic("kept-by-a-reviewer", { reviewStatus: "keep" }),
    synthetic("tier-open", { tier: "open", reviewStatus: "keep", publishedOpenAt: new Date() }),
    synthetic("tier-licensed", { tier: "licensed", reviewStatus: "keep" }),
    synthetic("rights-cleared", { rightsStatus: "cleared", reviewStatus: "keep" }),
    synthetic("cloning-flag", { voiceCloningOptIn: true, reviewStatus: "keep" }),
    synthetic("marked-exam", { isTestSet: true, reviewStatus: "keep" }),
    // Every flag flipped at once, as favourably as each tier allows: a consent
    // record, rights cleared, kept by a reviewer, cloning allowed, published.
    synthetic("all-favourable-open", {
      tier: "open",
      publishedOpenAt: new Date(),
      consentId: "consent-1",
      rightsStatus: "cleared",
      reviewStatus: "keep",
      voiceCloningOptIn: true,
    }),
    synthetic("all-favourable-licensed", {
      tier: "licensed",
      consentId: "consent-1",
      rightsStatus: "cleared",
      reviewStatus: "keep",
      voiceCloningOptIn: true,
    }),
  ];

  it.each(ENTRY_POINTS)("export $name releases none of them", async (entry) => {
    expect(await entry.released(variants())).toEqual([]);
  });

  it.each(TRAIN_ENTRY_POINTS)("training $name takes none of them", async (entry) => {
    expect(await entry.released(variants())).toEqual([]);
  });

  it("the voice-cloning plan, the cloning purpose and the exam take none of them", () => {
    const plan = buildFirstModelPlan(variants(), { signedUrl, heldTiers: [] });
    expect([...plan.train, ...plan.heldOut]).toEqual([]);
    for (const row of variants()) {
      expect(canTrain(row, { scope: "internal", purpose: "cloning" }).ok, row.id).toBe(false);
      expect(canTrain(row, { scope: "internal", purpose: "tts" }).ok, row.id).toBe(false);
      expect(canEvaluate(row, { scope: "internal", purpose: "asr" }).ok, row.id).toBe(false);
      expect(neverLeaves(row) || row.rightsStatus !== "cleared" || row.consentId === null, row.id).toBe(true);
    }
  });

  it("the rule is stated outright: derived, before consent, tier or review are read", () => {
    for (const row of variants()) {
      for (const scope of ["internal", "provider"] as const) {
        for (const purpose of ["asr", "tts", "cloning"] as const) {
          expect(canTrain(row, { scope, purpose }), `${row.id} ${scope} ${purpose}`).toEqual({
            ok: false,
            reason: "derived",
          });
        }
      }
      expect(neverLeaves(row), row.id).toBe(true);
    }
  });

  it("the same favourable rows, as a person's recording, do train and do leave (the control)", () => {
    const person = variants()
      .filter((r) => r.id.startsWith("all-favourable"))
      .map((r) => ({ ...r, sourceType: "contributor" as const }));
    expect(person.length).toBe(2);
    for (const row of person) {
      expect(canTrain(row, { scope: "provider", purpose: "cloning" }), row.id).toEqual({ ok: true });
      expect(neverLeaves(row), row.id).toBe(false);
    }
    expect(canExportOpen(person[0])).toBe(true);
    expect(canExportLicensed(person[1], gated)).toBe(true);
  });

  it("under the outright rule, the row as written is still blocked three more ways", () => {
    // Read the row as if it were a person's: each of these alone refuses it.
    const row = { ...synthetic("as-written"), sourceType: "contributor" as const };
    expect(canTrain({ ...row, reviewStatus: "keep" }, { scope: "internal", purpose: "asr" })).toEqual({
      ok: false,
      reason: "no_consent",
    });
    expect(row.tier).toBe("community_only");
    expect(neverLeaves(row)).toBe(true);
    expect(row.rightsStatus).toBe("restricted");
  });
});

describe("the provider scope also refuses community_only", () => {
  it.each(TRAIN_ENTRY_POINTS.filter((e) => e.name.includes("provider")))(
    "$name",
    async (entry) => {
      const out = await entry.released(forbiddenRows());
      expect(out.filter((id) => id.startsWith("community"))).toEqual([]);
    },
  );
});

describe("eval entry points release test-set rows and nothing else", () => {
  const EVAL_ENTRY_POINTS: EntryPoint[] = [
    {
      name: "can-train.canEvaluate",
      released: (rows) =>
        rows
          .filter(
            (r) => canEvaluate(r, { scope: "internal", purpose: "asr" }).ok,
          )
          .map((r) => r.id),
    },
    {
      name: "training-manifest.buildEvalManifest",
      released: (rows) =>
        buildEvalManifest(rows, {
          scope: "internal",
          purpose: "asr",
          signedUrl,
        }).lines.map((l) => l.id),
    },
  ];
  const mixed = () => [
    openRow({ id: "train" }),
    licensedRow({ id: "train-licensed" }),
    openRow({ id: "exam", isTestSet: true }),
    openRow({
      id: "exam-frozen",
      isTestSet: true,
      prompt: { isHoldout: true, split: "test" },
    }),
    openRow({ id: "exam-demo", isTestSet: true, isDemo: true }),
    openRow({ id: "exam-bad", isTestSet: true, reviewStatus: "bad_audio" }),
  ];

  it.each(EVAL_ENTRY_POINTS)("$name refuses every non-test row", async (e) => {
    expect(await e.released(mixed())).toEqual(["exam", "exam-frozen"]);
  });
});

/**
 * Outside audio and withdrawn clips (US-039, US-040): no export entry point
 * releases a third_party clip whose source is not cleared, or a clip its
 * speaker withdrew. Same registry, so a new path is covered the day it is added.
 */
describe.each(ENTRY_POINTS)("rights guards: $name", (entry) => {
  const own = entry.name.includes("canExportLicensed") ? licensedRow : openRow;
  it("refuses outside audio whose source is pending or restricted", async () => {
    const rows = (["pending", "restricted"] as const).map((rightsStatus) =>
      own({
        id: `tp-${rightsStatus}`,
        sourceType: "third_party",
        sourceRef: "src-1",
        rightsStatus,
      }),
    );
    expect(await entry.released(rows)).toEqual([]);
  });

  it("refuses a clip its speaker withdrew", async () => {
    expect(
      await entry.released([own({ id: "gone", reviewStatus: "withdrawn" })]),
    ).toEqual([]);
  });
});

describe("the loop queries select explicit fields, never bytes", () => {
  it("loadTrainableRows and loadTestSetRows name a select without bytes", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = {
      speechRecording: { findMany },
      consentGrant: { findMany: vi.fn().mockResolvedValue([]) },
    } as never;
    await loadTrainableRows(db);
    await loadTestSetRows(db);
    for (const [arg] of findMany.mock.calls) {
      expect(arg.select).toBeDefined();
      expect(arg.select).not.toHaveProperty("bytes");
      expect(arg.select).not.toHaveProperty("quality");
    }
    expect(findMany.mock.calls[0][0].where).toMatchObject({ isTestSet: false });
    expect(findMany.mock.calls[1][0].where).toMatchObject({ isTestSet: true });
  });
});

describe("an eligible English clip is released like any other, and bytes never leave", () => {
  it("the manifest line carries the language and no audio or metrics", () => {
    const row = {
      ...openRow({ id: "en", storagePath: "clips/en.webm" }),
      language: "english",
      quality: { rmsDbfs: -20 },
      bytes: new Uint8Array([9, 9, 9]),
    } as ManifestRow;
    const text = JSON.stringify(buildOpenManifest([row]));
    expect(text).toContain('"language":"english"');
    expect(text).not.toMatch(/bytes|quality|rmsDbfs/);
  });
});

describe("neverLeaves is the shared floor", () => {
  it("is true for every forbidden row", () => {
    for (const r of forbiddenRows()) expect(neverLeaves(r), r.id).toBe(true);
  });
});

/**
 * The registry above must not rot: every non-test source file in the lab that
 * mentions an export predicate or the manifest builder is a registered entry
 * point, and any route or script with "export" in its path is registered.
 * Add the new path to ENTRY_POINTS and to REGISTERED_FILES together.
 */
const REGISTERED_FILES = [
  "src/lib/speech/guard.ts", // defines the predicates
  "src/lib/speech/manifest.ts", // buildOpenManifest, the one builder
  "src/app/api/lab/speech/export/route.ts", // the export route
  "src/lib/speech/open-rows.ts", // the shared candidate query (narrowing only)
  "src/lib/speech/can-train.ts", // the training guard (canTrain, canEvaluate)
  "src/lib/speech/training-manifest.ts", // the training and eval manifest builders
  "src/lib/speech/loop-rows.ts", // the training and test-set candidate queries
  "src/lib/speech/loop-launch.ts", // signs and launches the manifests (entry point above)
  "src/lib/speech/nightly.ts", // the nightly run: builds manifests only through buildSigned
  "scripts/speech/export-manifest.ts", // the export script
  "src/lib/speech/tts-job.ts", // the TTS launch: buildTrainingManifest, purpose tts
  "src/lib/speech/first-model-plan.ts", // the first voice model's plan: buildTrainingManifest, purpose cloning (entry point below)
  "scripts/speech/first-model-plan.ts", // its script: writes only what buildFirstModelPlan returns
  "scripts/speech/publish-listen-candidates.ts", // writes synthetic Listen clips (syntheticClipRow); every guard refuses that row (test above)
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name))
      out.push(full);
  }
  return out;
}

describe("the entry-point registry is complete", () => {
  const web = join(__dirname, "..", "..", "..");
  const roots = ["src/lib/speech", "src/app/api/lab", "scripts/speech"];
  const files = roots.flatMap((r) => {
    try {
      return sourceFiles(join(web, r));
    } catch {
      return []; // a root that does not exist yet
    }
  });

  it("every file that uses the export guard or builder is registered", () => {
    const users = files
      .map((f) => relative(web, f))
      .filter((rel) => {
        const src = readFileSync(join(web, rel), "utf8");
        return /canExportOpen|canExportLicensed|buildOpenManifest|neverLeaves|canTrain|canEvaluate|buildTrainingManifest|buildEvalManifest/.test(
          src,
        );
      })
      .filter((rel) => !rel.endsWith("fixtures.ts"));
    for (const rel of users) {
      expect(
        REGISTERED_FILES,
        `${rel} uses the export guard but is not registered`,
      ).toContain(rel);
    }
  });

  it("every route or script with export in its path is registered", () => {
    const exporters = files
      .map((f) => relative(web, f))
      .filter((rel) => /export/i.test(rel));
    for (const rel of exporters) {
      expect(
        REGISTERED_FILES,
        `${rel} looks like an export path but is not registered`,
      ).toContain(rel);
    }
  });

  it("every registered file exists", () => {
    for (const rel of REGISTERED_FILES) {
      expect(() => statSync(join(web, rel)), rel).not.toThrow();
    }
  });
});
