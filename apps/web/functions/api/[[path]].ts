import { normalizeAiOcrImages, normalizeAiTripDraft, parseAiTripDraft } from "@wanderlust/api";
import { AiItineraryPatchProposalSchema, TripSchema, canViewShare, createPersistedTripId, enforceAiPatchContext, isPersistedTripId, reassignTripReferences, type AiPatchContext } from "@wanderlust/domain";
import { getSessionUser, getUserStorageId, json, type AuthEnv } from "../_auth";

type TripDraftPayload = {
  id?: string;
  ownerId?: string;
  title?: string;
  destination?: string;
  destinationMeta?: DestinationCandidate;
  startDate?: string;
  endDate?: string;
  status?: "draft" | "active" | "archived";
  days?: Array<{
    id?: string;
    tripId?: string;
    date?: string;
    title?: string;
    items?: Array<{ dayId?: string; title?: string; startTime?: string; locationName?: string; reason?: string; notes?: string }>;
  }>;
  places?: Array<{ tripId?: string }>;
  bookings?: Array<{ tripId?: string; dayId?: string }>;
  attachments?: Array<{ tripId?: string }>;
  packingItems?: Array<{ tripId?: string }>;
  weather?: Array<{ dayId?: string }>;
  budgetMembers?: Array<{ tripId?: string }>;
  budgetItems?: Array<{ tripId?: string }>;
};

type DestinationCandidate = {
  name: string;
  fullName: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  provider: "google" | "fallback";
  providerPlaceId?: string;
};

type TripRow = {
  id: string;
  title: string;
  destination: string;
  status: "draft" | "active" | "archived";
  payload: string;
  updated_at: string;
};

type TripSummary = {
  id: string;
  title: string;
  destination: string;
  status: "draft" | "active" | "archived";
  startDate?: string;
  endDate?: string;
  dayCount: number;
  placeCount: number;
  bookingCount: number;
  updatedAt: string;
};

type ShareRow = {
  id: string;
  trip_id: string;
  owner_id: string;
  token: string;
  visibility: "public" | "private";
  allow_copy: number;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type ShareTripRow = ShareRow & {
  payload: string;
};

type AiRoutebookRequest = {
  trip?: Partial<TripDraftPayload> & {
    timezone?: string;
    days?: Array<{ date?: string; title?: string; items?: Array<{ title?: string; startTime?: string; locationName?: string; reason?: string; notes?: string }> }>;
    places?: Array<{ name?: string; category?: string; address?: string; notes?: string }>;
    bookings?: Array<{ title?: string; type?: string; startsAt?: string; endsAt?: string; notes?: string }>;
  };
  prompt?: string;
  text?: string;
};

type AiTextResult = string | { response?: unknown; result?: { response?: unknown }; choices?: Array<{ message?: { content?: unknown } }> };
type AiOcrRequest = {
  images?: unknown;
};
type AiPatchRequest = {
  trip?: unknown;
  prompt?: string;
  context?: AiPatchContext;
};
type AiVisionResult =
  | string
  | {
      response?: unknown;
      answer?: unknown;
      description?: unknown;
      result?: { response?: unknown; answer?: unknown; description?: unknown };
      choices?: Array<{ message?: { content?: unknown } }>;
    };

type GoogleGeocodeResponse = {
  status: string;
  results?: Array<{
    place_id?: string;
    formatted_address?: string;
    address_components?: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  }>;
};

type GoogleTimezoneResponse = {
  status: string;
  timeZoneId?: string;
};

const defaultWorkersAiTextModel = "@cf/meta/llama-3.1-8b-instruct-fast";
const defaultWorkersAiVisionModel = "@cf/moondream/moondream3.1-9B-A2B";
const fallbackDestinations: DestinationCandidate[] = [
  { name: "Tokyo", fullName: "Tokyo, Japan", countryCode: "JP", latitude: 35.6762, longitude: 139.6503, timezone: "Asia/Tokyo", provider: "fallback" },
  { name: "Osaka", fullName: "Osaka, Japan", countryCode: "JP", latitude: 34.6937, longitude: 135.5023, timezone: "Asia/Tokyo", provider: "fallback" },
  { name: "Kyoto", fullName: "Kyoto, Japan", countryCode: "JP", latitude: 35.0116, longitude: 135.7681, timezone: "Asia/Tokyo", provider: "fallback" },
  { name: "Seoul", fullName: "Seoul, South Korea", countryCode: "KR", latitude: 37.5665, longitude: 126.978, timezone: "Asia/Seoul", provider: "fallback" },
  { name: "Bangkok", fullName: "Bangkok, Thailand", countryCode: "TH", latitude: 13.7563, longitude: 100.5018, timezone: "Asia/Bangkok", provider: "fallback" },
  { name: "Singapore", fullName: "Singapore", countryCode: "SG", latitude: 1.3521, longitude: 103.8198, timezone: "Asia/Singapore", provider: "fallback" },
  { name: "Paris", fullName: "Paris, France", countryCode: "FR", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris", provider: "fallback" },
  { name: "London", fullName: "London, United Kingdom", countryCode: "GB", latitude: 51.5072, longitude: -0.1276, timezone: "Europe/London", provider: "fallback" },
  { name: "New York", fullName: "New York, NY, USA", countryCode: "US", latitude: 40.7128, longitude: -74.006, timezone: "America/New_York", provider: "fallback" },
  { name: "Los Angeles", fullName: "Los Angeles, CA, USA", countryCode: "US", latitude: 34.0522, longitude: -118.2437, timezone: "America/Los_Angeles", provider: "fallback" }
];
const aiTripDraftJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    destination: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    timezone: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          type: { type: "string", enum: ["place", "food", "hotel", "transport", "activity", "note", "booking"] },
          title: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          locationName: { type: "string" },
          latitude: { type: "number" },
          longitude: { type: "number" },
          googlePlaceId: { type: "string" },
          reason: { type: "string" },
          notes: { type: "string" }
        },
        required: ["date", "type", "title"]
      }
    }
  },
  required: ["title", "destination", "startDate", "endDate", "timezone", "items"]
};
const aiItineraryPatchJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    summary: { type: "string" },
    operations: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { const: "add_item" },
              summary: { type: "string" },
              dayId: { type: "string" },
              after: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  dayId: { type: "string" },
                  type: { enum: ["place", "food", "hotel", "transport", "activity", "note", "booking"] },
                  title: { type: "string" },
                  startTime: { type: "string" },
                  endTime: { type: "string" },
                  locationName: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  googlePlaceId: { type: "string" },
                  reason: { type: "string" },
                  notes: { type: "string" },
                  attachmentIds: { type: "array", items: { type: "string" } },
                  sortOrder: { type: "integer", minimum: 0 }
                },
                required: ["id", "dayId", "type", "title", "sortOrder"]
              }
            },
            required: ["id", "type", "summary", "dayId", "after"]
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { const: "update_item" },
              summary: { type: "string" },
              dayId: { type: "string" },
              itemId: { type: "string" },
              before: { type: "object" },
              after: { type: "object" }
            },
            required: ["id", "type", "summary", "dayId", "itemId", "after"]
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { const: "delete_item" },
              summary: { type: "string" },
              dayId: { type: "string" },
              itemId: { type: "string" },
              before: { type: "object" }
            },
            required: ["id", "type", "summary", "dayId", "itemId"]
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { const: "move_item" },
              summary: { type: "string" },
              dayId: { type: "string" },
              itemId: { type: "string" },
              toDayId: { type: "string" },
              toSortOrder: { type: "integer", minimum: 0 }
            },
            required: ["id", "type", "summary", "dayId", "itemId", "toDayId"]
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { const: "update_day" },
              summary: { type: "string" },
              dayId: { type: "string" },
              before: { type: "object" },
              after: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  date: { type: "string" }
                }
              }
            },
            required: ["id", "type", "summary", "dayId", "after"]
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { const: "update_place" },
              summary: { type: "string" },
              placeId: { type: "string" },
              before: { type: "object" },
              after: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  category: { enum: ["nature", "culture", "food", "architecture", "hotel", "transport", "shopping", "other"] },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  address: { type: "string" },
                  notes: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  website: { type: "string" },
                  phone: { type: "string" },
                  imageUrl: { type: "string" },
                  googlePlaceId: { type: "string" },
                  osmId: { type: "string" },
                  isFavorite: { type: "boolean" }
                }
              }
            },
            required: ["id", "type", "summary", "placeId", "after"]
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { const: "update_booking" },
              summary: { type: "string" },
              bookingId: { type: "string" },
              before: { type: "object" },
              after: {
                type: "object",
                properties: {
                  dayId: { type: "string" },
                  placeId: { type: "string" },
                  type: { enum: ["flight", "hotel", "train", "restaurant", "ticket", "car", "other"] },
                  title: { type: "string" },
                  confirmationCode: { type: "string" },
                  startsAt: { type: "string" },
                  endsAt: { type: "string" },
                  address: { type: "string" },
                  provider: { type: "string" },
                  status: { enum: ["todo", "confirmed", "checked_in", "cancelled"] },
                  notes: { type: "string" },
                  attachmentIds: { type: "array", items: { type: "string" } }
                }
              }
            },
            required: ["id", "type", "summary", "bookingId", "after"]
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { const: "update_packing" },
              summary: { type: "string" },
              packingItemId: { type: "string" },
              before: { type: "object" },
              after: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  category: { enum: ["documents", "clothing", "electronics", "health", "money", "toiletries", "other"] },
                  assignedTo: { type: "string" },
                  quantity: { type: "integer", minimum: 1 },
                  packed: { type: "boolean" },
                  notes: { type: "string" }
                }
              }
            },
            required: ["id", "type", "summary", "packingItemId", "after"]
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { const: "update_budget_item" },
              summary: { type: "string" },
              budgetItemId: { type: "string" },
              before: { type: "object" },
              after: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  category: { enum: ["accommodation", "transport", "food", "tickets", "shopping", "other"] },
                  amount: { type: "number", minimum: 0 },
                  currency: { type: "string" },
                  paidByMemberIds: { type: "array", items: { type: "string" } },
                  splitWithMemberIds: { type: "array", items: { type: "string" } },
                  bookingId: { type: "string" },
                  placeId: { type: "string" },
                  date: { type: "string" },
                  notes: { type: "string" }
                }
              }
            },
            required: ["id", "type", "summary", "budgetItemId", "after"]
          },
          {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { const: "update_attachment" },
              summary: { type: "string" },
              attachmentId: { type: "string" },
              before: { type: "object" },
              after: {
                type: "object",
                properties: {
                  type: { enum: ["image", "pdf", "ticket", "receipt", "document"] },
                  category: { enum: ["passport", "visa", "hotel", "ticket", "transport", "insurance", "receipt", "other"] },
                  linkedType: { enum: ["trip", "place", "booking"] },
                  linkedId: { type: "string" },
                  title: { type: "string" }
                }
              }
            },
            required: ["id", "type", "summary", "attachmentId", "after"]
          }
        ]
      }
    }
  },
  required: ["id", "summary", "operations"]
};

export const onRequest: PagesFunction<AuthEnv> = async ({ request, env, params }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path ?? "");
  const url = new URL(request.url);

  if (url.pathname === "/api/trips" && request.method === "GET") {
    return listTrips(request, env);
  }

  if (url.pathname === "/api/trips" && request.method === "POST") {
    return createTrip(request, env);
  }

  if (path === "ai/plan" && request.method === "POST") {
    return createAiTripDraft(request, env, "plan");
  }

  if (path === "ai/import" && request.method === "POST") {
    return createAiTripDraft(request, env, "import");
  }

  if (path === "ai/ocr" && request.method === "POST") {
    return extractAiTripTextFromImages(request, env);
  }

  if (path === "ai/patch" && request.method === "POST") {
    return createAiItineraryPatch(request, env);
  }

  if (path === "geo/search" && request.method === "GET") {
    return searchDestinations(request, env);
  }

  const publicShareMatch = path.match(/^share\/([^/]+)$/);
  if (publicShareMatch && request.method === "GET") {
    return getPublicShare(env, decodeURIComponent(publicShareMatch[1]!));
  }

  const tripShareMatch = path.match(/^trips\/([^/]+)\/share$/);
  if (tripShareMatch && request.method === "GET") {
    return getTripShare(request, env, decodeURIComponent(tripShareMatch[1]!));
  }

  if (tripShareMatch && request.method === "POST") {
    return createTripShare(request, env, decodeURIComponent(tripShareMatch[1]!));
  }

  const shareMatch = path.match(/^shares\/([^/]+)$/);
  if (shareMatch && request.method === "DELETE") {
    return revokeShare(request, env, decodeURIComponent(shareMatch[1]!));
  }

  const tripMatch = path.match(/^trips\/([^/]+)$/);
  if (tripMatch && request.method === "GET") {
    return getTrip(request, env, decodeURIComponent(tripMatch[1]!));
  }

  if (tripMatch && request.method === "PUT") {
    return updateTrip(request, env, decodeURIComponent(tripMatch[1]!));
  }

  if (tripMatch && request.method === "DELETE") {
    return deleteTrip(request, env, decodeURIComponent(tripMatch[1]!));
  }

  const attachmentMatch = path.match(/^attachments\/(.+)$/);
  if (attachmentMatch) {
    const key = decodeURIComponent(attachmentMatch[1]!);
    if (request.method === "PUT") return putAttachment(request, env, key);
    if (request.method === "GET") return getAttachment(request, env, key);
    if (request.method === "DELETE") return deleteAttachment(request, env, key);
  }

  return json({ error: "not_found" }, 404);
};

async function searchDestinations(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return json({ candidates: [] });
  }
  if (query.length > 120) {
    return json({ error: "query_too_long" }, 400);
  }

  if (!env.GOOGLE_MAPS_API_KEY?.trim()) {
    return json({ candidates: searchFallbackDestinations(query) });
  }

  try {
    const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    geocodeUrl.searchParams.set("address", query);
    geocodeUrl.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);
    geocodeUrl.searchParams.set("language", "en");

    const geocodeResponse = await fetch(geocodeUrl.toString());
    if (!geocodeResponse.ok) {
      return json({ candidates: searchFallbackDestinations(query), providerError: "google_geocode_http_error" });
    }

    const geocode = (await geocodeResponse.json()) as GoogleGeocodeResponse;
    if (geocode.status !== "OK") {
      return json({ candidates: searchFallbackDestinations(query), providerError: geocode.status });
    }

    const candidates = await Promise.all(
      (geocode.results ?? [])
        .slice(0, 5)
        .map(async (result): Promise<DestinationCandidate | null> => {
          const location = result.geometry?.location;
          if (!location || !result.formatted_address) return null;
          const country = result.address_components?.find((component) => component.types.includes("country"));
          const locality =
            result.address_components?.find((component) => component.types.includes("locality")) ??
            result.address_components?.find((component) => component.types.includes("administrative_area_level_1")) ??
            result.address_components?.[0];
          const timezone = await fetchGoogleTimezone(env, location.lat, location.lng);
          return {
            name: locality?.long_name ?? result.formatted_address,
            fullName: result.formatted_address,
            countryCode: country?.short_name,
            latitude: location.lat,
            longitude: location.lng,
            timezone,
            provider: "google",
            providerPlaceId: result.place_id
          };
        })
    );

    return json({ candidates: candidates.filter((candidate): candidate is DestinationCandidate => Boolean(candidate)) });
  } catch (error) {
    return json({
      candidates: searchFallbackDestinations(query),
      providerError: error instanceof Error ? error.message : "google_geocode_failed"
    });
  }
}

async function fetchGoogleTimezone(env: AuthEnv, latitude: number, longitude: number): Promise<string | undefined> {
  if (!env.GOOGLE_MAPS_API_KEY?.trim()) return undefined;
  const timezoneUrl = new URL("https://maps.googleapis.com/maps/api/timezone/json");
  timezoneUrl.searchParams.set("location", `${latitude},${longitude}`);
  timezoneUrl.searchParams.set("timestamp", `${Math.floor(Date.now() / 1000)}`);
  timezoneUrl.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);
  const response = await fetch(timezoneUrl.toString());
  if (!response.ok) return undefined;
  const payload = (await response.json()) as GoogleTimezoneResponse;
  return payload.status === "OK" ? payload.timeZoneId : undefined;
}

function searchFallbackDestinations(query: string): DestinationCandidate[] {
  const normalized = query.toLowerCase();
  return fallbackDestinations
    .filter((candidate) => `${candidate.name} ${candidate.fullName}`.toLowerCase().includes(normalized))
    .slice(0, 5);
}

async function listTrips(request: Request, env: AuthEnv): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const result = await auth.db.prepare(
    `SELECT id, title, destination, status, payload, updated_at
     FROM trips
     WHERE owner_id = ?
     ORDER BY updated_at DESC`
  )
    .bind(auth.ownerId)
    .all<TripRow>();

  return json({ trips: result.results.map(rowToTripSummary) });
}

async function createAiTripDraft(request: Request, env: AuthEnv, mode: "plan" | "import"): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.AI) {
    return json({ error: "workers_ai_not_configured" }, 503);
  }

  const payload = await request.json<AiRoutebookRequest>();
  const trip = payload.trip ?? {};
  const model = env.WORKERS_AI_TEXT_MODEL?.trim() || defaultWorkersAiTextModel;
  const userText = mode === "plan" ? clampText(payload.prompt ?? "", 4000) : clampText(payload.text ?? "", 12000);
  if (!userText.trim()) {
    return json({ error: mode === "plan" ? "prompt_required" : "text_required" }, 400);
  }

  const currentTrip = {
    title: trip.title,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    timezone: trip.timezone,
    existingDays: (trip.days ?? []).map((day) => ({
      date: day.date,
      title: day.title,
      items: (day.items ?? []).map((item) => ({
        title: item.title,
        startTime: item.startTime,
        locationName: item.locationName,
        reason: item.reason,
        notes: item.notes
      }))
    })),
    places: trip.places ?? [],
    bookings: trip.bookings ?? []
  };

  const systemPrompt = [
    "You are Pocket Routebook AI. Return only strict JSON, no markdown.",
    "The JSON shape is:",
    '{"title":"string","destination":"string","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","timezone":"IANA timezone","items":[{"date":"YYYY-MM-DD","type":"place|food|hotel|transport|activity|note|booking","title":"string","startTime":"HH:MM","endTime":"HH:MM","locationName":"string","latitude":number,"longitude":number,"googlePlaceId":"string","reason":"string","notes":"string"}]}',
    "Use the trip date range from context unless the user clearly provided different dates.",
    "Give every non-note item a short reason explaining why it belongs at that point in the day.",
    "Keep items practical for offline travel use. Mark uncertain details in notes instead of inventing confirmation numbers."
  ].join("\n");

  const taskPrompt =
    mode === "plan"
      ? `Create a reviewable itinerary draft from this request.\nCurrent routebook context:\n${JSON.stringify(currentTrip)}\nUser request:\n${userText}`
      : `Extract a reviewable routebook draft from pasted travel material. Preserve confirmed facts and put uncertainty in notes.\nCurrent routebook context:\n${JSON.stringify(currentTrip)}\nMaterial:\n${userText}`;

  try {
    const aiResult = (await env.AI.run(model, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: taskPrompt }
      ],
      temperature: mode === "plan" ? 0.35 : 0.1,
      max_tokens: 3200,
      response_format: {
        type: "json_schema",
        json_schema: aiTripDraftJsonSchema
      }
    })) as AiTextResult;
    const draftJson = parseAiTripDraft(parseJsonFromAiOutput(extractAiOutput(aiResult)));
    const normalized = normalizeAiTripDraft(draftJson);
    return json({ draft: draftJson, trip: normalized.trip, provider: "cloudflare-workers-ai", model });
  } catch (error) {
    return json({ error: "ai_draft_failed", message: error instanceof Error ? error.message : "Could not create AI draft" }, 502);
  }
}

async function createAiItineraryPatch(request: Request, env: AuthEnv): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.AI) {
    return json({ error: "workers_ai_not_configured" }, 503);
  }

  const payload = await request.json<AiPatchRequest>();
  const prompt = clampText(payload.prompt ?? "", 4000);
  if (!prompt.trim()) {
    return json({ error: "prompt_required" }, 400);
  }

  let trip;
  try {
    trip = TripSchema.parse(payload.trip);
  } catch (error) {
    return json({ error: "invalid_trip", message: error instanceof Error ? error.message : "Trip payload is invalid" }, 400);
  }

  const model = env.WORKERS_AI_TEXT_MODEL?.trim() || defaultWorkersAiTextModel;
  const existingDayIds = trip.days.map((day) => day.id);
  const existingItemIds = trip.days.flatMap((day) => day.items.map((item) => item.id));
  const existingPlaceIds = trip.places.map((place) => place.id);
  const existingBookingIds = trip.bookings.map((booking) => booking.id);
  const existingPackingItemIds = trip.packingItems.map((item) => item.id);
  const existingBudgetItemIds = trip.budgetItems.map((item) => item.id);
  const existingAttachmentIds = trip.attachments.map((attachment) => attachment.id);
  const compactTrip = {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    timezone: trip.timezone,
    days: trip.days.map((day) => ({
      id: day.id,
      date: day.date,
      title: day.title,
      sortOrder: day.sortOrder,
      items: day.items.map((item) => ({
        id: item.id,
        dayId: item.dayId,
        type: item.type,
        title: item.title,
        startTime: item.startTime,
        endTime: item.endTime,
        locationName: item.locationName,
        reason: item.reason,
        notes: item.notes,
        sortOrder: item.sortOrder
      }))
    })),
    places: trip.places.map((place) => ({
      id: place.id,
      name: place.name,
      category: place.category,
      latitude: place.latitude,
      longitude: place.longitude,
      address: place.address,
      notes: place.notes,
      tags: place.tags,
      isFavorite: place.isFavorite
    })),
    bookings: trip.bookings.map((booking) => ({
      id: booking.id,
      dayId: booking.dayId,
      placeId: booking.placeId,
      type: booking.type,
      title: booking.title,
      confirmationCode: booking.confirmationCode,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      address: booking.address,
      provider: booking.provider,
      status: booking.status,
      notes: booking.notes
    })),
    packingItems: trip.packingItems.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      assignedTo: item.assignedTo,
      quantity: item.quantity,
      packed: item.packed,
      notes: item.notes
    })),
    budgetItems: trip.budgetItems.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      amount: item.amount,
      currency: item.currency,
      paidByMemberIds: item.paidByMemberIds,
      splitWithMemberIds: item.splitWithMemberIds,
      bookingId: item.bookingId,
      placeId: item.placeId,
      date: item.date,
      notes: item.notes
    })),
    attachments: trip.attachments.map((attachment) => ({
      id: attachment.id,
      type: attachment.type,
      category: attachment.category,
      linkedType: attachment.linkedType,
      linkedId: attachment.linkedId,
      title: attachment.title
    }))
  };

  const systemPrompt = [
    "You are Pocket Routebook AI. Return only strict JSON, no markdown.",
    "Create a reviewable routebook patch proposal. Do not return a full trip.",
    "Allowed operation types: add_item, update_item, delete_item, move_item, update_day, update_place, update_booking, update_packing, update_budget_item, update_attachment.",
    "Use only existing dayId values for dayId/toDayId. Use only existing itemId values for update_item/delete_item/move_item.",
    "Use only existing placeId, bookingId, packingItemId, budgetItemId, and attachmentId values for module update operations.",
    "For add_item, generate id values with prefix ai_item_ and keep dayId equal to the target day.",
    "Never change attachment storagePath or localUri.",
    "For every update operation, after must include only changed editable fields. Never include id or tripId in after. Never include id or dayId in update_item after.",
    "Prefer small, concrete changes. If the request is ambiguous, return an empty operations array with a short summary."
  ].join("\n");

  const contextRules = getAiPatchContextRules(payload.context);
  const taskPrompt = [
    `Current routebook: ${JSON.stringify(compactTrip)}`,
    `Valid day ids: ${JSON.stringify(existingDayIds)}`,
    `Valid item ids: ${JSON.stringify(existingItemIds)}`,
    `Valid place ids: ${JSON.stringify(existingPlaceIds)}`,
    `Valid booking ids: ${JSON.stringify(existingBookingIds)}`,
    `Valid packing item ids: ${JSON.stringify(existingPackingItemIds)}`,
    `Valid budget item ids: ${JSON.stringify(existingBudgetItemIds)}`,
    `Valid attachment ids: ${JSON.stringify(existingAttachmentIds)}`,
    `Edit context: ${JSON.stringify(payload.context ?? { source: "global" })}`,
    `Context rules: ${contextRules}`,
    `User prompt: ${prompt}`
  ].join("\n");

  try {
    const aiResult = (await env.AI.run(model, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: taskPrompt }
      ],
      temperature: 0.2,
      max_tokens: 2600,
      response_format: {
        type: "json_schema",
        json_schema: aiItineraryPatchJsonSchema
      }
    })) as AiTextResult;
    const rawProposal = parseJsonFromAiOutput(extractAiOutput(aiResult));
    const proposal = AiItineraryPatchProposalSchema.parse(rawProposal);
    const scopedProposal = enforceAiPatchContext(proposal, payload.context);
    return json({ proposal: scopedProposal, provider: "cloudflare-workers-ai", model });
  } catch (error) {
    return json({ error: "ai_patch_failed", message: error instanceof Error ? error.message : "Could not create AI patch" }, 502);
  }
}

function getAiPatchContextRules(context: AiPatchRequest["context"]): string {
  if (!context || context.source === "global") return "The user is editing the whole routebook. Keep changes minimal and relevant to the prompt.";
  if (context.source === "day") return `Only change itinerary content for dayId ${context.dayId}. Do not emit module update operations unless directly required by that day.`;
  if (context.source === "item") return `Only change itinerary itemId ${context.itemId} on dayId ${context.dayId}. Use update_item, delete_item, or move_item for that item unless the prompt clearly asks to add a supporting item.`;
  if (context.source === "module") {
    const moduleRules: Record<string, string> = {
      itinerary: "Only emit itinerary operations: add_item, update_item, delete_item, move_item, update_day.",
      places: "Only emit update_place operations for existing place ids.",
      map: "Only emit update_place operations that improve coordinates, addresses, or map-related place metadata.",
      bookings: "Only emit update_booking operations for existing booking ids.",
      files: "Only emit update_attachment operations for existing attachment ids. Never change storagePath or localUri.",
      packing: "Only emit update_packing operations for existing packing item ids.",
      budget: "Only emit update_budget_item operations for existing budget item ids.",
      ai: "Only produce a small patch proposal relevant to the routebook data. Do not describe AI settings."
    };
    return moduleRules[context.moduleId ?? ""] ?? "Only change the active editor module.";
  }

  const entityRules: Record<string, string> = {
    place: `Only emit update_place for placeId ${context.entityId}.`,
    booking: `Only emit update_booking for bookingId ${context.entityId}.`,
    attachment: `Only emit update_attachment for attachmentId ${context.entityId}. Never change storagePath or localUri.`,
    packingItem: `Only emit update_packing for packingItemId ${context.entityId}.`,
    budgetItem: `Only emit update_budget_item for budgetItemId ${context.entityId}.`
  };
  return entityRules[context.entityType ?? ""] ?? "Only update the explicitly selected entity.";
}

async function extractAiTripTextFromImages(request: Request, env: AuthEnv): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.AI) {
    return json({ error: "workers_ai_not_configured" }, 503);
  }

  try {
    const payload = await request.json<AiOcrRequest>();
    const images = normalizeAiOcrImages(payload.images);
    const model = env.WORKERS_AI_VISION_MODEL?.trim() || defaultWorkersAiVisionModel;
    const chunks = await Promise.all(
      images.map(async (image, index) => {
        const result = (await env.AI!.run(model, {
          task: "query",
          image: image.dataUrl,
          question: [
            "请从这张旅行订单或行程截图中提取可导入路书的文字。",
            "保留日期、时间、航班/酒店/车票/门票名称、出发到达城市、机场航站楼、地址、房型、订单号等行程事实。",
            "忽略手机号、邮箱、支付金额、身份证件号、广告文案和页面导航文字。",
            "如果字段无法确定，请写“未识别”。按原图顺序用简洁中文输出。"
          ].join("\n"),
          reasoning: false,
          stream: false,
          temperature: 0.1,
          max_tokens: 1800
        })) as AiVisionResult;
        const text = clampText(stringifyAiOutput(extractAiOutput(result)), 5000).trim();
        return text ? `【截图 ${index + 1}：${image.name}】\n${text}` : "";
      })
    );
    const text = chunks.filter(Boolean).join("\n\n").trim();
    if (!text) {
      return json({ error: "ocr_empty", message: "没有从截图中识别到可导入的行程内容" }, 422);
    }
    return json({ text, provider: "cloudflare-workers-ai", model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "截图识别失败";
    return json({ error: "ai_ocr_failed", message }, message.includes("截图") || message.includes("支持") ? 400 : 502);
  }
}

async function createTrip(request: Request, env: AuthEnv): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const draft = await request.json<TripDraftPayload>();
  const id = draft.id?.trim() && isPersistedTripId(draft.id.trim()) ? draft.id.trim() : createPersistedTripId();
  const title = draft.title?.trim() || "Untitled trip";
  const destination = draft.destination?.trim() || "New destination";
  const status = draft.status ?? "draft";
  const normalizedDraft = reassignTripReferences(draft, id, auth.ownerId);
  const payload = JSON.stringify({ ...normalizedDraft, title, destination, status });

  await auth.db.prepare(
    `INSERT INTO trips (id, owner_id, title, destination, status, payload, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  )
    .bind(id, auth.ownerId, title, destination, status, payload)
    .run();

  return json({ trip: JSON.parse(payload) }, 201);
}

async function getTripShare(request: Request, env: AuthEnv, tripId: string): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const trip = await auth.db.prepare("SELECT id FROM trips WHERE id = ? AND owner_id = ?").bind(tripId, auth.ownerId).first<{ id: string }>();
  if (!trip) {
    return json({ error: "trip_not_found" }, 404);
  }

  const row = await auth.db.prepare(
    `SELECT id, trip_id, owner_id, token, visibility, allow_copy, revoked_at, expires_at, created_at, updated_at
     FROM shares
     WHERE trip_id = ? AND owner_id = ? AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(tripId, auth.ownerId)
    .first<ShareRow>();

  return json({ share: row ? rowToShare(row) : null });
}

async function createTripShare(request: Request, env: AuthEnv, tripId: string): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const trip = await auth.db.prepare("SELECT id FROM trips WHERE id = ? AND owner_id = ?").bind(tripId, auth.ownerId).first<{ id: string }>();
  if (!trip) {
    return json({ error: "trip_not_found" }, 404);
  }

  const existing = await auth.db.prepare(
    `SELECT id, trip_id, owner_id, token, visibility, allow_copy, revoked_at, expires_at, created_at, updated_at
     FROM shares
     WHERE trip_id = ? AND owner_id = ? AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(tripId, auth.ownerId)
    .first<ShareRow>();
  if (existing) {
    return json({ share: rowToShare(existing) });
  }

  const id = `share_${crypto.randomUUID()}`;
  const token = createShareToken();
  await auth.db.prepare(
    `INSERT INTO shares (id, trip_id, owner_id, token, visibility, allow_copy, updated_at)
     VALUES (?, ?, ?, ?, 'public', 0, CURRENT_TIMESTAMP)`
  )
    .bind(id, tripId, auth.ownerId, token)
    .run();

  const row = await auth.db.prepare(
    `SELECT id, trip_id, owner_id, token, visibility, allow_copy, revoked_at, expires_at, created_at, updated_at
     FROM shares
     WHERE id = ?`
  )
    .bind(id)
    .first<ShareRow>();

  return json({ share: rowToShare(row!) }, 201);
}

async function revokeShare(request: Request, env: AuthEnv, shareId: string): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const result = await auth.db.prepare(
    `UPDATE shares
     SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND owner_id = ? AND revoked_at IS NULL`
  )
    .bind(shareId, auth.ownerId)
    .run();

  if (!result.meta.changes) {
    return json({ error: "share_not_found" }, 404);
  }

  return new Response(null, { status: 204 });
}

async function getPublicShare(env: AuthEnv, token: string): Promise<Response> {
  if (!env.DB) {
    return json({ error: "database_not_configured" }, 503);
  }

  const row = await env.DB.prepare(
    `SELECT shares.id, shares.trip_id, shares.owner_id, shares.token, shares.visibility, shares.allow_copy,
            shares.revoked_at, shares.expires_at, shares.created_at, shares.updated_at, trips.payload
     FROM shares
     INNER JOIN trips ON trips.id = shares.trip_id AND trips.owner_id = shares.owner_id
     WHERE shares.token = ?
     LIMIT 1`
  )
    .bind(token)
    .first<ShareTripRow>();

  if (!row) {
    return json({ error: "share_not_found" }, 404);
  }

  const share = rowToShare(row);
  const gate = canViewShare(share, new Date().toISOString());
  if (!gate.allowed) {
    return json({ error: gate.reason }, gate.reason === "share_private" ? 403 : 410);
  }

  return json({ share, trip: sanitizeSharedTrip(JSON.parse(row.payload)) });
}

function rowToTripSummary(row: TripRow): TripSummary {
  const payload = JSON.parse(row.payload) as TripDraftPayload & {
    days?: unknown[];
    places?: unknown[];
    bookings?: unknown[];
  };
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    status: row.status,
    startDate: payload.startDate,
    endDate: payload.endDate,
    dayCount: payload.days?.length ?? 0,
    placeCount: payload.places?.length ?? 0,
    bookingCount: payload.bookings?.length ?? 0,
    updatedAt: row.updated_at
  };
}

function rowToShare(row: ShareRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    token: row.token,
    visibility: row.visibility,
    allowCopy: Boolean(row.allow_copy),
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sanitizeSharedTrip(payload: Record<string, unknown>): Record<string, unknown> {
  const bookings = Array.isArray(payload.bookings)
    ? payload.bookings.map((booking) => {
        if (!booking || typeof booking !== "object") return booking;
        const { confirmationCode: _confirmationCode, attachmentIds: _attachmentIds, ...safeBooking } = booking as Record<string, unknown>;
        return { ...safeBooking, attachmentIds: [] };
      })
    : [];

  return {
    ...payload,
    ownerId: "shared",
    bookings,
    attachments: [],
    budgetMembers: [],
    budgetItems: []
  };
}

function createShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getTrip(request: Request, env: AuthEnv, id: string): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await auth.db.prepare("SELECT payload FROM trips WHERE id = ? AND owner_id = ?").bind(id, auth.ownerId).first<{ payload: string }>();
  if (!row) {
    return json({ error: "trip_not_found" }, 404);
  }

  return json({ trip: JSON.parse(row.payload) });
}

async function updateTrip(request: Request, env: AuthEnv, id: string): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const existing = await auth.db.prepare("SELECT id FROM trips WHERE id = ? AND owner_id = ?").bind(id, auth.ownerId).first<{ id: string }>();
  if (!existing) {
    return json({ error: "trip_not_found" }, 404);
  }

  const draft = await request.json<TripDraftPayload>();
  const title = draft.title?.trim() || "Untitled trip";
  const destination = draft.destination?.trim() || "New destination";
  const status = draft.status ?? "draft";
  const payload = JSON.stringify({ ...draft, id, title, destination, status });

  await auth.db.prepare(
    `UPDATE trips
     SET title = ?, destination = ?, status = ?, payload = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND owner_id = ?`
  )
    .bind(title, destination, status, payload, id, auth.ownerId)
    .run();

  return json({ trip: JSON.parse(payload) });
}

async function deleteTrip(request: Request, env: AuthEnv, id: string): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await auth.db.prepare("SELECT payload FROM trips WHERE id = ? AND owner_id = ?").bind(id, auth.ownerId).first<{ payload: string }>();
  if (!row) {
    return json({ error: "trip_not_found" }, 404);
  }

  await auth.db.prepare("DELETE FROM trips WHERE id = ? AND owner_id = ?").bind(id, auth.ownerId).run();

  if (env.ATTACHMENTS) {
    const payload = JSON.parse(row.payload) as { attachments?: Array<{ storagePath?: string }> };
    await Promise.all(
      (payload.attachments ?? [])
        .map((attachment) => attachment.storagePath)
        .filter((storagePath): storagePath is string => Boolean(storagePath))
        .map((storagePath) => env.ATTACHMENTS!.delete(buildOwnerAttachmentKey(auth.ownerId, storagePath)))
    );
  }

  return new Response(null, { status: 204 });
}

async function requireTripAuth(request: Request, env: AuthEnv): Promise<{ ownerId: string; db: D1Database } | Response> {
  const user = await getSessionUser(request, env);
  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.DB) {
    return json({ error: "database_not_configured" }, 503);
  }

  return { ownerId: getUserStorageId(user), db: env.DB };
}

async function putAttachment(request: Request, env: AuthEnv, key: string): Promise<Response> {
  const auth = await requireStorageAuth(request, env);
  if (auth instanceof Response) return auth;

  const safeKey = buildOwnerAttachmentKey(auth.ownerId, key);
  const body = await request.arrayBuffer();
  await auth.bucket.put(safeKey, body, {
    httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" }
  });

  return json({ key: safeKey, size: body.byteLength }, 201);
}

async function getAttachment(request: Request, env: AuthEnv, key: string): Promise<Response> {
  const auth = await requireStorageAuth(request, env);
  if (auth instanceof Response) return auth;

  const safeKey = buildOwnerAttachmentKey(auth.ownerId, key);
  const object = await auth.bucket.get(safeKey);
  if (!object) {
    return json({ error: "attachment_not_found" }, 404);
  }

  const headers = new Headers({ "cache-control": "private, max-age=300" });
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}

async function deleteAttachment(request: Request, env: AuthEnv, key: string): Promise<Response> {
  const auth = await requireStorageAuth(request, env);
  if (auth instanceof Response) return auth;

  await auth.bucket.delete(buildOwnerAttachmentKey(auth.ownerId, key));
  return new Response(null, { status: 204 });
}

async function requireStorageAuth(request: Request, env: AuthEnv): Promise<{ ownerId: string; bucket: R2Bucket } | Response> {
  const user = await getSessionUser(request, env);
  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.ATTACHMENTS) {
    return json({ error: "attachments_not_configured" }, 503);
  }

  return { ownerId: getUserStorageId(user), bucket: env.ATTACHMENTS };
}

function buildOwnerAttachmentKey(ownerId: string, key: string): string {
  const ownerSegment = ownerId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanKey = key.replace(/^\/+/, "").replace(/\.\./g, "_");
  return `users/${ownerSegment}/${cleanKey}`;
}

function clampText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function extractAiOutput(result: AiTextResult | AiVisionResult): unknown {
  if (typeof result === "string") return result;
  const payload = result as {
      response?: unknown;
      answer?: unknown;
      caption?: unknown;
      description?: unknown;
      result?: { response?: unknown; answer?: unknown; caption?: unknown; description?: unknown };
      choices?: Array<{ message?: { content?: unknown } }>;
  };
  return payload.response ?? payload.answer ?? payload.caption ?? payload.description ?? payload.result?.response ?? payload.result?.answer ?? payload.result?.caption ?? payload.result?.description ?? payload.choices?.[0]?.message?.content ?? "";
}

function stringifyAiOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === undefined || output === null) return "";
  return JSON.stringify(output);
}

function parseJsonFromAiOutput(output: unknown): unknown {
  if (typeof output === "object" && output !== null) return output;
  if (typeof output !== "string") throw new Error("AI returned an unsupported response shape");
  const text = output;
  const trimmed = text.trim();
  if (!trimmed) throw new Error("AI returned an empty response");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI response did not contain JSON");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}
