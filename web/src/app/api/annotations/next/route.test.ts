import { describe, it, expect, vi, beforeEach } from "vitest";
import { axesForBucket, bucketWatchFor } from "@/lib/buckets";
import { abSwap, assignedPair, hasAllowedPair } from "@/lib/pairing";

/**
 * /api/annotations/next, with the pinned prompt (?prompt=<code>) a researcher
 * opens from the review drawer.
 *
 * Annotators are working this queue while the change ships, so the first
 * thing held here is that NOTHING moved for a request without the parameter:
 * the response is compared as text against the bytes the route produced
 * before the pin existed. Then the pin itself: researchers only, the same
 * episode the queue would have dealt, and one plain status when the prompt
 * is not served.
 *
 * Prisma, auth and the retrieval search are mocked; the queue loader, the
 * pairing functions and the route are the real code. Every prompt, answer
 * and code below is invented for this file.
 */

const { mockPrisma, mockGetServerSession, mockSearchRag } = vi.hoisted(() => ({
  mockPrisma: {
    candidateModel: { count: vi.fn() },
    prompt: { findMany: vi.fn() },
    pairwiseComparison: { findMany: vi.fn() },
    promptFlag: { findMany: vi.fn() },
  },
  mockGetServerSession: vi.fn(),
  mockSearchRag: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rag", () => ({ searchRag: mockSearchRag }));

import { GET } from "./route";

// Three pooled arms whose three combinations are all on the pairing
// whitelist, so which pair a person gets is a real draw (checked below).
const ARMS = [
  "gemini-3-1-pro",
  "gemini-3-1-pro-rag-v3",
  "gemini-3-1-pro-rag-v4-4",
];
// On the whitelist only beside an arm this fixture does not have.
const UNPAIRED_ARM = "gemini-3-1-pro-tonestrip";

interface PromptRowOptions {
  bucket?: string;
  gold?: number;
  slugs?: string[];
  isHoldout?: boolean;
  note?: string | null;
}

/** A prompt as loadQueueInputs' query returns it. */
function promptRow(code: string, o: PromptRowOptions = {}) {
  return {
    id: `db-${code}`,
    promptId: code,
    bucket: o.bucket ?? "orthography",
    language: "Igala",
    text: `Question ${code}: how would you say this?`,
    targetCulture: null,
    expectedCulturalContext: o.note ?? null,
    isHoldout: o.isHoldout ?? false,
    provenance: null,
    modelOutputs: (o.slugs ?? ARMS).map((slug, i) => ({
      id: `${code}-out-${i}`,
      outputText: `Answer ${i} to ${code}: ukọlọ.`,
      candidateModel: { inPairingPool: true, archived: false, slug },
    })),
    _count: { coldAuthorAnswers: o.gold ?? 0 },
  };
}

// Queue order: HEAD (no gold yet, so served first), then SECOND, then FACTUAL.
const HEAD = "ig_test_001";
const SECOND = "ig_test_002";
const FACTUAL = "ig_test_003";
const FROZEN = "ig_test_frozen";
const ONE_ARM = "ig_test_onearm";
const NO_PAIR = "ig_test_nopair";

const PROMPT_ROWS = [
  promptRow(HEAD, { bucket: "register_honorifics", gold: 0 }),
  promptRow(SECOND, { bucket: "orthography", gold: 1 }),
  promptRow(FACTUAL, {
    bucket: "lexicon_disambig",
    gold: 2,
    note: "A note for the reference block.",
  }),
  // A frozen exam question. It holds an answer from every arm, so only the
  // holdout flag keeps it out; it must never be served or described.
  promptRow(FROZEN, { gold: 3, isHoldout: true }),
  promptRow(ONE_ARM, { slugs: [ARMS[0]] }),
  promptRow(NO_PAIR, { slugs: [ARMS[0], UNPAIRED_ARM] }),
];

const ANNOTATOR = { user: { id: "annot-1", role: "ANNOTATOR" } };
const RESEARCHER = { user: { id: "res-1", role: "RESEARCHER" } };

// The two history tables the route reads, held in memory.
let comparisons: { annotatorId: string; promptId: string; isDemo: boolean }[];
let flags: { annotatorId: string; code: string }[];

const judged = (code: string, annotatorId = RESEARCHER.user.id) =>
  comparisons.push({ annotatorId, promptId: code, isDemo: false });

function get(query = "") {
  return GET(new Request(`http://test/api/annotations/next${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  comparisons = [];
  flags = [];
  mockGetServerSession.mockResolvedValue(ANNOTATOR);
  mockPrisma.candidateModel.count.mockResolvedValue(ARMS.length);
  mockPrisma.prompt.findMany.mockResolvedValue(PROMPT_ROWS);
  mockPrisma.pairwiseComparison.findMany.mockImplementation(
    async ({ where }: { where: { annotatorId: string; isDemo: boolean } }) =>
      comparisons
        .filter(
          (c) =>
            c.annotatorId === where.annotatorId && c.isDemo === where.isDemo,
        )
        .map((c) => ({ promptId: c.promptId })),
  );
  mockPrisma.promptFlag.findMany.mockImplementation(
    async ({ where }: { where: { annotatorId: string } }) =>
      flags
        .filter((f) => f.annotatorId === where.annotatorId)
        .map((f) => ({ prompt: { promptId: f.code } })),
  );
  mockSearchRag.mockResolvedValue([
    { topic: "a topic", content: "a reference entry", source: "a source" },
  ]);
});

/** The A and B output ids the pairing functions give this user here. */
function sidesFor(userId: string, code: string) {
  const [i, j] = assignedPair(userId, code, ARMS.length, ARMS)!;
  const swap = abSwap(userId, code);
  return { a: `${code}-out-${swap ? j : i}`, b: `${code}-out-${swap ? i : j}` };
}

describe("the fixture", () => {
  it("draws from three whitelisted pairs, and holds one prompt with none", () => {
    expect(hasAllowedPair([ARMS[0], ARMS[1]])).toBe(true);
    expect(hasAllowedPair([ARMS[0], ARMS[2]])).toBe(true);
    expect(hasAllowedPair([ARMS[1], ARMS[2]])).toBe(true);
    expect(hasAllowedPair([ARMS[0], UNPAIRED_ARM])).toBe(false);
  });
});

describe("without ?prompt= the answer is what it was", () => {
  // The exact text the route answered with BEFORE the pinned path was added,
  // captured by running the previous route against this same fixture (the
  // two were also run side by side over 850 combinations of user, history
  // and query, and never differed by a byte). Text, not a parsed object: key
  // order and absent fields are part of what a deployed client reads. Only
  // the two per-category values are filled in from src/lib/buckets.ts, so a
  // wording edit there does not read as a queue change here.
  const headTask = (a: number, b: number) =>
    `"task":{"prompt":{"id":"db-ig_test_001","promptId":"ig_test_001","bucket":"register_honorifics","language":"Igala","text":"Question ig_test_001: how would you say this?","targetCulture":null,"expectedCulturalContext":null},"goldFirst":true,"lane":"both","watchFor":${JSON.stringify(bucketWatchFor("register_honorifics"))},"scoring":"subjective","applicableAxes":${JSON.stringify(axesForBucket("register_honorifics"))},"reference":null,"outputA":{"id":"ig_test_001-out-${a}","text":"Answer ${a} to ig_test_001: ukọlọ."},"outputB":{"id":"ig_test_001-out-${b}","text":"Answer ${b} to ig_test_001: ukọlọ."}}`;

  it("an annotator gets the head of the queue, byte for byte", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      `{"complete":false,"demo":false,"progress":{"completed":0,"total":3},${headTask(1, 0)}}`,
    );
  });

  it("a researcher gets the head of the queue, byte for byte (their own pair)", async () => {
    mockGetServerSession.mockResolvedValue(RESEARCHER);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      `{"complete":false,"demo":false,"progress":{"completed":0,"total":3},${headTask(2, 0)}}`,
    );
  });

  it("a demo link is unchanged too: the head whatever the history, and no history read", async () => {
    judged(HEAD, ANNOTATOR.user.id);
    const res = await get("?demo=demo-1");
    expect(await res.text()).toBe(
      `{"complete":false,"demo":true,"progress":{"completed":0,"total":3},${headTask(1, 0)}}`,
    );
    expect(mockPrisma.pairwiseComparison.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.promptFlag.findMany).not.toHaveBeenCalled();
  });

  it("a factual question still carries its reference block, in the same shape", async () => {
    mockGetServerSession.mockResolvedValue(RESEARCHER);
    judged(HEAD);
    judged(SECOND);
    const res = await get();
    expect(await res.text()).toBe(
      `{"complete":false,"demo":false,"progress":{"completed":2,"total":3},"task":{"prompt":{"id":"db-ig_test_003","promptId":"ig_test_003","bucket":"lexicon_disambig","language":"Igala","text":"Question ig_test_003: how would you say this?","targetCulture":null,"expectedCulturalContext":"A note for the reference block."},"goldFirst":false,"lane":"strong_pair","watchFor":${JSON.stringify(bucketWatchFor("lexicon_disambig"))},"scoring":"factual","applicableAxes":${JSON.stringify(axesForBucket("lexicon_disambig"))},"reference":{"note":"A note for the reference block.","entries":[{"topic":"a topic","content":"a reference entry","source":"a source"}]},"outputA":{"id":"ig_test_003-out-2","text":"Answer 2 to ig_test_003: ukọlọ."},"outputB":{"id":"ig_test_003-out-1","text":"Answer 1 to ig_test_003: ukọlọ."}}}`,
    );
  });

  it("the two endings are unchanged: all done, and nothing to serve at all", async () => {
    judged(HEAD, ANNOTATOR.user.id);
    judged(SECOND, ANNOTATOR.user.id);
    judged(FACTUAL, ANNOTATOR.user.id);
    expect(await (await get()).text()).toBe(
      '{"complete":true,"progress":{"completed":3,"total":3}}',
    );

    mockPrisma.prompt.findMany.mockResolvedValue([]);
    expect(await (await get()).text()).toBe(
      '{"complete":true,"message":"No prompts with model outputs available yet."}',
    );
  });

  it("never mentions a pin to someone who did not pin", async () => {
    for (const session of [ANNOTATOR, RESEARCHER]) {
      mockGetServerSession.mockResolvedValue(session);
      for (const query of ["", "?demo=demo-1"]) {
        expect(await (await get(query)).json()).not.toHaveProperty("pinned");
      }
    }
  });

  it("still refuses a request with no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect((await get(`?prompt=${SECOND}`)).status).toBe(401);
  });
});

describe("?prompt= is for researchers", () => {
  it("refuses an annotator with 403 and a plain message, before the queue is even loaded", async () => {
    const res = await get(`?prompt=${SECOND}`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/for researchers/i);
    expect(body).not.toHaveProperty("task");
    expect(body).not.toHaveProperty("pinned");
    expect(mockPrisma.prompt.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.pairwiseComparison.findMany).not.toHaveBeenCalled();
  });

  it("refuses whatever the value: empty, unknown, frozen, and with demo on", async () => {
    for (const query of [
      "?prompt=",
      "?prompt=no_such_code",
      `?prompt=${FROZEN}`,
      `?demo=demo-1&prompt=${SECOND}`,
    ]) {
      expect((await get(query)).status, query).toBe(403);
    }
  });

  it("refuses an account with no role, and any role that is not RESEARCHER", async () => {
    for (const user of [
      { id: "u-1" },
      { id: "u-2", role: "LEARNER" },
      { id: "u-3", role: "researcher" },
    ]) {
      mockGetServerSession.mockResolvedValue({ user });
      expect((await get(`?prompt=${SECOND}`)).status).toBe(403);
    }
  });

  it("the refusal answers the same for a real code and an invented one", async () => {
    const real = await get(`?prompt=${FROZEN}`);
    const invented = await get("?prompt=no_such_code");
    expect(await real.text()).toBe(await invented.text());
  });
});

describe("a researcher's pinned prompt", () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(RESEARCHER);
  });

  it("serves THAT prompt, not the head, with the pair and the A/B order assignedPair and abSwap give", async () => {
    const res = await get(`?prompt=${SECOND}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pinned).toEqual({ promptId: SECOND, status: "served" });
    expect(body.complete).toBe(false);
    expect(body.demo).toBe(false);
    expect(body.task.prompt.promptId).toBe(SECOND);
    const sides = sidesFor(RESEARCHER.user.id, SECOND);
    expect(body.task.outputA.id).toBe(sides.a);
    expect(body.task.outputB.id).toBe(sides.b);
    // Nothing was judged by opening it.
    expect(body.progress).toEqual({ completed: 0, total: 3 });
  });

  it("is the very episode the queue would deal this person for that prompt", async () => {
    for (const code of [SECOND, FACTUAL]) {
      const pinned = await (await get(`?prompt=${code}`)).json();

      // Walk the real queue to the same prompt and take what it serves.
      comparisons = [];
      for (const earlier of [HEAD, SECOND, FACTUAL]) {
        if (earlier === code) break;
        judged(earlier);
      }
      const dealt = await (await get()).json();
      comparisons = [];

      expect(dealt.task.prompt.promptId).toBe(code);
      expect(pinned.task).toEqual(dealt.task);
      expect(JSON.stringify(pinned.task)).toBe(JSON.stringify(dealt.task));
    }
  });

  it("different researchers are dealt their own pair on the same pinned prompt", async () => {
    const seen = new Set<string>();
    for (let n = 0; n < 24; n++) {
      const id = `res-${n}`;
      mockGetServerSession.mockResolvedValue({
        user: { id, role: "RESEARCHER" },
      });
      const { task } = await (await get(`?prompt=${SECOND}`)).json();
      const sides = sidesFor(id, SECOND);
      expect([task.outputA.id, task.outputB.id]).toEqual([sides.a, sides.b]);
      seen.add(`${task.outputA.id}|${task.outputB.id}`);
    }
    // The pin does not collapse everyone onto one pair or one orientation.
    expect(seen.size).toBeGreaterThan(2);
  });

  it("keeps the cold-first rule and the reference block of the prompt it serves", async () => {
    const head = await (await get(`?prompt=${HEAD}`)).json();
    expect(head.task.goldFirst).toBe(true);
    expect(head.task.lane).toBe("both");
    expect(head.task.reference).toBeNull();

    const factual = await (await get(`?prompt=${FACTUAL}`)).json();
    expect(factual.task.goldFirst).toBe(false);
    expect(factual.task.lane).toBe("strong_pair");
    expect(factual.task.reference).toEqual({
      note: "A note for the reference block.",
      entries: [
        { topic: "a topic", content: "a reference entry", source: "a source" },
      ],
    });
  });

  it("already_judged: a counted comparison of theirs exists, so no task", async () => {
    judged(SECOND);
    const body = await (await get(`?prompt=${SECOND}`)).json();
    expect(body.pinned).toEqual({ promptId: SECOND, status: "already_judged" });
    expect(body).not.toHaveProperty("task");
    expect(body.complete).toBe(false);
    expect(body.progress).toEqual({ completed: 1, total: 3 });
  });

  it("already_judged also when the earlier row holds the Prompt.id instead of the code (what submit refuses)", async () => {
    judged(`db-${SECOND}`);
    const body = await (await get(`?prompt=${SECOND}`)).json();
    expect(body.pinned.status).toBe("already_judged");
    expect(body).not.toHaveProperty("task");
  });

  it("someone else's judgment, or their own demo run, does not make it judged", async () => {
    judged(SECOND, "someone-else");
    comparisons.push({
      annotatorId: RESEARCHER.user.id,
      promptId: SECOND,
      isDemo: true,
    });
    const body = await (await get(`?prompt=${SECOND}`)).json();
    expect(body.pinned.status).toBe("served");
    expect(body.task.prompt.promptId).toBe(SECOND);
  });

  it("skipped: they skipped or flagged it, so no task", async () => {
    flags.push({ annotatorId: RESEARCHER.user.id, code: SECOND });
    const body = await (await get(`?prompt=${SECOND}`)).json();
    expect(body.pinned).toEqual({ promptId: SECOND, status: "skipped" });
    expect(body).not.toHaveProperty("task");
  });

  it("judged wins over skipped, the order the queue itself counts in", async () => {
    judged(SECOND);
    flags.push({ annotatorId: RESEARCHER.user.id, code: SECOND });
    const body = await (await get(`?prompt=${SECOND}`)).json();
    expect(body.pinned.status).toBe("already_judged");
  });

  it("not_in_queue: an unknown code, an empty one, one arm only, and no whitelisted pair", async () => {
    for (const code of ["no_such_code", "", ONE_ARM, NO_PAIR]) {
      const body = await (
        await get(`?prompt=${encodeURIComponent(code)}`)
      ).json();
      expect(body.pinned, code).toEqual({
        promptId: code,
        status: "not_in_queue",
      });
      expect(body).not.toHaveProperty("task");
    }
  });

  it("not_in_queue for a frozen exam question, and nothing else about it", async () => {
    const res = await get(`?prompt=${FROZEN}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      complete: false,
      demo: false,
      progress: { completed: 0, total: 3 },
      pinned: { promptId: FROZEN, status: "not_in_queue" },
    });
    // Not its text, not its answers, not its database id.
    expect(text).not.toContain("Question");
    expect(text).not.toContain("Answer");
    expect(text).not.toContain(`db-${FROZEN}`);
  });

  it("a frozen question answers exactly as an unknown code does, whatever the history", async () => {
    const shape = async (code: string) =>
      (await (await get(`?prompt=${code}`)).text()).replaceAll(code, "<code>");

    expect(await shape(FROZEN)).toBe(await shape("no_such_code"));

    // Old history on a frozen question must not turn the answer into
    // "already judged" or "skipped": either would say the code is real.
    judged(FROZEN);
    judged(`db-${FROZEN}`);
    flags.push({ annotatorId: RESEARCHER.user.id, code: FROZEN });
    expect(await shape(FROZEN)).toBe(await shape("no_such_code"));
  });

  it("a frozen question is not served in demo either", async () => {
    const body = await (await get(`?demo=demo-1&prompt=${FROZEN}`)).json();
    expect(body.pinned.status).toBe("not_in_queue");
    expect(body).not.toHaveProperty("task");
  });

  it("an empty catalogue answers not_in_queue rather than 'all done'", async () => {
    mockPrisma.prompt.findMany.mockResolvedValue([]);
    const body = await (await get(`?prompt=${SECOND}`)).json();
    expect(body).toEqual({
      complete: false,
      demo: false,
      progress: { completed: 0, total: 0 },
      pinned: { promptId: SECOND, status: "not_in_queue" },
    });
  });

  it("demo plus prompt serves a prompt they already judged, and one they skipped", async () => {
    judged(SECOND);
    flags.push({ annotatorId: RESEARCHER.user.id, code: FACTUAL });

    const again = await (await get(`?demo=demo-1&prompt=${SECOND}`)).json();
    expect(again.demo).toBe(true);
    expect(again.pinned).toEqual({ promptId: SECOND, status: "served" });
    const sides = sidesFor(RESEARCHER.user.id, SECOND);
    expect(again.task.outputA.id).toBe(sides.a);
    expect(again.task.outputB.id).toBe(sides.b);

    const skipped = await (await get(`?demo=demo-1&prompt=${FACTUAL}`)).json();
    expect(skipped.pinned.status).toBe("served");
    expect(skipped.task.prompt.promptId).toBe(FACTUAL);

    // Demo never reads the real history, pinned or not.
    expect(mockPrisma.pairwiseComparison.findMany).not.toHaveBeenCalled();
  });

  it("the same pair in demo as counted, so a draft made in one is found in the other", async () => {
    const counted = await (await get(`?prompt=${SECOND}`)).json();
    const demo = await (await get(`?demo=demo-1&prompt=${SECOND}`)).json();
    expect(demo.task).toEqual(counted.task);
  });
});
