import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakePrisma } from "@/lib/answer-edit.fake";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  session: null as unknown,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    { get: (_t, key) => (holder.db as Record<string | symbol, unknown>)[key] },
  ),
}));
vi.mock("next-auth", () => ({ getServerSession: async () => holder.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { GET, PATCH } from "./route";

/**
 * The author's door. What the route itself must hold: who may come in, that
 * the door is for one's own rows whatever the role, and the status codes of
 * the spec (403 for another person's row, 405 for the choice or a score).
 * Invented placeholder texts.
 */

const ctx = (type: string, id: string) => ({
  params: Promise.resolve({ type, id }),
});
const patch = (type: string, id: string, body: unknown) =>
  PATCH(
    new Request("http://test/x", {
      method: "PATCH",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx(type, id),
  );
const as = (id: string, role: string) => {
  holder.session = { user: { id, role } };
};

let db: ReturnType<typeof fakePrisma>;
beforeEach(() => {
  db = fakePrisma({
    prompts: [{ id: "p1", promptId: "ig_test_001", text: "A test question?" }],
    cold: [
      {
        id: "c-ann",
        annotatorId: "ann",
        isDemo: false,
        answerText: "alpha beta",
        englishGloss: null,
        dialect: null,
        instructionIg: null,
        provenance: "speaker_authored_sourcefree",
        promptId: "p1",
        prompt: { promptId: "ig_test_001" },
        createdAt: new Date("2026-10-12T08:00:00Z"),
      },
    ],
    pairwise: [
      {
        id: "pw-ann",
        annotatorId: "ann",
        isDemo: false,
        winner: "b",
        explanation: "B reads better.",
        promptId: "ig_test_001",
        modelOutputAId: "moA",
        modelOutputBId: "moB",
        createdAt: new Date("2026-10-12T08:01:00Z"),
      },
    ],
  });
  holder.db = db;
  holder.session = null;
});

describe("/api/annotator/answers/[type]/[id]", () => {
  it("401 signed out, 403 for a learner, 404 for an unknown kind of row", async () => {
    expect((await patch("cold", "c-ann", { englishGloss: "x" })).status).toBe(
      401,
    );
    expect(
      (await GET(new Request("http://test/x"), ctx("cold", "c-ann"))).status,
    ).toBe(401);
    as("lea", "LEARNER");
    expect((await patch("cold", "c-ann", { englishGloss: "x" })).status).toBe(
      403,
    );
    as("ann", "ANNOTATOR");
    expect((await patch("rubric", "c-ann", { score: 1 })).status).toBe(404);
  });

  it("an ANNOTATOR changes the English meaning of their own answer", async () => {
    as("ann", "ANNOTATOR");
    const res = await patch("cold", "c-ann", {
      englishGloss: "It says alpha, then beta.",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).changed).toEqual(["englishGloss"]);
    expect(db.coldAuthorAnswer.rows[0].englishGloss).toBe(
      "It says alpha, then beta.",
    );
    expect(db.answerRevision.rows).toHaveLength(1);
  });

  it("another person's row is refused (403), for an annotator and for a researcher", async () => {
    as("other", "ANNOTATOR");
    expect((await patch("cold", "c-ann", { englishGloss: "x" })).status).toBe(
      403,
    );
    expect(
      (await GET(new Request("http://test/x"), ctx("cold", "c-ann"))).status,
    ).toBe(403);
    // A researcher changes another person's answer text in Annotations, not
    // through this door.
    as("res", "RESEARCHER");
    expect((await patch("cold", "c-ann", { answerText: "x y" })).status).toBe(
      403,
    );
    expect(db.answerRevision.rows).toHaveLength(0);
  });

  it("the choice or a score is refused (405), for every role", async () => {
    for (const [id, role] of [
      ["ann", "ANNOTATOR"],
      ["ann", "RESEARCHER"],
      ["other", "RESEARCHER"],
    ]) {
      as(id, role);
      expect((await patch("pairwise", "pw-ann", { winner: "a" })).status).toBe(
        405,
      );
      expect(
        (
          await patch("pairwise", "pw-ann", {
            axisScores: [{ axis: "syntax", score: 5 }],
          })
        ).status,
      ).toBe(405);
    }
    expect(db.pairwiseComparison.rows[0].winner).toBe("b");
  });

  it("a bad body is a JSON 400, never a bare 500", async () => {
    as("ann", "ANNOTATOR");
    const res = await patch("cold", "c-ann", "{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
    expect((await patch("cold", "c-ann", [1, 2])).status).toBe(400);
  });

  it("GET returns the owner's episode, and no clip rows with the speech layer off", async () => {
    as("ann", "ANNOTATOR");
    const res = await GET(
      new Request("http://test/x"),
      ctx("pairwise", "pw-ann"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.promptText).toBe("A test question?");
    expect(body.items.map((i: { type: string }) => i.type)).toEqual([
      "cold",
      "pairwise",
    ]);
    expect(body.items[0]).toMatchObject({ needsFix: true, clips: [] });
    expect(body.items[1]).toMatchObject({ winner: "b" });
  });
});
