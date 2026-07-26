import { z } from "zod";
import { createTripDays, sortItineraryItems, TripSchema, type ItineraryItem, type TripDay } from "@wanderlust/domain";

const ServerConfigInputSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  GOOGLE_MAPS_API_KEY: z.string().min(1),
  REVENUECAT_WEBHOOK_SECRET: z.string().min(1),
  APP_PUBLIC_URL: z.string().url()
});

const ClientRuntimeConfigInputSchema = z.object({
  apiBaseUrl: z.string().url()
});

const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("wanderlust-api")
});

const AgentApiTokenSchema = z.object({
  token: z.string().min(16),
  ownerId: z.string().regex(/^[a-z][a-z0-9_-]*:.+$/),
  name: z.string().min(1).optional(),
  email: z.string().email().optional()
});

export type ServerConfig = Omit<z.infer<typeof ServerConfigInputSchema>, "NEXT_PUBLIC_SUPABASE_URL" | "APP_PUBLIC_URL"> & {
  NEXT_PUBLIC_SUPABASE_URL: URL;
  APP_PUBLIC_URL: URL;
};

export type ClientRuntimeConfig = {
  apiBaseUrl: string;
};

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type AgentApiToken = z.infer<typeof AgentApiTokenSchema>;
export type OAuthProvider = "google" | "apple";
export type OAuthProviderStatus = Record<OAuthProvider, { configured: boolean }>;
export type OAuthAuthorizationInput = {
  provider: OAuthProvider;
  clientId: string;
  redirectUri: string;
  state: string;
  returnTo: string;
};

export const AiDraftItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["place", "food", "hotel", "transport", "activity", "note", "booking"]),
  title: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  locationName: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  googlePlaceId: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional()
});

export const AiTripDraftSchema = z.object({
  title: z.string().min(1),
  destination: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
  items: z.array(AiDraftItemSchema).default([])
});

export type AiTripDraftInput = z.input<typeof AiTripDraftSchema>;
export type AiTripDraft = z.infer<typeof AiTripDraftSchema>;
export type AiOcrImageInput = {
  name?: string;
  type?: string;
  dataUrl?: string;
};
export type NormalizedAiOcrImage = {
  name: string;
  type: string;
  dataUrl: string;
  byteLength: number;
};

const supportedAiOcrImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAiOcrImageCount = 4;
const maxAiOcrImageBytes = 4 * 1024 * 1024;

export function parseServerConfig(input: unknown): ServerConfig {
  const result = ServerConfigInputSchema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).filter(Boolean).join(", ");
    throw new Error(`服务器配置缺失或无效：${fields}`);
  }

  return {
    ...result.data,
    NEXT_PUBLIC_SUPABASE_URL: new URL(result.data.NEXT_PUBLIC_SUPABASE_URL),
    APP_PUBLIC_URL: new URL(result.data.APP_PUBLIC_URL)
  };
}

export function parseClientRuntimeConfig(input: unknown): ClientRuntimeConfig {
  const result = ClientRuntimeConfigInputSchema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).filter(Boolean).join(", ");
    throw new Error(`客户端运行时配置缺失或无效：${fields}`);
  }

  return {
    apiBaseUrl: result.data.apiBaseUrl.replace(/\/+$/, "")
  };
}

export function buildApiUrl(config: ClientRuntimeConfig, path: `/${string}`): string {
  return `${config.apiBaseUrl}${path}`;
}

export function parseHealthResponse(input: unknown): HealthResponse {
  const result = HealthResponseSchema.safeParse(input);
  if (!result.success) {
    throw new Error("无效的健康检查响应");
  }

  return result.data;
}

export function parseAgentApiTokens(input: string | undefined): AgentApiToken[] {
  if (!input?.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("AGENT_API_TOKENS 配置无效：必须是 JSON 数组");
  }

  const result = z.array(AgentApiTokenSchema).safeParse(parsed);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).filter(Boolean).join(", ");
    throw new Error(`AGENT_API_TOKENS 配置无效：${fields}`);
  }

  return result.data;
}

export function resolveAgentApiToken(token: string | undefined, config: string | undefined): AgentApiToken | undefined {
  if (!token) return undefined;
  return parseAgentApiTokens(config).find((entry) => entry.token === token);
}

export function getOAuthProviderStatus(input: Record<string, string | undefined>): OAuthProviderStatus {
  return {
    google: { configured: Boolean(input.GOOGLE_OAUTH_CLIENT_ID?.trim()) },
    apple: { configured: Boolean(input.APPLE_OAUTH_CLIENT_ID?.trim()) }
  };
}

export function buildOAuthAuthorizationUrl(input: OAuthAuthorizationInput): URL {
  assertSafeReturnPath(input.returnTo);

  const url = new URL(input.provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.provider === "google" ? "openid email profile" : "name email");
  url.searchParams.set("state", input.state);

  if (input.provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "select_account");
  } else {
    url.searchParams.set("response_mode", "form_post");
  }

  return url;
}

export function normalizeAiTripDraft(input: AiTripDraftInput) {
  const draft = AiTripDraftSchema.parse(input);
  const days = createTripDays("trip_ai_draft", draft.startDate, draft.endDate);
  const daysByDate = new Map(days.map((day) => [day.date, { ...day, items: [] as ItineraryItem[] } satisfies TripDay]));

  draft.items.forEach((item, index) => {
    const day = daysByDate.get(item.date);
    if (!day) {
      throw new Error("AI 草稿条目的日期超出行程范围");
    }

    const itineraryItem: ItineraryItem = {
      id: `ai_item_${index + 1}`,
      dayId: day.id,
      type: item.type,
      title: item.title,
      sortOrder: index
    };

    if (item.startTime) itineraryItem.startTime = item.startTime;
    if (item.endTime) itineraryItem.endTime = item.endTime;
    if (item.locationName) itineraryItem.locationName = item.locationName;
    if (typeof item.latitude === "number") itineraryItem.latitude = item.latitude;
    if (typeof item.longitude === "number") itineraryItem.longitude = item.longitude;
    if (item.googlePlaceId) itineraryItem.googlePlaceId = item.googlePlaceId;
    if (item.reason) itineraryItem.reason = item.reason;
    if (item.notes) itineraryItem.notes = item.notes;

    day.items.push(itineraryItem);
  });

  const normalizedDays = days.map((day) => {
    const hydrated = daysByDate.get(day.date)!;
    return { ...hydrated, items: sortItineraryItems(hydrated.items) };
  });

  const trip = TripSchema.parse({
    id: "trip_ai_draft",
    ownerId: "ai_preview",
    title: draft.title,
    destination: draft.destination,
    startDate: draft.startDate,
    endDate: draft.endDate,
    timezone: draft.timezone,
    status: "draft",
    days: normalizedDays,
    places: draft.items
      .filter((item) => typeof item.latitude === "number" && typeof item.longitude === "number")
      .map((item, index) => ({
        id: `ai_place_${index + 1}`,
        tripId: "trip_ai_draft",
        name: item.title,
        category: item.type === "food" ? "food" : "other",
        latitude: item.latitude!,
        longitude: item.longitude!,
        googlePlaceId: item.googlePlaceId,
        address: item.locationName
      })),
    bookings: [],
    attachments: []
  });

  return { trip };
}

export function parseAiTripDraft(input: unknown): AiTripDraft {
  return AiTripDraftSchema.parse(input);
}

export function normalizeAiOcrImages(input: unknown): NormalizedAiOcrImage[] {
  if (!Array.isArray(input)) {
    throw new Error("请上传行程截图");
  }
  if (input.length === 0) {
    throw new Error("请上传行程截图");
  }
  if (input.length > maxAiOcrImageCount) {
    throw new Error(`一次最多识别 ${maxAiOcrImageCount} 张截图`);
  }

  return input.map((image, index) => {
    const candidate = image as AiOcrImageInput;
    const name = typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim().slice(0, 120) : `截图 ${index + 1}`;
    const type = typeof candidate.type === "string" ? candidate.type.trim().toLowerCase() : "";
    const dataUrl = typeof candidate.dataUrl === "string" ? candidate.dataUrl.trim() : "";
    if (!supportedAiOcrImageTypes.has(type)) {
      throw new Error("仅支持 JPG、PNG 或 WebP 截图");
    }

    const expectedPrefix = `data:${type};base64,`;
    if (!dataUrl.startsWith(expectedPrefix)) {
      throw new Error("截图数据格式无效");
    }

    const base64 = dataUrl.slice(expectedPrefix.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new Error("截图数据格式无效");
    }

    const byteLength = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
    if (byteLength <= 0 || byteLength > maxAiOcrImageBytes) {
      throw new Error("单张截图不能超过 4MB");
    }

    return { name, type, dataUrl, byteLength };
  });
}

function assertSafeReturnPath(returnTo: string): void {
  const isAppRelative = returnTo.startsWith("/") && !returnTo.startsWith("//");
  const isMobileDeepLink = returnTo === "wanderlust://auth";
  if (!isAppRelative && !isMobileDeepLink) {
    throw new Error("returnTo 必须是应用内相对路径或 Wanderlust 移动端登录回调地址");
  }
}
