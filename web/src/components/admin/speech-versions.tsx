import Link from "next/link";
import type { VersionSummary } from "@/lib/admin/measure/view";
import {
  card,
  day,
  eyebrow,
  pct,
  signed,
  td,
  th,
} from "@/components/admin/speech-measure-parts";

/**
 * Every version we know of, one row each. The Exam column is the id of the
 * clips a recogniser was scored on: two rows can be compared only when it
 * matches, and the page never draws a line between two that do not.
 * Promotion stays on the Loop tab, where the candidates and the switch are.
 */
export function SpeechVersions({ rows }: { rows: VersionSummary[] }) {
  return (
    <section aria-labelledby="speech-versions" className={card}>
      <h2 id="speech-versions" className={eyebrow}>
        Versions
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">
          No version yet. A recogniser appears here once it is scored, a voice
          once it is measured or heard by a listener.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={th}>Version</th>
                <th className={th}>System</th>
                <th className={th}>Measured</th>
                <th className={th}>Exam</th>
                <th className={th}>Letters wrong</th>
                <th className={th}>Tone marks wrong</th>
                <th className={th}>Round trip gap</th>
                <th className={th}>Listeners chose it</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={`${r.system}:${r.modelRef}`}>
                  <td className="max-w-[18rem] px-2 py-2">
                    <Link
                      href={`/admin/speech?${r.system === "tts" ? "system=tts&" : ""}v=${encodeURIComponent(r.modelRef)}`}
                      className="break-all font-medium text-accent-text"
                    >
                      {r.modelRef}
                    </Link>
                  </td>
                  <td className={td}>
                    {r.system === "asr" ? "Recognition" : "Voice"}
                  </td>
                  <td className={td}>{r.scoredAt ? day(r.scoredAt) : ""}</td>
                  <td className={`${td} font-mono text-xs`}>
                    {r.exam ?? ""}
                    {r.examTier && (
                      <span className="ml-1.5 font-sans text-text-tertiary">
                        {r.examTier}
                      </span>
                    )}
                  </td>
                  <td className={td}>
                    {r.lettersWrong === null ? "" : pct(r.lettersWrong)}
                  </td>
                  <td className={td}>
                    {r.tonesWrong === null ? "" : pct(r.tonesWrong)}
                  </td>
                  <td className={td}>
                    {r.roundTripGapPoints === null
                      ? ""
                      : `${signed(r.roundTripGapPoints)} points`}
                  </td>
                  <td className={td}>
                    {r.listeners
                      ? `${r.listeners.chosen} of ${r.listeners.decided} (${r.listeners.tier})`
                      : ""}
                  </td>
                  <td className={td}>
                    {[
                      r.promoted && "Promoted",
                      r.regressed && "Worse than promoted",
                      r.retrainRequired && "Needs retraining",
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-sm text-text-tertiary">
        Two rows compare only when the Exam column matches.{" "}
        <Link
          href="/admin/speech/loop"
          className="font-medium text-accent-text"
        >
          Promote a version on the Loop tab
        </Link>
      </p>
    </section>
  );
}
