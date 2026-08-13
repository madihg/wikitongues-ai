import { redirect } from "next/navigation";

/**
 * The How-it-works page moved to a PUBLIC route so the link can be shared
 * with funders, partners and community members who have no login - the page
 * was built for exactly that audience, every number on it is a live aggregate,
 * the fact-check pass verified no frozen gold answer appears in its prose, and
 * its metrics honour consentBenchmark. This server-side redirect runs before
 * the client-side auth guard in the (app) layout can bounce an anonymous
 * visitor to /login, so the original /admin/how-it-works URL keeps working
 * for everyone who already has it.
 */
export default function HowItWorksRedirect() {
  redirect("/how-it-works");
}
