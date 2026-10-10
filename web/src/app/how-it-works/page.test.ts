import { describe, it, expect, vi } from "vitest";

/**
 * The platform no longer tells "How it works" itself: both of its routes send
 * the visitor to the one public telling on the marketing site. What this
 * pins: the two routes redirect, to the same constant the nav uses, and
 * neither renders a page of its own again by accident.
 */
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const { PUBLIC_HOW_IT_WORKS_URL } = await import("@/lib/personas");
const { default: PublicRoute } = await import("./page");
const { default: AdminRoute } = await import("../(app)/admin/how-it-works/page");

describe("the platform's how-it-works routes", () => {
  it("redirect to the marketing site's page, the same URL the nav links to", () => {
    expect(PUBLIC_HOW_IT_WORKS_URL).toMatch(/^https:\/\/.+\/how-it-works\/?$/);
    expect(() => PublicRoute()).toThrow(`REDIRECT:${PUBLIC_HOW_IT_WORKS_URL}`);
    expect(() => AdminRoute()).toThrow(`REDIRECT:${PUBLIC_HOW_IT_WORKS_URL}`);
    expect(redirect).toHaveBeenCalledTimes(2);
  });
});
