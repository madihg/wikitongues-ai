"use client";

import { analyseSamples, type QualityMetrics } from "./analyse";

/**
 * Decode a recorded blob with WebAudio and measure it (see analyse.ts for
 * the maths, which is pure and tested). Browser only. Resolves null when the
 * browser cannot decode the clip, so the screen can say so and still let the
 * speaker keep the take: feedback never blocks a recording.
 *
 * No speech recognition happens here. Transcription feedback is a later step
 * that needs an Igala ASR baseline to exist first.
 */
export async function analyseBlob(
  blob: Blob,
  text: string,
  language: "igala" | "english",
): Promise<QualityMetrics | null> {
  try {
    const Ctx: typeof AudioContext | undefined =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    try {
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      const mono = new Float32Array(audio.length);
      for (let c = 0; c < audio.numberOfChannels; c++) {
        const data = audio.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          mono[i] += data[i] / audio.numberOfChannels;
        }
      }
      return analyseSamples(mono, audio.sampleRate, text, language);
    } finally {
      void ctx.close();
    }
  } catch {
    return null;
  }
}
