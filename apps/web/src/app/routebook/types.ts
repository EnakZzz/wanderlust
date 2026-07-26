import type {
  Attachment,
  Booking,
  BudgetItem,
  BudgetMember,
  ItineraryItem,
  OfflineBundle,
  PackingItem,
  Place,
  TripDay,
  WeatherForecast
} from "@wanderlust/domain";

export type TripDraft = {
  id: string;
  ownerId: string;
  title: string;
  destination: string;
  destinationMeta?: DestinationMeta;
  startDate: string;
  endDate: string;
  timezone: string;
  status: "draft" | "active" | "archived";
  days: TripDay[];
  places: Place[];
  bookings: Booking[];
  attachments: Attachment[];
  packingItems: PackingItem[];
  weather: WeatherForecast[];
  budgetMembers: BudgetMember[];
  budgetItems: BudgetItem[];
  offlineBundle?: OfflineBundle;
};

export type DestinationMeta = {
  name: string;
  fullName: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  provider: "google" | "fallback";
  providerPlaceId?: string;
};

export type SessionUser = {
  id: string;
  provider: "google" | "apple";
  email?: string;
  name?: string;
  avatarUrl?: string;
};

export type TripSummary = {
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

export type RoutebookShare = {
  id: string;
  tripId: string;
  token: string;
  visibility: "public" | "private";
  allowCopy: boolean;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type EditorModule = "itinerary" | "places" | "map" | "bookings" | "files" | "packing" | "budget" | "ai";

export type DragPayload =
  | { kind: "place"; placeId: string }
  | { kind: "item"; itemId: string; fromDayId: string };

export type ImportedPlaceInput = {
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  notes?: string;
  tags?: string[];
};
