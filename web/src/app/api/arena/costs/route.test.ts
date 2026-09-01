import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The ledger's one-source-of-truth rule, proved against a fake prisma:
 *   - category "eval_generation" rows are EXCLUDED from every consumption sum
 *     (their generations are already priced live from stored token counts) but
 *     still appear in ledger.entries, flagged countedInInference;
 *   - judge / other rows ARE counted, and are not flagged;
 *   - "credits" rows are cash: never in consumption, always in cashTotal.
 */

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    modelOutput: { findMany: vi.fn() },
    fineTuneJob: { findMany: vi.fn() },
    costEntry: { findMany: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET } from "./route";

const entry = (over: Record<string, unknown>) => ({
  id: "e",
  category: "other",
  provider: "openai",
  label: "label",
  amountUsd: 1,
  estimated: true,
  refType: null,
  refId: null,
  createdAt: new Date("2026-01-01"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "u1",
    role: "RESEARCHER",
  });
  mockPrisma.modelOutput.findMany.mockResolvedValue([]);
  mockPrisma.fineTuneJob.findMany.mockResolvedValue([]);
  mockPrisma.costEntry.findMany.mockResolvedValue([]);
});

async function body() {
  const res = await GET();
  return res.json();
}

describe("GET /api/arena/costs", () => {
  it("excludes eval_generation rows from consumption but still lists them", async () => {
    mockPrisma.costEntry.findMany.mockResolvedValue([
      entry({
        id: "gen-1",
        category: "eval_generation",
        provider: "google",
        label: "train-queue-fill slice 1",
        amountUsd: 0.34,
        refType: "train_queue_fill",
      }),
      entry({
        id: "judge-1",
        category: "judge",
        provider: "anthropic",
        amountUsd: 2,
      }),
    ]);

    const data = await body();

    // Sum: the judge row only.
    expect(data.ledger.total).toBe(2);
    expect(data.grandTotal).toBe(2);

    // Listing: both rows, correctly flagged.
    const rows = data.ledger.entries as {
      id: string;
      countedInInference: boolean;
      amount: number;
    }[];
    expect(rows.map((r) => r.id).sort()).toEqual(["gen-1", "judge-1"]);
    expect(rows.find((r) => r.id === "gen-1")).toMatchObject({
      countedInInference: true,
      amount: 0.34,
    });
    expect(rows.find((r) => r.id === "judge-1")?.countedInInference).toBe(
      false,
    );
  });

  it("never counts an eval_generation row twice against the live inference figure", async () => {
    // One stored output priced live, plus a ledger row for that same spend.
    mockPrisma.modelOutput.findMany.mockResolvedValue([
      {
        modelId: "gemini-3.1-pro-preview",
        tokenCountIn: 1_000_000,
        tokenCountOut: 1_000_000,
        candidateModel: { provider: "google" },
      },
    ]);
    mockPrisma.costEntry.findMany.mockResolvedValue([
      entry({
        id: "gen-1",
        category: "eval_generation",
        provider: "google",
        amountUsd: 14,
      }),
    ]);

    const data = await body();

    // 1M in @ $2 + 1M out @ $12 = $14, counted once.
    expect(data.inference.total).toBe(14);
    expect(data.ledger.total).toBe(0);
    expect(data.grandTotal).toBe(14);
  });

  it("keeps credits out of consumption and in cash", async () => {
    mockPrisma.costEntry.findMany.mockResolvedValue([
      entry({
        id: "cash-1",
        category: "credits",
        provider: "openrouter",
        amountUsd: 20,
        estimated: false,
      }),
      entry({ id: "judge-1", category: "judge", amountUsd: 3 }),
    ]);

    const data = await body();

    expect(data.cashTotal).toBe(20);
    expect(data.ledger.cashTotal).toBe(20);
    expect(data.ledger.total).toBe(3);
    expect(data.grandTotal).toBe(3);
    expect(data.ledger.entries).toHaveLength(2);
  });

  it("leaves eval_generation out of the per-provider burn-down too", async () => {
    mockPrisma.costEntry.findMany.mockResolvedValue([
      entry({
        id: "cash-1",
        category: "credits",
        provider: "google",
        amountUsd: 50,
        estimated: false,
      }),
      entry({
        id: "gen-1",
        category: "eval_generation",
        provider: "google",
        amountUsd: 5,
      }),
    ]);
    mockPrisma.modelOutput.findMany.mockResolvedValue([
      {
        modelId: "gemini-3-1-pro",
        tokenCountIn: 1_000_000,
        tokenCountOut: 0,
        candidateModel: { provider: "google" },
      },
    ]);

    const data = await body();
    const google = (
      data.burndown as {
        provider: string;
        consumed: number;
        remainingEstimate: number;
      }[]
    ).find((b) => b.provider === "google");

    // $2 of live inference, and NOT the $5 ledger echo of it.
    expect(google).toMatchObject({
      consumed: 2,
      remainingEstimate: 48,
    });
  });

  it("passes the auth guard's error straight through", async () => {
    const forbidden = { error: { status: 403 }, userId: null, role: null };
    mockRequireResearcher.mockResolvedValue(forbidden);
    expect(await GET()).toBe(forbidden.error);
  });
});
