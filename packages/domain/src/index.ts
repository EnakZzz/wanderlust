import { z } from "zod";

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
  title: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  locationName: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  googlePlaceId: z.string().optional(),
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
  imageUrl: z.string().url().optional(),
  googlePlaceId: z.string().optional(),
  isFavorite: z.boolean().default(false)
});

export const BookingSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  type: z.enum(["flight", "hotel", "train", "ticket", "car", "other"]),
  title: z.string().min(1),
  confirmationCode: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  attachmentIds: z.array(z.string()).default([])
});

export const AttachmentSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  type: z.enum(["image", "pdf", "ticket", "receipt", "document"]),
  storagePath: z.string().min(1),
  localUri: z.string().optional(),
  title: z.string().optional()
});

export const TripSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  title: z.string().min(1),
  destination: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
  status: z.enum(["draft", "active", "archived"]),
  coverImageUrl: z.string().url().optional(),
  days: z.array(TripDaySchema),
  places: z.array(PlaceSchema).default([]),
  bookings: z.array(BookingSchema).default([]),
  attachments: z.array(AttachmentSchema).default([])
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

export type TripDay = {
  id: string;
  tripId: string;
  date: string;
  title: string;
  sortOrder: number;
  items: ItineraryItem[];
};

export type ItineraryItem = {
  id: string;
  dayId: string;
  type: string;
  title: string;
  startTime?: string;
  endTime?: string;
  sortOrder: number;
  notes?: string;
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
    throw new Error("endDate must be on or after startDate");
  }

  const days: TripDay[] = [];
  for (let cursor = new Date(start), index = 0; cursor.getTime() <= end.getTime(); index += 1) {
    const date = formatIsoDate(cursor);
    days.push({
      id: `${tripId}-${date}`,
      tripId,
      date,
      title: `Day ${index + 1}`,
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
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return date;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isEntitlementUsable(entitlement: Entitlement): boolean {
  return entitlement.status === "active" || entitlement.status === "trialing";
}
