import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RightsCard, type RightsSourceItem } from "./rights-register";

const ITEM: RightsSourceItem = {
  id: "s1",
  name: "Synthetic Source",
  licenseText: "Licence text pasted here.",
  rightsStatus: "pending",
  confirmedBy: null,
  confirmedAt: null,
  notes: "Does it allow redistribution?",
};

const html = (item: RightsSourceItem, error: string | null = null) =>
  renderToStaticMarkup(
    <RightsCard item={item} onSave={() => {}} saving={false} error={error} />,
  );

describe("RightsCard", () => {
  it("shows the name, licence text, status, open questions and that nobody confirmed", () => {
    const out = html(ITEM);
    expect(out).toContain("Synthetic Source");
    expect(out).toContain("Licence text pasted here.");
    expect(out).toContain("Pending");
    expect(out).toContain("Does it allow redistribution?");
    expect(out).toContain("Not confirmed by anyone yet");
    expect(out).toContain("Open questions");
  });

  it("shows who confirmed and the date once cleared", () => {
    const out = html({
      ...ITEM,
      rightsStatus: "cleared",
      confirmedBy: "A. Researcher",
      confirmedAt: "2026-11-06T10:00:00.000Z",
    });
    expect(out).toContain("Confirmed by A. Researcher on 2026-11-06");
  });

  it("offers the three statuses and surfaces a save error as an alert", () => {
    const out = html(ITEM, "Could not save.");
    for (const v of ["pending", "cleared", "restricted"]) {
      expect(out).toContain(`value="${v}"`);
    }
    expect(out).toContain('role="alert"');
  });
});
