import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SPEECH_BUCKET,
  StorageConfigError,
  baseMime,
  isAllowedAudioMime,
  recordingPath,
  signedReadUrl,
  signedUploadUrl,
} from "./storage";

const URL_BASE = "https://example-ref.supabase.co";
const env = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.SUPABASE_URL = URL_BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("media types and paths", () => {
  it("strips codec parameters", () => {
    expect(baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMime("Audio/MP4")).toBe("audio/mp4");
  });

  it("allows recordable audio only", () => {
    expect(isAllowedAudioMime("audio/webm;codecs=opus")).toBe(true);
    expect(isAllowedAudioMime("audio/mp4")).toBe(true);
    expect(isAllowedAudioMime("video/webm")).toBe(false);
    expect(isAllowedAudioMime("text/html")).toBe(false);
    expect(isAllowedAudioMime("")).toBe(false);
  });

  it("builds clips/<id>.<ext> and refuses unknown types", () => {
    expect(recordingPath("abc123", "audio/webm;codecs=opus")).toBe(
      "clips/abc123.webm",
    );
    expect(recordingPath("abc123", "audio/mp4")).toBe("clips/abc123.m4a");
    expect(() => recordingPath("abc123", "video/mp4")).toThrow(/Unsupported/);
  });
});

describe("signedUploadUrl", () => {
  it("asks the private bucket for a signed upload URL and returns it with the token", async () => {
    fetchMock.mockResolvedValue(
      json({
        url: `/object/upload/sign/${SPEECH_BUCKET}/clips/a.webm?token=tok-1`,
      }),
    );
    const out = await signedUploadUrl("clips/a.webm", "audio/webm;codecs=opus");

    expect(out.token).toBe("tok-1");
    expect(out.path).toBe("clips/a.webm");
    expect(out.contentType).toBe("audio/webm");
    expect(out.uploadUrl).toContain("token=tok-1");

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toBe(
      `${URL_BASE}/storage/v1/object/upload/sign/${SPEECH_BUCKET}/clips/a.webm`,
    );
    expect(init.method).toBe("POST");
    // The service role key authorises the call, server-side only.
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer service-role-test-key");
    // No upsert: an existing object can never be overwritten.
    expect(headers.get("x-upsert")).toBeNull();
  });

  it("refuses a non-audio type and an unsafe path before any request", async () => {
    await expect(signedUploadUrl("clips/a.webm", "text/html")).rejects.toThrow(
      /Unsupported/,
    );
    await expect(signedUploadUrl("../secrets", "audio/webm")).rejects.toThrow(
      /Invalid/,
    );
    await expect(signedUploadUrl("/abs/path", "audio/webm")).rejects.toThrow(
      /Invalid/,
    );
    await expect(
      signedUploadUrl("clips/a b.webm", "audio/webm"),
    ).rejects.toThrow(/Invalid/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a storage error", async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          message: "Bucket not found",
          error: "Bucket not found",
          statusCode: "404",
        },
        404,
      ),
    );
    await expect(signedUploadUrl("clips/a.webm", "audio/webm")).rejects.toThrow(
      /Could not create an upload URL/,
    );
  });
});

describe("signedReadUrl", () => {
  it("returns the signed URL and asks for a short expiry by default", async () => {
    fetchMock.mockResolvedValue(
      json({
        signedURL: `/object/sign/${SPEECH_BUCKET}/clips/a.webm?token=read-1`,
      }),
    );
    const url = await signedReadUrl("clips/a.webm");
    expect(url).toContain("token=read-1");
    expect(url.startsWith(URL_BASE)).toBe(true);

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toBe(
      `${URL_BASE}/storage/v1/object/sign/${SPEECH_BUCKET}/clips/a.webm`,
    );
    expect(JSON.parse(init.body).expiresIn).toBe(300);
  });

  it("clamps the expiry to between one second and one hour", async () => {
    fetchMock.mockImplementation(async () =>
      json({ signedURL: `/object/sign/${SPEECH_BUCKET}/clips/a.webm?token=t` }),
    );
    await signedReadUrl("clips/a.webm", 999999);
    await signedReadUrl("clips/a.webm", 0);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).expiresIn).toBe(3600);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).expiresIn).toBe(1);
  });

  it("never returns a public object URL", async () => {
    fetchMock.mockResolvedValue(
      json({ signedURL: `/object/sign/${SPEECH_BUCKET}/clips/a.webm?token=t` }),
    );
    const url = await signedReadUrl("clips/a.webm");
    expect(url).not.toContain("/object/public/");
    expect(url).toContain("/object/sign/");
  });

  it("refuses an unsafe path", async () => {
    await expect(signedReadUrl("../x")).rejects.toThrow(/Invalid/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("configuration", () => {
  it("throws a clear error when the service role key is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(signedReadUrl("clips/a.webm")).rejects.toThrow(
      StorageConfigError,
    );
    await expect(signedUploadUrl("clips/a.webm", "audio/webm")).rejects.toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a clear error when no URL is configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    await expect(signedReadUrl("clips/a.webm")).rejects.toThrow(/SUPABASE_URL/);
  });

  it("falls back to NEXT_PUBLIC_SUPABASE_URL", async () => {
    delete process.env.SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_BASE;
    fetchMock.mockResolvedValue(
      json({ signedURL: `/object/sign/${SPEECH_BUCKET}/clips/a.webm?token=t` }),
    );
    await expect(signedReadUrl("clips/a.webm")).resolves.toContain("token=t");
  });
});
