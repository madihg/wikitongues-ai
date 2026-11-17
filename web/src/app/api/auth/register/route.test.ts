import { describe, it, expect, vi, beforeEach } from "vitest";

const { create, findUnique, valid } = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  valid: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { create, findUnique } },
}));
vi.mock("bcryptjs", () => ({ hash: async () => "hashed" }));
vi.mock("@/lib/registration", () => ({
  REGISTRATION_CLOSED_MESSAGE: "closed",
  isValidInvite: valid,
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://x/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  create.mockReset();
  findUnique.mockReset().mockResolvedValue(null);
  valid.mockReset();
});

describe("POST /api/auth/register is by invitation", () => {
  it("refuses with 403 and touches no row when the invite is not accepted", async () => {
    valid.mockReturnValue(false);
    const res = await post({ email: "a@b.c", password: "longenough" });
    expect(res.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    valid.mockReturnValue(false);
    const res = await POST(
      new Request("http://x/api/auth/register", { method: "POST", body: "{" }),
    );
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates the account when the invite is accepted, and passes it the invite it was sent", async () => {
    valid.mockReturnValue(true);
    const res = await post({
      email: "a@b.c",
      password: "longenough",
      invite: "code-1",
    });
    expect(res.status).toBe(201);
    expect(valid).toHaveBeenCalledWith("code-1");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("never lets an invited caller pick the researcher role", async () => {
    valid.mockReturnValue(true);
    await post({
      email: "a@b.c",
      password: "longenough",
      invite: "code-1",
      role: "RESEARCHER",
    });
    expect(create.mock.calls[0][0].data.role).toBe("ANNOTATOR");
  });
});
