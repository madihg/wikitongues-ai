import Link from "next/link";
import type {
  AutoNumber,
  GapNumber,
  LevelsBlock,
  RecognitionBlock,
  VoiceBlock,
} from "@/lib/admin/measure/auto";
import {
  AUTO_LEVELS,
  AUTO_RECOGNITION,
  AUTO_VOICE,
  EMPTY,
  NOT_BUILT_YET,
} from "@/lib/admin/measure/copy";
import type { Held } from "@/lib/admin/measure/data";
import { LEVEL_TARGETS } from "@/lib/admin/measure/targets";
import { EXAM_TIER_MEANING, nextExamTier } from "@/lib/admin/measure/tiers";
import type { System } from "@/lib/admin/measure/view";
import {
  Empty,
  Sample,
  Term,
  card,
  day,
  eyebrow,
  pct,
  pctRange,
  signed,
  subhead,
  td,
  th,
} from "@/components/admin/speech-measure-parts";

/**
 * The automatic half: what we can compute on our own, with no listener.
 * Every number sits beside its plain sentence (Term), its range when one is
 * stored, and the count it rests on. On a smoke test the numbers are grey
 * and nothing is called better or worse.
 */

const WORD_CLASS: Record<string, string> = {
  better: "text-success",
  worse: "text-danger",
  "tied at this size": "text-text-tertiary",
};

function DeltaCell({ n }: { n: AutoNumber }) {
  if (!n.delta) return <td className={td} />;
  return (
    <td className={td}>
      <span className="text-text-secondary">
        {signed(n.delta.points)} points
      </span>{" "}
      {n.delta.word ? (
        <span className={`font-medium ${WORD_CLASS[n.delta.word]}`}>
          {n.delta.word}
        </span>
      ) : (
        <span className="block text-xs text-text-tertiary">{n.delta.why}</span>
      )}
    </td>
  );
}

function Recognition({ block }: { block: RecognitionBlock }) {
  const smoke = block.exam.tier === "Smoke test";
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-text-secondary">
          {block.exam.locked ? "Exam" : "Clips scored"}: {block.exam.clips}{" "}
          clips, {block.exam.speakers}{" "}
          {block.exam.speakers === 1 ? "speaker" : "speakers"}. Scored on{" "}
          {day(block.exam.scoredAt)}.
        </p>
        <Sample
          word={block.exam.tier}
          meaning={EXAM_TIER_MEANING[block.exam.tier]}
          next={block.exam.next}
        />
      </div>
      {!block.exam.locked && (
        <p className="mt-2 text-sm text-text-tertiary">
          These clips are not a locked exam. The run shows the recogniser works
          on our audio. It does not say how good it is.
        </p>
      )}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>What was counted</th>
            <th className={th}>Result</th>
            <th className={th}>Range</th>
            {block.comparedWith && (
              <th className={th}>Against {block.comparedWith}</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {block.numbers.map((n) => (
            <tr key={n.key}>
              <td className="px-2 py-2 text-text-primary">
                <Term of={AUTO_RECOGNITION[n.key]} />
                {n.n !== null && (
                  <span className="block text-xs text-text-tertiary">
                    on {n.n.toLocaleString("en-US")} marked vowels
                  </span>
                )}
                {n.note && (
                  <span className="block text-xs text-text-tertiary">
                    {n.note}
                  </span>
                )}
              </td>
              <td
                className={`${td} text-base ${smoke ? "text-text-tertiary" : "text-text-primary"}`}
              >
                {pct(n.value)}
              </td>
              <td className={`${td} text-text-secondary`}>
                {n.range ? (
                  pctRange(n.range.lo, n.range.hi)
                ) : (
                  <span className="text-xs text-text-tertiary">not stored</span>
                )}
              </td>
              {block.comparedWith && <DeltaCell n={n} />}
            </tr>
          ))}
        </tbody>
      </table>
      {block.notCompared && (
        <p className="mt-3 text-sm text-text-tertiary">{block.notCompared}</p>
      )}
    </div>
  );
}

function GapRow({
  term,
  gap,
}: {
  term: (typeof AUTO_VOICE)[keyof typeof AUTO_VOICE];
  gap: GapNumber | null;
}) {
  return (
    <tr>
      <td className="px-2 py-2 text-text-primary">
        <Term of={term} />
      </td>
      {gap ? (
        <>
          <td className={`${td} text-base text-text-primary`}>
            {signed(gap.gapPoints)} points
          </td>
          <td className={`${td} text-text-secondary`}>
            {gap.range ? (
              `${gap.range.lo} to ${gap.range.hi}`
            ) : (
              <span className="text-xs text-text-tertiary">not stored</span>
            )}
          </td>
          <td className={`${td} text-text-secondary`}>
            {gap.model !== null && gap.person !== null
              ? `model ${pct(gap.model)}, person ${pct(gap.person)}`
              : ""}
          </td>
        </>
      ) : (
        <td className={`${td} text-text-tertiary`} colSpan={3}>
          {EMPTY.notMeasured}
        </td>
      )}
    </tr>
  );
}

function Voice({ block }: { block: VoiceBlock }) {
  return (
    <div>
      <p className="text-sm text-text-secondary">
        {block.sentences} sentences, each said by the model and by a person.
        Heard back by {block.ruler}. Measured on {day(block.scoredAt)}.
      </p>
      <p className="mt-2 text-sm text-text-tertiary">
        Read the gap, not the two numbers. The recogniser misreads people too,
        so only the difference between the voice and a person means something.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>What was counted</th>
            <th className={th}>Gap to a person</th>
            <th className={th}>Range</th>
            <th className={th}>Behind the gap</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <GapRow term={AUTO_VOICE.roundTripCer} gap={block.letters} />
          <GapRow term={AUTO_VOICE.roundTripTer} gap={block.tones} />
        </tbody>
      </table>
    </div>
  );
}

function Levels({ levels }: { levels: LevelsBlock }) {
  const cell = (v: number | null, unit: string) =>
    v === null ? (
      <span className="text-xs text-text-tertiary">{EMPTY.notMeasured}</span>
    ) : unit === "clips" ? (
      `${Math.round(v)} of ${levels.clips}`
    ) : (
      `${v.toFixed(1)} ${unit}`
    );
  const answer = levels.cleaning;
  return (
    <div>
      <h3 className={subhead}>Clip level and noise</h3>
      <p className="mt-1 text-sm text-text-tertiary">
        {levels.clips > 0
          ? `The middle clip of ${levels.clips}, ${
              levels.source === "worker"
                ? "measured by the worker from the stored audio."
                : "as the recorder measured it when the clip was saved."
            }`
          : "No clip has been measured yet."}
      </p>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={th} />
            <th className={th}>As recorded</th>
            <th className={th}>After cleaning</th>
            <th className={th}>Aim for</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {levels.rows.map((r) => (
            <tr key={r.key}>
              <td className="px-2 py-2 text-text-primary">
                <Term of={AUTO_LEVELS[r.key]} />
              </td>
              <td className={td}>{cell(r.before, r.unit)}</td>
              <td className={td}>{cell(r.after, r.unit)}</td>
              <td className={`${td} text-text-tertiary`}>
                {LEVEL_TARGETS[r.key].asRecorded}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-text-primary">
        <Term of={AUTO_LEVELS.cleaningCheck} />{" "}
        {answer === null ? (
          <span className="text-text-tertiary">{EMPTY.notMeasured}</span>
        ) : answer.answer === "no" ? (
          <strong className="font-semibold">No.</strong>
        ) : answer.answer === "worse" ? (
          <strong className="font-semibold text-danger">Yes, worse.</strong>
        ) : answer.answer === "better" ? (
          <strong className="font-semibold">Yes, better.</strong>
        ) : (
          <span className="text-text-tertiary">
            Cannot say: a range is missing.
          </span>
        )}
        {answer && answer.lettersPoints !== null && (
          <span className="text-text-secondary">
            {" "}
            Letters wrong {signed(answer.lettersPoints)} points
            {answer.tonesPoints !== null &&
              `, tone marks wrong ${signed(answer.tonesPoints)} points`}
            .
          </span>
        )}
      </p>
    </div>
  );
}

export function SpeechMeasureAuto({
  system,
  recognition,
  voice,
  voiceSelected,
  levels,
  held,
  autoTableReady,
}: {
  system: System;
  recognition: RecognitionBlock | null;
  voice: VoiceBlock | null;
  voiceSelected: string | null;
  levels: LevelsBlock;
  held: Held;
  autoTableReady: boolean;
}) {
  return (
    <section aria-labelledby="automatic-half" className={card}>
      <h2 id="automatic-half" className={eyebrow}>
        Automatic
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Computed without people. It can rank two versions. It cannot say the
        tones are right: only a listener can.
      </p>

      <div className="mt-5">
        {system === "asr" ? (
          recognition ? (
            <Recognition block={recognition} />
          ) : (
            <Empty
              next={
                held.examClips > 0
                  ? `${held.examClips} exam clips are locked. ${nextExamTier(held.examClips, held.examSpeakers) ?? ""}`
                  : "No exam is locked yet. Lock exam clips in Data, Speech clips."
              }
            >
              {EMPTY.noModel}
            </Empty>
          )
        ) : voice ? (
          <Voice block={voice} />
        ) : (
          <Empty
            next={
              voiceSelected
                ? "This voice has no round trip stored yet."
                : "A voice appears here once the worker has made clips with it."
            }
          >
            {EMPTY.noVoice}
          </Empty>
        )}
      </div>

      {system === "tts" && (
        <p className="mt-4 text-sm text-text-tertiary">
          Not computed yet: {NOT_BUILT_YET.join(", ")}.
        </p>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <Levels levels={levels} />
      </div>

      <p className="mt-6 text-sm text-text-tertiary">
        We hold {held.clips} clips,{" "}
        {(Math.round(held.minutes * 10) / 10).toFixed(1)} minutes, from{" "}
        {held.speakers} {held.speakers === 1 ? "speaker" : "speakers"}.{" "}
        {held.examClips} are locked as the exam. {held.unchecked} have not been
        checked.{" "}
        <Link href="/admin/data/clips" className="font-medium text-accent-text">
          Open the clips
        </Link>
      </p>
      {!autoTableReady && (
        <p className="mt-2 text-sm text-text-tertiary">
          {EMPTY.workerTableMissing}
        </p>
      )}
    </section>
  );
}
