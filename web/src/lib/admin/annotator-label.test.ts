import { describe, it, expect } from "vitest";
import { annotatorCode, annotatorForViewer } from "./annotator-label";

const a = { id: "cmabc7k2q", name: "Real Name", email: "real@example.org" };

describe("who a researcher sees beside an answer", () => {
  it("shows a lead the name and email", () => {
    expect(annotatorForViewer(a, { lead: true, userId: "other" })).toEqual(a);
  });

  it("shows a researcher their own name on their own work", () => {
    expect(annotatorForViewer(a, { lead: false, userId: a.id })).toEqual(a);
  });

  it("shows anyone else a stable code, with no name and no email", () => {
    const shown = annotatorForViewer(a, { lead: false, userId: "other" });
    expect(shown).toEqual({ id: a.id, name: "Annotator 7K2Q", email: "" });
    expect(JSON.stringify(shown)).not.toContain("Real");
    expect(JSON.stringify(shown)).not.toContain("example.org");
    expect(annotatorCode(a.id)).toBe(annotatorCode(a.id));
  });
});
