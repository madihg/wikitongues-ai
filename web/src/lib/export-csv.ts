/**
 * CSV construction for the downloadable research exports.
 *
 * Pure and separately tested, because these files leave the building. Once a
 * CSV is emailed to a collaborator it gets loaded into a notebook, joined,
 * filtered and published, and nothing about that downstream life is under our
 * control. Two consequences shape this module:
 *
 * 1. CONSENT TRAVELS WITH THE ROW. Every export that carries community-authored
 *    text carries `consent_training` and `consent_benchmark` beside it, placed
 *    immediately after the text rather than at the end where a reader would
 *    have to scroll to find them. A permission that stays behind in our
 *    database is a permission the recipient cannot honour. Ten of the 937 gold
 *    answers withhold training consent and eight withhold benchmark consent,
 *    and the two sets are disjoint - so "the community consented" is not a
 *    statement anyone can make about the file as a whole.
 *
 * 2. HELD-OUT STATUS TRAVELS TOO. `split` and `is_holdout` are on every row
 *    that has a prompt. A collaborator who trains on the frozen benchmark
 *    destroys it, and they cannot avoid that if the file does not say which
 *    rows those are.
 */

export type CsvValue = string | number | boolean | null | undefined;

/**
 * Escape one field.
 *
 * Also guards against CSV injection: a value starting with =, +, - or @ is
 * interpreted as a formula by Excel and Google Sheets. Annotator-authored free
 * text ends up in these files, so the leading character is neutralised with a
 * single quote, which spreadsheets strip on display.
 */
export function csvEscape(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function csvRow(values: CsvValue[]): string {
  return values.map(csvEscape).join(",");
}

/**
 * Assemble a CSV from a column spec and rows.
 *
 * Taking columns as {key, get} pairs rather than two parallel arrays means the
 * header and the row builder cannot drift apart - the commonest way an export
 * starts mislabelling its own data.
 */
export interface CsvColumn<T> {
  key: string;
  get: (row: T) => CsvValue;
}

export function buildCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const header = csvRow(columns.map((c) => c.key));
  const body = rows.map((r) => csvRow(columns.map((c) => c.get(r))));
  // Trailing newline: without it some tools drop or mangle the final record.
  return [header, ...body].join("\n") + "\n";
}

/** Multi-valued fields are semicolon-joined so the CSV stays one-row-per-record. */
export function joinList(values: readonly string[] | null | undefined): string {
  return values && values.length ? values.join("; ") : "";
}

/**
 * How an annotator is identified in an export.
 *
 * The stable id goes in every file so rows can be grouped by contributor
 * without a name. The name goes in too, because these are credited
 * contributors to a language-documentation project and stripping attribution
 * would be its own kind of wrong - but the email never does. An email address
 * is a contact detail, not a research variable, and the previous export used it
 * as a fallback whenever a display name happened to be missing.
 */
export function annotatorLabel(a: {
  name: string | null;
  email?: string | null;
}): string {
  return a.name?.trim() || "(unnamed contributor)";
}
