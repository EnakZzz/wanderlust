import { describe, expect, it } from "vitest";
import {
  buildApiUrl,
  buildOAuthAuthorizationUrl,
  getOAuthProviderStatus,
  parseClientRuntimeConfig,
  parseHealthResponse,
  parseServerConfig
} from "./index";

describe("parseServerConfig", () => {
  it("accepts the production services needed for AI, auth, maps, billing, and app links", () => {
    const config = parseServerConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      OPENAI_API_KEY: "sk-test",
      GOOGLE_MAPS_API_KEY: "google-key",
      REVENUECAT_WEBHOOK_SECRET: "webhook-secret",
      APP_PUBLIC_URL: "https://wanderlust.example.com"
    });

    expect(config.APP_PUBLIC_URL.hostname).toBe("wanderlust.example.com");
  });

  it("rejects missing secrets with actionable field names", () => {
    expect(() => parseServerConfig({})).toThrow("Missing or invalid server config");
  });
});

describe("parseClientRuntimeConfig", () => {
  it("normalizes the API base URL without a trailing slash", () => {
    const config = parseClientRuntimeConfig({
      apiBaseUrl: "https://wanderlust-api.cheezuo.workers.dev/"
    });

    expect(config.apiBaseUrl).toBe("https://wanderlust-api.cheezuo.workers.dev");
  });

  it("rejects missing API URLs with actionable field names", () => {
    expect(() => parseClientRuntimeConfig({})).toThrow("apiBaseUrl");
  });
});

describe("Cloudflare API health helpers", () => {
  it("builds API URLs from normalized runtime config", () => {
    const config = parseClientRuntimeConfig({
      apiBaseUrl: "https://wanderlust-web.pages.dev/"
    });

    expect(buildApiUrl(config, "/health")).toBe("https://wanderlust-web.pages.dev/health");
  });

  it("accepts the deployed health response shape", () => {
    expect(parseHealthResponse({ ok: true, service: "wanderlust-api" })).toEqual({
      ok: true,
      service: "wanderlust-api"
    });
  });

  it("rejects unexpected health response payloads", () => {
    expect(() => parseHealthResponse({ ok: true, service: "other" })).toThrow("Invalid health response");
  });
});

describe("OAuth helpers", () => {
  it("reports Google and Apple provider configuration independently", () => {
    expect(
      getOAuthProviderStatus({
        GOOGLE_OAUTH_CLIENT_ID: "google-client",
        APPLE_OAUTH_CLIENT_ID: ""
      })
    ).toEqual({
      google: { configured: true },
      apple: { configured: false }
    });
  });

  it("builds provider authorization URLs with state and a safe return path", () => {
    const url = buildOAuthAuthorizationUrl({
      provider: "google",
      clientId: "google-client",
      redirectUri: "https://wanderlust-web.pages.dev/auth/google/callback",
      state: "state_123",
      returnTo: "/#editor"
    });

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("google-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://wanderlust-web.pages.dev/auth/google/callback");
    expect(url.searchParams.get("state")).toBe("state_123");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("returnTo")).toBeNull();
  });

  it("rejects external return paths before building an authorization URL", () => {
    expect(() =>
      buildOAuthAuthorizationUrl({
        provider: "apple",
        clientId: "apple-client",
        redirectUri: "https://wanderlust-web.pages.dev/auth/apple/callback",
        state: "state_123",
        returnTo: "https://evil.example/#editor"
      })
    ).toThrow("returnTo must be an app-relative path");
  });
});
