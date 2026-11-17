/**
 * Who a researcher sees beside an answer in the Data view.
 *
 * The RESEARCHER role is wider than the research leads: annotators who record
 * hold it too. A lead sees the annotator's name and email. Anyone else sees
 * their own name on their own work and a stable code on everyone else's, so
 * rows by one person still group and filter together without naming them.
 */

export interface AnnotatorShown {
  id: string;
  name: string | null;
  email: string;
}

/** "Annotator 7K2Q": the last four characters of the account id. Stable. */
export function annotatorCode(id: string): string {
  return `Annotator ${id.slice(-4).toUpperCase()}`;
}

export function annotatorForViewer(
  annotator: AnnotatorShown,
  viewer: { lead: boolean; userId: string | null },
): AnnotatorShown {
  if (viewer.lead || annotator.id === viewer.userId) return annotator;
  return { id: annotator.id, name: annotatorCode(annotator.id), email: "" };
}
