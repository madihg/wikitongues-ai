import { redirect } from "next/navigation";

/**
 * Collective review moved to the Data view, where the answers it is about
 * live. The old address keeps working.
 */
export default function ContestedRedirect() {
  redirect("/admin/data/disagreements");
}
