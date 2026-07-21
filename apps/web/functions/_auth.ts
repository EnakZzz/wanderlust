import { buildOAuthAuthorizationUrl, getOAuthProviderStatus, type OAuthProvider } from "@wanderlust/api";

export type AuthEnv = {
  DB?: D1Database;
  ATTACHMENTS?: R2Bucket;
  APP_PUBLIC_URL?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  APPLE_OAUTH_CLIENT_ID?: string;
  APPLE_OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
};

export type OAuthUser = {
  id: string;
  provider: OAuthProvider;
  email?: string;
  name?: string;
  avatarUrl?: string;
};

const oauthStateCookie = "wl_oauth_state";
const sessionCookie = "wl_session";

export function getAuthConfig(env: AuthEnv) {
  return {
    providers: getOAuthProviderStatus({
      GOOGLE_OAUTH_CLIENT_ID: env.GOOGLE_OAUTH_CLIENT_ID,
      APPLE_OAUTH_CLIENT_ID: env.APPLE_OAUTH_CLIENT_ID
    })
  };
}

export function startOAuth(request: Request, env: AuthEnv, provider: OAuthProvider): Response {
  const clientId = getClientId(env, provider);
  if (!clientId) {
    return json({ error: "provider_not_configured", provider }, 503);
  }

  const requestUrl = new URL(request.url);
  const returnTo = requestUrl.searchParams.get("returnTo") ?? "/#editor";
  const state = createRandomToken();
  const redirectUri = `${getPublicOrigin(request, env)}/auth/${provider}/callback`;
  const authorizationUrl = buildOAuthAuthorizationUrl({ provider, clientId, redirectUri, state, returnTo });

  const headers = new Headers({ location: authorizationUrl.toString() });
  headers.append("set-cookie", serializeCookie(oauthStateCookie, `${state}.${base64UrlEncode(returnTo)}`, 600, "/auth"));
  return new Response(null, { status: 302, headers });
}

export async function completeOAuth(request: Request, env: AuthEnv, provider: OAuthProvider): Promise<Response> {
  const callback = await readOAuthCallback(request);
  if (!callback.code || !callback.state) {
    return json({ error: "missing_oauth_callback" }, 400);
  }

  const stateCookie = readCookie(request.headers.get("cookie"), oauthStateCookie);
  const stateParts = stateCookie?.split(".");
  if (!stateParts || stateParts[0] !== callback.state || !stateParts[1]) {
    return json({ error: "invalid_oauth_state" }, 400);
  }

  if (!env.SESSION_SECRET) {
    return json({ error: "session_secret_not_configured" }, 503);
  }

  const user = provider === "google" ? await exchangeGoogleCode(request, env, callback.code) : await exchangeAppleCode(request, env, callback.code);
  await upsertUser(env, user);
  const session = await signSession(user, env.SESSION_SECRET);
  const returnTo = base64UrlDecode(stateParts[1]);
  const location = buildOAuthReturnLocation(returnTo, session);
  const headers = new Headers({ location });
  headers.append("set-cookie", serializeCookie(sessionCookie, session, 60 * 60 * 24 * 30, "/"));
  headers.append("set-cookie", expireCookie(oauthStateCookie, "/auth"));
  return new Response(null, { status: 302, headers });
}

export async function readSession(request: Request, env: AuthEnv): Promise<Response> {
  const user = await getSessionUser(request, env);
  return json({ user });
}

export async function getSessionUser(request: Request, env: AuthEnv): Promise<OAuthUser | null> {
  const token = readBearerToken(request.headers.get("authorization")) ?? readCookie(request.headers.get("cookie"), sessionCookie);
  if (!token || !env.SESSION_SECRET) {
    return null;
  }

  return verifySession(token, env.SESSION_SECRET);
}

export function logout(): Response {
  const headers = new Headers({ location: "/#editor" });
  headers.append("set-cookie", expireCookie(sessionCookie, "/"));
  return new Response(null, { status: 302, headers });
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "cache-control": "no-store"
    }
  });
}

function getClientId(env: AuthEnv, provider: OAuthProvider): string | undefined {
  return provider === "google" ? env.GOOGLE_OAUTH_CLIENT_ID : env.APPLE_OAUTH_CLIENT_ID;
}

function getClientSecret(env: AuthEnv, provider: OAuthProvider): string | undefined {
  return provider === "google" ? env.GOOGLE_OAUTH_CLIENT_SECRET : env.APPLE_OAUTH_CLIENT_SECRET;
}

export function getUserStorageId(user: OAuthUser): string {
  return `${user.provider}:${user.id}`;
}

async function upsertUser(env: AuthEnv, user: OAuthUser): Promise<void> {
  if (!env.DB) {
    return;
  }

  await env.DB.prepare(
    `INSERT INTO users (id, provider, provider_user_id, email, name, avatar_url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       avatar_url = excluded.avatar_url,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(getUserStorageId(user), user.provider, user.id, user.email ?? null, user.name ?? null, user.avatarUrl ?? null)
    .run();
}

function getPublicOrigin(request: Request, env: AuthEnv): string {
  return (env.APP_PUBLIC_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
}

function createRandomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}

async function readOAuthCallback(request: Request): Promise<{ code?: string; state?: string }> {
  if (request.method === "POST") {
    const form = await request.formData();
    return {
      code: stringValue(form.get("code")),
      state: stringValue(form.get("state"))
    };
  }

  const url = new URL(request.url);
  return {
    code: url.searchParams.get("code") ?? undefined,
    state: url.searchParams.get("state") ?? undefined
  };
}

async function exchangeGoogleCode(request: Request, env: AuthEnv, code: string): Promise<OAuthUser> {
  const clientId = getClientId(env, "google");
  const clientSecret = getClientSecret(env, "google");
  if (!clientId || !clientSecret) {
    throw new Error("google_oauth_not_configured");
  }

  const redirectUri = `${getPublicOrigin(request, env)}/auth/google/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    })
  });

  if (!tokenResponse.ok) {
    throw new Error("google_token_exchange_failed");
  }

  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    throw new Error("google_access_token_missing");
  }

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokenPayload.access_token}` }
  });
  if (!profileResponse.ok) {
    throw new Error("google_userinfo_failed");
  }

  const profile = (await profileResponse.json()) as { sub: string; email?: string; name?: string; picture?: string };
  return {
    id: profile.sub,
    provider: "google",
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.picture
  };
}

async function exchangeAppleCode(request: Request, env: AuthEnv, code: string): Promise<OAuthUser> {
  const clientId = getClientId(env, "apple");
  const clientSecret = getClientSecret(env, "apple");
  if (!clientId || !clientSecret) {
    throw new Error("apple_oauth_not_configured");
  }

  const redirectUri = `${getPublicOrigin(request, env)}/auth/apple/callback`;
  const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    })
  });

  if (!tokenResponse.ok) {
    throw new Error("apple_token_exchange_failed");
  }

  const tokenPayload = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenPayload.id_token) {
    throw new Error("apple_id_token_missing");
  }

  const profile = decodeJwtPayload<{ sub: string; email?: string }>(tokenPayload.id_token);
  return {
    id: profile.sub,
    provider: "apple",
    email: profile.email
  };
}

async function signSession(user: OAuthUser, secret: string): Promise<string> {
  const payload = base64UrlEncode(JSON.stringify({ user, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }));
  const signature = await hmac(payload, secret);
  return `${payload}.${signature}`;
}

async function verifySession(token: string, secret: string): Promise<OAuthUser | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = await hmac(payload, secret);
  if (signature !== expected) {
    return null;
  }

  const session = JSON.parse(base64UrlDecode(payload)) as { user: OAuthUser; exp: number };
  if (session.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return session.user;
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function readBearerToken(authorizationHeader: string | null): string | undefined {
  const [scheme, token] = authorizationHeader?.split(" ") ?? [];
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

function buildOAuthReturnLocation(returnTo: string, session: string): string {
  if (returnTo === "wanderlust://auth") {
    const url = new URL(returnTo);
    url.searchParams.set("session", session);
    return url.toString();
  }

  return returnTo;
}

function serializeCookie(name: string, value: string, maxAge: number, path: string): string {
  return `${name}=${value}; Max-Age=${maxAge}; Path=${path}; HttpOnly; Secure; SameSite=Lax`;
}

function expireCookie(name: string, path: string): string {
  return `${name}=; Max-Age=0; Path=${path}; HttpOnly; Secure; SameSite=Lax`;
}

function decodeJwtPayload<T>(jwt: string): T {
  const [, payload] = jwt.split(".");
  if (!payload) {
    throw new Error("invalid_id_token");
  }

  return JSON.parse(base64UrlDecode(payload)) as T;
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function stringValue(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" ? value : undefined;
}
