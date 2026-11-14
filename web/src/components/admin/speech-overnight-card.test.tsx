import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SpeechOvernightCard } from "./speech-overnight-card";
import { buildOvernight, type OvernightCandidate } from "@/lib/speech/overnight";

const m = (cer: number, ter: number) => ({ cer, werStripped: cer + 0.1, werRetained: cer + 0.2, ter });

const run = (outcome: string, stepLog: unknown[], costUsd = 0) => ({
  id: "run1",
  runDate: new Date("2026-11-07"),
  outcome,
  stepLog,
  costUsd,
});

const ingest = { step: "ingest", ok: true, newClips: 12, newHours: 1.5 };
const render = (v: ReturnType<typeof buildOvernight> | null) =>
  renderToStaticMarkup(<SpeechOvernightCard view={v} />);

describe("SpeechOvernightCard: three states", () => {
  it("trained: headline, candidate scores, deltas against the promoted model, cost", () => {
    const cand: OvernightCandidate = { id: "c1", jobId: "job1", regressed: false, metrics: m(0.18, 0.25) };
    const view = buildOvernight(
      run("trained", [
        ingest,
        { step: "decide", ok: true, reasons: ["asr: 40.0 new minutes, at or above 30"] },
        { step: "finish", ok: true, launched: [{ jobId: "job1", kind: "train_asr" }] },
      ]),
      [cand],
      m(0.2, 0.3),
      5.62,
    );
    const html = render(view);
    expect(html).toContain("Trained");
    expect(html).toContain("12");
    expect(html).toContain("1.5");
    expect(html).toContain("18.0%"); // CER
    expect(html).toContain("28.0%"); // WER tones stripped
    expect(html).toContain("38.0%"); // WER tones kept
    expect(html).toContain("25.0%"); // TER
    expect(html).toContain("-2.0"); // CER delta in points
    expect(html).toContain("-5.0"); // TER delta in points
    expect(html).toContain("$5.62");
    expect(html).toContain("asr: 40.0 new minutes, at or above 30");
    expect(html).not.toContain("worse than the promoted model");
  });

  it("trained and regressed: says promoting needs a reason", () => {
    const cand: OvernightCandidate = { id: "c1", jobId: "job1", regressed: true, metrics: m(0.3, 0.5) };
    const view = buildOvernight(
      run("trained", [ingest, { step: "finish", ok: true, launched: [{ jobId: "job1", kind: "train_asr" }] }]),
      [cand],
      m(0.2, 0.3),
      null,
    );
    const html = render(view);
    expect(html).toContain("+10.0");
    expect(html).toContain("needs a written reason");
  });

  it("trained but not yet scored: says so instead of inventing numbers", () => {
    const view = buildOvernight(
      run("trained", [ingest, { step: "finish", ok: true, launched: [{ jobId: "job1", kind: "train_asr" }] }]),
      [],
      null,
      null,
    );
    expect(render(view)).toContain("has not been scored on the exam set yet");
  });

  it("skipped: headline and the reasons, no metrics", () => {
    const view = buildOvernight(
      run("skipped", [
        ingest,
        { step: "decide", ok: true, reasons: ["asr: 12.0 new minutes, below 30", "tts: 0.0 new studio minutes, below 30"] },
        { step: "finish", ok: true, launched: [] },
      ]),
      [],
      null,
      null,
    );
    const html = render(view);
    expect(html).toContain("Skipped");
    expect(html).toContain("asr: 12.0 new minutes, below 30");
    expect(html).toContain("tts: 0.0 new studio minutes, below 30");
    expect(html).not.toContain("vs promoted");
  });

  it("failed: headline and the errors that broke the run", () => {
    const view = buildOvernight(
      run("failed", [
        { step: "poll", ok: false, error: "db down" },
        { step: "launch_train_asr", ok: false, error: "Speech worker refused train_asr: HTTP 502" },
        { step: "finish", ok: true, launched: [] },
      ]),
      [],
      null,
      null,
    );
    const html = render(view);
    expect(html).toContain("Failed");
    expect(html).toContain("poll: db down");
    expect(html).toContain("launch_train_asr: Speech worker refused train_asr: HTTP 502");
  });

  it("no run yet: an honest empty state", () => {
    expect(render(null)).toContain("The loop has not run yet");
  });
});
