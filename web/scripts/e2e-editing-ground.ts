/**
 * END-TO-END WALKTHROUGH of the editing ground (tasks/editing-ground-spec.md),
 * as a throwaway test annotator against a locally running dev server.
 *
 * Usage (from web/, with the dev server up):
 *   npx next dev -p 3123          # in another shell
 *   npx tsx --env-file=.env.local scripts/e2e-editing-ground.ts
 *
 * Isolation contract: everything it creates hangs off dedicated eg_e2e_*
 * prompts, a dedicated test candidate, and a dedicated test user. Each test
 * prompt carries at most ONE pool-arm output, so it is never pairwise-eligible
 * and can never be served to a real annotator while the script runs. The
 * episode-path leg runs with a demoSessionId (isDemo=true rows). The lane leg
 * necessarily writes non-demo rows (own-verdict servability requires a
 * non-demo comparison by design) - those live only on the test-only entities
 * and are hard-deleted in the cleanup step, which runs even on failure and
 * verifies zero test rows remain.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { applySegments, nfc } from "@/lib/edit-segments";

const BASE = process.env.EG_E2E_BASE_URL ?? "http://localhost:3123";
const EMAIL = "eg-e2e@test.local";
const PASSWORD = "egE2eWalkthrough42";
const TAG = "eg_e2e"; // prefix on every promptId this script owns

const prisma = new PrismaClient();

// ─── tiny transcript logger ──────────────────────────────────────────────────
const transcript: string[] = [];
let failures = 0;
function log(line: string) {
  transcript.push(line);
  console.log(line);
}
function check(cond: boolean, label: string) {
  const mark = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  log(`   [${mark}] ${label}`);
  if (!cond) throw new Error(`assertion failed: ${label}`);
}

// ─── minimal cookie jar over fetch ───────────────────────────────────────────
const jar = new Map<string, string>();
function storeCookies(res: Response) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
function cookieHeader(): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function api(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: {
      cookie: cookieHeader(),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function login() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { redirect: "manual" });
  storeCookies(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body: new URLSearchParams({
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      json: "true",
    }),
  });
  storeCookies(res);
  if (![...jar.keys()].some((k) => k.includes("session-token"))) {
    throw new Error(`login failed (status ${res.status})`);
  }
}

// ─── seed / cleanup ──────────────────────────────────────────────────────────

// The real corpus pair from ig_bank_auth_012, deliberately stored NFD so the
// walkthrough proves the NFC contract end to end.
const OUT_A_TEXT_NFD = "Àgbá Ọ́jọ́".normalize("NFD");
const OUT_B2_TEXT = "Ọjọ ki chẹnyọ ñwu wẹ";

interface Seeded {
  userId: string;
  candidateId: string;
  promptIds: string[]; // db cuids
  outA: string;
  outB: string;
  outA2: string;
  outB2: string;
  outFrozen: string;
  outNoVote: string;
  outputIds: string[];
}

async function seed(): Promise<Seeded> {
  const passwordHash = await hash(PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "EG E2E Walkthrough",
      passwordHash,
      role: "ANNOTATOR",
    },
  });
  const candidate = await prisma.candidateModel.create({
    data: {
      name: "EG E2E pool arm (delete me)",
      slug: `eg-e2e-arm-${Date.now()}`,
      family: "test",
      kind: "baseline",
      baseModelId: "test/eg-e2e",
      provider: "openai-compatible",
      inPairingPool: true, // rule 1 must hold for lane targets
    },
  });

  const mkPrompt = (publicId: string, bucket: string, isHoldout = false) =>
    prisma.prompt.create({
      data: {
        promptId: publicId,
        bucket: bucket as never,
        text: `[e2e walkthrough] ${publicId}`,
        split: isHoldout ? "test" : "train",
        isHoldout,
        provenance: "e2e_walkthrough_delete_me",
      },
    });
  // Each prompt gets AT MOST ONE pool-arm output -> outputCount stays < 2 ->
  // never pairwise-eligible -> invisible to real annotators' queues.
  const p1 = await mkPrompt(`${TAG}_001`, "authenticity");
  const p2 = await mkPrompt(`${TAG}_002`, "grammar_tone");
  const p3 = await mkPrompt(`${TAG}_003`, "authenticity", true);
  const p4 = await mkPrompt(`${TAG}_004`, "lexicon_disambig");

  const mkOut = (promptId: string, text: string, pool: boolean) =>
    prisma.modelOutput.create({
      data: {
        promptId,
        model: "eg-e2e",
        modelId: "test/eg-e2e",
        candidateModelId: pool ? candidate.id : null,
        outputText: text,
      },
    });
  const outA = await mkOut(p1.id, OUT_A_TEXT_NFD, true);
  const outB = await mkOut(p1.id, "gibberish one", false);
  const outA2 = await mkOut(p2.id, "gibberish two", false);
  const outB2 = await mkOut(p2.id, OUT_B2_TEXT, true);
  const outFrozen = await mkOut(p3.id, "frozen text", true);
  const outFrozen2 = await mkOut(p3.id, "frozen text b", false);
  const outNoVote = await mkOut(p4.id, "unjudged text", true);

  // The test annotator's own past verdicts (non-demo - servability rule 3).
  const t0 = new Date(Date.now() - 60 * 60 * 1000);
  const later = (min: number) => new Date(t0.getTime() + min * 60 * 1000);
  await prisma.pairwiseComparison.create({
    data: {
      promptId: `${TAG}_001`,
      bucket: "authenticity",
      modelOutputAId: outA.id,
      modelOutputBId: outB.id,
      winner: "both_inadequate",
      explanation:
        "Neither is how a speaker would say thank God - not Igala phrasing.",
      failureTagsA: ["not_igala"],
      failureTagsB: ["wrong_language"],
      annotatorId: user.id,
      createdAt: t0,
    },
  });
  await prisma.pairwiseComparison.create({
    data: {
      promptId: `${TAG}_002`,
      bucket: "grammar_tone",
      modelOutputAId: outA2.id,
      modelOutputBId: outB2.id,
      winner: "b",
      explanation: "B has the right blessing but one wrong word.",
      failureTagsA: ["wrong_word"],
      annotatorId: user.id,
      createdAt: later(1),
    },
  });
  await prisma.pairwiseComparison.create({
    data: {
      promptId: `${TAG}_003`,
      bucket: "authenticity",
      modelOutputAId: outFrozen.id,
      modelOutputBId: outFrozen2.id,
      winner: "tie",
      explanation: "both fine (frozen prompt).",
      annotatorId: user.id,
      createdAt: later(2),
    },
  });

  return {
    userId: user.id,
    candidateId: candidate.id,
    promptIds: [p1.id, p2.id, p3.id, p4.id],
    outA: outA.id,
    outB: outB.id,
    outA2: outA2.id,
    outB2: outB2.id,
    outFrozen: outFrozen.id,
    outNoVote: outNoVote.id,
    outputIds: [
      outA.id,
      outB.id,
      outA2.id,
      outB2.id,
      outFrozen.id,
      outFrozen2.id,
      outNoVote.id,
    ],
  };
}

async function cleanup(s: Seeded | null) {
  // Delete by ownership, FK-safe order. Idempotent: match on the test
  // entities whether or not each step of the walkthrough ran.
  const where = s
    ? {
        user: { id: s.userId },
        outputs: s.outputIds,
        prompts: s.promptIds,
        candidate: s.candidateId,
      }
    : null;
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  const prompts = await prisma.prompt.findMany({
    where: { promptId: { startsWith: TAG } },
    select: { id: true },
  });
  const promptIds = where?.prompts ?? prompts.map((p) => p.id);
  const outputs = await prisma.modelOutput.findMany({
    where: { promptId: { in: promptIds } },
    select: { id: true },
  });
  const outputIds = outputs.map((o) => o.id);

  const deleted = {
    edits: (
      await prisma.outputEdit.deleteMany({
        where: { modelOutputId: { in: outputIds } },
      })
    ).count,
    rubric: (
      await prisma.rubricAxisScore.deleteMany({
        where: { modelOutputId: { in: outputIds } },
      })
    ).count,
    comparisons: (
      await prisma.pairwiseComparison.deleteMany({
        where: {
          OR: [
            { modelOutputAId: { in: outputIds } },
            { modelOutputBId: { in: outputIds } },
          ],
        },
      })
    ).count,
    cold: (
      await prisma.coldAuthorAnswer.deleteMany({
        where: { promptId: { in: promptIds } },
      })
    ).count,
    flags: (
      await prisma.promptFlag.deleteMany({
        where: { promptId: { in: promptIds } },
      })
    ).count,
    outputs: (
      await prisma.modelOutput.deleteMany({ where: { id: { in: outputIds } } })
    ).count,
    prompts: (
      await prisma.prompt.deleteMany({ where: { id: { in: promptIds } } })
    ).count,
    candidates: (
      await prisma.candidateModel.deleteMany({
        where: { slug: { startsWith: "eg-e2e-arm-" } },
      })
    ).count,
    users: user
      ? (await prisma.user.deleteMany({ where: { id: user.id } })).count
      : 0,
  };
  log(`CLEANUP deleted: ${JSON.stringify(deleted)}`);

  const leftovers = await Promise.all([
    prisma.prompt.count({ where: { promptId: { startsWith: TAG } } }),
    prisma.user.count({ where: { email: EMAIL } }),
    prisma.candidateModel.count({
      where: { slug: { startsWith: "eg-e2e-arm-" } },
    }),
  ]);
  log(
    `CLEANUP verify (must all be 0): prompts=${leftovers[0]} users=${leftovers[1]} candidates=${leftovers[2]}`,
  );
  if (leftovers.some((n) => n !== 0)) {
    throw new Error("cleanup left test rows behind");
  }
}

// ─── the walkthrough ─────────────────────────────────────────────────────────

async function main() {
  log(`=== EDITING-GROUND E2E WALKTHROUGH (${new Date().toISOString()}) ===`);
  log(`server: ${BASE}; test annotator: ${EMAIL}`);

  const before = {
    edits: await prisma.outputEdit.count(),
    comparisons: await prisma.pairwiseComparison.count(),
  };
  log(
    `baseline row counts: OutputEdit=${before.edits} PairwiseComparison=${before.comparisons}`,
  );

  let seeded: Seeded | null = null;
  try {
    seeded = await seed();
    log(`seeded: 1 user, 1 pool candidate, 4 prompts, 7 outputs, 3 verdicts`);

    await login();
    log(`login: ok (credentials flow, session cookie held)`);

    // 1. summary shows the live lane size
    log(`\n[1] GET /api/annotator/summary`);
    const sum1 = await api("GET", "/api/annotator/summary");
    log(
      `    -> ${sum1.status} correctionsWaiting=${sum1.json.correctionsWaiting}`,
    );
    check(sum1.status === 200, "summary 200");
    check(
      sum1.json.correctionsWaiting === 2,
      `correctionsWaiting is 2 (001 both_inadequate + 002 winner; holdout 003 and unjudged 004 excluded), got ${sum1.json.correctionsWaiting}`,
    );

    // 2. first task: oldest verdict first, both_inadequate side A, blind
    log(`\n[2] GET /api/edits/next`);
    const next1 = await api("GET", "/api/edits/next");
    const t1 = next1.json.task as {
      prompt: { promptId: string };
      output: { id: string; text: string };
      verdict: { role: string; explanation: string; failureTags: string[] };
    };
    log(
      `    -> ${next1.status} waiting=${(next1.json.progress as { waiting: number }).waiting} prompt=${t1?.prompt?.promptId} role=${t1?.verdict?.role}`,
    );
    check(next1.status === 200 && !next1.json.complete, "serves a task");
    check(t1.prompt.promptId === `${TAG}_001`, "oldest verdict served first");
    check(t1.output.id === seeded.outA, "the judged pool-arm output (side A)");
    check(t1.output.text === nfc(OUT_A_TEXT_NFD), "output text served as NFC");
    check(t1.verdict.role === "both_inadequate", "role replayed");
    check(
      t1.verdict.explanation.includes("thank God"),
      "own explanation replayed",
    );
    check(
      JSON.stringify(t1.verdict.failureTags) === JSON.stringify(["not_igala"]),
      "THIS side's failure tags replayed",
    );
    check(
      !JSON.stringify(next1.json).includes("eg-e2e"),
      "no model name anywhere in the payload (lane stays blind)",
    );

    // 3. save a correction with segments + reasons (incl. the unsure tag)
    log(`\n[3] POST /api/edits/submit (the worked-example fix, with reasons)`);
    const corrected = "Agba ọjọ";
    const seg = {
      start: 0,
      end: nfc(OUT_A_TEXT_NFD).length,
      original: nfc(OUT_A_TEXT_NFD),
      replacement: corrected,
      reason: "The team writes it without the tone marks.",
      reasonTags: ["tone_marks", "unsure"],
    };
    const save1 = await api("POST", "/api/edits/submit", {
      modelOutputId: seeded.outA,
      correctedText: corrected,
      segments: [seg],
    });
    log(`    -> ${save1.status} ${JSON.stringify(save1.json)}`);
    check(save1.status === 200 && save1.json.success === true, "saved");

    const row = await prisma.outputEdit.findFirst({
      where: { modelOutputId: seeded.outA },
    });
    check(!!row, "OutputEdit row exists");
    check(row!.originalText === nfc(OUT_A_TEXT_NFD), "originalText stored NFC");
    check(row!.correctedText === corrected, "correctedText stored");
    check(
      row!.provenance === "salvage_both_inadequate",
      "provenance salvage_both_inadequate (from the verdict role)",
    );
    check(row!.verificationStatus === "single_annotator", "single_annotator");
    check(row!.isDemo === false, "lane write is non-demo (test-only entities)");
    check(
      row!.consentBenchmark === true && row!.consentTraining === true,
      "consent defaults true",
    );
    const env = row!.segments as {
      v: number;
      segments: {
        start: number;
        end: number;
        original: string;
        replacement: string;
        reason?: string;
        reasonTags?: string[];
      }[];
    };
    check(env?.v === 1, "segments envelope v1");
    check(
      applySegments(row!.originalText, env.segments) === row!.correctedText,
      "applySegments(originalText, segments) === correctedText on the stored row",
    );
    check(
      JSON.stringify(env.segments[0].reasonTags) ===
        JSON.stringify(["tone_marks", "unsure"]),
      "reason tags stored (incl. span-level 'unsure' - where confidence went)",
    );
    check(!!env.segments[0].reason, "free-text reason stored");

    // 4. never re-serves the corrected output; next in verdict-age order
    log(`\n[4] GET /api/edits/next (must move on)`);
    const next2 = await api("GET", "/api/edits/next");
    const t2 = next2.json.task as typeof t1;
    log(
      `    -> ${next2.status} waiting=${(next2.json.progress as { waiting: number }).waiting} prompt=${t2?.prompt?.promptId} role=${t2?.verdict?.role}`,
    );
    check(t2.prompt.promptId === `${TAG}_002`, "second verdict served next");
    check(
      t2.output.id === seeded.outB2,
      "the WINNING side only (pure loser never served)",
    );
    check(t2.verdict.role === "winner", "role winner");
    check(
      (next2.json.progress as { waiting: number }).waiting === 1,
      "waiting dropped to 1 (live count)",
    );

    // 5. duplicate correction -> 409
    log(`\n[5] POST /api/edits/submit again on the same output (409 expected)`);
    const dup = await api("POST", "/api/edits/submit", {
      modelOutputId: seeded.outA,
      correctedText: "Agba ọjọ dẹẹ",
    });
    log(`    -> ${dup.status} ${JSON.stringify(dup.json)}`);
    check(dup.status === 409, "409 - you have already corrected this one");

    // 6. no-change submit -> 400 (NFD original vs visibly identical NFC typing)
    log(`\n[6] POST /api/edits/submit with an identical (NFC-retyped) text`);
    const noChange = await api("POST", "/api/edits/submit", {
      modelOutputId: seeded.outB2,
      correctedText: nfc(OUT_B2_TEXT),
    });
    log(`    -> ${noChange.status} ${JSON.stringify(noChange.json)}`);
    check(
      noChange.status === 400,
      "400 - no change made (phantom diff killed)",
    );

    // 7. unjudged output -> 403 (servability re-derived server-side)
    log(`\n[7] POST /api/edits/submit on an output with no verdict (403)`);
    const noVote = await api("POST", "/api/edits/submit", {
      modelOutputId: seeded.outNoVote,
      correctedText: "different text",
    });
    log(`    -> ${noVote.status} ${JSON.stringify(noVote.json)}`);
    check(noVote.status === 403, "403 - not servable without an own verdict");

    // 8. held-out prompt -> 403 even with a verdict
    log(`\n[8] POST /api/edits/submit on a held-out prompt's output (403)`);
    const frozen = await api("POST", "/api/edits/submit", {
      modelOutputId: seeded.outFrozen,
      correctedText: "different text",
    });
    log(`    -> ${frozen.status} ${JSON.stringify(frozen.json)}`);
    check(frozen.status === 403, "403 - holdout never served or saved");

    // 9. malformed segments never block the write - server derives spans
    log(
      `\n[9] POST /api/edits/submit with GARBAGE segments (kept edit, derived spans)`,
    );
    const fix2 = "Ọjọ ki d'ẹnyọ ñwu wẹ";
    const badSegs = await api("POST", "/api/edits/submit", {
      modelOutputId: seeded.outB2,
      correctedText: fix2,
      segments: [{ start: 999, end: 4, original: "junk", nonsense: true }],
    });
    log(`    -> ${badSegs.status} ${JSON.stringify(badSegs.json)}`);
    check(badSegs.status === 200, "edit saved despite malformed enrichment");
    const row2 = await prisma.outputEdit.findFirst({
      where: { modelOutputId: seeded.outB2 },
    });
    const env2 = row2!.segments as {
      v: number;
      segments: { original: string; replacement: string }[];
    };
    check(
      env2.v === 1 && env2.segments.length === 1,
      "server-derived segments stored (single-token fix -> one span)",
    );
    check(
      env2.segments[0].original.includes("chẹnyọ") &&
        env2.segments[0].replacement.includes("d'ẹnyọ"),
      "derived span isolates chẹnyọ -> d'ẹnyọ",
    );
    check(
      applySegments(row2!.originalText, env2.segments as never) ===
        row2!.correctedText,
      "derived segments reconstruct exactly",
    );
    check(
      row2!.provenance === "model_correction",
      "winner role -> model_correction",
    );

    // 10. lane drained
    log(`\n[10] GET /api/edits/next (drained)`);
    const next3 = await api("GET", "/api/edits/next");
    log(`    -> ${next3.status} ${JSON.stringify(next3.json)}`);
    check(
      next3.json.complete === true &&
        (next3.json.progress as { waiting: number }).waiting === 0,
      "complete, waiting 0",
    );

    // 11. skip flow on a fresh servable target (re-seed a verdict on 004)
    log(`\n[11] skip flow: give ${TAG}_004 a verdict, then skip it`);
    // First, the never-trust-the-client guard: 004 has no verdict from this
    // annotator yet, so a skip must 403 and write NO flag - otherwise the
    // flag would eat the prompt out of their own pairwise queue.
    const skipUnjudged = await api("POST", "/api/edits/skip", {
      promptId: `${TAG}_004`,
    });
    check(
      skipUnjudged.status === 403,
      "skip on an unjudged prompt -> 403, never a flag",
    );
    check(
      (await prisma.promptFlag.count({
        where: { annotatorId: seeded.userId, reason: "edit_skip" },
      })) === 0,
      "no edit_skip flag written by the rejected skip",
    );
    await prisma.pairwiseComparison.create({
      data: {
        promptId: `${TAG}_004`,
        bucket: "lexicon_disambig",
        modelOutputAId: seeded.outNoVote,
        modelOutputBId: seeded.outB, // non-pool partner
        winner: "tie",
        explanation: "tie for the skip test.",
        annotatorId: seeded.userId,
      },
    });
    const beforeSkip = await api("GET", "/api/edits/next");
    check(
      (beforeSkip.json.task as typeof t1)?.prompt?.promptId === `${TAG}_004`,
      "new verdict makes the prompt servable again",
    );
    const skip1 = await api("POST", "/api/edits/skip", {
      promptId: `${TAG}_004`,
    });
    const skip2 = await api("POST", "/api/edits/skip", {
      promptId: `${TAG}_004`,
    });
    log(
      `    -> skip ${skip1.status}, repeat skip ${skip2.status} (idempotent)`,
    );
    check(skip1.status === 200 && skip2.status === 200, "skip 200, idempotent");
    const flags = await prisma.promptFlag.count({
      where: { annotatorId: seeded.userId, reason: "edit_skip" },
    });
    check(flags === 1, "exactly one edit_skip PromptFlag row");
    const afterSkip = await api("GET", "/api/edits/next");
    check(afterSkip.json.complete === true, "skipped prompt never re-served");
    const skip404 = await api("POST", "/api/edits/skip", {
      promptId: "does_not_exist_xyz",
    });
    check(skip404.status === 404, "unknown prompt -> 404");

    // 12. episode path (demo-isolated): both_inadequate markup via
    //     /api/annotations/submit -> provenance salvage_both_inadequate
    log(
      `\n[12] POST /api/annotations/submit (demo session): both_inadequate + markup edit`,
    );
    const demoId = `eg-e2e-demo-${Date.now()}`;
    const epi1 = await api("POST", "/api/annotations/submit", {
      promptId: `${TAG}_001`,
      modelOutputAId: seeded.outA,
      modelOutputBId: seeded.outB,
      winner: "both_inadequate",
      explanation: "demo episode: neither works, marking up B.",
      failureTagsB: ["not_igala"],
      edit: {
        modelOutputId: seeded.outB,
        correctedText: "Agba ọjọ",
        segments: [
          {
            start: 0,
            end: "gibberish one".length,
            original: "gibberish one",
            replacement: "Agba ọjọ",
            reasonTags: ["not_igala"],
          },
        ],
      },
      demoSessionId: demoId,
    });
    log(`    -> ${epi1.status} ${JSON.stringify(epi1.json)}`);
    check(
      epi1.status === 200 && epi1.json.editsSaved === 1,
      "episode markup saved",
    );
    const demoEdit = await prisma.outputEdit.findFirst({
      where: { modelOutputId: seeded.outB },
    });
    check(
      demoEdit!.isDemo === true,
      "episode leg is demo-isolated (isDemo=true)",
    );
    check(
      demoEdit!.provenance === "salvage_both_inadequate",
      "both_inadequate markup -> salvage_both_inadequate",
    );
    const demoEnv = demoEdit!.segments as { v: number; segments: unknown[] };
    check(
      demoEnv.v === 1 && demoEnv.segments.length === 1,
      "client segments kept",
    );

    // 13. episode path (demo): winner edit WITHOUT segments -> derived
    log(
      `\n[13] POST /api/annotations/submit (demo): winner edit, stale-client shape (no segments)`,
    );
    const epi2 = await api("POST", "/api/annotations/submit", {
      promptId: `${TAG}_002`,
      modelOutputAId: seeded.outA2,
      modelOutputBId: seeded.outB2,
      winner: "b",
      confidence: 4, // stale clients still send it - must stay accepted
      explanation: "demo episode: B wins, fixing one word.",
      rubricAxes: [{ axis: "syntax", score: 4 }],
      edit: { correctedText: fix2 },
      demoSessionId: demoId,
    });
    log(`    -> ${epi2.status} ${JSON.stringify(epi2.json)}`);
    check(
      epi2.status === 200 && epi2.json.editsSaved === 1,
      "stale-client edit saved (confidence still accepted)",
    );
    const demoEdit2 = await prisma.outputEdit.findFirst({
      where: { modelOutputId: seeded.outB2, isDemo: true },
    });
    const demoEnv2 = demoEdit2!.segments as {
      v: number;
      segments: { original: string; replacement: string }[];
    };
    check(
      demoEdit2!.provenance === "model_correction" &&
        demoEnv2.v === 1 &&
        demoEnv2.segments.length === 1 &&
        applySegments(demoEdit2!.originalText, demoEnv2.segments as never) ===
          demoEdit2!.correctedText,
      "winner edit: segments derived server-side, provenance model_correction",
    );

    // 14. final summary: lane empty again
    log(`\n[14] GET /api/annotator/summary (final)`);
    const sum2 = await api("GET", "/api/annotator/summary");
    log(
      `    -> ${sum2.status} correctionsWaiting=${sum2.json.correctionsWaiting}`,
    );
    check(sum2.json.correctionsWaiting === 0, "correctionsWaiting back to 0");

    log(`\nALL CHECKS PASSED`);
  } finally {
    log(`\n=== CLEANUP ===`);
    await cleanup(seeded);
    const after = {
      edits: await prisma.outputEdit.count(),
      comparisons: await prisma.pairwiseComparison.count(),
    };
    log(
      `row counts after cleanup: OutputEdit=${after.edits} (baseline ${before.edits}) PairwiseComparison=${after.comparisons} (baseline ${before.comparisons})`,
    );
    // Pollution is asserted on TEST-OWNED rows, never global totals: real
    // annotators keep working while this runs against a live DB, so global
    // counts move legitimately mid-run. cleanup() already threw if any
    // eg_e2e-owned row survived; this re-checks the ownership scan here so
    // the pass/fail verdict is explicit in the transcript.
    const strays = {
      prompts: await prisma.prompt.count({
        where: { promptId: { startsWith: TAG } },
      }),
      users: await prisma.user.count({ where: { email: EMAIL } }),
      candidates: await prisma.candidateModel.count({
        where: { slug: { startsWith: "eg-e2e-arm-" } },
      }),
    };
    if (strays.prompts !== 0 || strays.users !== 0 || strays.candidates !== 0) {
      failures++;
      log(`[FAIL] test-owned rows survived cleanup`);
    } else {
      log(
        `[PASS] zero test-owned rows survive - nothing pollutes real data ` +
          `(global deltas, if any, are concurrent real-annotator activity)`,
      );
    }
    await prisma.$disconnect();
  }

  if (failures > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("\nWALKTHROUGH FAILED:", e);
  await prisma.$disconnect();
  process.exit(1);
});
