import { redirect } from "next/navigation";
import { workHref } from "@/lib/work-flow";

/**
 * Pass 2: tone marks moved into the one Annotate flow on 2026-11-24 (its
 * Tone marks tab). The old address still opens it.
 */
export default function TonePassPage() {
  redirect(workHref("tone"));
}
