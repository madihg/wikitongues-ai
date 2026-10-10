import { redirect } from "next/navigation";
import { PUBLIC_HOW_IT_WORKS_URL } from "@/lib/personas";

/**
 * The original /admin/how-it-works URL keeps working for everyone who already
 * has it: it goes straight to the one public telling on the marketing site.
 * A server-side redirect, so it runs before the client-side auth guard in the
 * (app) layout can bounce an anonymous visitor to /login.
 */
export default function HowItWorksRedirect() {
  redirect(PUBLIC_HOW_IT_WORKS_URL);
}
