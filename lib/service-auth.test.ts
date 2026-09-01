import { describe, it, expect, vi, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { isCronRequest, isServiceRequest } from "./service-auth";

// service-auth only reads req.headers.get() and req.url, so a minimal
// duck-typed object is enough and avoids pulling in the edge runtime.
function req(opts: { auth?: string; url?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.auth) headers.set("authorization", opts.auth);
  return {
    headers,
    url: opts.url ?? "https://bears.example.com/api/cron",
  } as unknown as NextRequest;
}

afterEach(() => vi.unstubAllEnvs());

describe("isCronRequest", () => {
  it("accepts the CRON_SECRET as an Authorization: Bearer header", () => {
    vi.stubEnv("CRON_SECRET", "s3cr3t");
    expect(isCronRequest(req({ auth: "Bearer s3cr3t" }))).toBe(true);
  });

  it("rejects a ?secret= query param (no longer a supported path)", () => {
    vi.stubEnv("CRON_SECRET", "s3cr3t");
    expect(
      isCronRequest(req({ url: "https://bears.example.com/api/cron?secret=s3cr3t" })),
    ).toBe(false);
  });

  it("rejects a wrong bearer token", () => {
    vi.stubEnv("CRON_SECRET", "s3cr3t");
    expect(isCronRequest(req({ auth: "Bearer nope" }))).toBe(false);
  });

  it("rejects when CRON_SECRET is unset", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronRequest(req({ auth: "Bearer s3cr3t" }))).toBe(false);
  });
});

describe("isServiceRequest", () => {
  it("accepts the shared DESK_SERVICE_SECRET as a bearer token", () => {
    vi.stubEnv("DESK_SERVICE_SECRET", "desk-key");
    expect(isServiceRequest(req({ auth: "Bearer desk-key" }))).toBe(true);
  });

  it("rejects a token of a different length without throwing", () => {
    vi.stubEnv("DESK_SERVICE_SECRET", "desk-key");
    expect(isServiceRequest(req({ auth: "Bearer x" }))).toBe(false);
  });

  it("rejects when no Authorization header is present", () => {
    vi.stubEnv("DESK_SERVICE_SECRET", "desk-key");
    expect(isServiceRequest(req())).toBe(false);
  });
});
