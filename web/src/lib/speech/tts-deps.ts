import { prisma } from "@/lib/prisma";
import { mockProvider, modalProvider } from "./train-providers";
import { signedUrl, storageEnabled } from "./storage-supabase";
import { TtsJobError, type TtsDeps } from "./tts-job";

/**
 * The real dependencies of the two TTS job routes. The provider is the Modal
 * worker when SPEECH_WORKER_URL is set, else the deterministic mock (no
 * network, no GPU). Clips are signed from the private bucket when
 * SPEECH_STORAGE is on; with the mock provider and no bucket the URLs are
 * placeholders (nothing reads them); with the worker and no bucket the launch
 * is refused, because the worker cannot reach clips that sit in Postgres.
 */
export function ttsDeps(): TtsDeps {
  const real = !!process.env.SPEECH_WORKER_URL;
  const provider = real ? modalProvider : mockProvider;
  const sign = async (key: string): Promise<string> => {
    if (storageEnabled()) return signedUrl(key);
    if (real) {
      throw new TtsJobError(
        "SPEECH_STORAGE is not on: the worker can only read clips from the private bucket.",
        503,
      );
    }
    return `mock://${key}`;
  };
  return { db: prisma, sign, provider };
}
