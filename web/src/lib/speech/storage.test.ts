import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AUDIO_MIME_TYPES,
  audioUrl,
  baseMime,
  isAllowedAudioMime,
  recordingPath,
} from "./storage";

describe("baseMime and isAllowedAudioMime", () => {
  it("strips parameters and lower-cases", () => {
    expect(baseMime("Audio/WebM; codecs=opus")).toBe("audio/webm");
  });
  it("allows exactly the types the recorder produces, parameters aside", () => {
    for (const t of AUDIO_MIME_TYPES) expect(isAllowedAudioMime(t)).toBe(true);
    expect(isAllowedAudioMime("audio/webm;codecs=opus")).toBe(true);
    expect(isAllowedAudioMime("audio/mp4")).toBe(true);
    for (const t of ["video/webm", "text/html", "application/json", "audio/mpeg", ""])
      expect(isAllowedAudioMime(t), t).toBe(false);
  });
});

describe("recordingPath", () => {
  it("is clips/<id>.<ext> per type, carrying no text", () => {
    expect(recordingPath("abc", "audio/webm;codecs=opus")).toBe("clips/abc.webm");
    expect(recordingPath("abc", "audio/mp4")).toBe("clips/abc.m4a");
    expect(recordingPath("abc", "audio/ogg")).toBe("clips/abc.ogg");
    expect(recordingPath("abc", "audio/wav")).toBe("clips/abc.wav");
  });
  it("refuses a type that is not audio", () => {
    expect(() => recordingPath("abc", "text/plain")).toThrow(/Unsupported/);
  });
});

describe("audioUrl", () => {
  it("is the same-origin, researcher-only audio endpoint, never a public URL", () => {
    expect(audioUrl("rec-1")).toBe("/api/lab/speech/recording/rec-1/audio");
    expect(audioUrl("a/b")).not.toContain("a/b");
  });
});

/** The bucket is gone: no code path may bring signed URLs or the SDK back. */
describe("no Supabase Storage left in the Speech Lab", () => {
  const root = join(__dirname, "..", "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(join(root, "lib", "speech"));
  walk(join(root, "app", "api", "lab"));
  walk(join(root, "components", "lab"));

  it("nothing imports @supabase/supabase-js or mints a signed URL", () => {
    for (const f of files) {
      if (f.endsWith("storage.test.ts")) continue;
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@supabase\/supabase-js/);
      expect(text, f).not.toMatch(/signedReadUrl|signedUploadUrl|createSignedUrl/);
    }
  });

  it("the dependency is gone from package.json", () => {
    const pkg = JSON.parse(
      readFileSync(join(root, "..", "package.json"), "utf8"),
    );
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(all).not.toHaveProperty("@supabase/supabase-js");
  });
});
