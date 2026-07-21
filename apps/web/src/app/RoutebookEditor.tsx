"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import JSZip from "jszip";
import {
  CalendarDays,
  CheckSquare,
  CloudSun,
  Download,
  FileUp,
  FolderOpen,
  Landmark,
  Map as MapIcon,
  MapPin,
  Navigation,
  Paperclip,
  Plus,
  Save,
  Search,
  Sparkles,
  Ticket,
  Trash2,
  Type
} from "lucide-react";
import {
  buildMapsUrl,
  createTripDays,
  removeItineraryItem,
  sortItineraryItems,
  updateItineraryItem,
  type Attachment,
  type Booking,
  type BudgetItem,
  type BudgetMember,
  type ItineraryItem,
  type OfflineBundle,
  type PackingItem,
  type Place,
  type TripDay,
  type WeatherForecast
} from "@wanderlust/domain";
import {
  attachmentCategories,
  bookingTypes,
  budgetCategories,
  moduleCopy,
  offlineStorageKey,
  packingCategories,
  placeCategories,
  storageKey
} from "./routebook/constants";
import type { DragPayload, EditorModule, ImportedPlaceInput, SessionUser, TripDraft, TripSummary } from "./routebook/types";

const modules = [
  { id: "itinerary", icon: CalendarDays, title: "Itinerary", copy: "Day plan, route order, notes, and navigation targets." },
  { id: "places", icon: MapPin, title: "Places", copy: "Place library with coordinates, tags, and on-site details." },
  { id: "map", icon: MapIcon, title: "Map", copy: "Preview clusters and open navigation/search." },
  { id: "bookings", icon: Ticket, title: "Bookings", copy: "Flights, hotels, tickets, confirmations, and files." },
  { id: "files", icon: Paperclip, title: "Files", copy: "Docs attached to trip, places, and bookings." },
  { id: "packing", icon: CheckSquare, title: "Packing", copy: "Packing templates, paperwork, and departure checks." },
  { id: "budget", icon: Landmark, title: "Budget", copy: "Shared expenses and settle-up calculation." }
] satisfies Array<{ id: EditorModule; icon: typeof CalendarDays; title: string; copy: string }>;

const sampleTrip = createSampleTrip();

function createSampleTrip(): TripDraft {
  const id = "local_kyoto";
  const days = createTripDays(id, "2026-10-12", "2026-10-16").map((day) => ({
    ...day,
    title: day.sortOrder === 1 ? "Southern & Western Kyoto" : day.title,
    items:
      day.sortOrder === 1
        ? sortItineraryItems([
            {
      id: "fushimi",
      dayId: day.id,
      type: "place",
      placeId: "place_fushimi",
      title: "Fushimi Inari before the crowds",
              startTime: "08:00",
              locationName: "Fushimi Inari Taisha",
              latitude: 34.9671,
              longitude: 135.7727,
              sortOrder: 0,
              notes: "Walk the lower gates, then stop for coffee near the station."
            },
            {
      id: "arashiyama",
      dayId: day.id,
      type: "activity",
      placeId: "place_arashiyama",
      title: "Arashiyama bamboo grove",
              startTime: "14:00",
              locationName: "Arashiyama Bamboo Grove",
              latitude: 35.0094,
              longitude: 135.6668,
              sortOrder: 1,
              notes: "Keep the Tenryu-ji ticket PDF offline."
            }
          ])
        : []
  }));

  return {
    id,
    ownerId: "local",
    title: "Kyoto Autumn Routebook",
    destination: "Kyoto, Japan",
    startDate: "2026-10-12",
    endDate: "2026-10-16",
    timezone: "Asia/Tokyo",
    status: "draft",
    days,
    places: [
      {
        id: "place_fushimi",
        tripId: id,
        name: "Fushimi Inari Taisha",
        category: "culture",
        latitude: 34.9671,
        longitude: 135.7727,
        address: "68 Fukakusa Yabunouchicho, Fushimi Ward",
        notes: "Go early and save the station exit note.",
        tags: ["shrine", "morning"],
        website: "https://inari.jp/",
        isFavorite: true
      },
      {
        id: "place_arashiyama",
        tripId: id,
        name: "Arashiyama Bamboo Grove",
        category: "nature",
        latitude: 35.0094,
        longitude: 135.6668,
        address: "Sagaogurayama Tabuchiyamacho",
        notes: "Pair with Tenryu-ji ticket.",
        tags: ["walk", "crowds"],
        isFavorite: false
      }
    ],
    bookings: [
      {
        id: "booking_jr",
        tripId: id,
        type: "train",
        title: "JR pass PDF",
        confirmationCode: "Offline file",
        status: "confirmed",
        provider: "JR West",
        notes: "Cached in offline files.",
        attachmentIds: []
      },
      {
        id: "booking_tenryuji",
        tripId: id,
        dayId: days[1]?.id,
        placeId: "place_arashiyama",
        type: "ticket",
        title: "Tenryu-ji entry",
        confirmationCode: "Check email",
        status: "todo",
        notes: "Add PDF after booking.",
        attachmentIds: []
      }
    ],
    attachments: [],
    packingItems: [
      { id: "pack_passport", tripId: id, title: "Passport and visa screenshots", category: "documents", quantity: 1, packed: true },
      { id: "pack_umbrella", tripId: id, title: "Compact umbrella", category: "clothing", quantity: 1, packed: false },
      { id: "pack_esim", tripId: id, title: "Install eSIM before departure", category: "electronics", quantity: 1, packed: false }
    ],
    weather: [],
    budgetMembers: [
      { id: "member_you", tripId: id, name: "You" },
      { id: "member_friend", tripId: id, name: "Travel partner" }
    ],
    budgetItems: [
      {
        id: "budget_hotel",
        tripId: id,
        title: "Hotel deposit",
        category: "accommodation",
        amount: 320,
        currency: "USD",
        paidByMemberIds: ["member_you"],
        splitWithMemberIds: ["member_you", "member_friend"],
        notes: "Example shared bill."
      }
    ]
  };
}

function createDraftId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createBlankTripDraft(): TripDraft {
  const id = `trip_${crypto.randomUUID()}`;
  return hydrateDraft({
    id,
    ownerId: "account",
    title: "New routebook",
    destination: "New destination",
    startDate: "2026-10-12",
    endDate: "2026-10-14",
    timezone: "Etc/UTC",
    status: "draft",
    days: createTripDays(id, "2026-10-12", "2026-10-14"),
    places: [],
    bookings: [],
    attachments: [],
    packingItems: [{ id: createDraftId("pack"), tripId: id, title: "Confirm passport and entry requirements", category: "documents", quantity: 1, packed: false }],
    weather: [],
    budgetMembers: [{ id: createDraftId("member"), tripId: id, name: "You" }],
    budgetItems: []
  });
}

function hydrateDraft(input: Partial<TripDraft>): TripDraft {
  const fallback = sampleTrip;
  const id = input.id ?? fallback.id;
  const basePlaces = (input.places ?? []).map((place) => ({ ...place, tripId: place.tripId || id, tags: place.tags ?? [], isFavorite: place.isFavorite ?? false }));
  const migrated = migratePlaceAssignments(input.days?.length ? input.days : fallback.days, basePlaces, id);
  return {
    ...fallback,
    ...input,
    id,
    ownerId: input.ownerId ?? "account",
    timezone: input.timezone ?? "Etc/UTC",
    days: migrated.days,
    places: migrated.places,
    bookings: (input.bookings ?? []).map((booking) => ({ ...booking, tripId: booking.tripId || id, status: booking.status ?? "todo", attachmentIds: booking.attachmentIds ?? [], segments: booking.segments ?? [] })),
    attachments: input.attachments ?? [],
    packingItems: (input.packingItems ?? []).map((item) => ({ ...item, tripId: item.tripId || id, quantity: item.quantity ?? 1, packed: item.packed ?? false })),
    weather: input.weather ?? [],
    budgetMembers: (input.budgetMembers ?? []).map((member) => ({ ...member, tripId: member.tripId || id })),
    budgetItems: (input.budgetItems ?? []).map((item) => ({ ...item, tripId: item.tripId || id, currency: item.currency ?? "USD", paidByMemberIds: item.paidByMemberIds ?? [], splitWithMemberIds: item.splitWithMemberIds ?? [] }))
  };
}

function rehomeTripDraft(draft: TripDraft): TripDraft {
  const id = `trip_${crypto.randomUUID()}`;
  const dayIds = new Map(draft.days.map((day) => [day.id, `${id}-${day.date}`]));
  return hydrateDraft({
    ...draft,
    id,
    ownerId: "account",
    days: draft.days.map((day) => {
      const nextDayId = dayIds.get(day.id) ?? `${id}-${day.date}`;
      return { ...day, id: nextDayId, tripId: id, items: day.items.map((item) => ({ ...item, dayId: dayIds.get(item.dayId) ?? nextDayId })) };
    }),
    places: draft.places.map((place) => ({ ...place, id: createDraftId("place"), tripId: id })),
    bookings: draft.bookings.map((booking) => ({ ...booking, id: createDraftId("booking"), tripId: id, dayId: booking.dayId ? dayIds.get(booking.dayId) : undefined })),
    attachments: [],
    packingItems: draft.packingItems.map((item) => ({ ...item, id: createDraftId("pack"), tripId: id })),
    weather: [],
    budgetMembers: draft.budgetMembers.map((member) => ({ ...member, id: createDraftId("member"), tripId: id })),
    budgetItems: []
  });
}

function formatTripSummaryLine(trip: TripSummary): string {
  const dates = trip.startDate && trip.endDate ? `${trip.startDate} - ${trip.endDate}` : "Dates not set";
  const dayCount = trip.dayCount || 0;
  const placeCount = trip.placeCount || 0;
  const bookingCount = trip.bookingCount || 0;
  return [
    dates,
    `${dayCount} ${dayCount === 1 ? "day" : "days"}`,
    `${placeCount} ${placeCount === 1 ? "place" : "places"}`,
    `${bookingCount} ${bookingCount === 1 ? "booking" : "bookings"}`
  ].join(" · ");
}

function readLocalDraft(): TripDraft {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return sampleTrip;
  try {
    return hydrateDraft(JSON.parse(saved) as Partial<TripDraft>);
  } catch {
    window.localStorage.removeItem(storageKey);
    return sampleTrip;
  }
}

function buildOfflineBundle(draft: TripDraft): OfflineBundle {
  return {
    tripId: draft.id,
    version: 1,
    generatedAt: new Date().toISOString(),
    includes: {
      itinerary: true,
      places: draft.places.length > 0,
      bookings: draft.bookings.length > 0,
      attachments: draft.attachments.length > 0,
      packing: draft.packingItems.length > 0,
      weather: draft.weather.length > 0
    }
  };
}

function calculateMapPosition(place: Place, places: Place[]): { left: string; top: string } {
  const lats = places.map((item) => item.latitude);
  const lngs = places.map((item) => item.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const left = maxLng === minLng ? 50 : 14 + ((place.longitude - minLng) / (maxLng - minLng)) * 72;
  const top = maxLat === minLat ? 50 : 14 + ((maxLat - place.latitude) / (maxLat - minLat)) * 72;
  return { left: `${left}%`, top: `${top}%` };
}

function googleSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function migratePlaceAssignments(days: TripDay[], places: Place[], tripId: string): { days: TripDay[]; places: Place[] } {
  const nextPlaces = [...places];
  const findOrCreatePlace = (item: ItineraryItem): Place | undefined => {
    if (item.placeId && nextPlaces.some((place) => place.id === item.placeId)) {
      return nextPlaces.find((place) => place.id === item.placeId);
    }
    if (typeof item.latitude !== "number" || typeof item.longitude !== "number") {
      return undefined;
    }

    const existing = nextPlaces.find(
      (place) =>
        Math.abs(place.latitude - item.latitude!) < 0.00001 &&
        Math.abs(place.longitude - item.longitude!) < 0.00001 &&
        normalizeName(place.name) === normalizeName(item.locationName ?? item.title)
    );
    if (existing) return existing;

    const place: Place = {
      id: createDraftId("place"),
      tripId,
      name: item.locationName ?? item.title,
      category: item.type === "food" ? "food" : item.type === "hotel" ? "hotel" : item.type === "transport" ? "transport" : "other",
      latitude: item.latitude,
      longitude: item.longitude,
      address: item.locationName,
      notes: item.notes,
      tags: [],
      isFavorite: false
    };
    nextPlaces.push(place);
    return place;
  };

  const nextDays = days.map((day) => ({
    ...day,
    items: (day.items ?? []).map((item) => {
      const place = findOrCreatePlace(item);
      return place && !item.placeId ? { ...item, placeId: place.id } : item;
    })
  }));

  return { days: nextDays, places: nextPlaces };
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeImportedPlaces(current: Place[], imports: ImportedPlaceInput[], tripId: string): Place[] {
  const next = [...current];
  imports.forEach((input) => {
    const existing = next.find(
      (place) =>
        normalizeName(place.name) === normalizeName(input.name) ||
        (Math.abs(place.latitude - input.latitude) < 0.00001 && Math.abs(place.longitude - input.longitude) < 0.00001)
    );
    if (existing) return;
    next.push({
      id: createDraftId("place"),
      tripId,
      name: input.name,
      category: "other",
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      notes: input.notes,
      tags: input.tags ?? [],
      isFavorite: false
    });
  });
  return next;
}

function resequenceItems(items: ItineraryItem[]): ItineraryItem[] {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

function getPlaceForItem(item: ItineraryItem, places: Place[]): Place | undefined {
  return item.placeId ? places.find((place) => place.id === item.placeId) : undefined;
}

function parseGoogleMapsLinks(input: string): ImportedPlaceInput[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const decoded = decodeURIComponent(line);
      const atMatch = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const query = new URLSearchParams(line.includes("?") ? line.slice(line.indexOf("?")) : "").get("query");
      const placeMatch = decoded.match(/\/place\/([^/@?]+)/);
      const name = (query || placeMatch?.[1] || `Google Maps place ${index + 1}`).replace(/\+/g, " ");
      return {
        name,
        latitude: atMatch ? Number(atMatch[1]) : 0,
        longitude: atMatch ? Number(atMatch[2]) : 0,
        notes: atMatch ? line : "Paste coordinates or search this place before travel.",
        tags: ["google-maps"]
      };
    });
}

async function parsePlaceImportFile(file: File): Promise<ImportedPlaceInput[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "kmz") {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmlFile = Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith(".kml"));
    if (!kmlFile) throw new Error("KMZ does not contain a KML file.");
    return parseKml(await kmlFile.async("text"));
  }

  const text = await file.text();
  if (extension === "geojson" || extension === "json") return parseGeoJson(text);
  if (extension === "gpx") return parseGpx(text);
  if (extension === "kml") return parseKml(text);
  throw new Error("Supported place imports: GeoJSON, GPX, KML, KMZ.");
}

function parseGeoJson(text: string): ImportedPlaceInput[] {
  const payload = JSON.parse(text) as { features?: Array<{ properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }> };
  return (payload.features ?? []).flatMap((feature, index) => {
    const geometry = feature.geometry;
    if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) return [];
    const [longitude, latitude] = geometry.coordinates;
    if (typeof latitude !== "number" || typeof longitude !== "number") return [];
    const properties = feature.properties ?? {};
    return [{
      name: String(properties.name ?? properties.title ?? `GeoJSON place ${index + 1}`),
      latitude,
      longitude,
      address: typeof properties.address === "string" ? properties.address : undefined,
      notes: typeof properties.description === "string" ? properties.description : undefined,
      tags: ["geojson"]
    }];
  });
}

function parseGpx(text: string): ImportedPlaceInput[] {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  return Array.from(xml.querySelectorAll("wpt")).flatMap((point, index) => {
    const latitude = Number(point.getAttribute("lat"));
    const longitude = Number(point.getAttribute("lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{
      name: point.querySelector("name")?.textContent?.trim() || `GPX waypoint ${index + 1}`,
      latitude,
      longitude,
      notes: point.querySelector("desc")?.textContent?.trim(),
      tags: ["gpx"]
    }];
  });
}

function parseKml(text: string): ImportedPlaceInput[] {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  return Array.from(xml.querySelectorAll("Placemark")).flatMap((placemark, index) => {
    const coordinates = placemark.querySelector("Point coordinates")?.textContent?.trim() ?? placemark.querySelector("coordinates")?.textContent?.trim();
    const [longitudeText, latitudeText] = coordinates?.split(/\s+/)[0]?.split(",") ?? [];
    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{
      name: placemark.querySelector("name")?.textContent?.trim() || `KML place ${index + 1}`,
      latitude,
      longitude,
      notes: placemark.querySelector("description")?.textContent?.trim(),
      tags: ["kml"]
    }];
  });
}

function createBookingDraftFromText(text: string, tripId: string, dayId?: string): Booking {
  const flightMatch = text.match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/);
  const codeMatch = text.match(/\b(?:confirmation|booking|reservation|pnr|code)[:\s#-]*([A-Z0-9]{5,12})\b/i);
  const hotelMatch = text.match(/\b(?:hotel|accommodation|stay)[:\s-]+(.+)/i);
  const title = flightMatch ? `Flight ${flightMatch[1]}${flightMatch[2]}` : hotelMatch?.[1]?.trim() || "Imported booking";
  return {
    id: createDraftId("booking"),
    tripId,
    dayId,
    type: flightMatch ? "flight" : hotelMatch ? "hotel" : "other",
    title,
    confirmationCode: codeMatch?.[1],
    status: "todo",
    notes: text.slice(0, 1000),
    attachmentIds: [],
    segments: flightMatch
      ? [{
          id: createDraftId("segment"),
          mode: "flight",
          carrier: flightMatch[1],
          serviceNumber: flightMatch[2]
        }]
      : []
  };
}

function calculateBudgetSettlements(members: BudgetMember[], items: BudgetItem[]): Array<{ from: string; to: string; amount: number; currency: string }> {
  const balanceByCurrency = new Map<string, Map<string, number>>();
  const ensureCurrency = (currency: string) => {
    if (!balanceByCurrency.has(currency)) balanceByCurrency.set(currency, new Map());
    return balanceByCurrency.get(currency)!;
  };

  items.forEach((item) => {
    const currency = item.currency || "USD";
    const balances = ensureCurrency(currency);
    const payers = item.paidByMemberIds?.length ? item.paidByMemberIds : [];
    const splitters = item.splitWithMemberIds?.length ? item.splitWithMemberIds : members.map((member) => member.id);
    if (!payers.length || !splitters.length || !item.amount) return;
    const paidShare = item.amount / payers.length;
    const owedShare = item.amount / splitters.length;
    payers.forEach((id) => balances.set(id, (balances.get(id) ?? 0) + paidShare));
    splitters.forEach((id) => balances.set(id, (balances.get(id) ?? 0) - owedShare));
  });

  const settlements: Array<{ from: string; to: string; amount: number; currency: string }> = [];
  balanceByCurrency.forEach((balances, currency) => {
    const debtors = Array.from(balances.entries()).filter(([, amount]) => amount < -0.01).map(([id, amount]) => ({ id, amount: -amount }));
    const creditors = Array.from(balances.entries()).filter(([, amount]) => amount > 0.01).map(([id, amount]) => ({ id, amount }));
    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtors[debtorIndex] && creditors[creditorIndex]) {
      const debtor = debtors[debtorIndex]!;
      const creditor = creditors[creditorIndex]!;
      const amount = Math.min(debtor.amount, creditor.amount);
      settlements.push({ from: debtor.id, to: creditor.id, amount: Math.round(amount * 100) / 100, currency });
      debtor.amount -= amount;
      creditor.amount -= amount;
      if (debtor.amount <= 0.01) debtorIndex += 1;
      if (creditor.amount <= 0.01) creditorIndex += 1;
    }
  });

  return settlements;
}

async function fetchWeatherForDraft(draft: TripDraft): Promise<WeatherForecast[]> {
  const anchor = draft.places[0] ?? draft.days.flatMap((day) => day.items).find((item) => typeof item.latitude === "number" && typeof item.longitude === "number");
  if (!anchor) throw new Error("Add one place with coordinates before fetching weather.");

  const latitude = anchor.latitude;
  const longitude = anchor.longitude;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", draft.startDate);
  url.searchParams.set("end_date", draft.endDate);

  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not fetch weather.");
  const payload = (await response.json()) as {
    daily?: {
      time?: string[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
    };
  };

  return draft.days.map((day) => {
    const index = payload.daily?.time?.indexOf(day.date) ?? -1;
    const rain = index >= 0 ? payload.daily?.precipitation_probability_max?.[index] : undefined;
    return {
      dayId: day.id,
      date: day.date,
      locationName: draft.destination,
      temperatureMaxC: index >= 0 ? payload.daily?.temperature_2m_max?.[index] : undefined,
      temperatureMinC: index >= 0 ? payload.daily?.temperature_2m_min?.[index] : undefined,
      precipitationProbability: rain,
      summary: typeof rain === "number" && rain >= 50 ? "Rain likely" : "Plan normally",
      fetchedAt: new Date().toISOString()
    };
  });
}

export function RoutebookEditor() {
  const [draft, setDraft] = useState<TripDraft>(sampleTrip);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [selectedDayId, setSelectedDayId] = useState(sampleTrip.days[0]!.id);
  const [activeModule, setActiveModule] = useState<EditorModule>("itinerary");
  const [isSaved, setIsSaved] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [placeSearch, setPlaceSearch] = useState("");
  const [googleImportText, setGoogleImportText] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAccountTrips() {
      const sessionResponse = await fetch("/auth/session", { credentials: "include" });
      if (!sessionResponse.ok) return;
      const session = (await sessionResponse.json()) as { user?: SessionUser | null };
      if (!session.user) return;

      const tripsResponse = await fetch("/api/trips", { credentials: "include" });
      if (!tripsResponse.ok) throw new Error("Could not load account trips");
      const tripsPayload = (await tripsResponse.json()) as { trips: TripSummary[] };
      if (cancelled) return;

      setUser(session.user);
      setTrips(tripsPayload.trips);
      setIsSaved(true);
    }

    loadAccountTrips().catch((error) => {
      if (!cancelled) setSyncError(error instanceof Error ? error.message : "Could not load account trips");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user) return;
    const parsed = readLocalDraft();
    setDraft(parsed);
    setSelectedDayId(parsed.days[0]?.id ?? sampleTrip.days[0]!.id);
  }, [user]);

  const selectedDay = useMemo(() => draft.days.find((day) => day.id === selectedDayId) ?? draft.days[0]!, [draft.days, selectedDayId]);
  const isAccountTripPersisted = Boolean(user && trips.some((trip) => trip.id === draft.id));
  const showPlanHome = Boolean(user && !isAccountTripPersisted);
  const itemCount = draft.days.reduce((count, day) => count + day.items.length, 0);
  const packedCount = draft.packingItems.filter((item) => item.packed).length;
  const selectedWeather = draft.weather.find((item) => item.dayId === selectedDay.id);
  const settlements = useMemo(() => calculateBudgetSettlements(draft.budgetMembers, draft.budgetItems), [draft.budgetMembers, draft.budgetItems]);

  function markDirty() {
    setIsSaved(false);
  }

  function patchDraft(patch: Partial<TripDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    markDirty();
  }

  function updateSelectedDay(patch: Partial<Pick<TripDay, "title" | "date">>) {
    setDraft((current) => ({ ...current, days: current.days.map((day) => (day.id === selectedDay.id ? { ...day, ...patch } : day)) }));
    markDirty();
  }

  function updateItem(itemId: string, patch: Partial<Omit<ItineraryItem, "id" | "dayId">>) {
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) => (day.id === selectedDay.id ? { ...day, items: updateItineraryItem(day.items, itemId, patch) } : day))
    }));
    markDirty();
  }

  function addItem(place?: Place) {
    addItemToDay(selectedDay.id, place);
  }

  function addItemToDay(dayId: string, place?: Place) {
    const targetDay = draft.days.find((day) => day.id === dayId) ?? selectedDay;
    const nextItem: ItineraryItem = {
      id: createDraftId("item"),
      dayId: targetDay.id,
      type: place ? "place" : "activity",
      placeId: place?.id,
      title: place?.name ?? "New plan item",
      startTime: "09:00",
      locationName: place?.name,
      latitude: place?.latitude,
      longitude: place?.longitude,
      googlePlaceId: place?.googlePlaceId,
      notes: place?.notes ?? "",
      sortOrder: targetDay.items.length
    };

    setDraft((current) => ({
      ...current,
      days: current.days.map((day) => (day.id === targetDay.id ? { ...day, items: sortItineraryItems([...day.items, nextItem]) } : day))
    }));
    markDirty();
  }

  function handleDragStart(event: DragEvent, payload: DragPayload) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
  }

  function readDragPayload(event: DragEvent): DragPayload | null {
    try {
      return JSON.parse(event.dataTransfer.getData("application/json")) as DragPayload;
    } catch {
      return null;
    }
  }

  function dropOnDay(event: DragEvent, dayId: string) {
    event.preventDefault();
    const payload = readDragPayload(event);
    if (!payload) return;
    if (payload.kind === "place") {
      const place = draft.places.find((item) => item.id === payload.placeId);
      if (place) addItemToDay(dayId, place);
      return;
    }
    moveItemToDay(payload.itemId, payload.fromDayId, dayId);
  }

  function dropOnItem(event: DragEvent, targetDayId: string, targetItemId: string) {
    event.preventDefault();
    const payload = readDragPayload(event);
    if (!payload) return;
    if (payload.kind === "place") {
      const place = draft.places.find((item) => item.id === payload.placeId);
      if (place) insertPlaceBeforeItem(place, targetDayId, targetItemId);
      return;
    }
    moveItemToDay(payload.itemId, payload.fromDayId, targetDayId, targetItemId);
  }

  function moveItemToDay(itemId: string, fromDayId: string, toDayId: string, beforeItemId?: string) {
    setDraft((current) => {
      const sourceDay = current.days.find((day) => day.id === fromDayId);
      const moving = sourceDay?.items.find((item) => item.id === itemId);
      if (!moving) return current;
      return {
        ...current,
        days: current.days.map((day) => {
          const withoutMoving = day.items.filter((item) => item.id !== itemId);
          if (day.id !== toDayId) return { ...day, items: resequenceItems(withoutMoving) };
          const nextItem = { ...moving, dayId: toDayId };
          const targetIndex = beforeItemId ? Math.max(0, withoutMoving.findIndex((item) => item.id === beforeItemId)) : withoutMoving.length;
          const nextItems = [...withoutMoving.slice(0, targetIndex), nextItem, ...withoutMoving.slice(targetIndex)];
          return { ...day, items: resequenceItems(nextItems) };
        })
      };
    });
    markDirty();
  }

  function insertPlaceBeforeItem(place: Place, dayId: string, beforeItemId: string) {
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) => {
        if (day.id !== dayId) return day;
        const targetIndex = Math.max(0, day.items.findIndex((item) => item.id === beforeItemId));
        const nextItem: ItineraryItem = {
          id: createDraftId("item"),
          dayId,
          type: "place",
          placeId: place.id,
          title: place.name,
          locationName: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          googlePlaceId: place.googlePlaceId,
          notes: place.notes,
          sortOrder: targetIndex
        };
        return { ...day, items: resequenceItems([...day.items.slice(0, targetIndex), nextItem, ...day.items.slice(targetIndex)]) };
      })
    }));
    markDirty();
  }

  function deleteItem(itemId: string) {
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) => (day.id === selectedDay.id ? { ...day, items: removeItineraryItem(day.items, itemId) } : day))
    }));
    markDirty();
  }

  async function refreshTrips() {
    if (!user) return;
    const response = await fetch("/api/trips", { credentials: "include" });
    if (!response.ok) throw new Error("Could not refresh trips");
    const payload = (await response.json()) as { trips: TripSummary[] };
    setTrips(payload.trips);
  }

  async function loadTrip(tripId: string) {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not open trip");
      const payload = (await response.json()) as { trip: TripDraft };
      const hydrated = hydrateDraft(payload.trip);
      setDraft(hydrated);
      setSelectedDayId(hydrated.days[0]?.id ?? sampleTrip.days[0]!.id);
      setIsSaved(true);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not open trip");
    } finally {
      setIsSyncing(false);
    }
  }

  async function deleteTrip(trip: TripSummary) {
    if (!user || deletingTripId) return;
    const confirmed = window.confirm(`Delete "${trip.title}"? This will remove the routebook and its attached files from your account.`);
    if (!confirmed) return;

    setDeletingTripId(trip.id);
    setSyncError(null);
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(trip.id)}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!response.ok) throw new Error("Could not delete trip");

      const nextTrips = trips.filter((item) => item.id !== trip.id);
      setTrips(nextTrips);
      if (draft.id === trip.id) {
        const blank = createBlankTripDraft();
        setDraft(blank);
        setSelectedDayId(blank.days[0]?.id ?? sampleTrip.days[0]!.id);
        setIsSaved(true);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not delete trip");
    } finally {
      setDeletingTripId(null);
    }
  }

  async function createSyncedTrip() {
    const nextDraft = createBlankTripDraft();
    setDraft(nextDraft);
    setSelectedDayId(nextDraft.days[0]!.id);
    setIsSaved(false);
    if (!user) return;
    await persistDraft(nextDraft, false);
  }

  async function importKyotoSample() {
    const nextDraft = user ? rehomeTripDraft(sampleTrip) : sampleTrip;
    setDraft(nextDraft);
    setSelectedDayId(nextDraft.days[0]!.id);
    setIsSaved(false);
    if (user) await persistDraft(nextDraft, false);
  }

  async function persistDraft(target = draft, existing = trips.some((trip) => trip.id === target.id)) {
    setSyncError(null);
    if (!user) {
      window.localStorage.setItem(storageKey, JSON.stringify(target));
      setIsSaved(true);
      return;
    }

    setIsSyncing(true);
    try {
      const response = await fetch(existing ? `/api/trips/${encodeURIComponent(target.id)}` : "/api/trips", {
        method: existing ? "PUT" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(target)
      });
      if (!response.ok) throw new Error("Could not save trip");
      const payload = (await response.json()) as { trip: TripDraft };
      const hydrated = hydrateDraft(payload.trip);
      setDraft(hydrated);
      setSelectedDayId(hydrated.days[0]?.id ?? sampleTrip.days[0]!.id);
      setIsSaved(true);
      await refreshTrips();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not save trip");
    } finally {
      setIsSyncing(false);
    }
  }

  function updatePlace(placeId: string, patch: Partial<Place>) {
    setDraft((current) => ({ ...current, places: current.places.map((place) => (place.id === placeId ? { ...place, ...patch } : place)) }));
    markDirty();
  }

  function addPlace() {
    setDraft((current) => ({
      ...current,
      places: [
        ...current.places,
        {
          id: createDraftId("place"),
          tripId: current.id,
          name: placeSearch || "New saved place",
          category: "other",
          latitude: current.places[0]?.latitude ?? 0,
          longitude: current.places[0]?.longitude ?? 0,
          address: "",
          notes: "",
          tags: [],
          isFavorite: false
        }
      ]
    }));
    setPlaceSearch("");
    markDirty();
  }

  function importGoogleMapsPlaces() {
    const imported = parseGoogleMapsLinks(googleImportText);
    setDraft((current) => ({ ...current, places: mergeImportedPlaces(current.places, imported, current.id) }));
    setGoogleImportText("");
    markDirty();
  }

  async function importPlaceFile(file: File) {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const imported = await parsePlaceImportFile(file);
      setDraft((current) => ({ ...current, places: mergeImportedPlaces(current.places, imported, current.id) }));
      markDirty();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not import places");
    } finally {
      setIsSyncing(false);
    }
  }

  function updateBooking(bookingId: string, patch: Partial<Booking>) {
    setDraft((current) => ({ ...current, bookings: current.bookings.map((booking) => (booking.id === bookingId ? { ...booking, ...patch } : booking)) }));
    markDirty();
  }

  function addBooking() {
    setDraft((current) => ({
      ...current,
      bookings: [
        ...current.bookings,
        { id: createDraftId("booking"), tripId: current.id, dayId: selectedDay.id, type: "ticket", title: "New booking", status: "todo", attachmentIds: [] }
      ]
    }));
    markDirty();
  }

  async function importBookingFile(file: File) {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const text = file.type.includes("pdf") ? file.name : await file.text();
      const booking = createBookingDraftFromText(text, draft.id, selectedDay.id);
      setDraft((current) => ({ ...current, bookings: [...current.bookings, booking] }));
      await uploadAttachment(file, booking.id);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not import booking");
    } finally {
      setIsSyncing(false);
    }
  }

  async function uploadAttachment(file: File, bookingId?: string, patch: Partial<Attachment> = {}) {
    const relativeKey = `${draft.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const attachment: Attachment = {
      id: createDraftId("file"),
      tripId: draft.id,
      type: file.type.includes("pdf") ? "pdf" : file.type.startsWith("image/") ? "image" : "document",
      category: "other",
      linkedType: bookingId ? "booking" : "trip",
      linkedId: bookingId,
      storagePath: relativeKey,
      title: file.name,
      ...patch
    };

    if (user) {
      const response = await fetch(`/api/attachments/${encodeURIComponent(relativeKey)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file
      });
      if (!response.ok) throw new Error("Could not upload attachment");
    }

    setDraft((current) => ({
      ...current,
      attachments: [...current.attachments, attachment],
      bookings: current.bookings.map((booking) =>
        booking.id === bookingId ? { ...booking, attachmentIds: [...(booking.attachmentIds ?? []), attachment.id] } : booking
      )
    }));
    markDirty();
  }

  function updateAttachment(attachmentId: string, patch: Partial<Attachment>) {
    setDraft((current) => ({ ...current, attachments: current.attachments.map((attachment) => (attachment.id === attachmentId ? { ...attachment, ...patch } : attachment)) }));
    markDirty();
  }

  function updateBudgetMember(memberId: string, patch: Partial<BudgetMember>) {
    setDraft((current) => ({ ...current, budgetMembers: current.budgetMembers.map((member) => (member.id === memberId ? { ...member, ...patch } : member)) }));
    markDirty();
  }

  function addBudgetMember() {
    setDraft((current) => ({
      ...current,
      budgetMembers: [...current.budgetMembers, { id: createDraftId("member"), tripId: current.id, name: "New traveler" }]
    }));
    markDirty();
  }

  function updateBudgetItem(itemId: string, patch: Partial<BudgetItem>) {
    setDraft((current) => ({ ...current, budgetItems: current.budgetItems.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }));
    markDirty();
  }

  function addBudgetItem() {
    const memberIds = draft.budgetMembers.map((member) => member.id);
    setDraft((current) => ({
      ...current,
      budgetItems: [
        ...current.budgetItems,
        {
          id: createDraftId("budget"),
          tripId: current.id,
          title: "New shared bill",
          category: "other",
          amount: 0,
          currency: "USD",
          paidByMemberIds: memberIds.slice(0, 1),
          splitWithMemberIds: memberIds
        }
      ]
    }));
    markDirty();
  }

  function toggleBudgetMember(item: BudgetItem, field: "paidByMemberIds" | "splitWithMemberIds", memberId: string) {
    const currentIds = item[field] ?? [];
    updateBudgetItem(item.id, {
      [field]: currentIds.includes(memberId) ? currentIds.filter((id) => id !== memberId) : [...currentIds, memberId]
    });
  }

  function updatePacking(itemId: string, patch: Partial<PackingItem>) {
    setDraft((current) => ({ ...current, packingItems: current.packingItems.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }));
    markDirty();
  }

  function addPackingItem(category: PackingItem["category"] = "other") {
    setDraft((current) => ({
      ...current,
      packingItems: [...current.packingItems, { id: createDraftId("pack"), tripId: current.id, title: "New packing item", category, quantity: 1, packed: false }]
    }));
    markDirty();
  }

  async function refreshWeather() {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const weather = await fetchWeatherForDraft(draft);
      setDraft((current) => ({ ...current, weather }));
      setIsSaved(false);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not refresh weather");
    } finally {
      setIsSyncing(false);
    }
  }

  function prepareOfflineBundle() {
    const offlineBundle = buildOfflineBundle(draft);
    const bundledTrip = { ...draft, offlineBundle };
    setDraft(bundledTrip);
    const savedBundles = JSON.parse(window.localStorage.getItem(offlineStorageKey) ?? "{}") as Record<string, TripDraft>;
    savedBundles[draft.id] = bundledTrip;
    window.localStorage.setItem(offlineStorageKey, JSON.stringify(savedBundles));
    const blob = new Blob([JSON.stringify(bundledTrip, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.title.replace(/[^a-zA-Z0-9_-]/g, "-")}-offline.json`;
    link.click();
    URL.revokeObjectURL(url);
    setIsSaved(false);
  }

  return (
    <section id="editor" className="workspace">
      <aside className="rail" aria-label="Trip sections">
        {showPlanHome ? (
          <button className="rail-item active" type="button" title="Account plans" aria-pressed="true">
            <FolderOpen size={18} />
            <span>Plans</span>
          </button>
        ) : (
          modules.map((module) => (
            <button
              key={module.id}
              className={activeModule === module.id ? "rail-item active" : "rail-item"}
              type="button"
              title={module.copy}
              aria-pressed={activeModule === module.id}
              onClick={() => setActiveModule(module.id)}
            >
              <module.icon size={18} />
              <span>{module.title}</span>
            </button>
          ))
        )}
      </aside>

      <div className="panel itinerary-panel">
        <div className="trip-library">
          <div>
            <p className="eyebrow">{user ? "Account trips" : "Local draft"}</p>
            <h2>{user ? "Your routebooks" : "Sign in to sync trips"}</h2>
          </div>
          <button className="new-trip-button" type="button" onClick={createSyncedTrip} title="New trip" aria-label="New trip">
            <Plus size={20} />
          </button>
          {user ? (
            <div className="trip-card-grid">
              {trips.map((trip) => (
                <article key={trip.id} className={trip.id === draft.id ? "trip-card active" : "trip-card"}>
                  <button className="trip-card-open" type="button" onClick={() => loadTrip(trip.id)}>
                    <span className="trip-card-icon" aria-hidden="true">
                      <MapPin size={22} />
                    </span>
                    <span className="trip-card-copy">
                      <strong>{trip.title}</strong>
                      <span>{trip.destination}</span>
                      <small>{formatTripSummaryLine(trip)}</small>
                    </span>
                  </button>
                  <div className="trip-card-footer">
                    <span>{trip.status}</span>
                    <button
                      className="trip-delete-button"
                      type="button"
                      onClick={() => deleteTrip(trip)}
                      disabled={deletingTripId === trip.id}
                      title="Delete routebook"
                      aria-label={`Delete ${trip.title}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
              {trips.length === 0 ? <div className="empty-trip-card">{isSyncing ? "Syncing plans..." : "No plans yet. Create a plan to start."}</div> : null}
            </div>
          ) : (
            <div className="local-trip-note">Google 登录后，这里会显示当前账号自己的旅行列表；保存会写入 Cloudflare D1，附件写入 R2。</div>
          )}
        </div>

        {showPlanHome ? (
          <div className="plan-home">
            <div>
              <p className="eyebrow">Plan library</p>
              <h3>{trips.length > 0 ? "Choose a plan to edit" : "Create your first plan"}</h3>
              <p>Kyoto is a reference sample only. Create a blank plan or add the sample to your account when you need it.</p>
            </div>
            <div className="plan-home-actions">
              <button className="save-button" type="button" onClick={createSyncedTrip}>
                <Plus size={18} />
                <span>Create plan</span>
              </button>
              <button className="sample-button" type="button" onClick={importKyotoSample}>
                <Sparkles size={18} />
                <span>Add Kyoto sample</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="panel-heading editor-heading">
              <div className="title-fields">
                <label>
                  <span>Routebook</span>
                  <input aria-label="Routebook title" value={draft.title} onChange={(event) => patchDraft({ title: event.target.value })} />
                </label>
                <label>
                  <span>Destination</span>
                  <input aria-label="Destination" value={draft.destination} onChange={(event) => patchDraft({ destination: event.target.value })} />
                </label>
              </div>
              <button className="save-button" type="button" onClick={() => persistDraft()} title="Save plan">
                <Save size={18} />
                <span>{isSyncing ? "Saving" : isSaved ? "Save" : "Save"}</span>
              </button>
            </div>
            {syncError ? <div className="sync-error">{syncError}</div> : null}

            <div className="module-heading">
              <p>{modules.find((module) => module.id === activeModule)?.title}</p>
              <span>{moduleCopy[activeModule]}</span>
            </div>

            {activeModule === "itinerary" ? (
              <>
                <div className="date-range-editor">
                  <label>
                    <span>Start</span>
                    <input type="date" value={draft.startDate} onChange={(event) => patchDraft({ startDate: event.target.value })} />
                  </label>
                  <label>
                    <span>End</span>
                    <input type="date" value={draft.endDate} onChange={(event) => patchDraft({ endDate: event.target.value })} />
                  </label>
                  <label>
                    <span>Timezone</span>
                    <input value={draft.timezone} onChange={(event) => patchDraft({ timezone: event.target.value })} />
                  </label>
                </div>

                <div className="day-strip" aria-label="Trip days">
                  {draft.days.map((day) => (
                    <button
                      key={day.id}
                      className={day.id === selectedDay.id ? "day-tab active" : "day-tab"}
                      type="button"
                      onClick={() => setSelectedDayId(day.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => dropOnDay(event, day.id)}
                    >
                      <strong>{day.title}</strong>
                      <span>{day.date}</span>
                    </button>
                  ))}
                </div>

                <div className="day-editor">
                  <label>
                    <span>Day title</span>
                    <input value={selectedDay.title} onChange={(event) => updateSelectedDay({ title: event.target.value })} />
                  </label>
                  <label>
                    <span>Date</span>
                    <input type="date" value={selectedDay.date} onChange={(event) => updateSelectedDay({ date: event.target.value })} />
                  </label>
                </div>

                <div className="timeline editor-timeline">
                  {selectedDay.items.map((item) => {
                    const linkedPlace = getPlaceForItem(item, draft.places);
                    return (
                    <article
                      key={item.id}
                      className="timeline-item editable-item"
                      draggable
                      onDragStart={(event) => handleDragStart(event, { kind: "item", itemId: item.id, fromDayId: selectedDay.id })}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => dropOnItem(event, selectedDay.id, item.id)}
                    >
                      <label className="time-field">
                        <span>Time</span>
                        <input aria-label={`${item.title} start time`} type="time" value={item.startTime ?? ""} onChange={(event) => updateItem(item.id, { startTime: event.target.value || undefined })} />
                      </label>
                      <div className="item-fields">
                        <label>
                          <Type size={16} />
                          <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} />
                        </label>
                        <label>
                          <MapPin size={16} />
                          <input
                            value={linkedPlace?.name ?? item.locationName ?? ""}
                            placeholder="Location name"
                            onChange={(event) => updateItem(item.id, { locationName: event.target.value, placeId: undefined })}
                          />
                        </label>
                        <textarea aria-label={`${item.title} notes`} value={item.notes ?? ""} onChange={(event) => updateItem(item.id, { notes: event.target.value })} />
                      </div>
                      <button className="delete-button" type="button" onClick={() => deleteItem(item.id)} title="Delete item">
                        <Trash2 size={17} />
                      </button>
                    </article>
                  )})}
                </div>

                <div className="inline-actions">
                  <button className="add-button" type="button" onClick={() => addItem()}>
                    <Plus size={18} />
                    <span>Add plan item</span>
                  </button>
                </div>
              </>
            ) : null}

            {activeModule === "places" ? (
              <div className="module-list">
                <div className="search-row">
                  <Search size={18} />
                  <input value={placeSearch} placeholder="Search or paste a place name" onChange={(event) => setPlaceSearch(event.target.value)} />
                  <a className="sample-button" href={googleSearchUrl(placeSearch || draft.destination)} target="_blank" rel="noreferrer">
                    Google Maps
                  </a>
                  <button className="new-trip-button" type="button" onClick={addPlace} title="Add place" aria-label="Add place">
                    <Plus size={18} />
                  </button>
                </div>
                <div className="import-panel">
                  <label>
                    <span>Google Maps links</span>
                    <textarea
                      value={googleImportText}
                      placeholder="Paste one Google Maps place URL per line"
                      onChange={(event) => setGoogleImportText(event.target.value)}
                    />
                  </label>
                  <div className="row-actions">
                    <button className="sample-button" type="button" onClick={importGoogleMapsPlaces} disabled={!googleImportText.trim()}>
                      <MapPin size={16} />
                      <span>Import links</span>
                    </button>
                    <label className="file-upload-button">
                      <FileUp size={17} />
                      <span>Import GeoJSON / GPX / KML / KMZ</span>
                      <input
                        type="file"
                        accept=".geojson,.json,.gpx,.kml,.kmz,application/geo+json,application/json"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) importPlaceFile(file);
                        }}
                      />
                    </label>
                  </div>
                </div>
                {draft.places.map((place) => (
                  <article
                    key={place.id}
                    className="module-row place-row"
                    draggable
                    onDragStart={(event) => handleDragStart(event, { kind: "place", placeId: place.id })}
                  >
                    <label>
                      <span>Place</span>
                      <input value={place.name} onChange={(event) => updatePlace(place.id, { name: event.target.value })} />
                    </label>
                    <label>
                      <span>Category</span>
                      <select value={place.category} onChange={(event) => updatePlace(place.id, { category: event.target.value as Place["category"] })}>
                        {placeCategories.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Latitude</span>
                      <input type="number" step="0.0001" value={place.latitude} onChange={(event) => updatePlace(place.id, { latitude: Number(event.target.value) })} />
                    </label>
                    <label>
                      <span>Longitude</span>
                      <input type="number" step="0.0001" value={place.longitude} onChange={(event) => updatePlace(place.id, { longitude: Number(event.target.value) })} />
                    </label>
                    <label>
                      <span>Address</span>
                      <input value={place.address ?? ""} onChange={(event) => updatePlace(place.id, { address: event.target.value })} />
                    </label>
                    <label>
                      <span>Tags</span>
                      <input value={(place.tags ?? []).join(", ")} onChange={(event) => updatePlace(place.id, { tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
                    </label>
                    <textarea value={place.notes ?? ""} onChange={(event) => updatePlace(place.id, { notes: event.target.value })} />
                    <div className="row-actions">
                      <button className="sample-button" type="button" onClick={() => addItem(place)}>
                        <Plus size={16} />
                        <span>Add to day</span>
                      </button>
                      <a className="sample-button" href={buildMapsUrl({ latitude: place.latitude, longitude: place.longitude, label: place.name }, "google")} target="_blank" rel="noreferrer">
                        <Navigation size={16} />
                        Navigate
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {activeModule === "map" ? (
              <div className="map-editor">
                <div className="map-card interactive-map">
                  {draft.places.map((place) => {
                    const position = calculateMapPosition(place, draft.places);
                    return (
                      <button key={place.id} className="map-pin" style={position} type="button" onClick={() => setActiveModule("places")} title={place.name}>
                        <MapPin size={16} />
                      </button>
                    );
                  })}
                  <span>{draft.destination} route cluster</span>
                </div>
                <div className="map-place-list">
                  {draft.places.map((place) => (
                    <a key={place.id} href={buildMapsUrl({ latitude: place.latitude, longitude: place.longitude, label: place.name }, "google")} target="_blank" rel="noreferrer">
                      <Navigation size={16} />
                      <strong>{place.name}</strong>
                      <span>{place.category} · {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {activeModule === "bookings" ? (
              <div className="module-list">
                <div className="import-panel booking-import-panel">
                  <div>
                    <p className="eyebrow">Booking import</p>
                    <strong>Drop in confirmations as booking drafts</strong>
                    <span>PDF files are attached and parsed from filename for now. Text and email files are parsed for confirmation codes and flight numbers.</span>
                  </div>
                  <label className="file-upload-button">
                    <FileUp size={17} />
                    <span>Import PDF / email / text</span>
                    <input
                      type="file"
                      accept=".pdf,.eml,.txt,.ics,application/pdf,text/plain,message/rfc822,text/calendar"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) importBookingFile(file);
                      }}
                    />
                  </label>
                </div>
                {draft.bookings.map((booking) => (
                  <article key={booking.id} className="module-row booking-row-editor">
                    <label>
                      <span>Type</span>
                      <select value={booking.type} onChange={(event) => updateBooking(booking.id, { type: event.target.value as Booking["type"] })}>
                        {bookingTypes.map((type) => <option key={type}>{type}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Title</span>
                      <input value={booking.title} onChange={(event) => updateBooking(booking.id, { title: event.target.value })} />
                    </label>
                    <label>
                      <span>Code</span>
                      <input value={booking.confirmationCode ?? ""} onChange={(event) => updateBooking(booking.id, { confirmationCode: event.target.value })} />
                    </label>
                    <label>
                      <span>Status</span>
                      <select value={booking.status} onChange={(event) => updateBooking(booking.id, { status: event.target.value as Booking["status"] })}>
                        {["todo", "confirmed", "checked_in", "cancelled"].map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </label>
                    <textarea value={booking.notes ?? ""} onChange={(event) => updateBooking(booking.id, { notes: event.target.value })} />
                    {booking.segments?.length ? (
                      <div className="segment-list">
                        {booking.segments.map((segment) => (
                          <span key={segment.id}>
                            {segment.mode} {segment.carrier}{segment.serviceNumber}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <label className="file-upload-button">
                      <FileUp size={17} />
                      <span>Upload file</span>
                      <input type="file" onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadAttachment(file, booking.id).catch((error) => setSyncError(error instanceof Error ? error.message : "Upload failed"));
                      }} />
                    </label>
                    <div className="attachment-list">
                      {(booking.attachmentIds ?? []).map((id) => {
                        const attachment = draft.attachments.find((item) => item.id === id);
                        return attachment ? <span key={id}><Paperclip size={14} />{attachment.title}</span> : null;
                      })}
                    </div>
                  </article>
                ))}
                <button className="add-button" type="button" onClick={addBooking}>
                  <Plus size={18} />
                  <span>Add booking</span>
                </button>
              </div>
            ) : null}

            {activeModule === "files" ? (
              <div className="module-list">
                <div className="import-panel booking-import-panel">
                  <div>
                    <p className="eyebrow">File center</p>
                    <strong>Trip documents and receipts</strong>
                    <span>Upload passports, visas, hotel confirmations, attraction tickets, transport tickets, insurance, and e-receipts.</span>
                  </div>
                  <label className="file-upload-button">
                    <FileUp size={17} />
                    <span>Upload document</span>
                    <input
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadAttachment(file).catch((error) => setSyncError(error instanceof Error ? error.message : "Upload failed"));
                      }}
                    />
                  </label>
                </div>
                {draft.attachments.map((attachment) => (
                  <article key={attachment.id} className="module-row file-row-editor">
                    <Paperclip size={18} />
                    <label>
                      <span>Title</span>
                      <input value={attachment.title ?? ""} onChange={(event) => updateAttachment(attachment.id, { title: event.target.value })} />
                    </label>
                    <label>
                      <span>Category</span>
                      <select value={attachment.category ?? "other"} onChange={(event) => updateAttachment(attachment.id, { category: event.target.value as Attachment["category"] })}>
                        {attachmentCategories.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Linked to</span>
                      <select
                        value={`${attachment.linkedType ?? "trip"}:${attachment.linkedId ?? ""}`}
                        onChange={(event) => {
                          const [linkedType, linkedId] = event.target.value.split(":");
                          updateAttachment(attachment.id, { linkedType: linkedType as Attachment["linkedType"], linkedId: linkedId || undefined });
                        }}
                      >
                        <option value="trip:">Trip</option>
                        {draft.places.map((place) => <option key={place.id} value={`place:${place.id}`}>Place · {place.name}</option>)}
                        {draft.bookings.map((booking) => <option key={booking.id} value={`booking:${booking.id}`}>Booking · {booking.title}</option>)}
                      </select>
                    </label>
                  </article>
                ))}
                {draft.attachments.length === 0 ? <div className="empty-trip-card">No files yet. Upload documents before departure.</div> : null}
              </div>
            ) : null}

            {activeModule === "packing" ? (
              <div className="module-list">
                <div className="packing-template-bar">
                  {packingCategories.map((category) => (
                    <button key={category} className="sample-button" type="button" onClick={() => addPackingItem(category)}>
                      <Plus size={15} />
                      <span>{category}</span>
                    </button>
                  ))}
                </div>
                {draft.packingItems.map((item) => (
                  <label key={item.id} className="check-row packing-row">
                    <input type="checkbox" checked={item.packed} onChange={(event) => updatePacking(item.id, { packed: event.target.checked })} />
                    <select value={item.category} onChange={(event) => updatePacking(item.id, { category: event.target.value as PackingItem["category"] })}>
                      {packingCategories.map((category) => <option key={category}>{category}</option>)}
                    </select>
                    <input value={item.title} onChange={(event) => updatePacking(item.id, { title: event.target.value })} />
                    <input type="number" min={1} value={item.quantity} onChange={(event) => updatePacking(item.id, { quantity: Number(event.target.value) || 1 })} />
                  </label>
                ))}
              </div>
            ) : null}

            {activeModule === "budget" ? (
              <div className="module-list">
                <div className="budget-members">
                  {draft.budgetMembers.map((member) => (
                    <label key={member.id}>
                      <span>Traveler</span>
                      <input value={member.name} onChange={(event) => updateBudgetMember(member.id, { name: event.target.value })} />
                    </label>
                  ))}
                  <button className="new-trip-button" type="button" onClick={addBudgetMember} title="Add traveler" aria-label="Add traveler">
                    <Plus size={18} />
                  </button>
                </div>
                {draft.budgetItems.map((item) => (
                  <article key={item.id} className="module-row budget-row-editor">
                    <label>
                      <span>Bill</span>
                      <input value={item.title} onChange={(event) => updateBudgetItem(item.id, { title: event.target.value })} />
                    </label>
                    <label>
                      <span>Category</span>
                      <select value={item.category ?? "other"} onChange={(event) => updateBudgetItem(item.id, { category: event.target.value as BudgetItem["category"] })}>
                        {budgetCategories.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Amount</span>
                      <input type="number" min={0} step="0.01" value={item.amount} onChange={(event) => updateBudgetItem(item.id, { amount: Number(event.target.value) || 0 })} />
                    </label>
                    <label>
                      <span>Currency</span>
                      <input value={item.currency ?? "USD"} onChange={(event) => updateBudgetItem(item.id, { currency: event.target.value.toUpperCase() || "USD" })} />
                    </label>
                    <div className="member-toggle-group">
                      <span>Paid by</span>
                      {draft.budgetMembers.map((member) => (
                        <button key={member.id} className={item.paidByMemberIds?.includes(member.id) ? "member-pill active" : "member-pill"} type="button" onClick={() => toggleBudgetMember(item, "paidByMemberIds", member.id)}>
                          {member.name}
                        </button>
                      ))}
                    </div>
                    <div className="member-toggle-group">
                      <span>Split with</span>
                      {draft.budgetMembers.map((member) => (
                        <button key={member.id} className={item.splitWithMemberIds?.includes(member.id) ? "member-pill active" : "member-pill"} type="button" onClick={() => toggleBudgetMember(item, "splitWithMemberIds", member.id)}>
                          {member.name}
                        </button>
                      ))}
                    </div>
                    <textarea value={item.notes ?? ""} placeholder="Notes" onChange={(event) => updateBudgetItem(item.id, { notes: event.target.value })} />
                  </article>
                ))}
                <button className="add-button" type="button" onClick={addBudgetItem}>
                  <Plus size={18} />
                  <span>Add bill</span>
                </button>
                <div className="settlement-panel">
                  <p className="eyebrow">Settle up</p>
                  {settlements.map((settlement, index) => (
                    <div key={`${settlement.from}-${settlement.to}-${index}`}>
                      <strong>{draft.budgetMembers.find((member) => member.id === settlement.from)?.name}</strong>
                      <span> pays </span>
                      <strong>{draft.budgetMembers.find((member) => member.id === settlement.to)?.name}</strong>
                      <em>{settlement.amount.toFixed(2)} {settlement.currency}</em>
                    </div>
                  ))}
                  {settlements.length === 0 ? <span>No settlement needed yet.</span> : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="panel side-panel">
        {showPlanHome ? (
          <div className="plan-summary-card">
            <strong>{trips.length}</strong>
            <span>{trips.length === 1 ? "plan in this account" : "plans in this account"}</span>
          </div>
        ) : (
          <>
            <div className="weather-card">
              <div>
                <p className="eyebrow">Weather</p>
                <strong>{selectedWeather?.temperatureMinC ?? "--"} / {selectedWeather?.temperatureMaxC ?? "--"} C</strong>
                <span>{selectedWeather?.summary ?? "Fetch forecast after places are set."}</span>
              </div>
              <button className="icon-button" type="button" onClick={refreshWeather} title="Fetch weather">
                <CloudSun size={18} />
              </button>
            </div>
            <div className="map-card">
              {draft.places.slice(0, 4).map((place) => {
                const position = calculateMapPosition(place, draft.places);
                return <div key={place.id} className="pin" style={position} />;
              })}
              <span>{draft.destination} planning map</span>
            </div>
            <div className="quick-grid">
              <div><strong>{draft.days.length}</strong><span>days</span></div>
              <div><strong>{itemCount}</strong><span>items</span></div>
              <div><strong>{draft.bookings.length}</strong><span>bookings</span></div>
              <div><strong>{packedCount}/{draft.packingItems.length}</strong><span>packed</span></div>
            </div>
            <button className="offline-button" type="button" onClick={prepareOfflineBundle}>
              <Download size={18} />
              <span>{draft.offlineBundle ? "Refresh offline bundle" : "Prepare offline bundle"}</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}
