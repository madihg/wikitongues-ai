import { redirect } from "next/navigation";
import { requireLabPage } from "@/lib/speech/page-gate";

/**
 * The rights register moved to the Speech model view, beside the numbers it
 * governs. The old address keeps working. The gate runs first, so a visitor
 * who may not see the register learns nothing from the redirect either.
 */
export default async function RightsRedirect() {
  await requireLabPage();
  redirect("/admin/speech/rights");
}
