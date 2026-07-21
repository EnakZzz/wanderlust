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
  updatedAt: string;
};

export type EditorModule = "itinerary" | "places" | "map" | "bookings" | "files" | "packing" | "budget";

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
