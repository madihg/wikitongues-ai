import { describe, it, expect } from "vitest";
import {
  csvEscape,
  buildCsv,
  joinList,
  annotatorLabel,
  type CsvColumn,
} from "./export-csv";

describe("csvEscape", () => {
  it("quotes fields containing a comma, quote or newline", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("leaves ordinary Igala text untouched, diacritics and all", () => {
    expect(csvEscape("Wọla ọdudu")).toBe("Wọla ọdudu");
    expect(csvEscape("ẹ́kọ̀ ñw'ọjọ")).toBe("ẹ́kọ̀ ñw'ọjọ");
  });

  it("neutralises spreadsheet formula injection", () => {
    // Annotator free text lands in these files and then gets opened in Excel or
    // Sheets, where a leading =, +, - or @ is executed as a formula.
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("+44 800")).toBe("'+44 800");
    expect(csvEscape("@handle")).toBe("'@handle");
    expect(csvEscape("-3 is wrong")).toBe("'-3 is wrong");
  });

  it("renders booleans and blanks predictably", () => {
    expect(csvEscape(true)).toBe("true");
    expect(csvEscape(false)).toBe("false");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    // 0 must survive: it is a real rubric score, not an absent value.
    expect(csvEscape(0)).toBe("0");
  });
});

describe("buildCsv", () => {
  interface Row {
    answer: string;
    gloss: string | null;
    dialect: string | null;
    consent: boolean;
  }
  const columns: CsvColumn<Row>[] = [
    { key: "igala_answer", get: (r) => r.answer },
    { key: "english_translation", get: (r) => r.gloss },
    { key: "dialect", get: (r) => r.dialect },
    { key: "consent_training", get: (r) => r.consent },
  ];

  it("emits a header derived from the same spec as the rows", () => {
    const csv = buildCsv(columns, [
      { answer: "Ọma", gloss: "child", dialect: "Ankpa", consent: true },
    ]);
    const [header, first] = csv.trim().split("\n");
    expect(header).toBe(
      "igala_answer,english_translation,dialect,consent_training",
    );
    expect(first).toBe("Ọma,child,Ankpa,true");
  });

  it("keeps column count identical when optional fields are absent", () => {
    // The commonest real case: gloss and dialect were added partway through
    // collection, so most rows have neither. Ragged rows break every parser.
    const csv = buildCsv(columns, [
      { answer: "Ọma", gloss: "child", dialect: "Ankpa", consent: true },
      { answer: "Ọkọ", gloss: null, dialect: null, consent: false },
    ]);
    const lines = csv.trim().split("\n");
    const counts = lines.map((l) => l.split(",").length);
    expect(new Set(counts).size).toBe(1);
    expect(lines[2]).toBe("Ọkọ,,,false");
  });

  it("ends with a newline so the last record is not dropped", () => {
    expect(buildCsv(columns, [])).toBe(
      "igala_answer,english_translation,dialect,consent_training\n",
    );
  });

  it("survives a round trip through a naive parser for quoted free text", () => {
    const csv = buildCsv(columns, [
      {
        answer: 'He said "no", then left',
        gloss: "a, b",
        dialect: null,
        consent: true,
      },
    ]);
    // The embedded comma must not create a fifth column.
    const body = csv.trim().split("\n")[1];
    expect(body.startsWith('"He said ""no"", then left"')).toBe(true);
  });
});

describe("joinList", () => {
  it("semicolon-joins so a multi-valued field stays in one column", () => {
    expect(joinList(["yoruba_substitution", "invented"])).toBe(
      "yoruba_substitution; invented",
    );
    expect(joinList([])).toBe("");
    expect(joinList(null)).toBe("");
  });
});

describe("annotatorLabel", () => {
  it("uses the contributor's name - attribution is intended", () => {
    expect(annotatorLabel({ name: "Charity Ogali" })).toBe("Charity Ogali");
  });

  it("never falls back to an email address", () => {
    // The previous export used `name ?? email`, so any contributor without a
    // display name had their email address written into a file that gets
    // emailed to collaborators. An email is a contact detail, not a research
    // variable.
    const label = annotatorLabel({ name: null, email: "someone@example.com" });
    expect(label).not.toContain("@");
    expect(label).toBe("(unnamed contributor)");
    expect(annotatorLabel({ name: "   ", email: "x@y.com" })).not.toContain(
      "@",
    );
  });
});
