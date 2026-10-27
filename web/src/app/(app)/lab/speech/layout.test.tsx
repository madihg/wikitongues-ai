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
  usePathname: () => "/lab/speech",
}));

import SpeechLabLayout from "./layout";

const original = process.env.SPEECH_LAB_ENABLED;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
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
    for (const f of ["page.tsx", "listen/page.tsx", "recordings/page.tsx"]) {
      const src = readFileSync(join(__dirname, f), "utf8");
      expect(src, f).toContain("await requireLabPage()");
    }
  });

  it("the layout is dynamic, so the flag is never frozen into a build", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "layout.tsx"), "utf8");
    expect(src).toContain('export const dynamic = "force-dynamic"');
  });
});
