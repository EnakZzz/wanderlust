import { z } from "zod";

export const productBrand = {
  name: "随身路书",
  shortName: "路书",
  tagline: "出发前整理、旅行中离线执行的随身路书。",
  description: "在网页上规划行程，把票据、地点、清单和当天下一步离线带到手机上。"
} as const;

export const ItineraryItemTypeSchema = z.enum([
  "place",
  "food",
  "hotel",
  "transport",
  "activity",
  "note",
  "booking"
]);

export const ItineraryItemSchema = z.object({
  id: z.string().min(1),
  dayId: z.string().min(1),
  type: ItineraryItemTypeSchema,
  placeId: z.string().optional(),
  bookingId: z.string().optional(),
  title: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  locationName: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  googlePlaceId: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  attachmentIds: z.array(z.string()).default([]),
  sortOrder: z.number().int().nonnegative()
});

export const TripDaySchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  items: z.array(ItineraryItemSchema).default([])
});

export const PlaceSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(["nature", "culture", "food", "architecture", "hotel", "transport", "shopping", "other"]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
  website: z.string().url().optional(),
  phone: z.string().optional(),
  imageUrl: z.string().url().optional(),
  googlePlaceId: z.string().optional(),
  osmId: z.string().optional(),
  isFavorite: z.boolean().default(false)
});

export const BookingSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  dayId: z.string().optional(),
  placeId: z.string().optional(),
  type: z.enum(["flight", "hotel", "train", "restaurant", "ticket", "car", "other"]),
  title: z.string().min(1),
  confirmationCode: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  address: z.string().optional(),
  provider: z.string().optional(),
  status: z.enum(["todo", "confirmed", "checked_in", "cancelled"]).default("todo"),
  notes: z.string().optional(),
  attachmentIds: z.array(z.string()).default([]),
  segments: z
    .array(
      z.object({
        id: z.string().min(1),
        mode: z.enum(["flight", "train", "bus", "ferry", "car", "other"]),
        carrier: z.string().optional(),
        serviceNumber: z.string().optional(),
        departureCode: z.string().optional(),
        departureName: z.string().optional(),
        departureAt: z.string().optional(),
        arrivalCode: z.string().optional(),
        arrivalName: z.string().optional(),
        arrivalAt: z.string().optional(),
        seat: z.string().optional(),
        terminal: z.string().optional(),
        gate: z.string().optional()
      })
    )
    .default([])
});

export const AttachmentSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  type: z.enum(["image", "pdf", "ticket", "receipt", "document"]),
  category: z.enum(["passport", "visa", "hotel", "ticket", "transport", "insurance", "receipt", "other"]).default("other"),
  linkedType: z.enum(["trip", "place", "booking"]).default("trip"),
  linkedId: z.string().optional(),
  storagePath: z.string().min(1),
  localUri: z.string().optional(),
  title: z.string().optional()
});

export const BudgetMemberSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  name: z.string().min(1)
});

export const BudgetItemSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(["accommodation", "transport", "food", "tickets", "shopping", "other"]).default("other"),
  amount: z.number().nonnegative(),
  currency: z.string().min(1).default("USD"),
  paidByMemberIds: z.array(z.string()).default([]),
  splitWithMemberIds: z.array(z.string()).default([]),
  bookingId: z.string().optional(),
  placeId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional()
});

export const PackingItemSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(["documents", "clothing", "electronics", "health", "money", "toiletries", "other"]).default("other"),
  assignedTo: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  packed: z.boolean().default(false),
  notes: z.string().optional()
});

export const WeatherForecastSchema = z.object({
  dayId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locationName: z.string().optional(),
  temperatureMinC: z.number().optional(),
  temperatureMaxC: z.number().optional(),
  precipitationProbability: z.number().min(0).max(100).optional(),
  summary: z.string().optional(),
  fetchedAt: z.string().optional()
});

export const DestinationMetaSchema = z.object({
  name: z.string().min(1),
  fullName: z.string().min(1),
  countryCode: z.string().min(2).max(2).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().min(1).optional(),
  provider: z.enum(["google", "fallback"]),
  providerPlaceId: z.string().optional()
});

export const OfflineBundleSchema = z.object({
  tripId: z.string().min(1),
  version: z.number().int().positive(),
  generatedAt: z.string(),
  includes: z.object({
    itinerary: z.boolean(),
    places: z.boolean(),
    bookings: z.boolean(),
    attachments: z.boolean(),
    packing: z.boolean(),
    weather: z.boolean()
  })
});

export const TripSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  title: z.string().min(1),
  destination: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
  destinationMeta: DestinationMetaSchema.optional(),
  status: z.enum(["draft", "active", "archived"]),
  coverImageUrl: z.string().url().optional(),
  days: z.array(TripDaySchema),
  places: z.array(PlaceSchema).default([]),
  bookings: z.array(BookingSchema).default([]),
  attachments: z.array(AttachmentSchema).default([]),
  packingItems: z.array(PackingItemSchema).default([]),
  weather: z.array(WeatherForecastSchema).default([]),
  budgetMembers: z.array(BudgetMemberSchema).default([]),
  budgetItems: z.array(BudgetItemSchema).default([]),
  offlineBundle: OfflineBundleSchema.optional()
});

export const EntitlementSchema = z.object({
  userId: z.string().min(1),
  plan: z.enum(["free", "pro", "team"]),
  status: z.enum(["active", "trialing", "past_due", "canceled", "expired"]),
  aiJobsUsedThisPeriod: z.number().int().nonnegative(),
  aiJobsLimit: z.number().int().nonnegative(),
  storageBytesUsed: z.number().int().nonnegative(),
  storageBytesLimit: z.number().int().nonnegative(),
  collaboratorLimit: z.number().int().nonnegative(),
  offlineTripLimit: z.number().int().nonnegative()
});

export const ShareSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  token: z.string().min(1),
  visibility: z.enum(["public", "private"]),
  allowCopy: z.boolean(),
  revokedAt: z.string().datetime().nullable().default(null),
  expiresAt: z.string().datetime().nullable().default(null)
});

const AiPatchDayUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const AiPatchItemUpdateSchema = ItineraryItemSchema.partial().omit({ id: true, dayId: true }).extend({
  id: z.never().optional(),
  dayId: z.never().optional()
});
const AiPatchPlaceUpdateSchema = PlaceSchema.partial().omit({ id: true, tripId: true }).extend({
  id: z.never().optional(),
  tripId: z.never().optional()
});
const AiPatchBookingUpdateSchema = BookingSchema.partial().omit({ id: true, tripId: true }).extend({
  id: z.never().optional(),
  tripId: z.never().optional()
});
const AiPatchPackingUpdateSchema = PackingItemSchema.partial().omit({ id: true, tripId: true }).extend({
  id: z.never().optional(),
  tripId: z.never().optional()
});
const AiPatchBudgetItemUpdateSchema = BudgetItemSchema.partial().omit({ id: true, tripId: true }).extend({
  id: z.never().optional(),
  tripId: z.never().optional()
});

export const AiAddItineraryItemOperationSchema = z.object({
  id: z.string().min(1),
  type: z.literal("add_item"),
  summary: z.string().min(1),
  dayId: z.string().min(1),
  after: ItineraryItemSchema
});

export const AiUpdateItineraryItemOperationSchema = z.object({
  id: z.string().min(1),
  type: z.literal("update_item"),
  summary: z.string().min(1),
  dayId: z.string().min(1),
  itemId: z.string().min(1),
  before: AiPatchItemUpdateSchema.optional(),
  after: AiPatchItemUpdateSchema
});

export const AiDeleteItineraryItemOperationSchema = z.object({
  id: z.string().min(1),
  type: z.literal("delete_item"),
  summary: z.string().min(1),
  dayId: z.string().min(1),
  itemId: z.string().min(1),
  before: ItineraryItemSchema.optional()
});

export const AiMoveItineraryItemOperationSchema = z.object({
  id: z.string().min(1),
  type: z.literal("move_item"),
  summary: z.string().min(1),
  dayId: z.string().min(1),
  itemId: z.string().min(1),
  toDayId: z.string().min(1),
  toSortOrder: z.number().int().nonnegative().optional()
});

export const AiUpdateItineraryDayOperationSchema = z.object({
  id: z.string().min(1),
  type: z.literal("update_day"),
  summary: z.string().min(1),
  dayId: z.string().min(1),
  before: AiPatchDayUpdateSchema.optional(),
  after: AiPatchDayUpdateSchema
});

export const AiUpdatePlaceOperationSchema = z.object({
  id: z.string().min(1),
  type: z.literal("update_place"),
  summary: z.string().min(1),
  placeId: z.string().min(1),
  before: AiPatchPlaceUpdateSchema.optional(),
  after: AiPatchPlaceUpdateSchema
});

export const AiUpdateBookingOperationSchema = z.object({
  id: z.string().min(1),
  type: z.literal("update_booking"),
  summary: z.string().min(1),
  bookingId: z.string().min(1),
  before: AiPatchBookingUpdateSchema.optional(),
  after: AiPatchBookingUpdateSchema
});

export const AiUpdatePackingOperationSchema = z.object({
  id: z.string().min(1),
  type: z.literal("update_packing"),
  summary: z.string().min(1),
  packingItemId: z.string().min(1),
  before: AiPatchPackingUpdateSchema.optional(),
  after: AiPatchPackingUpdateSchema
});

export const AiUpdateBudgetItemOperationSchema = z.object({
  id: z.string().min(1),
  type: z.literal("update_budget_item"),
  summary: z.string().min(1),
  budgetItemId: z.string().min(1),
  before: AiPatchBudgetItemUpdateSchema.optional(),
  after: AiPatchBudgetItemUpdateSchema
});

export const AiItineraryPatchOperationSchema = z.discriminatedUnion("type", [
  AiAddItineraryItemOperationSchema,
  AiUpdateItineraryItemOperationSchema,
  AiDeleteItineraryItemOperationSchema,
  AiMoveItineraryItemOperationSchema,
  AiUpdateItineraryDayOperationSchema,
  AiUpdatePlaceOperationSchema,
  AiUpdateBookingOperationSchema,
  AiUpdatePackingOperationSchema,
  AiUpdateBudgetItemOperationSchema
]);

export const AiItineraryPatchProposalSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  operations: z.array(AiItineraryPatchOperationSchema).default([])
});

export type TripDay = {
  id: string;
  tripId: string;
  date: string;
  title: string;
  sortOrder: number;
  items: ItineraryItem[];
};

export type ItineraryItem = z.input<typeof ItineraryItemSchema>;

export type Place = z.input<typeof PlaceSchema>;
export type Booking = z.input<typeof BookingSchema>;
export type Attachment = z.input<typeof AttachmentSchema>;
export type BudgetMember = z.input<typeof BudgetMemberSchema>;
export type BudgetItem = z.input<typeof BudgetItemSchema>;
export type PackingItem = z.input<typeof PackingItemSchema>;
export type WeatherForecast = z.input<typeof WeatherForecastSchema>;
export type DestinationMeta = z.input<typeof DestinationMetaSchema>;
export type OfflineBundle = z.input<typeof OfflineBundleSchema>;
export type Trip = z.input<typeof TripSchema>;

export type OfflineReadinessItem = {
  key: "itinerary" | "places" | "bookings" | "files" | "packing" | "weather";
  label: string;
  ready: boolean;
  count: number;
};

export type OfflineReadiness = {
  readyCount: number;
  totalCount: number;
  items: OfflineReadinessItem[];
};

export type NavigationTarget = {
  latitude: number;
  longitude: number;
  label?: string;
  googlePlaceId?: string;
};

export type MapProvider = "apple" | "google";

export type Entitlement = z.infer<typeof EntitlementSchema>;
export type Share = z.infer<typeof ShareSchema>;
export type AiItineraryPatchOperation = z.infer<typeof AiItineraryPatchOperationSchema>;
export type AiItineraryPatchProposal = z.infer<typeof AiItineraryPatchProposalSchema>;
export type AppliedTrip = z.output<typeof TripSchema>;
type AppliedItineraryItem = z.output<typeof ItineraryItemSchema>;

export type GateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "subscription_inactive" | "ai_quota_exhausted" | "collaborator_limit_reached" | "offline_trip_limit_reached";
    };

export type ShareGateResult =
  | { allowed: true }
  | { allowed: false; reason: "share_revoked" | "share_expired" | "share_private" };

export function createTripDays(tripId: string, startDate: string, endDate: string): TripDay[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  if (end.getTime() < start.getTime()) {
    throw new Error("结束日期必须晚于或等于开始日期");
  }

  const days: TripDay[] = [];
  for (let cursor = new Date(start), index = 0; cursor.getTime() <= end.getTime(); index += 1) {
    const date = formatIsoDate(cursor);
    days.push({
      id: `${tripId}-${date}`,
      tripId,
      date,
      title: `第 ${index + 1} 天`,
      sortOrder: index,
      items: []
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export function sortItineraryItems(items: ItineraryItem[]): ItineraryItem[] {
  return [...items].sort((left, right) => {
    const leftTimed = Boolean(left.startTime);
    const rightTimed = Boolean(right.startTime);

    if (leftTimed && rightTimed && left.startTime !== right.startTime) {
      return left.startTime!.localeCompare(right.startTime!);
    }

    if (leftTimed !== rightTimed) {
      return leftTimed ? -1 : 1;
    }

    return left.sortOrder - right.sortOrder;
  });
}

export function updateItineraryItem(
  items: ItineraryItem[],
  itemId: string,
  patch: Partial<Omit<ItineraryItem, "id" | "dayId">>
): ItineraryItem[] {
  return sortItineraryItems(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
}

export function removeItineraryItem(items: ItineraryItem[], itemId: string): ItineraryItem[] {
  return items.filter((item) => item.id !== itemId);
}

export function getTodayTripDay(days: TripDay[], localIsoDate: string): TripDay | undefined {
  return days.find((day) => day.date === localIsoDate);
}

export function applyItineraryPatchOperations(
  trip: Trip,
  operations: AiItineraryPatchOperation[],
  selectedOperationIds: string[]
): { trip: AppliedTrip; appliedOperationIds: string[]; skippedOperationIds: string[] } {
  const selected = new Set(selectedOperationIds);
  const nextTrip = TripSchema.parse({
    ...trip,
    days: trip.days.map((day) => ({
      ...day,
      items: [...(day.items ?? [])]
    }))
  });
  const appliedOperationIds: string[] = [];
  const skippedOperationIds: string[] = [];

  for (const operation of operations) {
    if (!selected.has(operation.id)) continue;
    const applied = applyItineraryPatchOperation(nextTrip, operation);
    if (applied) {
      appliedOperationIds.push(operation.id);
    } else {
      skippedOperationIds.push(operation.id);
    }
  }

  return { trip: nextTrip, appliedOperationIds, skippedOperationIds };
}

function applyItineraryPatchOperation(trip: AppliedTrip, operation: AiItineraryPatchOperation): boolean {
  if (operation.type === "add_item") {
    const day = trip.days.find((item) => item.id === operation.dayId);
    if (!day) return false;
    day.items = resequenceDomainItems([...day.items, parseAppliedItineraryItem({ ...operation.after, dayId: day.id })]);
    return true;
  }

  if (operation.type === "update_item") {
    const day = trip.days.find((item) => item.id === operation.dayId);
    const itemIndex = day?.items.findIndex((item) => item.id === operation.itemId) ?? -1;
    if (!day || itemIndex < 0) return false;
    day.items = resequenceDomainItems(
      day.items.map((item, index) =>
        index === itemIndex ? parseAppliedItineraryItem({ ...item, ...operation.after, id: item.id, dayId: item.dayId }) : item
      )
    );
    return true;
  }

  if (operation.type === "delete_item") {
    const day = trip.days.find((item) => item.id === operation.dayId);
    if (!day || !day.items.some((item) => item.id === operation.itemId)) return false;
    day.items = resequenceDomainItems(day.items.filter((item) => item.id !== operation.itemId));
    return true;
  }

  if (operation.type === "move_item") {
    const fromDay = trip.days.find((item) => item.id === operation.dayId);
    const toDay = trip.days.find((item) => item.id === operation.toDayId);
    const moving = fromDay?.items.find((item) => item.id === operation.itemId);
    if (!fromDay || !toDay || !moving) return false;
    fromDay.items = resequenceDomainItems(fromDay.items.filter((item) => item.id !== operation.itemId));
    const moved = parseAppliedItineraryItem({ ...moving, dayId: toDay.id });
    const targetIndex = Math.min(operation.toSortOrder ?? toDay.items.length, toDay.items.length);
    toDay.items = resequenceDomainItems([...toDay.items.slice(0, targetIndex), moved, ...toDay.items.slice(targetIndex)]);
    return true;
  }

  if (operation.type === "update_day") {
    const day = trip.days.find((item) => item.id === operation.dayId);
    if (!day) return false;
    Object.assign(day, operation.after);
    return true;
  }

  if (operation.type === "update_place") {
    const placeIndex = trip.places.findIndex((item) => item.id === operation.placeId);
    if (placeIndex < 0) return false;
    trip.places[placeIndex] = PlaceSchema.parse({ ...trip.places[placeIndex], ...operation.after, id: operation.placeId, tripId: trip.id });
    return true;
  }

  if (operation.type === "update_booking") {
    const bookingIndex = trip.bookings.findIndex((item) => item.id === operation.bookingId);
    if (bookingIndex < 0) return false;
    trip.bookings[bookingIndex] = BookingSchema.parse({ ...trip.bookings[bookingIndex], ...operation.after, id: operation.bookingId, tripId: trip.id });
    return true;
  }

  if (operation.type === "update_packing") {
    const packingIndex = trip.packingItems.findIndex((item) => item.id === operation.packingItemId);
    if (packingIndex < 0) return false;
    trip.packingItems[packingIndex] = PackingItemSchema.parse({ ...trip.packingItems[packingIndex], ...operation.after, id: operation.packingItemId, tripId: trip.id });
    return true;
  }

  const budgetIndex = trip.budgetItems.findIndex((item) => item.id === operation.budgetItemId);
  if (budgetIndex < 0) return false;
  trip.budgetItems[budgetIndex] = BudgetItemSchema.parse({ ...trip.budgetItems[budgetIndex], ...operation.after, id: operation.budgetItemId, tripId: trip.id });
  return true;
}

function parseAppliedItineraryItem(item: unknown): AppliedItineraryItem {
  return ItineraryItemSchema.parse(item);
}

function resequenceDomainItems(items: AppliedItineraryItem[]): AppliedItineraryItem[] {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

export function buildTripEditorPath(tripId: string): string {
  return `/journeys/${encodeURIComponent(tripId)}`;
}

export function parseTripIdFromEditorPath(pathname: string): string | null {
  const match = pathname.match(/^\/journeys\/([^/?#]+)$/);
  if (!match?.[1] || match[1] === "edit") return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function getOfflineReadiness(trip: Pick<Trip, "days" | "places" | "bookings" | "attachments" | "packingItems" | "weather">): OfflineReadiness {
  const itineraryCount = trip.days.reduce((total, day) => total + (day.items?.length ?? 0), 0);
  const packedCount = trip.packingItems?.filter((item) => item.packed).length ?? 0;
  const items: OfflineReadinessItem[] = [
    { key: "itinerary", label: "行程", ready: trip.days.length > 0, count: itineraryCount },
    { key: "places", label: "地点", ready: (trip.places?.length ?? 0) > 0, count: trip.places?.length ?? 0 },
    { key: "bookings", label: "预订", ready: (trip.bookings?.length ?? 0) > 0, count: trip.bookings?.length ?? 0 },
    { key: "files", label: "文件", ready: (trip.attachments?.length ?? 0) > 0, count: trip.attachments?.length ?? 0 },
    { key: "packing", label: "打包", ready: (trip.packingItems?.length ?? 0) > 0 && packedCount === trip.packingItems?.length, count: packedCount },
    { key: "weather", label: "天气", ready: (trip.weather?.length ?? 0) > 0, count: trip.weather?.length ?? 0 }
  ];

  return {
    readyCount: items.filter((item) => item.ready).length,
    totalCount: items.length,
    items
  };
}

export function buildMapsUrl(target: NavigationTarget, provider: MapProvider): string {
  const destination = `${target.latitude},${target.longitude}`;

  if (provider === "apple") {
    const label = target.label ? `&q=${encodeURIComponent(target.label)}` : "";
    return `http://maps.apple.com/?daddr=${destination}${label}`;
  }

  return [
    "https://www.google.com/maps/dir/?api=1",
    `destination=${destination}`,
    `destination_place_id=${target.googlePlaceId ?? ""}`,
    "travelmode=walking"
  ].join("&");
}

export function canCreateAiJob(entitlement: Entitlement): GateResult {
  if (!isEntitlementUsable(entitlement)) {
    return { allowed: false, reason: "subscription_inactive" };
  }

  if (entitlement.aiJobsUsedThisPeriod >= entitlement.aiJobsLimit) {
    return { allowed: false, reason: "ai_quota_exhausted" };
  }

  return { allowed: true };
}

export function canAddCollaborator(entitlement: Entitlement, currentCollaboratorCount: number): GateResult {
  if (!isEntitlementUsable(entitlement)) {
    return { allowed: false, reason: "subscription_inactive" };
  }

  if (currentCollaboratorCount >= entitlement.collaboratorLimit) {
    return { allowed: false, reason: "collaborator_limit_reached" };
  }

  return { allowed: true };
}

export function canKeepOfflineTrip(entitlement: Entitlement, currentOfflineTripCount: number): GateResult {
  if (!isEntitlementUsable(entitlement)) {
    return { allowed: false, reason: "subscription_inactive" };
  }

  if (currentOfflineTripCount >= entitlement.offlineTripLimit) {
    return { allowed: false, reason: "offline_trip_limit_reached" };
  }

  return { allowed: true };
}

export function canViewShare(shareInput: Share, nowIso: string, hasMemberSession = false): ShareGateResult {
  const share = ShareSchema.parse(shareInput);
  const now = Date.parse(nowIso);

  if (share.revokedAt) {
    return { allowed: false, reason: "share_revoked" };
  }

  if (share.expiresAt && Date.parse(share.expiresAt) <= now) {
    return { allowed: false, reason: "share_expired" };
  }

  if (share.visibility === "private" && !hasMemberSession) {
    return { allowed: false, reason: "share_private" };
  }

  return { allowed: true };
}

function parseIsoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效的 ISO 日期：${value}`);
  }
  return date;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isEntitlementUsable(entitlement: Entitlement): boolean {
  return entitlement.status === "active" || entitlement.status === "trialing";
}
