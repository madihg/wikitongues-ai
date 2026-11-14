import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetServerSession } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

import { requireLabPage, requireSpeakPage } from "./page-gate";

const was = {
  lab: process.env.SPEECH_LAB_ENABLED,
  layer: process.env.SPEECH_LAYER_ANNOTATORS,
};
const env = (lab: boolean, layer: boolean) => {
  if (lab) process.env.SPEECH_LAB_ENABLED = "1";
  else delete process.env.SPEECH_LAB_ENABLED;
  if (layer) process.env.SPEECH_LAYER_ANNOTATORS = "1";
  else delete process.env.SPEECH_LAYER_ANNOTATORS;
};
const as = (role: string | null) =>
  mockGetServerSession.mockResolvedValue(
    role ? { user: { id: "u1", role } } : null,
  );
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  for (const [k, v] of [
    ["SPEECH_LAB_ENABLED", was.lab],
    ["SPEECH_LAYER_ANNOTATORS", was.layer],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("requireLabPage with the annotator layer", () => {
  it("sends an annotator to the matching /speak page when the layer is on", async () => {
    env(true, true);
    as("ANNOTATOR");
    await expect(requireLabPage({ annotatorRedirect: "/speak" })).rejects.toThrow(
      "NEXT_REDIRECT:/speak",
    );
    await expect(
      requireLabPage({ annotatorRedirect: "/speak/listen" }),
    ).rejects.toThrow("NEXT_REDIRECT:/speak/listen");
  });

  it("refuses an annotator on a page with no redirect (Recordings), layer on or off", async () => {
    as("ANNOTATOR");
    env(true, true);
    await expect(requireLabPage()).rejects.toThrow("NEXT_FORBIDDEN");
    env(true, false);
    await expect(
      requireLabPage({ annotatorRedirect: "/speak" }),
    ).rejects.toThrow("NEXT_FORBIDDEN");
  });

  it("a researcher is never redirected", async () => {
    env(true, true);
    as("RESEARCHER");
    expect(await requireLabPage({ annotatorRedirect: "/speak" })).toBe("researcher");
  });
});

describe("requireSpeakPage", () => {
  it("is a 404 with the lab flag off, before asking who is signed in", async () => {
    env(false, true);
    await expect(requireSpeakPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it("admits a researcher, and an annotator only with the layer on", async () => {
    env(true, false);
    as("RESEARCHER");
    await expect(requireSpeakPage()).resolves.toBeUndefined();
    as("ANNOTATOR");
    await expect(requireSpeakPage()).rejects.toThrow("NEXT_FORBIDDEN");
    env(true, true);
    await expect(requireSpeakPage()).resolves.toBeUndefined();
  });

  it("refuses a learner and a signed-out visitor even with both flags on", async () => {
    env(true, true);
    as("LEARNER");
    await expect(requireSpeakPage()).rejects.toThrow("NEXT_FORBIDDEN");
    as(null);
    await expect(requireSpeakPage()).rejects.toThrow("NEXT_FORBIDDEN");
  });
});

describe("every /speak page asks for the gate itself", () => {
  it("the layout and each page call requireSpeakPage", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "src/app/(app)/speak");
    for (const f of [
      "layout.tsx",
      "page.tsx",
      "listen/page.tsx",
      "check/page.tsx",
      "profile/page.tsx",
    ]) {
      expect(readFileSync(join(dir, f), "utf8"), f).toContain(
        "await requireSpeakPage()",
      );
    }
  });
});
