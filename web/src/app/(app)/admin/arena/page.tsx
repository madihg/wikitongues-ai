import { redirect } from "next/navigation";

/**
 * /admin/arena was the Model Arena overview. Its four blocks each had a
 * better home already: the speakers' headline and the current pairing are on
 * the Verdict tab, and the Agreement Score bars, the rubric arena table and
 * its reading guide are on the Benchmark tab. The address keeps working and
 * lands on the Verdict, the first thing the overview showed.
 */
export default function ArenaRedirect() {
  redirect("/admin/arena/verdict");
}
