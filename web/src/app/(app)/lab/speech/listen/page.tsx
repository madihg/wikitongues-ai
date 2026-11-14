import { redirect } from "next/navigation";
import { requireLabPage } from "@/lib/speech/page-gate";

/**
 * The old Listen path. Listen lives at /speak/listen for every role now, so
 * this only redirects, after the gate.
 */
export default async function ListenPage() {
  await requireLabPage({ annotatorRedirect: "/speak/listen" });
  redirect("/speak/listen");
}
