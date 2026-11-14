import { redirect } from "next/navigation";
import { requireLabPage } from "@/lib/speech/page-gate";

/**
 * The old Record path. Record lives at /speak for every role now, so this
 * only redirects: the gate first (flag off is still a 404, a stranger still a
 * 403), then on to /speak.
 */
export default async function RecordPage() {
  await requireLabPage({ annotatorRedirect: "/speak" });
  redirect("/speak");
}
