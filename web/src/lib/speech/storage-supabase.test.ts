import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreateClient, bucket, from } = vi.hoisted(() => {
  const bucket = {
    upload: vi.fn(),
    createSignedUrl: vi.fn(),
    remove: vi.fn(),
    download: vi.fn(),
  };
  const from = vi.fn(() => bucket);
  const mockCreateClient = vi.fn((...args: unknown[]) => ({
    args,
    storage: { from },
  }));
  return { mockCreateClient, bucket, from };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: mockCreateClient }));

import {
  BUCKET,
  deleteClip,
  downloadClip,
  putClip,
  signedUrl,
  storageEnabled,
} from "./storage-supabase";

const NAMES = [
  "SPEECH_STORAGE",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const n of NAMES) {
    saved[n] = process.env[n];
    delete process.env[n];
  }
});
afterEach(() => {
  for (const n of NAMES) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
});

const on = () => {
  process.env.SPEECH_STORAGE = "1";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
};

describe("storageEnabled", () => {
  it("is false until the flag and both env names are set", () => {
    expect(storageEnabled()).toBe(false);
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    expect(storageEnabled()).toBe(false); // flag missing
    process.env.SPEECH_STORAGE = "1";
    expect(storageEnabled()).toBe(true);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(storageEnabled()).toBe(false);
  });

  it("only the exact value 1 turns it on", () => {
    on();
    process.env.SPEECH_STORAGE = "true";
    expect(storageEnabled()).toBe(false);
  });

  it("falls back to NEXT_PUBLIC_SUPABASE_URL for the URL", () => {
    on();
    delete process.env.SUPABASE_URL;
    expect(storageEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    expect(storageEnabled()).toBe(true);
  });
});

describe("missing env", () => {
  it("importing the module does not touch the client", () => {
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("every function throws naming SUPABASE_SERVICE_ROLE_KEY", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    const bytes = new Uint8Array([1]);
    await expect(putClip("clips/a.webm", bytes, "audio/webm")).rejects.toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
    await expect(signedUrl("clips/a.webm")).rejects.toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
    await expect(deleteClip("clips/a.webm")).rejects.toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
    await expect(downloadClip("clips/a.webm")).rejects.toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("names SUPABASE_URL when only the key is set", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    await expect(signedUrl("clips/a.webm")).rejects.toThrow(/SUPABASE_URL/);
  });
});

describe("with env set", () => {
  beforeEach(on);

  it("putClip uploads to the private bucket without overwriting", async () => {
    bucket.upload.mockResolvedValue({ data: { path: "x" }, error: null });
    const bytes = new Uint8Array([1, 2, 3]);
    await putClip("clips/a.webm", bytes, "audio/webm");
    expect(from).toHaveBeenCalledWith("igala-speech");
    expect(BUCKET).toBe("igala-speech");
    expect(bucket.upload).toHaveBeenCalledWith("clips/a.webm", bytes, {
      contentType: "audio/webm",
      upsert: false,
    });
    expect(mockCreateClient.mock.calls[0][0]).toBe(
      "https://example.supabase.co",
    );
    expect(mockCreateClient.mock.calls[0][1]).toBe("service-key");
  });

  it("putClip throws on a storage error", async () => {
    bucket.upload.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(
      putClip("clips/a.webm", new Uint8Array([1]), "audio/webm"),
    ).rejects.toThrow(/boom/);
  });

  it("signedUrl defaults to one hour and returns the url", async () => {
    bucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.supabase.co/signed?t=1" },
      error: null,
    });
    expect(await signedUrl("clips/a.webm")).toBe(
      "https://example.supabase.co/signed?t=1",
    );
    expect(bucket.createSignedUrl).toHaveBeenCalledWith("clips/a.webm", 3600);
    await signedUrl("clips/a.webm", 60);
    expect(bucket.createSignedUrl).toHaveBeenLastCalledWith("clips/a.webm", 60);
  });

  it("signedUrl throws on a storage error", async () => {
    bucket.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "nope" },
    });
    await expect(signedUrl("clips/a.webm")).rejects.toThrow(/nope/);
  });

  it("deleteClip removes one key", async () => {
    bucket.remove.mockResolvedValue({ data: [], error: null });
    await deleteClip("clips/a.webm");
    expect(bucket.remove).toHaveBeenCalledWith(["clips/a.webm"]);
  });

  it("downloadClip returns the bytes", async () => {
    bucket.download.mockResolvedValue({
      data: new Blob([new Uint8Array([9, 8, 7])]),
      error: null,
    });
    const got = await downloadClip("clips/a.webm");
    expect([...got]).toEqual([9, 8, 7]);
  });
});
