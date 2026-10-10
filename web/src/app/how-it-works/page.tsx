import { redirect } from "next/navigation";
import { PUBLIC_HOW_IT_WORKS_URL } from "@/lib/personas";

/**
 * "How it works" has ONE telling, on the marketing site
 * (PUBLIC_HOW_IT_WORKS_URL, src/lib/personas.ts). This route held the
 * platform's own copy from 2026-08-13 until 2026-10-10: two pages, kept in
 * step by hand, with the changelog copied between them byte for byte. Halim
 * asked for the second one to go once the platform got its own address
 * (app.wikitongues.org) and the old copy became easy to land on. The route
 * stays as a redirect so every link already shared keeps working; the record
 * of changes now lives only on the site (content/en/howItWorks.ts there).
 */
export default function HowItWorksRedirect() {
  redirect(PUBLIC_HOW_IT_WORKS_URL);
}
