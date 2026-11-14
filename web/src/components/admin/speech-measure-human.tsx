import { AXIS_LINES, EMPTY, HUMAN } from "@/lib/admin/measure/copy";
import type {
  CheckColumn,
  HumanHalf,
  TonePairs,
} from "@/lib/admin/measure/human";
import {
  AGREEMENT_MIN_UNITS,
  AXIS_GAP_MIN,
  CHECK_LEVEL_MIN,
  CHECK_PERCENT_MIN,
  CHECK_TRUST_MIN,
  HUMAN_TIER_MEANING,
  TONE_PAIR_MIN,
} from "@/lib/admin/measure/tiers";
import { CHECK_LEVELS, type CheckVerdict } from "@/lib/speech/check";
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
 * The human half: what listeners decided, without knowing which clip was
 * which. Below 30 rounds it prints counts and no percentage. A tie and "both
 * unusable" are always shown beside the choice, never inside it.
 */

function Preference({ half }: { half: HumanHalf }) {
  const p = half.preference;
  if (p.rounds === 0) {
    return <Empty next={p.next}>{EMPTY.noRounds}</Empty>;
  }
  const decided = p.model + p.person;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-text-secondary">
          <Term of={HUMAN.counts} />: {p.rounds} rounds, {p.sentences}{" "}
          {p.sentences === 1 ? "sentence" : "sentences"}, {p.listeners}{" "}
          {p.listeners === 1 ? "listener" : "listeners"}
          {p.firstAt && p.lastAt && (
            <span className="text-text-tertiary">
              , {day(p.firstAt)} to {day(p.lastAt)}
            </span>
          )}
          .
        </p>
        <Sample
          word={p.tier}
          meaning={HUMAN_TIER_MEANING[p.tier]}
          next={p.next}
        />
      </div>

      <div className="mt-4">
        <p className="text-sm text-text-primary">
          <Term of={HUMAN.preference} />
        </p>
        {p.share ? (
          <p className="mt-1 text-3xl tabular-nums text-text-primary">
            {pct(p.share.mean, 0)}
            <span className="ml-3 text-base text-text-secondary">
              {pctRange(p.share.ciLow, p.share.ciHigh)}, {p.model} of {decided}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-3xl tabular-nums text-text-primary">
            {p.model} of {decided}
            <span className="ml-3 text-base text-text-secondary">
              {decided === 0
                ? "no round named a winner"
                : "too few rounds for a percentage"}
            </span>
          </p>
        )}
        <p className="mt-2 text-sm text-text-secondary">
          Chose the person {p.person}. Tie {p.tie}. Both unusable{" "}
          {p.bothUnusable}.
        </p>
        {p.listeners === 1 && (
          <p className="mt-2 text-sm text-text-tertiary">{EMPTY.oneListener}</p>
        )}
        {p.next && <p className="mt-1 text-sm text-text-tertiary">{p.next}</p>}
      </div>
    </div>
  );
}

function Scores({ half }: { half: HumanHalf }) {
  const t = half.axes;
  const rated = t.lines.some((l) => l.rated > 0);
  return (
    <div>
      <h3 className={subhead}>
        <Term of={HUMAN.axes} />
      </h3>
      {!rated ? (
        <div className="mt-3">
          <Empty>{EMPTY.noScores}</Empty>
        </div>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className={th} />
              <th className={th}>Person</th>
              <th className={th}>Model</th>
              <th className={th}>Gap</th>
              <th className={th}>Rated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {t.lines.map((l) => (
              <tr key={l.key}>
                <td className="px-2 py-2 text-text-primary">
                  {AXIS_LINES[l.key] ?? l.key}
                </td>
                <td className={td}>
                  {l.person === null ? "" : l.person.toFixed(1)}
                </td>
                <td className={td}>
                  {l.model === null ? "" : l.model.toFixed(1)}
                </td>
                <td className={td}>
                  {l.gap ? (
                    <>
                      {signed(l.gap.mean)}
                      <span className="ml-1.5 text-xs text-text-tertiary">
                        {signed(l.gap.ciLow)} to {signed(l.gap.ciHigh)}
                      </span>
                    </>
                  ) : l.rated > 0 ? (
                    <span className="text-xs text-text-tertiary">
                      from {AXIS_GAP_MIN} rounds
                    </span>
                  ) : (
                    ""
                  )}
                </td>
                <td className={td}>{l.rated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs text-text-tertiary">
        Rubric: {t.version}.
        {t.winnerOnlyExcluded > 0 &&
          ` ${t.winnerOnlyExcluded} older ${t.winnerOnlyExcluded === 1 ? "round" : "rounds"} scored only the winning clip and ${t.winnerOnlyExcluded === 1 ? "is" : "are"} left out.`}
        {t.otherVersionExcluded > 0 &&
          ` ${t.otherVersionExcluded} scored under another rubric ${t.otherVersionExcluded === 1 ? "is" : "are"} left out.`}
      </p>
    </div>
  );
}

const VERDICT_LABEL: Record<CheckVerdict, string> = {
  matches: "Yes",
  does_not_match: "No",
  cannot_hear: "Cannot hear",
};

function CheckCell({
  col,
  verdict,
}: {
  col: CheckColumn;
  verdict: CheckVerdict;
}) {
  if (col.checked === 0) return <td className={td} />;
  const n = col.counts[verdict];
  return (
    <td className={td}>
      {col.shares ? (
        <>
          {pct(col.shares[verdict].mean, 0)}
          <span className="ml-1.5 text-xs text-text-tertiary">
            {pctRange(col.shares[verdict].ciLow, col.shares[verdict].ciHigh)},{" "}
            {n} of {col.checked}
          </span>
        </>
      ) : (
        `${n} of ${col.checked}`
      )}
    </td>
  );
}

function Checks({
  person,
  model,
}: {
  person: CheckColumn;
  model: CheckColumn;
}) {
  const none = person.checked === 0 && model.checked === 0;
  return (
    <div>
      <h3 className={subhead}>
        <Term of={HUMAN.check} />
      </h3>
      {none ? (
        <div className="mt-3">
          <Empty
            next={`${CHECK_PERCENT_MIN} checked clips give a percentage. ${CHECK_TRUST_MIN} make it trustworthy.`}
          >
            {EMPTY.noChecks}
          </Empty>
        </div>
      ) : (
        <>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={th} />
                <th className={th}>Person ({person.checked} checked)</th>
                <th className={th}>Model ({model.checked} checked)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(["matches", "does_not_match"] as const).map((v) => (
                <tr key={v}>
                  <td className="px-2 py-2 text-text-primary">
                    {VERDICT_LABEL[v]}
                  </td>
                  <CheckCell col={person} verdict={v} />
                  <CheckCell col={model} verdict={v} />
                </tr>
              ))}
              {CHECK_LEVELS.filter(
                (l) => person.levels[l.key] > 0 || model.levels[l.key] > 0,
              ).map((l) => (
                <tr key={l.key} className="text-text-secondary">
                  <td className="py-1.5 pl-6 pr-2">{l.label}</td>
                  <td className={td}>{person.levels[l.key] || ""}</td>
                  <td className={td}>{model.levels[l.key] || ""}</td>
                </tr>
              ))}
              <tr>
                <td className="px-2 py-2 text-text-primary">
                  {VERDICT_LABEL.cannot_hear}
                </td>
                <CheckCell col={person} verdict="cannot_hear" />
                <CheckCell col={model} verdict="cannot_hear" />
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-text-tertiary">
            Under {CHECK_PERCENT_MIN} checked clips a column shows counts only.
            A level with fewer than {CHECK_LEVEL_MIN} cases is a count, not a
            pattern.
            {model.checked === 0 && ` ${EMPTY.noModelChecks}`}
          </p>
        </>
      )}
    </div>
  );
}

function TonePairLine({ who, t }: { who: string; t: TonePairs }) {
  return (
    <p className="text-sm text-text-secondary">
      {who}:{" "}
      {t.share ? (
        <>
          <span className="text-text-primary">{pct(t.share.mean, 0)}</span>{" "}
          {pctRange(t.share.ciLow, t.share.ciHigh)}, {t.correct} of {t.answered}
        </>
      ) : (
        <span className="text-text-primary">
          {t.correct} of {t.answered}
        </span>
      )}
      {t.unsure > 0 && `, ${t.unsure} not sure`}
      {!t.trusted && (
        <span className="text-text-tertiary">
          {" "}
          (trusted from {TONE_PAIR_MIN} answers)
        </span>
      )}
    </p>
  );
}

function Tones({
  tone,
}: {
  tone: { person: TonePairs; model: TonePairs | null };
}) {
  const any = tone.person.answered > 0 || (tone.model?.answered ?? 0) > 0;
  return (
    <div>
      <h3 className={subhead}>
        <Term of={HUMAN.tonePairs} />
      </h3>
      <div className="mt-2 space-y-1">
        {!any ? (
          <Empty>{EMPTY.noTonePairs}</Empty>
        ) : (
          <>
            {tone.person.answered > 0 && (
              <TonePairLine who="People's clips" t={tone.person} />
            )}
            {tone.model && tone.model.answered > 0 && (
              <TonePairLine who="The model's clips" t={tone.model} />
            )}
            <p className="text-xs text-text-tertiary">Guessing gives 50%.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Reliability({ half }: { half: HumanHalf }) {
  const a = half.agreement;
  const r = half.again;
  return (
    <div className="space-y-4">
      <div>
        <h3 className={subhead}>
          <Term of={HUMAN.agreement} />
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          {a.sharedRounds === 0
            ? EMPTY.noSecondListener
            : a.alpha === null
              ? `${a.sharedRounds} ${a.sharedRounds === 1 ? "round was" : "rounds were"} judged by two listeners. A number needs ${AGREEMENT_MIN_UNITS}.`
              : `${a.alpha.toFixed(2)}, on ${a.sharedRounds} rounds judged by two or more listeners.`}
        </p>
      </div>
      <div>
        <h3 className={subhead}>Same answer when asked again</h3>
        <p className="mt-1 text-sm text-text-secondary">
          {r.asked === 0
            ? EMPTY.noRepeats
            : `${r.same} of ${r.asked}. One round in ten is asked twice, sides swapped. A listener who changes more than a third of them is close to guessing.`}
        </p>
      </div>
    </div>
  );
}

export function SpeechMeasureHuman({
  half,
  checks,
  tone,
}: {
  half: HumanHalf;
  checks: { person: CheckColumn; model: CheckColumn };
  tone: { person: TonePairs; model: TonePairs | null };
}) {
  return (
    <section aria-labelledby="human-half" className={card}>
      <h2 id="human-half" className={eyebrow}>
        Human
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        What listeners decided, without knowing which clip was which.
        {half.modelRef && (
          <span className="text-text-tertiary"> Voice: {half.modelRef}.</span>
        )}
      </p>

      <div className="mt-5 space-y-8">
        <Preference half={half} />
        <div className="border-t border-border pt-6">
          <Scores half={half} />
        </div>
        <div className="border-t border-border pt-6">
          <Checks person={checks.person} model={checks.model} />
        </div>
        <div className="border-t border-border pt-6">
          <Tones tone={tone} />
        </div>
        <div className="border-t border-border pt-6">
          <Reliability half={half} />
        </div>
      </div>
    </section>
  );
}

/**
 * What a researcher who is not a research lead sees in place of the human
 * half: one plain sentence, and nothing about how any voice is doing.
 */
export function HumanHalfForLeads() {
  return (
    <section aria-labelledby="human-half" className={card}>
      <h2 id="human-half" className={eyebrow}>
        Human
      </h2>
      <p className="mt-3 text-sm text-text-secondary">
        What listeners decided is shown to research leads only. The people who
        listen and rate must not see how a voice is doing while they rate it, so
        that their next judgment is their own.
      </p>
    </section>
  );
}
