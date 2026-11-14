import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSession, touched } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  touched: { reads: [] as string[] },
}));
vi.mock("next-auth", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
  usePathname: () => "/",
  useRouter: () => ({ push: () => undefined }),
}));
// Every read is recorded, then refused: a route or page that reads before
// it checks for a lead fails here.
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy(
          {},
          {
            get: (_m, method: string) => () => {
              touched.reads.push(`${model}.${method}`);
              throw new Error(`read before the lead check: ${model}.${method}`);
            },
          },
        ),
    },
  ),
}));
vi.mock("@/lib/queue-input", () => ({
  loadQueueInputs: vi.fn(async () => {
    touched.reads.push("queue");
    return { queuePrompts: [] };
  }),
}));

import { isResearchLead, researchLeadEmails } from "./leads";
import { requireLeadPage, requireResearcherPage } from "./page-gate";
import { requireLead } from "./lead-route";
import { loadTodayWork } from "./today-data";
import { weekOf } from "./week";
import PeoplePage from "@/app/(app)/admin/people/page";
import { GET as hours } from "@/app/api/admin/time-spent/route";
import { GET as activity } from "@/app/api/admin/activity/route";
import { GET as leadProbe } from "@/app/api/admin/lead/route";

/**
 * Who sees pay and people data. Agnes and Salem hold the RESEARCHER role so
 * they can use the speaker side, but they are annotators: hours per person,
 * the weekly table, who is running out and who has gone quiet are for the
 * owner and for the emails in RESEARCH_LEADS only.
 */

const OWNER = "madihalim@gmail.com";
const LEAD = "daniel@example.org";
const RESEARCHER = "agnes@example.org";

const was = process.env.RESEARCH_LEADS;
const leads = (value: string | undefined) => {
  if (value === undefined) delete process.env.RESEARCH_LEADS;
  else process.env.RESEARCH_LEADS = value;
};
const as = (user: Record<string, unknown> | null) =>
  mockSession.mockResolvedValue(user ? { user } : null);
const researcher = (email: string) => ({
  id: `id-${email}`,
  role: "RESEARCHER",
  email,
});

beforeEach(() => {
  vi.clearAllMocks();
  touched.reads = [];
  leads(`${LEAD}`);
});
afterEach(() => leads(was));

describe("RESEARCH_LEADS", () => {
  it("unset or empty means the owner only", () => {
    for (const v of [undefined, "", " , "]) {
      leads(v);
      expect(researchLeadEmails()).toEqual([]);
      expect(isResearchLead(OWNER)).toBe(true);
      expect(isResearchLead(LEAD)).toBe(false);
      expect(isResearchLead(RESEARCHER)).toBe(false);
    }
  });

  it("is a comma separated list, forgiving of spaces and case", () => {
    leads(` Daniel@Example.org ,lydia@example.org,,`);
    expect(researchLeadEmails()).toEqual([
      "daniel@example.org",
      "lydia@example.org",
    ]);
    expect(isResearchLead("daniel@example.org")).toBe(true);
    expect(isResearchLead("LYDIA@example.org ")).toBe(true);
    expect(isResearchLead(RESEARCHER)).toBe(false);
    expect(isResearchLead(null)).toBe(false);
    expect(isResearchLead("")).toBe(false);
  });

  it("the owner is always a lead, listed or not", () => {
    leads("someone@example.org");
    expect(isResearchLead(OWNER)).toBe(true);
  });

  it("is read on each call, so a change needs no rebuild", () => {
    leads(undefined);
    expect(isResearchLead(LEAD)).toBe(false);
    leads(LEAD);
    expect(isResearchLead(LEAD)).toBe(true);
  });
});

describe("the page gate", () => {
  it("requireResearcherPage says whether the researcher is a lead", async () => {
    as(researcher(RESEARCHER));
    expect((await requireResearcherPage()).lead).toBe(false);
    as(researcher(LEAD));
    expect((await requireResearcherPage()).lead).toBe(true);
    as(researcher(OWNER));
    expect((await requireResearcherPage()).lead).toBe(true);
  });

  it("requireLeadPage: 403 for a researcher who is not on the list", async () => {
    as(researcher(RESEARCHER));
    await expect(requireLeadPage()).rejects.toThrow("NEXT_FORBIDDEN");
    as({ id: "a", role: "ANNOTATOR", email: "a@example.org" });
    await expect(requireLeadPage()).rejects.toThrow("NEXT_FORBIDDEN");
    as(null);
    await expect(requireLeadPage()).rejects.toThrow("NEXT_REDIRECT:/login");
    as(researcher(LEAD));
    await expect(requireLeadPage()).resolves.toMatchObject({ lead: true });
  });

  it("an annotator on the list is still not a researcher", async () => {
    leads("a@example.org");
    as({ id: "a", role: "ANNOTATOR", email: "a@example.org" });
    await expect(requireLeadPage()).rejects.toThrow("NEXT_FORBIDDEN");
  });
});

describe("the People page", () => {
  const open = () => PeoplePage({ searchParams: Promise.resolve({}) });

  it("a researcher who is not a lead gets the forbidden page, and nothing is read", async () => {
    as(researcher(RESEARCHER));
    await expect(open()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(touched.reads).toEqual([]);
  });

  it("a lead and the owner get past the gate", async () => {
    for (const email of [LEAD, OWNER]) {
      as(researcher(email));
      await expect(open()).resolves.toBeTruthy();
    }
  });
});

describe("the people data routes", () => {
  const routes = [
    ["/api/admin/time-spent (hours and its CSV)", hours],
    ["/api/admin/activity", activity],
  ] as const;

  for (const [name, GET] of routes) {
    it(`${name}: 403 for a researcher who is not a lead, nothing read`, async () => {
      as(researcher(RESEARCHER));
      const res = await GET();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
      expect(touched.reads).toEqual([]);
    });

    it(`${name}: 401 signed out, 403 for an annotator, nothing read`, async () => {
      as(null);
      expect((await GET()).status).toBe(401);
      as({ id: "a", role: "ANNOTATOR", email: "a@example.org" });
      expect((await GET()).status).toBe(403);
      expect(touched.reads).toEqual([]);
    });

    it(`${name}: a lead gets past the gate and the data is read`, async () => {
      as(researcher(LEAD));
      await expect(GET()).rejects.toThrow(/read before the lead check/);
      expect(touched.reads.length).toBeGreaterThan(0);
    });
  }

  it("requireLead hands back the caller's id for a lead only", async () => {
    as(researcher(LEAD));
    expect(await requireLead()).toEqual({ error: null, userId: `id-${LEAD}` });
  });
});

describe("GET /api/admin/lead: one boolean about the caller", () => {
  it("answers for a researcher, and never returns the list", async () => {
    as(researcher(RESEARCHER));
    let res = await leadProbe();
    expect(await res.json()).toEqual({ lead: false });
    as(researcher(LEAD));
    res = await leadProbe();
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ lead: true });
    expect(body).not.toContain("@");
  });

  it("401 signed out, 403 for an annotator", async () => {
    as(null);
    expect((await leadProbe()).status).toBe(401);
    as({ id: "a", role: "ANNOTATOR", email: "a@example.org" });
    expect((await leadProbe()).status).toBe(403);
  });
});

describe("Today for a researcher who is not a lead: no person is loaded", () => {
  const NOW = new Date("2026-11-13T15:00:00Z");

  /** A database with people in it. Any read of a person is recorded. */
  function db() {
    const personReads: string[] = [];
    const person = (name: string) => ({
      findMany: vi.fn(async () => {
        personReads.push(`${name}.findMany`);
        return name === "user"
          ? [
              {
                id: "u1",
                name: "Ada Okoro",
                email: "ada@example.org",
                role: "ANNOTATOR",
              },
            ]
          : [];
      }),
      groupBy: vi.fn(async () => {
        personReads.push(`${name}.groupBy`);
        return [];
      }),
    });
    const counted = (name: string) => ({
      ...person(name),
      count: vi.fn(async () => 7),
      aggregate: vi.fn(async () => ({
        _sum: { durationMs: 60_000, amountUsd: 0 },
      })),
      findFirst: vi.fn(async () => ({
        createdAt: new Date("2026-07-24T00:00:00Z"),
      })),
      findUnique: vi.fn(async () => ({ monthlyCapUsd: 200 })),
    });
    return {
      personReads,
      client: {
        user: person("user"),
        pairwiseComparison: counted("pairwiseComparison"),
        coldAuthorAnswer: counted("coldAuthorAnswer"),
        outputEdit: counted("outputEdit"),
        speechRecording: counted("speechRecording"),
        speechComparison: counted("speechComparison"),
        speechCheck: counted("speechCheck"),
        promptFlag: counted("promptFlag"),
        speechAlert: { findMany: vi.fn(async () => []) },
        speechLoopState: counted("speechLoopState"),
        costEntry: counted("costEntry"),
      } as never,
    };
  }

  it("loads no user, groups nothing by person, and returns no name", async () => {
    const { client, personReads } = db();
    const work = await loadTodayWork(client, {
      now: NOW,
      week: weekOf(NOW),
      speech: true,
      lead: false,
      queuePrompts: [],
    });
    expect(personReads).toEqual([]);
    expect(work.people).toEqual([]);
    expect(work.rows).toEqual([]);
    // Nothing in what the page receives can carry a name.
    expect(JSON.stringify(work)).not.toContain("Ada");
    expect(JSON.stringify(work)).not.toContain("example.org");
  });

  it("keeps the lines that are not about people, and drops the two that are", async () => {
    const { client } = db();
    const work = await loadTodayWork(client, {
      now: NOW,
      week: weekOf(NOW),
      speech: true,
      lead: false,
      queuePrompts: [],
    });
    const keys = work.needs.map((l) => l.key);
    expect(keys).toContain("flags");
    expect(keys.some((k) => k.startsWith("quiet-"))).toBe(false);
    expect(keys).not.toContain("low-prompts");
    for (const l of work.needs) expect(l.href).not.toBe("/admin/people");
    // What we hold is still there: totals, no person.
    expect(work.holdings.map((h) => h.key)).toEqual([
      "answers",
      "comparisons",
      "corrections",
      "speech",
    ]);
  });

  it("a lead does get people", async () => {
    const { client, personReads } = db();
    await loadTodayWork(client, {
      now: NOW,
      week: weekOf(NOW),
      speech: true,
      lead: true,
      queuePrompts: [],
    });
    expect(personReads).toContain("user.findMany");
  });
});
