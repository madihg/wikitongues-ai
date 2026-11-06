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
  usePathname: () => "/lab/speech",
}));

import SpeechLabLayout from "./layout";

const original = process.env.SPEECH_LAB_ENABLED;
const originalLayer = process.env.SPEECH_LAYER_ANNOTATORS;
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SPEECH_LAYER_ANNOTATORS;
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
  if (originalLayer === undefined) delete process.env.SPEECH_LAYER_ANNOTATORS;
  else process.env.SPEECH_LAYER_ANNOTATORS = originalLayer;
});

const render = () => SpeechLabLayout({ children: "child" });

describe("the Speech Lab layout gate", () => {
  it("notFound when the flag is off, before asking who is signed in", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it("403 for an annotator even with the flag on", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    mockGetServerSession.mockResolvedValue({
      user: { id: "a1", role: "ANNOTATOR" },
    });
    await expect(render()).rejects.toThrow("NEXT_FORBIDDEN");
  });

  it("with the annotator layer on, an annotator passes the layout without the lab band", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    process.env.SPEECH_LAYER_ANNOTATORS = "1";
    mockGetServerSession.mockResolvedValue({
      user: { id: "a1", role: "ANNOTATOR" },
    });
    const el = await render();
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(el);
    expect(html).toBe("child");
    expect(html).not.toContain("LAB");
  });

  it("403 for a signed-out visitor", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    mockGetServerSession.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("NEXT_FORBIDDEN");
  });

  it("renders the band and the page for a researcher", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    mockGetServerSession.mockResolvedValue({
      user: { id: "r1", role: "RESEARCHER" },
    });
    const el = await render();
    expect(el).toBeTruthy();
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(el);
    expect(html).toContain("LAB");
    expect(html).toContain("child");
    expect(html).toContain("-m-8");
  });
});

describe("every page asks for the gate itself", () => {
  it("each page.tsx calls requireLabPage before rendering", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    // Record and Listen send an annotator on to the matching /speak page;
    // Recordings is researcher-only and refuses them.
    const pages = {
      "page.tsx": 'await requireLabPage({ annotatorRedirect: "/speak" })',
      "listen/page.tsx":
        'await requireLabPage({ annotatorRedirect: "/speak/listen" })',
      "recordings/page.tsx": "await requireLabPage()",
    };
    for (const [f, call] of Object.entries(pages)) {
      const src = readFileSync(join(__dirname, f), "utf8");
      expect(src, f).toContain(call);
    }
  });

  it("the layout is dynamic, so the flag is never frozen into a build", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "layout.tsx"), "utf8");
    expect(src).toContain('export const dynamic = "force-dynamic"');
  });
});
