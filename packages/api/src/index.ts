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

export type ServerConfig = Omit<z.infer<typeof ServerConfigInputSchema>, "NEXT_PUBLIC_SUPABASE_URL" | "APP_PUBLIC_URL"> & {
  NEXT_PUBLIC_SUPABASE_URL: URL;
  APP_PUBLIC_URL: URL;
};

export type ClientRuntimeConfig = {
  apiBaseUrl: string;
};

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type OAuthProvider = "google" | "apple";
export type OAuthProviderStatus = Record<OAuthProvider, { configured: boolean }>;
export type OAuthAuthorizationInput = {
  provider: OAuthProvider;
  clientId: string;
  redirectUri: string;
  state: string;
  returnTo: string;
};

const AiDraftItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["place", "food", "hotel", "transport", "activity", "note", "booking"]),
  title: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  locationName: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  googlePlaceId: z.string().optional(),
  notes: z.string().optional()
});

const AiTripDraftSchema = z.object({
  title: z.string().min(1),
  destination: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
  items: z.array(AiDraftItemSchema).default([])
});

export type AiTripDraftInput = z.input<typeof AiTripDraftSchema>;

export function parseServerConfig(input: unknown): ServerConfig {
  const result = ServerConfigInputSchema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).filter(Boolean).join(", ");
    throw new Error(`Missing or invalid server config: ${fields}`);
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
    throw new Error(`Missing or invalid client runtime config: ${fields}`);
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
    throw new Error("Invalid health response");
  }

  return result.data;
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
      throw new Error("AI draft item date is outside the trip range");
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

function assertSafeReturnPath(returnTo: string): void {
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
    throw new Error("returnTo must be an app-relative path");
  }
}
