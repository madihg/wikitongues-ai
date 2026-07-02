export function getRedirectForRole(role: string): string {
  switch (role) {
    case "LEARNER":
      return "/learner";
    case "ANNOTATOR":
    case "RESEARCHER":
    default:
      return "/annotator";
  }
}
