"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type DragEvent } from "react";
import JSZip from "jszip";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  Clock,
  FileUp,
  ImageUp,
  Landmark,
  Map as MapIcon,
  MapPin,
  Navigation,
  Paperclip,
  PanelLeftOpen,
  PencilLine,
  Plus,
  Save,
  Search,
  Share2,
  Sparkles,
  Ticket,
  Trash2,
  Type,
  X
} from "lucide-react";
import {
  buildTripEditorPath,
  buildMapsUrl,
  applyItineraryPatchOperations,
  createTripDays,
  parseTripIdFromEditorPath,
  removeItineraryItem,
  sortItineraryItems,
  updateItineraryItem,
  type Attachment,
  type AiItineraryPatchOperation,
  type AiItineraryPatchProposal,
  type Booking,
  type BudgetItem,
  type BudgetMember,
  type ItineraryItem,
  type PackingItem,
  type Place,
  type TripDay,
} from "@wanderlust/domain";
import { Button } from "@/components/ui/button";
import { TravelImage } from "@/components/TravelImage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getDestinationTheme, getItineraryTypeVisual } from "@/lib/travel-visuals";
import {
  attachmentCategories,
  bookingTypes,
  budgetCategories,
  moduleCopy,
  packingCategories,
  placeCategories,
  storageKey
} from "./routebook/constants";
import type { DestinationMeta, DragPayload, EditorModule, ImportedPlaceInput, RoutebookShare, SessionUser, TripDraft, TripSummary } from "./routebook/types";

const modules = [
  { id: "itinerary", icon: CalendarDays, title: "行程", copy: "每天路线、顺序、备注和导航目标。" },
  { id: "places", icon: MapPin, title: "地点", copy: "带坐标、标签和现场信息的地点库。" },
  { id: "map", icon: MapIcon, title: "地图", copy: "预览地点分布，并打开导航或搜索。" },
  { id: "bookings", icon: Ticket, title: "预订", copy: "航班、酒店、门票、确认号和文件。" },
  { id: "files", icon: Paperclip, title: "文件", copy: "关联到行程、地点和预订的旅行文件。" },
  { id: "packing", icon: CheckSquare, title: "打包", copy: "打包模板、证件材料和出发检查。" },
  { id: "budget", icon: Landmark, title: "预算", copy: "共同支出与分账计算。" },
  { id: "ai", icon: Sparkles, title: "AI", copy: "生成并导入可检查的路书草稿。" }
] satisfies Array<{ id: EditorModule; icon: typeof CalendarDays; title: string; copy: string }>;

const placeCategoryLabels: Record<NonNullable<Place["category"]>, string> = {
  culture: "文化",
  nature: "自然",
  food: "美食",
  architecture: "建筑",
  hotel: "酒店",
  transport: "交通",
  shopping: "购物",
  other: "其他"
};

const itineraryTypeLabels: Record<ItineraryItem["type"], string> = {
  place: "地点",
  food: "餐饮",
  hotel: "住宿",
  transport: "交通",
  activity: "活动",
  note: "备注",
  booking: "预订"
};

const bookingTypeLabels: Record<Booking["type"], string> = {
  flight: "航班",
  hotel: "酒店",
  train: "火车",
  restaurant: "餐厅",
  ticket: "门票",
  car: "租车",
  other: "其他"
};

const bookingStatusLabels: Record<NonNullable<Booking["status"]>, string> = {
  todo: "待处理",
  confirmed: "已确认",
  checked_in: "已值机",
  cancelled: "已取消"
};

const attachmentCategoryLabels: Record<NonNullable<Attachment["category"]>, string> = {
  passport: "护照",
  visa: "签证",
  hotel: "酒店",
  ticket: "票券",
  transport: "交通",
  insurance: "保险",
  receipt: "收据",
  other: "其他"
};

const attachmentLinkedTypeLabels: Record<NonNullable<Attachment["linkedType"]>, string> = {
  trip: "整趟旅行",
  place: "地点",
  booking: "预订"
};

const packingCategoryLabels: Record<NonNullable<PackingItem["category"]>, string> = {
  documents: "证件",
  clothing: "衣物",
  electronics: "电子设备",
  health: "健康用品",
  money: "现金卡券",
  toiletries: "洗漱用品",
  other: "其他"
};

const budgetCategoryLabels: Record<NonNullable<BudgetItem["category"]>, string> = {
  accommodation: "住宿",
  transport: "交通",
  food: "餐饮",
  tickets: "票券",
  shopping: "购物",
  other: "其他"
};

type AiDraftResponse = {
  trip: Partial<TripDraft>;
  provider: string;
  model: string;
};

type AiOcrResponse = {
  text: string;
  provider: string;
  model: string;
};

type AiPatchResponse = {
  proposal: AiItineraryPatchProposal;
  provider: string;
  model: string;
};

type AiPatchContext = {
  source: "global" | "day" | "item";
  dayId?: string;
  itemId?: string;
  label: string;
};

type RoutebookMetaForm = Pick<TripDraft, "title" | "destination" | "startDate" | "endDate" | "timezone" | "destinationMeta">;

type DestinationSearchResponse = {
  candidates: DestinationMeta[];
  providerError?: string;
};

type ShareResponse = {
  share: RoutebookShare | null;
};

type RoutebookEditorProps = {
  initialTripId?: string;
};

function createEmptyTripDraft(id = "local_draft", ownerId = "local"): TripDraft {
  const startDate = "2026-10-12";
  const endDate = "2026-10-14";
  return {
    id,
    ownerId,
    title: "",
    destination: "",
    startDate,
    endDate,
    timezone: "Etc/UTC",
    status: "draft",
    days: createTripDays(id, startDate, endDate),
    places: [],
    bookings: [],
    attachments: [],
    packingItems: ownerId === "account" ? [{ id: createDraftId("pack"), tripId: id, title: "确认护照和入境要求", category: "documents", quantity: 1, packed: false }] : [],
    weather: [],
    budgetMembers: [{ id: ownerId === "account" ? createDraftId("member") : "local_member_you", tripId: id, name: "我" }],
    budgetItems: []
  };
}

function createDraftId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createBlankTripDraft(): TripDraft {
  const id = `trip_${crypto.randomUUID()}`;
  return createEmptyTripDraft(id, "account");
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createInitialMetaForm(): RoutebookMetaForm {
  const start = new Date();
  return {
    title: "",
    destination: "",
    destinationMeta: undefined,
    startDate: formatDateInput(start),
    endDate: formatDateInput(addDays(start, 2)),
    timezone: "Etc/UTC"
  };
}

function createMetaFormFromDestination(destination: string): RoutebookMetaForm {
  return {
    ...createInitialMetaForm(),
    title: destination.trim() ? `${destination.trim()}路书` : "",
    destination: destination.trim()
  };
}

function createMetaFormFromDraft(draft: TripDraft): RoutebookMetaForm {
  return {
    title: draft.title,
    destination: draft.destination,
    destinationMeta: draft.destinationMeta,
    startDate: draft.startDate,
    endDate: draft.endDate,
    timezone: draft.timezone
  };
}

function normalizeMetaForm(form: RoutebookMetaForm): RoutebookMetaForm {
  const title = form.title.trim() || "未命名路书";
  const destination = form.destination.trim() || "未设置目的地";
  const startDate = form.startDate || formatDateInput(new Date());
  const endDate = form.endDate && form.endDate >= startDate ? form.endDate : startDate;
  return {
    title,
    destination,
    destinationMeta: form.destinationMeta?.fullName === destination ? form.destinationMeta : undefined,
    startDate,
    endDate,
    timezone: form.timezone.trim() || "Etc/UTC"
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("无法读取截图文件"));
    reader.readAsDataURL(file);
  });
}

function isPlaceholderText(value: string | undefined, placeholder: string): boolean {
  return !value?.trim() || value.trim().toLowerCase() === placeholder.toLowerCase();
}

function hydrateDraft(input: Partial<TripDraft>): TripDraft {
  const fallback = createEmptyTripDraft(input.id ?? "local_draft", input.ownerId ?? "account");
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

function applyAiTripDraft(current: TripDraft, aiTrip: Partial<TripDraft>): TripDraft {
  const id = current.id;
  const dateRangeChanged = Boolean(aiTrip.startDate && aiTrip.endDate && (aiTrip.startDate !== current.startDate || aiTrip.endDate !== current.endDate));
  const fallbackDays = dateRangeChanged ? createTripDays(id, aiTrip.startDate!, aiTrip.endDate!) : current.days;
  const sourceDays = aiTrip.days?.length ? aiTrip.days : fallbackDays;
  const days = sourceDays.map((day, dayIndex) => {
    const nextDayId = `${id}-${day.date ?? current.startDate}`;
    return {
      ...day,
      id: nextDayId,
      tripId: id,
      title: day.title ?? `第 ${dayIndex + 1} 天`,
      sortOrder: day.sortOrder ?? dayIndex,
      items: resequenceItems(
        (day.items ?? []).map((item) => ({
          ...item,
          id: createDraftId("item"),
          dayId: nextDayId,
          attachmentIds: item.attachmentIds ?? []
        }))
      )
    };
  });

  return hydrateDraft({
    ...current,
    title: aiTrip.title ?? current.title,
    destination: aiTrip.destination ?? current.destination,
    startDate: aiTrip.startDate ?? current.startDate,
    endDate: aiTrip.endDate ?? current.endDate,
    timezone: aiTrip.timezone ?? current.timezone,
    days,
    places: (aiTrip.places ?? []).map((place) => ({ ...place, id: createDraftId("place"), tripId: id, tags: place.tags ?? [], isFavorite: place.isFavorite ?? false })),
    weather: []
  });
}

function describeAiPatchOperation(operation: AiItineraryPatchOperation, trip: TripDraft): { before: string; after: string; dayTitle: string } {
  const day = trip.days.find((item) => item.id === operation.dayId);
  const dayTitle = day ? `${day.title} · ${day.date}` : "未找到的日期";
  if (operation.type === "add_item") {
    return {
      dayTitle,
      before: "无",
      after: `${operation.after.startTime ? `${operation.after.startTime} ` : ""}${operation.after.title}`
    };
  }
  if (operation.type === "update_day") {
    return {
      dayTitle,
      before: [day?.title, day?.date].filter(Boolean).join(" · ") || "无",
      after: [operation.after.title ?? day?.title, operation.after.date ?? day?.date].filter(Boolean).join(" · ")
    };
  }
  const item = day?.items.find((entry) => entry.id === operation.itemId);
  if (operation.type === "delete_item") {
    return {
      dayTitle,
      before: item ? `${item.startTime ? `${item.startTime} ` : ""}${item.title}` : "未找到",
      after: "删除"
    };
  }
  if (operation.type === "move_item") {
    const toDay = trip.days.find((entry) => entry.id === operation.toDayId);
    return {
      dayTitle,
      before: item ? `${dayTitle} · ${item.title}` : "未找到",
      after: `${toDay ? `${toDay.title} · ${toDay.date}` : operation.toDayId}${typeof operation.toSortOrder === "number" ? ` · 第 ${operation.toSortOrder + 1} 位` : ""}`
    };
  }
  return {
    dayTitle,
    before: item ? `${item.startTime ? `${item.startTime} ` : ""}${item.title}` : "未找到",
    after: [
      operation.after.startTime ?? item?.startTime,
      operation.after.title ?? item?.title,
      operation.after.locationName ?? item?.locationName
    ].filter(Boolean).join(" · ")
  };
}

function getAiPatchTouchedDayIds(proposal: AiItineraryPatchProposal | null, fallbackDayId: string): string[] {
  if (!proposal?.operations.length) return [fallbackDayId];
  return Array.from(new Set(proposal.operations.flatMap((operation) => operation.type === "move_item" ? [operation.dayId, operation.toDayId] : [operation.dayId])));
}

function formatTripSummaryLine(trip: TripSummary): string {
  const dates = trip.startDate && trip.endDate ? `${trip.startDate} - ${trip.endDate}` : "日期未设置";
  const dayCount = trip.dayCount || 0;
  const placeCount = trip.placeCount || 0;
  const bookingCount = trip.bookingCount || 0;
  return [
    dates,
    `${dayCount} 天`,
    `${placeCount} 个地点`,
    `${bookingCount} 项预订`
  ].join(" · ");
}

function readLocalDraft(): TripDraft {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return createEmptyTripDraft();
  try {
    const parsed = JSON.parse(saved) as Partial<TripDraft>;
    if (parsed.id === "local_kyoto" || parsed.title?.toLowerCase().includes("kyoto") || parsed.destination?.toLowerCase().includes("kyoto")) {
      window.localStorage.removeItem(storageKey);
      return createEmptyTripDraft();
    }
    return hydrateDraft(parsed);
  } catch {
    window.localStorage.removeItem(storageKey);
    return createEmptyTripDraft();
  }
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

function formatItemTime(item: ItineraryItem): string {
  if (item.startTime && item.endTime) return `${item.startTime}-${item.endTime}`;
  return item.startTime ?? item.endTime ?? "时间待定";
}

function formatDayMonthDate(date: string): string {
  const [, , month, day] = date.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  return month && day ? `${Number(month)}.${day}` : date;
}

function formatWeekday(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(parsed);
}

function getItineraryIconLabel(item: ItineraryItem): string {
  const labels: Record<ItineraryItem["type"], string> = {
    place: "景",
    food: "食",
    hotel: "宿",
    transport: "行",
    activity: "玩",
    note: "记",
    booking: "票"
  };
  return labels[item.type];
}

function getTransportSummary(item: ItineraryItem): string {
  if (item.type === "transport") return item.title;
  if (item.type === "hotel") return "抵达后办理入住";
  if (item.type === "food") return "步行或就近交通";
  if (item.type === "booking") return "按预订时间前往";
  return "市内交通 + 步行";
}

function formatMoney(amount: number, currency: string): string {
  const normalized = currency.toUpperCase();
  const symbol = normalized === "CNY" ? "¥" : normalized === "JPY" ? "¥" : normalized === "EUR" ? "€" : normalized === "GBP" ? "£" : normalized === "USD" ? "$" : `${normalized} `;
  return `${symbol}${Math.round(amount).toLocaleString("en-US")}`;
}

function getItemBudgetEstimate(item: ItineraryItem, day: TripDay, budgetItems: BudgetItem[]): string {
  const specificMatches = budgetItems.filter((budget) => (item.placeId && budget.placeId === item.placeId) || (item.bookingId && budget.bookingId === item.bookingId));
  const matches = specificMatches.length ? specificMatches : budgetItems.filter((budget) => !budget.placeId && !budget.bookingId && budget.date === day.date);
  if (!matches.length) return "待估算";
  const currency = matches[0]?.currency ?? "USD";
  const total = matches.filter((budget) => (budget.currency ?? "USD") === currency).reduce((sum, budget) => sum + budget.amount, 0);
  return formatMoney(total, currency);
}

function getItemLocationLabel(item: ItineraryItem, place?: Place): string {
  return place?.name ?? item.locationName ?? "地点待补";
}

function getItemDescription(item: ItineraryItem, place?: Place): string {
  return item.reason?.trim() || item.notes?.trim() || place?.notes?.trim() || "补充这一步的安排说明，旅行中会更容易扫读。";
}

function getItemImage(item: ItineraryItem, place?: Place): string {
  return place?.imageUrl || getItineraryTypeVisual(item.type).image;
}

function getItemNavigationTarget(item: ItineraryItem, place?: Place): { latitude: number; longitude: number; label: string } | undefined {
  const latitude = place?.latitude ?? item.latitude;
  const longitude = place?.longitude ?? item.longitude;
  if (typeof latitude !== "number" || typeof longitude !== "number") return undefined;
  return {
    latitude,
    longitude,
    label: getItemLocationLabel(item, place)
  };
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
        notes: atMatch ? line : "请先粘贴坐标，或在出发前搜索这个地点。",
        tags: ["google-maps"]
      };
    });
}

async function parsePlaceImportFile(file: File): Promise<ImportedPlaceInput[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "kmz") {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmlFile = Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith(".kml"));
    if (!kmlFile) throw new Error("KMZ 中没有 KML 文件。");
    return parseKml(await kmlFile.async("text"));
  }

  const text = await file.text();
  if (extension === "geojson" || extension === "json") return parseGeoJson(text);
  if (extension === "gpx") return parseGpx(text);
  if (extension === "kml") return parseKml(text);
  throw new Error("支持的地点导入格式：GeoJSON、GPX、KML、KMZ。");
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
  const title = flightMatch ? `航班 ${flightMatch[1]}${flightMatch[2]}` : hotelMatch?.[1]?.trim() || "导入的预订";
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

export function RoutebookEditor({ initialTripId }: RoutebookEditorProps = {}) {
  const [draft, setDraft] = useState<TripDraft>(() => createEmptyTripDraft());
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [selectedDayId, setSelectedDayId] = useState(() => draft.days[0]!.id);
  const [activeModule, setActiveModule] = useState<EditorModule>("itinerary");
  const [isSaved, setIsSaved] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [shareInfo, setShareInfo] = useState<RoutebookShare | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [placeSearch, setPlaceSearch] = useState("");
  const [googleImportText, setGoogleImportText] = useState("");
  const [routebookDrawerOpen, setRoutebookDrawerOpen] = useState(false);
  const [metaDialogMode, setMetaDialogMode] = useState<"create" | "edit" | null>(null);
  const [metaForm, setMetaForm] = useState<RoutebookMetaForm>(() => createInitialMetaForm());
  const [destinationCandidates, setDestinationCandidates] = useState<DestinationMeta[]>([]);
  const [isSearchingDestination, setIsSearchingDestination] = useState(false);
  const [destinationSearchError, setDestinationSearchError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiImportText, setAiImportText] = useState("");
  const [aiDraftPreview, setAiDraftPreview] = useState<AiDraftResponse | null>(null);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [aiScreenshotNames, setAiScreenshotNames] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiPatchPrompt, setAiPatchPrompt] = useState("");
  const [aiPatchContext, setAiPatchContext] = useState<AiPatchContext>({ source: "global", label: "整份路书" });
  const [aiPatchPreview, setAiPatchPreview] = useState<AiPatchResponse | null>(null);
  const [selectedAiPatchOperationIds, setSelectedAiPatchOperationIds] = useState<string[]>([]);
  const [isAiPatchRunning, setIsAiPatchRunning] = useState(false);
  const [aiPatchError, setAiPatchError] = useState<string | null>(null);
  const [expandedItineraryItemId, setExpandedItineraryItemId] = useState<string | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [initialDestinationConsumed, setInitialDestinationConsumed] = useState(false);
  const [initialTripIdConsumed, setInitialTripIdConsumed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapEditor() {
      const sessionResponse = await fetch("/auth/session", { credentials: "include" });
      if (!sessionResponse.ok || !sessionResponse.headers.get("content-type")?.includes("application/json")) {
        const parsed = readLocalDraft();
        if (!cancelled) {
          setDraft(parsed);
          setSelectedDayId(parsed.days[0]?.id ?? createEmptyTripDraft().days[0]!.id);
        }
        return;
      }

      const session = (await sessionResponse.json()) as { user?: SessionUser | null };
      if (!session.user) {
        const parsed = readLocalDraft();
        if (!cancelled) {
          setDraft(parsed);
          setSelectedDayId(parsed.days[0]?.id ?? createEmptyTripDraft().days[0]!.id);
        }
        return;
      }

      const tripsResponse = await fetch("/api/trips", { credentials: "include" });
      if (!tripsResponse.ok) throw new Error("无法加载账号路书");
      const tripsPayload = (await tripsResponse.json()) as { trips: TripSummary[] };
      if (cancelled) return;

      setUser(session.user);
      setTrips(tripsPayload.trips);
      setIsSaved(true);
    }

    bootstrapEditor().catch((error) => {
      if (!cancelled) setSyncError(error instanceof Error ? error.message : "无法加载账号路书");
    }).finally(() => {
      if (!cancelled) setIsAuthChecked(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthChecked || initialDestinationConsumed) return;
    const tripId = getRequestedTripId();
    if (tripId) {
      setInitialDestinationConsumed(true);
      return;
    }
    const destination = new URLSearchParams(window.location.search).get("destination")?.trim();
    if (!destination) {
      setInitialDestinationConsumed(true);
      return;
    }

    const nextForm = createMetaFormFromDestination(destination);
    setMetaForm(nextForm);
    setDestinationCandidates([]);
    setDestinationSearchError(null);
    setMetaDialogMode("create");
    setRoutebookDrawerOpen(false);
    setInitialDestinationConsumed(true);
  }, [initialDestinationConsumed, initialTripId, isAuthChecked]);

  useEffect(() => {
    if (!isAuthChecked || initialTripIdConsumed) return;
    const tripId = getRequestedTripId();
    if (!tripId) {
      setInitialTripIdConsumed(true);
      return;
    }
    if (!user) {
      setSyncError("请先登录再打开这个已保存的路书。");
      setInitialTripIdConsumed(true);
      return;
    }

    setInitialTripIdConsumed(true);
    void loadTrip(tripId, { updateRoute: !initialTripId, routeMode: "replace" });
  }, [initialTripId, initialTripIdConsumed, isAuthChecked, user]);

  const selectedDay = useMemo(() => draft.days.find((day) => day.id === selectedDayId) ?? draft.days[0]!, [draft.days, selectedDayId]);
  const isAccountTripPersisted = Boolean(user && trips.some((trip) => trip.id === draft.id));
  const showPlanHome = Boolean(user && !isAccountTripPersisted);
  const activeTripSummary = useMemo(() => trips.find((trip) => trip.id === draft.id), [draft.id, trips]);
  const displayTitle = draft.title || "未命名路书";
  const displayDestination = draft.destination || "未设置目的地";
  const hasTripDeepLink = Boolean(getRequestedTripId());
  const hasPendingTripDeepLink = Boolean(
    hasTripDeepLink && !initialTripIdConsumed
  );
  const routebookNeedsMeta = false;
  const settlements = useMemo(() => calculateBudgetSettlements(draft.budgetMembers, draft.budgetItems), [draft.budgetMembers, draft.budgetItems]);
  const shareUrl = shareInfo ? buildShareUrl(shareInfo.token) : null;
  const destinationTheme = useMemo(() => getDestinationTheme(draft.destination), [draft.destination]);
  const aiPatchPreviewTrip = useMemo(() => {
    if (!aiPatchPreview) return null;
    try {
      return applyItineraryPatchOperations(draft, aiPatchPreview.proposal.operations, selectedAiPatchOperationIds).trip;
    } catch {
      return null;
    }
  }, [aiPatchPreview, draft, selectedAiPatchOperationIds]);
  const aiPatchTouchedDayIds = useMemo(() => getAiPatchTouchedDayIds(aiPatchPreview?.proposal ?? null, selectedDay.id), [aiPatchPreview, selectedDay.id]);
  const journeyThemeStyle = {
    "--journey-accent": destinationTheme.accent,
    "--journey-ink": destinationTheme.ink,
    "--journey-wash": destinationTheme.wash,
    "--journey-line": destinationTheme.line,
    "--journey-glow": destinationTheme.glow
  } as CSSProperties;

  function getRequestedTripId(): string | null {
    const routeTripId = initialTripId?.trim();
    if (routeTripId) return routeTripId;
    if (typeof window === "undefined") return null;
    return parseTripIdFromEditorPath(window.location.pathname) ?? (new URLSearchParams(window.location.search).get("tripId")?.trim() || null);
  }

  function updateTripRoute(tripId: string, mode: "push" | "replace" = "push") {
    if (typeof window === "undefined") return;
    const nextPath = buildTripEditorPath(tripId);
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentPath === nextPath) return;
    window.history[mode === "replace" ? "replaceState" : "pushState"]({}, "", nextPath);
  }

  useEffect(() => {
    if (!routebookNeedsMeta || metaDialogMode) return;
    const mode = isAccountTripPersisted ? "edit" : "create";
    const destination = new URLSearchParams(window.location.search).get("destination")?.trim();
    setMetaForm(destination && mode === "create"
      ? createMetaFormFromDestination(destination)
      : {
          title: isPlaceholderText(draft.title, "新路书") ? "" : draft.title,
          destination: isPlaceholderText(draft.destination, "新目的地") ? "" : draft.destination,
          destinationMeta: draft.destinationMeta,
          startDate: draft.startDate,
          endDate: draft.endDate,
          timezone: draft.timezone
        });
    setMetaDialogMode(mode);
  }, [draft.destination, draft.endDate, draft.startDate, draft.timezone, draft.title, isAccountTripPersisted, metaDialogMode, routebookNeedsMeta]);

  useEffect(() => {
    if (!metaDialogMode) return;
    const query = metaForm.destination.trim();
    if (query.length < 2 || metaForm.destinationMeta?.fullName === query) {
      setDestinationCandidates([]);
      setDestinationSearchError(null);
      setIsSearchingDestination(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSearchingDestination(true);
      setDestinationSearchError(null);
      fetch(`/api/geo/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.headers.get("content-type")?.includes("application/json")) {
            throw new Error("API Worker 启动后才能使用目的地搜索。");
          }
          const payload = (await response.json()) as DestinationSearchResponse & { error?: string };
          if (!response.ok) throw new Error(payload.error || "无法搜索目的地");
          setDestinationCandidates(payload.candidates ?? []);
          setDestinationSearchError(payload.providerError ? "Google Maps 配置好之前先使用本地建议。" : null);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setDestinationCandidates([]);
          setDestinationSearchError(error instanceof Error ? error.message : "无法搜索目的地");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearchingDestination(false);
        });
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [metaDialogMode, metaForm.destination, metaForm.destinationMeta?.fullName]);

  if (!isAuthChecked) {
    return (
      <section id="editor" className="workspace workspace-editor workspace-loading" aria-busy="true">
        <div className="panel itinerary-panel editor-loading-panel">
          <div className="editor-loading-routebook">
            <span />
            <div>
              <p className="eyebrow">路书</p>
              <strong>正在加载你的路书</strong>
            </div>
          </div>
          <div className="editor-loading-line wide" />
          <div className="editor-loading-grid">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>
    );
  }

  function markDirty() {
    setIsSaved(false);
  }

  function patchDraft(patch: Partial<TripDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    markDirty();
  }

  function openCreateTripDialog() {
    const destination = new URLSearchParams(window.location.search).get("destination")?.trim();
    setMetaForm(destination ? createMetaFormFromDestination(destination) : createInitialMetaForm());
    setDestinationCandidates([]);
    setDestinationSearchError(null);
    setMetaDialogMode("create");
    setRoutebookDrawerOpen(false);
  }

  function openEditTripMetaDialog() {
    setMetaForm(createMetaFormFromDraft(draft));
    setDestinationCandidates([]);
    setDestinationSearchError(null);
    setMetaDialogMode("edit");
  }

  function selectDestinationCandidate(candidate: DestinationMeta) {
    setMetaForm((current) => ({
      ...current,
      destination: candidate.fullName,
      destinationMeta: candidate,
      timezone: candidate.timezone ?? current.timezone
    }));
    setDestinationCandidates([]);
    setDestinationSearchError(null);
  }

  async function submitRoutebookMeta() {
    const normalized = normalizeMetaForm(metaForm);
    if (metaDialogMode === "create") {
      const nextDraft = createBlankTripDraft();
      const nextTrip = hydrateDraft({
        ...nextDraft,
        ...normalized,
        days: createTripDays(nextDraft.id, normalized.startDate, normalized.endDate)
      });
      setDraft(nextTrip);
      setSelectedDayId(nextTrip.days[0]!.id);
      setIsSaved(false);
      setMetaDialogMode(null);
      if (user) await persistDraft(nextTrip, false);
      return;
    }

    if (metaDialogMode === "edit") {
      const dateRangeChanged = normalized.startDate !== draft.startDate || normalized.endDate !== draft.endDate;
      const nextTrip = hydrateDraft({
        ...draft,
        ...normalized,
        days: dateRangeChanged ? createTripDays(draft.id, normalized.startDate, normalized.endDate) : draft.days
      });
      setDraft(nextTrip);
      setSelectedDayId(nextTrip.days[0]!.id);
      setMetaDialogMode(null);
      await persistDraft(nextTrip);
    }
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
      title: place?.name ?? "新的行程项",
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
    if (!response.ok) throw new Error("无法刷新路书列表");
    const payload = (await response.json()) as { trips: TripSummary[] };
    setTrips(payload.trips);
  }

  async function loadTrip(tripId: string, options: { updateRoute?: boolean; routeMode?: "push" | "replace" } = {}) {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, { credentials: "include" });
      if (!response.ok) throw new Error("无法打开路书");
      const payload = (await response.json()) as { trip: TripDraft };
      const hydrated = hydrateDraft(payload.trip);
      setDraft(hydrated);
      setSelectedDayId(hydrated.days[0]?.id ?? createEmptyTripDraft().days[0]!.id);
      setIsSaved(true);
      setShareInfo(null);
      setShareStatus(null);
      setMetaDialogMode(null);
      setRoutebookDrawerOpen(false);
      if (options.updateRoute) {
        updateTripRoute(hydrated.id, options.routeMode);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "无法打开路书");
    } finally {
      setIsSyncing(false);
    }
  }

  async function deleteTrip(trip: TripSummary) {
    if (!user || deletingTripId) return;
    const confirmed = window.confirm(`删除“${trip.title}"? This will remove the routebook and its attached files from your account.`);
    if (!confirmed) return;

    setDeletingTripId(trip.id);
    setSyncError(null);
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(trip.id)}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!response.ok) throw new Error("无法删除路书");

      const nextTrips = trips.filter((item) => item.id !== trip.id);
      setTrips(nextTrips);
      if (draft.id === trip.id) {
        const blank = createBlankTripDraft();
        setDraft(blank);
        setSelectedDayId(blank.days[0]?.id ?? createEmptyTripDraft().days[0]!.id);
        setIsSaved(true);
        setShareInfo(null);
        setShareStatus(null);
        setMetaDialogMode(null);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "无法删除路书");
    } finally {
      setDeletingTripId(null);
    }
  }

  async function createSyncedTrip() {
    openCreateTripDialog();
  }

  async function persistDraft(target = draft, existing = trips.some((trip) => trip.id === target.id)): Promise<TripDraft | null> {
    setSyncError(null);
    if (!user) {
      window.localStorage.setItem(storageKey, JSON.stringify(target));
      setIsSaved(true);
      return target;
    }

    setIsSyncing(true);
    try {
      const response = await fetch(existing ? `/api/trips/${encodeURIComponent(target.id)}` : "/api/trips", {
        method: existing ? "PUT" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(target)
      });
      if (!response.ok) throw new Error("无法保存路书");
      const payload = (await response.json()) as { trip: TripDraft };
      const hydrated = hydrateDraft(payload.trip);
      setDraft(hydrated);
      setSelectedDayId(hydrated.days[0]?.id ?? createEmptyTripDraft().days[0]!.id);
      setIsSaved(true);
      setMetaDialogMode(null);
      await refreshTrips();
      if (!existing) {
        updateTripRoute(hydrated.id, "replace");
      }
      return hydrated;
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "无法保存路书");
      return null;
    } finally {
      setIsSyncing(false);
    }
  }

  function buildShareUrl(token: string): string {
    return `${window.location.origin}/share?token=${encodeURIComponent(token)}`;
  }

  async function copyShareUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setShareStatus("分享链接已复制。");
  }

  async function createOrCopyShare() {
    if (!user) {
      setSyncError("请先登录再分享路书。");
      return;
    }

    setIsSharing(true);
    setSyncError(null);
    setShareStatus(null);
    try {
      let target = draft;
      if (!isSaved || !isAccountTripPersisted) {
        const saved = await persistDraft(draft, isAccountTripPersisted);
        if (!saved) throw new Error("保存失败，无法创建分享链接");
        target = saved;
      }

      const response = await fetch(`/api/trips/${encodeURIComponent(target.id)}/share`, {
        method: "POST",
        credentials: "include"
      });
      const payload = (await response.json()) as ShareResponse & { error?: string };
      if (!response.ok || !payload.share) throw new Error(payload.error || "无法创建分享链接");
      setShareInfo(payload.share);
      await copyShareUrl(buildShareUrl(payload.share.token));
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "无法创建分享链接");
    } finally {
      setIsSharing(false);
    }
  }

  async function revokeShare() {
    if (!shareInfo || isSharing) return;
    setIsSharing(true);
    setSyncError(null);
    setShareStatus(null);
    try {
      const response = await fetch(`/api/shares/${encodeURIComponent(shareInfo.id)}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!response.ok) throw new Error("无法取消分享");
      setShareInfo(null);
      setShareStatus("已取消当前分享链接。");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "无法取消分享");
    } finally {
      setIsSharing(false);
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
          name: placeSearch || "新的收藏地点",
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
      setSyncError(error instanceof Error ? error.message : "无法导入地点");
    } finally {
      setIsSyncing(false);
    }
  }

  function updateBooking(bookingId: string, patch: Partial<Booking>) {
    setDraft((current) => ({ ...current, 项预订: current.bookings.map((booking) => (booking.id === bookingId ? { ...booking, ...patch } : booking)) }));
    markDirty();
  }

  function addBooking() {
    setDraft((current) => ({
      ...current,
      bookings: [
        ...current.bookings,
        { id: createDraftId("booking"), tripId: current.id, dayId: selectedDay.id, type: "ticket", title: "新的预订", status: "todo", attachmentIds: [] }
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
      setDraft((current) => ({ ...current, 项预订: [...current.bookings, booking] }));
      await uploadAttachment(file, booking.id);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "无法导入预订");
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
      if (!response.ok) throw new Error("无法上传附件");
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
          title: "新的共同账单",
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
      packingItems: [...current.packingItems, { id: createDraftId("pack"), tripId: current.id, title: "新的打包物品", category, quantity: 1, packed: false }]
    }));
    markDirty();
  }

  async function requestAiDraft(mode: "plan" | "import") {
    setIsAiRunning(true);
    setAiError(null);
    try {
      const response = await fetch(`/api/ai/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trip: draft,
          prompt: mode === "plan" ? aiPrompt : undefined,
          text: mode === "import" ? aiImportText : undefined
        })
      });
      const payload = (await response.json()) as AiDraftResponse & { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || "AI 草稿生成失败");
      setAiDraftPreview(payload);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI 草稿生成失败");
    } finally {
      setIsAiRunning(false);
    }
  }

  function openAiAssistant(context: AiPatchContext, suggestedPrompt = "") {
    setAiPatchContext(context);
    if (suggestedPrompt) setAiPatchPrompt(suggestedPrompt);
    setAiPatchError(null);
    setAiAssistantOpen(true);
  }

  async function requestAiPatch() {
    if (!user) {
      setAiPatchError("运行 AI 修改前请先用 Google 或 Apple 登录。");
      return;
    }
    if (!aiPatchPrompt.trim()) return;
    setIsAiPatchRunning(true);
    setAiPatchError(null);
    try {
      const response = await fetch("/api/ai/patch", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trip: draft,
          prompt: aiPatchPrompt,
          context: {
            source: aiPatchContext.source,
            dayId: aiPatchContext.dayId,
            itemId: aiPatchContext.itemId
          }
        })
      });
      const payload = (await response.json()) as AiPatchResponse & { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || "AI 修改预览生成失败");
      setAiPatchPreview(payload);
      setSelectedAiPatchOperationIds(payload.proposal.operations.map((operation) => operation.id));
    } catch (error) {
      setAiPatchError(error instanceof Error ? error.message : "AI 修改预览生成失败");
    } finally {
      setIsAiPatchRunning(false);
    }
  }

  function toggleAiPatchOperation(operationId: string) {
    setSelectedAiPatchOperationIds((current) =>
      current.includes(operationId) ? current.filter((id) => id !== operationId) : [...current, operationId]
    );
  }

  function applyAiPatchPreview() {
    if (!aiPatchPreview) return;
    const result = applyItineraryPatchOperations(draft, aiPatchPreview.proposal.operations, selectedAiPatchOperationIds);
    const nextDraft = hydrateDraft(result.trip);
    setDraft(nextDraft);
    if (!nextDraft.days.some((day) => day.id === selectedDayId)) {
      setSelectedDayId(nextDraft.days[0]?.id ?? createEmptyTripDraft().days[0]!.id);
    }
    setAiPatchPreview(null);
    setSelectedAiPatchOperationIds([]);
    setAiPatchPrompt("");
    markDirty();
  }

  async function requestScreenshotOcr(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (!user) {
      setAiError("运行截图识别前请先用 Google 或 Apple 登录。");
      return;
    }

    setIsOcrRunning(true);
    setAiError(null);
    setAiScreenshotNames(files.map((file) => file.name));
    try {
      const images = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type,
          dataUrl: await readFileAsDataUrl(file)
        }))
      );
      const response = await fetch("/api/ai/ocr", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images })
      });
      const payload = (await response.json()) as AiOcrResponse & { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || "截图识别失败");
      setAiImportText((current) => [current.trim(), payload.text.trim()].filter(Boolean).join("\n\n"));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "截图识别失败");
    } finally {
      setIsOcrRunning(false);
    }
  }

  function applyAiDraftPreview() {
    if (!aiDraftPreview?.trip) return;
    const nextDraft = applyAiTripDraft(draft, aiDraftPreview.trip);
    setDraft(nextDraft);
    setSelectedDayId(nextDraft.days[0]?.id ?? createEmptyTripDraft().days[0]!.id);
    setAiDraftPreview(null);
    markDirty();
  }

  function renderTripCard(trip: TripSummary) {
    return (
      <article key={trip.id} className={trip.id === draft.id ? "trip-card active" : "trip-card"}>
        <button className="trip-card-open" type="button" onClick={() => loadTrip(trip.id, { updateRoute: true })}>
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
    );
  }

  return (
    <section id="editor" className={showPlanHome ? "workspace workspace-plan-home" : "workspace workspace-editor"}>
      <div className="panel itinerary-panel">
        {!showPlanHome ? (
          <div className="trip-library">
            <button
              className="routebook-current"
              type="button"
              onClick={() => (user ? setRoutebookDrawerOpen(true) : openEditTripMetaDialog())}
              aria-haspopup="dialog"
              aria-expanded={routebookDrawerOpen}
            >
              <span className="routebook-current-icon" aria-hidden="true">
                <PanelLeftOpen size={19} />
              </span>
              <span>
                <span className="eyebrow">{user ? "当前路书" : "本地草稿"}</span>
                <strong>{user ? activeTripSummary?.title ?? displayTitle : displayTitle}</strong>
                <small>
                  {user
                    ? activeTripSummary
                      ? `${activeTripSummary.destination} · ${formatTripSummaryLine(activeTripSummary)}`
                      : trips.length > 0
                        ? "打开路书列表选择一个路书。"
                        : "先创建一个路书开始。"
                    : `${displayDestination} · ${draft.startDate} - ${draft.endDate} · ${draft.days.length} ${draft.days.length === 1 ? "day" : "天"} · 登录后同步`}
                </small>
              </span>
            </button>
            <div className="trip-library-actions">
              <Button variant="icon" size="icon" type="button" onClick={openEditTripMetaDialog} disabled={routebookNeedsMeta} title="编辑路书信息" aria-label="编辑路书信息">
                <PencilLine size={18} />
              </Button>
              <Button className="trip-save-button" type="button" onClick={() => persistDraft()} disabled={routebookNeedsMeta} title="保存路书">
                <Save size={18} />
                <span>{isSyncing ? "保存中" : "保存"}</span>
              </Button>
              <Button variant="secondary" type="button" onClick={createOrCopyShare} disabled={routebookNeedsMeta || isSharing || !user} title="分享只读路书">
                <Share2 size={17} />
                <span>{isSharing ? "生成中" : shareUrl ? "复制分享" : "分享"}</span>
              </Button>
              {shareInfo ? (
                <Button variant="icon" size="icon" type="button" onClick={revokeShare} disabled={isSharing} title="取消分享" aria-label="取消分享">
                  <X size={18} />
                </Button>
              ) : null}
              <button className="new-trip-button" type="button" onClick={createSyncedTrip} title="新建行程" aria-label="新建行程">
                <Plus size={20} />
              </button>
            </div>
          </div>
        ) : null}

        {!showPlanHome ? (
          <aside className="rail editor-module-rail" aria-label="行程模块">
            <TooltipProvider delayDuration={120}>
              <ToggleGroup
                className="editor-module-toggle"
                type="single"
                value={activeModule}
                aria-label="行程模块"
                onValueChange={(value) => {
                  if (value) setActiveModule(value as EditorModule);
                }}
              >
                {modules.map((module) => (
                  <Tooltip key={module.id}>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem className="rail-item" size="icon" value={module.id} aria-label={module.title}>
                        <module.icon size={18} />
                        <span>{module.title}</span>
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>{module.copy}</TooltipContent>
                  </Tooltip>
                ))}
              </ToggleGroup>
            </TooltipProvider>
          </aside>
        ) : null}
        {metaDialogMode ? (
          <Dialog
            open={Boolean(metaDialogMode)}
            onOpenChange={(open) => {
              if (!open && !routebookNeedsMeta) setMetaDialogMode(null);
            }}
          >
            <DialogContent
              className="routebook-meta-dialog-content"
              showClose={!routebookNeedsMeta}
              aria-label={metaDialogMode === "create" ? "创建路书" : "编辑路书"}
            >
              <DialogHeader className="routebook-modal-heading">
                <div>
                  <p className="eyebrow">{routebookNeedsMeta ? "创建路书" : metaDialogMode === "create" ? "创建路书" : "编辑路书"}</p>
                  <DialogTitle className="routebook-modal-title">
                    {routebookNeedsMeta ? "先给这趟旅行命名" : metaDialogMode === "create" ? "开始一个新的路书" : "更新路书信息"}
                  </DialogTitle>
                  <DialogDescription className="routebook-modal-description">目的地、日期和时区会决定路书主题色、日期结构和后续 AI 规划上下文。</DialogDescription>
                </div>
              </DialogHeader>
              <div className="routebook-meta-form">
                <label>
                  <span>路书</span>
                  <Input
                    aria-label="路书标题"
                    placeholder="东京夏季路书"
                    value={metaForm.title}
                    onChange={(event) => setMetaForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <label>
                  <span>目的地</span>
                  <div className="destination-combobox">
                    <Input
                      aria-label="目的地"
                      placeholder="Tokyo, Japan"
                      value={metaForm.destination}
                      autoComplete="off"
                      onChange={(event) =>
                        setMetaForm((current) => ({
                          ...current,
                          destination: event.target.value,
                          destinationMeta: current.destinationMeta?.fullName === event.target.value ? current.destinationMeta : undefined
                        }))
                      }
                    />
                    {isSearchingDestination ? <span className="destination-search-state">搜索中...</span> : null}
                    {destinationCandidates.length > 0 ? (
                      <div className="destination-suggestions" role="listbox" aria-label="目的地建议">
                        {destinationCandidates.map((candidate) => (
                          <button
                            key={`${candidate.provider}:${candidate.providerPlaceId ?? candidate.fullName}`}
                            type="button"
                            className="destination-suggestion"
                            onClick={() => selectDestinationCandidate(candidate)}
                          >
                            <strong>{candidate.name}</strong>
                            <span>{candidate.fullName}</span>
                            <small>
                              {candidate.countryCode ? `${candidate.countryCode} · ` : ""}
                              {candidate.timezone ?? "待获取时区"}
                            </small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {metaForm.destinationMeta ? (
                    <small className="destination-standardized">
                      Standardized as {metaForm.destinationMeta.fullName}
                      {metaForm.destinationMeta.countryCode ? ` · ${metaForm.destinationMeta.countryCode}` : ""}
                      {metaForm.destinationMeta.timezone ? ` · ${metaForm.destinationMeta.timezone}` : ""}
                    </small>
                  ) : destinationSearchError ? (
                    <small className="destination-standardized warning">{destinationSearchError}</small>
                  ) : null}
                </label>
                <label>
                  <span>Start</span>
                  <Input type="date" value={metaForm.startDate} onChange={(event) => setMetaForm((current) => ({ ...current, startDate: event.target.value }))} />
                </label>
                <label>
                  <span>End</span>
                  <Input type="date" value={metaForm.endDate} onChange={(event) => setMetaForm((current) => ({ ...current, endDate: event.target.value }))} />
                </label>
                <label>
                  <span>时区</span>
                  <Input
                    aria-label="时区"
                    value={metaForm.timezone}
                    onChange={(event) => setMetaForm((current) => ({ ...current, timezone: event.target.value }))}
                  />
                </label>
              </div>
              <DialogFooter className="routebook-modal-actions">
                {!routebookNeedsMeta ? (
                  <Button variant="secondary" type="button" onClick={() => setMetaDialogMode(null)}>
                    取消
                  </Button>
                ) : null}
                <Button type="button" onClick={() => void submitRoutebookMeta()}>
                  <Save size={18} />
                  <span>{routebookNeedsMeta || metaDialogMode === "create" ? "创建路书" : "保存修改"}</span>
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
        {user && !showPlanHome ? (
          <Dialog open={routebookDrawerOpen} onOpenChange={setRoutebookDrawerOpen}>
            <DialogContent className="routebook-drawer-content" aria-label="路书列表">
              <DialogHeader className="routebook-drawer-heading">
                <div>
                  <p className="eyebrow">路书列表</p>
                  <DialogTitle>你的行程</DialogTitle>
                  <DialogDescription className="routebook-drawer-description">切换、查看或删除已经同步的路书。</DialogDescription>
                </div>
              </DialogHeader>
              <ScrollArea className="routebook-drawer-list">
                {trips.map(renderTripCard)}
                {trips.length === 0 ? <div className="empty-trip-card">{isSyncing ? "正在同步路书..." : "还没有路书。 先创建一个路书开始。"}</div> : null}
              </ScrollArea>
            </DialogContent>
          </Dialog>
        ) : null}

        {showPlanHome ? (
          <div className="plan-home">
            <div className="plan-home-heading">
              <div>
                <p className="eyebrow">路书库</p>
                <h3>{trips.length > 0 ? "你的路书" : "创建你的第一本路书"}</h3>
                <p>每趟旅行创建一本路书，然后打开它编辑行程、地点、预订、文件、打包、预算和 AI 草稿。</p>
              </div>
              <button className="save-button" type="button" onClick={createSyncedTrip}>
                <Plus size={18} />
                <span>创建路书</span>
              </button>
            </div>
            <div className="plan-home-list">
              {trips.map(renderTripCard)}
              {trips.length === 0 ? <div className="empty-trip-card">{isSyncing ? "正在同步路书..." : "还没有路书。"}</div> : null}
            </div>
          </div>
        ) : (
          <>
            {shareStatus ? <div className="share-status">{shareStatus}{shareUrl ? <a href={shareUrl} target="_blank" rel="noreferrer">打开只读页</a> : null}</div> : null}
            {syncError ? <div className="sync-error">{syncError}</div> : null}

            <div className="module-heading">
              <p>{modules.find((module) => module.id === activeModule)?.title}</p>
              <span>{moduleCopy[activeModule]}</span>
            </div>

            {activeModule === "itinerary" ? (
              <>
                <div className="day-strip" aria-label="整趟旅行 天">
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

                <section className="journey-day-shell" style={journeyThemeStyle}>
                  <div className="journey-day-rail" aria-hidden="true">
                    <span />
                  </div>
                  <div className="journey-day-content">
                    <div className="journey-day-hero">
                      <TravelImage
                        className="journey-day-hero-image"
                        src={destinationTheme.image}
                        alt=""
                        overlayClassName="journey-day-hero-image-overlay"
                        sizes="(max-width: 900px) 100vw, 900px"
                        priority={draft.days.findIndex((day) => day.id === selectedDay.id) === 0}
                      />
                      <div>
                        <p className="eyebrow">DAY {String(draft.days.findIndex((day) => day.id === selectedDay.id) + 1).padStart(2, "0")}</p>
                        <input
                          className="journey-day-title-input"
                          aria-label="天标题"
                          value={selectedDay.title}
                          onChange={(event) => updateSelectedDay({ title: event.target.value })}
                        />
                      </div>
                      <div className="journey-day-tools">
                        <label className="journey-date-control">
                          <CalendarDays size={16} />
                          <input type="date" value={selectedDay.date} onChange={(event) => updateSelectedDay({ date: event.target.value })} />
                        </label>
                        <button className="add-button compact" type="button" onClick={() => addItem()}>
                          <Plus size={18} />
                          <span>添加行程项</span>
                        </button>
                        <button
                          className="ai-inline-button"
                          type="button"
                          onClick={() => openAiAssistant({ source: "day", dayId: selectedDay.id, label: selectedDay.title }, `帮我优化${selectedDay.title}的行程安排`)}
                        >
                          <Sparkles size={16} />
                          <span>AI 修改</span>
                        </button>
                      </div>
                    </div>

                    <div className="timeline journey-timeline">
                      {selectedDay.items.length ? selectedDay.items.map((item) => {
                        const linkedPlace = getPlaceForItem(item, draft.places);
                        const navigationTarget = getItemNavigationTarget(item, linkedPlace);
                        const isExpanded = expandedItineraryItemId === item.id;
                        const dayNumber = draft.days.findIndex((day) => day.id === selectedDay.id) + 1;
                        return (
                          <article
                            key={item.id}
                            className={isExpanded ? "route-step-card expanded" : "route-step-card"}
                            draggable
                            onDragStart={(event) => handleDragStart(event, { kind: "item", itemId: item.id, fromDayId: selectedDay.id })}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => dropOnItem(event, selectedDay.id, item.id)}
                          >
                            <aside className="route-step-date-panel">
                              <span>Day {dayNumber}</span>
                              <strong>{formatDayMonthDate(selectedDay.date)}</strong>
                              <small>{formatWeekday(selectedDay.date)}</small>
                              <em>{getItineraryIconLabel(item)}</em>
                              <b>{itineraryTypeLabels[item.type]}</b>
                            </aside>
                            <TravelImage
                              className="route-step-image"
                              src={getItemImage(item, linkedPlace)}
                              alt=""
                              overlayClassName="route-step-image-overlay"
                              sizes="(max-width: 720px) 100vw, 420px"
                              style={{
                                backgroundColor: getItineraryTypeVisual(item.type).color
                              }}
                            />
                            <div className="route-step-body">
                              <div className="route-step-topline">
                                <div className="route-step-kicker">
                                  <span>{displayDestination}</span>
                                  {item.bookingId ? <small>已关联预订</small> : null}
                                </div>
                                <div className="route-step-time">
                                  <Clock size={15} />
                                  <span>{formatItemTime(item)}</span>
                                </div>
                              </div>
                              <h3>{item.title}</h3>
                              <p>{getItemDescription(item, linkedPlace)}</p>
                              <div className="route-step-facts">
                                <div className="route-step-fact">
                                  <MapPin size={18} />
                                  <span>{getItemLocationLabel(item, linkedPlace)}</span>
                                </div>
                                <div className="route-step-fact">
                                  <Navigation size={18} />
                                  <span>{getTransportSummary(item)}</span>
                                </div>
                                <div className="route-step-fact">
                                  <Landmark size={18} />
                                  <span>预计费用：{getItemBudgetEstimate(item, selectedDay, draft.budgetItems)}</span>
                                </div>
                              </div>
                              <div className="route-step-actions">
                                <button className="route-link-button route-detail-button" type="button" onClick={() => setExpandedItineraryItemId(isExpanded ? null : item.id)}>
                                  <span>{isExpanded ? "收起" : "详情"}</span>
                                  <ChevronDown size={16} />
                                </button>
                                {navigationTarget ? (
                                  <a className="route-link-button strong" href={buildMapsUrl(navigationTarget, "google")} target="_blank" rel="noreferrer">
                                    <Navigation size={16} />
                                    <span>导航</span>
                                  </a>
                                ) : (
                                  <span className="route-link-button muted">
                                    <MapPin size={16} />
                                    <span>待补地点</span>
                                  </span>
                                )}
                                <button className="icon-button small" type="button" onClick={() => setExpandedItineraryItemId(isExpanded ? null : item.id)} title="编辑行程项" aria-label={`编辑 ${item.title}`}>
                                  <PencilLine size={16} />
                                </button>
                                <button
                                  className="icon-button small ai"
                                  type="button"
                                  onClick={() => openAiAssistant({ source: "item", dayId: selectedDay.id, itemId: item.id, label: item.title }, `帮我调整“${item.title}”这个行程项`)}
                                  title="用 AI 修改"
                                  aria-label={`用 AI 修改 ${item.title}`}
                                >
                                  <Sparkles size={16} />
                                </button>
                                <button className="icon-button small danger" type="button" onClick={() => deleteItem(item.id)} title="删除条目" aria-label={`删除 ${item.title}`}>
                                  <Trash2 size={16} />
                                </button>
                              </div>
                              {isExpanded ? (
                                <div className="route-step-editor">
                                  <label className="time-field">
                                    <span>开始</span>
                                    <input aria-label={`${item.title} start time`} type="time" value={item.startTime ?? ""} onChange={(event) => updateItem(item.id, { startTime: event.target.value || undefined })} />
                                  </label>
                                  <label className="time-field">
                                    <span>结束</span>
                                    <input aria-label={`${item.title} end time`} type="time" value={item.endTime ?? ""} onChange={(event) => updateItem(item.id, { endTime: event.target.value || undefined })} />
                                  </label>
                                  <label>
                                    <Type size={16} />
                                    <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} />
                                  </label>
                                  <label>
                                    <MapPin size={16} />
                                    <input
                                      value={linkedPlace?.name ?? item.locationName ?? ""}
                                      placeholder="地点名称"
                                      onChange={(event) => updateItem(item.id, { locationName: event.target.value, placeId: undefined })}
                                    />
                                  </label>
                                  <label className="reason-field">
                                    <Sparkles size={16} />
                                    <textarea
                                      aria-label={`${item.title} route reason`}
                                      placeholder="为什么放在这里"
                                      value={item.reason ?? ""}
                                      onChange={(event) => updateItem(item.id, { reason: event.target.value })}
                                    />
                                  </label>
                                  <textarea aria-label={`${item.title} notes`} value={item.notes ?? ""} onChange={(event) => updateItem(item.id, { notes: event.target.value })} />
                                </div>
                              ) : null}
                            </div>
                          </article>
                        );
                      }) : (
                        <div className="journey-empty-card">
                          <strong>这一天还没有安排</strong>
                          <span>添加一个行程项，或从地点库拖一个地点到这里。</span>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </>
            ) : null}

            {activeModule === "places" ? (
              <div className="module-list">
                <div className="search-row">
                  <Search size={18} />
                  <input value={placeSearch} placeholder="搜索或粘贴地点名称" onChange={(event) => setPlaceSearch(event.target.value)} />
                  <a className="sample-button" href={googleSearchUrl(placeSearch || draft.destination)} target="_blank" rel="noreferrer">
                    Google Maps
                  </a>
                  <button className="new-trip-button" type="button" onClick={addPlace} title="添加地点" aria-label="添加地点">
                    <Plus size={18} />
                  </button>
                </div>
                <div className="import-panel">
                  <label>
                    <span>Google Maps 链接</span>
                    <textarea
                      value={googleImportText}
                      placeholder="每行粘贴一个 Google Maps 地点链接"
                      onChange={(event) => setGoogleImportText(event.target.value)}
                    />
                  </label>
                  <div className="row-actions">
                    <button className="sample-button" type="button" onClick={importGoogleMapsPlaces} disabled={!googleImportText.trim()}>
                      <MapPin size={16} />
                      <span>导入链接</span>
                    </button>
                    <label className="file-upload-button">
                      <FileUp size={17} />
                      <span>导入 GeoJSON / GPX / KML / KMZ</span>
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
                      <span>地点</span>
                      <input value={place.name} onChange={(event) => updatePlace(place.id, { name: event.target.value })} />
                    </label>
                    <label>
                      <span>分类</span>
                      <select value={place.category} onChange={(event) => updatePlace(place.id, { category: event.target.value as Place["category"] })}>
                        {placeCategories.map((category) => <option key={category} value={category}>{placeCategoryLabels[category]}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>纬度</span>
                      <input type="number" step="0.0001" value={place.latitude} onChange={(event) => updatePlace(place.id, { latitude: Number(event.target.value) })} />
                    </label>
                    <label>
                      <span>经度</span>
                      <input type="number" step="0.0001" value={place.longitude} onChange={(event) => updatePlace(place.id, { longitude: Number(event.target.value) })} />
                    </label>
                    <label>
                      <span>地址</span>
                      <input value={place.address ?? ""} onChange={(event) => updatePlace(place.id, { address: event.target.value })} />
                    </label>
                    <label>
                      <span>标签</span>
                      <input value={(place.tags ?? []).join(", ")} onChange={(event) => updatePlace(place.id, { tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
                    </label>
                    <textarea value={place.notes ?? ""} onChange={(event) => updatePlace(place.id, { notes: event.target.value })} />
                    <div className="row-actions">
                      <button className="sample-button" type="button" onClick={() => addItem(place)}>
                        <Plus size={16} />
                        <span>加入当天</span>
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
                  <span>{draft.destination} 路线分布</span>
                </div>
                <div className="map-place-list">
                  {draft.places.map((place) => (
                    <a key={place.id} href={buildMapsUrl({ latitude: place.latitude, longitude: place.longitude, label: place.name }, "google")} target="_blank" rel="noreferrer">
                      <Navigation size={16} />
                      <strong>{place.name}</strong>
                      <span>{placeCategoryLabels[place.category]} · {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {activeModule === "bookings" ? (
              <div className="module-list">
                <div className="import-panel booking-import-panel">
                  <div>
                    <p className="eyebrow">预订导入</p>
                    <strong>把确认单直接导入为预订草稿</strong>
                    <span>目前 PDF 只会作为附件挂上，且先按文件名解析。文本和邮件会解析确认号与航班号。</span>
                  </div>
                  <label className="file-upload-button">
                    <FileUp size={17} />
                    <span>导入 PDF / 邮件 / 文本</span>
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
                      <span>类型</span>
                      <select value={booking.type} onChange={(event) => updateBooking(booking.id, { type: event.target.value as Booking["type"] })}>
                        {bookingTypes.map((type) => <option key={type} value={type}>{bookingTypeLabels[type]}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>标题</span>
                      <input value={booking.title} onChange={(event) => updateBooking(booking.id, { title: event.target.value })} />
                    </label>
                    <label>
                      <span>编号</span>
                      <input value={booking.confirmationCode ?? ""} onChange={(event) => updateBooking(booking.id, { confirmationCode: event.target.value })} />
                    </label>
                    <label>
                      <span>状态</span>
                      <select value={booking.status} onChange={(event) => updateBooking(booking.id, { status: event.target.value as Booking["status"] })}>
                        {["todo", "confirmed", "checked_in", "cancelled"].map((status) => <option key={status} value={status}>{bookingStatusLabels[status as NonNullable<Booking["status"]>]}</option>)}
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
                      <span>上传文件</span>
                      <input type="file" onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadAttachment(file, booking.id).catch((error) => setSyncError(error instanceof Error ? error.message : "上传失败"));
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
                  <span>添加预订</span>
                </button>
              </div>
            ) : null}

            {activeModule === "files" ? (
              <div className="module-list">
                <div className="import-panel booking-import-panel">
                  <div>
                    <p className="eyebrow">文件中心</p>
                    <strong>旅行证件和收据</strong>
                    <span>上传护照、签证、酒店确认单、景点门票、交通票券、保险和电子收据。</span>
                  </div>
                  <label className="file-upload-button">
                    <FileUp size={17} />
                    <span>上传文件</span>
                    <input
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadAttachment(file).catch((error) => setSyncError(error instanceof Error ? error.message : "上传失败"));
                      }}
                    />
                  </label>
                </div>
                {draft.attachments.map((attachment) => (
                  <article key={attachment.id} className="module-row file-row-editor">
                    <Paperclip size={18} />
                    <label>
                      <span>标题</span>
                      <input value={attachment.title ?? ""} onChange={(event) => updateAttachment(attachment.id, { title: event.target.value })} />
                    </label>
                    <label>
                      <span>分类</span>
                      <select value={attachment.category ?? "other"} onChange={(event) => updateAttachment(attachment.id, { category: event.target.value as Attachment["category"] })}>
                        {attachmentCategories.map((category) => <option key={category} value={category}>{attachmentCategoryLabels[category ?? "other"]}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>关联到</span>
                      <select
                        value={`${attachment.linkedType ?? "trip"}:${attachment.linkedId ?? ""}`}
                        onChange={(event) => {
                          const [linkedType, linkedId] = event.target.value.split(":");
                          updateAttachment(attachment.id, { linkedType: linkedType as Attachment["linkedType"], linkedId: linkedId || undefined });
                        }}
                      >
                        <option value="trip:">整趟旅行</option>
                        {draft.places.map((place) => <option key={place.id} value={`place:${place.id}`}>地点 · {place.name}</option>)}
                        {draft.bookings.map((booking) => <option key={booking.id} value={`booking:${booking.id}`}>预订 · {booking.title}</option>)}
                      </select>
                    </label>
                  </article>
                ))}
                {draft.attachments.length === 0 ? <div className="empty-trip-card">还没有文件。出发前先上传资料。</div> : null}
              </div>
            ) : null}

            {activeModule === "packing" ? (
              <div className="module-list">
                <div className="packing-template-bar">
                  {packingCategories.map((category) => (
                    <button key={category} className="sample-button" type="button" onClick={() => addPackingItem(category)}>
                      <Plus size={15} />
                      <span>{packingCategoryLabels[category ?? "other"]}</span>
                    </button>
                  ))}
                </div>
                {draft.packingItems.map((item) => (
                  <label key={item.id} className="check-row packing-row">
                    <input type="checkbox" checked={item.packed} onChange={(event) => updatePacking(item.id, { packed: event.target.checked })} />
                    <select value={item.category} onChange={(event) => updatePacking(item.id, { category: event.target.value as PackingItem["category"] })}>
                      {packingCategories.map((category) => <option key={category} value={category}>{packingCategoryLabels[category ?? "other"]}</option>)}
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
                      <span>同行人</span>
                      <input value={member.name} onChange={(event) => updateBudgetMember(member.id, { name: event.target.value })} />
                    </label>
                  ))}
                  <button className="new-trip-button" type="button" onClick={addBudgetMember} title="添加同行人" aria-label="添加同行人">
                    <Plus size={18} />
                  </button>
                </div>
                {draft.budgetItems.map((item) => (
                  <article key={item.id} className="module-row budget-row-editor">
                    <label>
                      <span>账单</span>
                      <input value={item.title} onChange={(event) => updateBudgetItem(item.id, { title: event.target.value })} />
                    </label>
                    <label>
                      <span>分类</span>
                      <select value={item.category ?? "other"} onChange={(event) => updateBudgetItem(item.id, { category: event.target.value as BudgetItem["category"] })}>
                        {budgetCategories.map((category) => <option key={category} value={category}>{budgetCategoryLabels[category ?? "other"]}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>金额</span>
                      <input type="number" min={0} step="0.01" value={item.amount} onChange={(event) => updateBudgetItem(item.id, { amount: Number(event.target.value) || 0 })} />
                    </label>
                    <label>
                      <span>币种</span>
                      <input value={item.currency ?? "USD"} onChange={(event) => updateBudgetItem(item.id, { currency: event.target.value.toUpperCase() || "USD" })} />
                    </label>
                    <div className="member-toggle-group">
                      <span>付款人</span>
                      {draft.budgetMembers.map((member) => (
                        <button key={member.id} className={item.paidByMemberIds?.includes(member.id) ? "member-pill active" : "member-pill"} type="button" onClick={() => toggleBudgetMember(item, "paidByMemberIds", member.id)}>
                          {member.name}
                        </button>
                      ))}
                    </div>
                    <div className="member-toggle-group">
                      <span>分摊人</span>
                      {draft.budgetMembers.map((member) => (
                        <button key={member.id} className={item.splitWithMemberIds?.includes(member.id) ? "member-pill active" : "member-pill"} type="button" onClick={() => toggleBudgetMember(item, "splitWithMemberIds", member.id)}>
                          {member.name}
                        </button>
                      ))}
                    </div>
                    <textarea value={item.notes ?? ""} placeholder="备注" onChange={(event) => updateBudgetItem(item.id, { notes: event.target.value })} />
                  </article>
                ))}
                <button className="add-button" type="button" onClick={addBudgetItem}>
                  <Plus size={18} />
                  <span>添加账单</span>
                </button>
                <div className="settlement-panel">
                  <p className="eyebrow">结算</p>
                  {settlements.map((settlement, index) => (
                    <div key={`${settlement.from}-${settlement.to}-${index}`}>
                      <strong>{draft.budgetMembers.find((member) => member.id === settlement.from)?.name}</strong>
                      <span> 付款给 </span>
                      <strong>{draft.budgetMembers.find((member) => member.id === settlement.to)?.name}</strong>
                      <em>{settlement.amount.toFixed(2)} {settlement.currency}</em>
                    </div>
                  ))}
                  {settlements.length === 0 ? <span>暂时还不需要结算。</span> : null}
                </div>
              </div>
            ) : null}

            {activeModule === "ai" ? (
              <div className="ai-workbench">
                <div className="ai-card ai-plan-card">
                  <div className="ai-card-heading">
                    <Sparkles size={20} />
                    <div>
                      <p className="eyebrow">AI 路书</p>
                      <strong>规划一个路书草稿</strong>
                    </div>
                  </div>
                  <textarea
                    value={aiPrompt}
                    placeholder="东京 5 天，第一次去，美食和建筑，节奏轻松，避免长距离转场。"
                    onChange={(event) => setAiPrompt(event.target.value)}
                  />
                  <button className="save-button" type="button" onClick={() => requestAiDraft("plan")} disabled={isAiRunning || !aiPrompt.trim() || !user}>
                    <Sparkles size={18} />
                    <span>{isAiRunning ? "生成中" : "生成草稿"}</span>
                  </button>
                </div>

                <div className="ai-card ai-import-card">
                  <div className="ai-card-heading">
                    <FileUp size={20} />
                    <div>
                      <p className="eyebrow">导入到草稿</p>
                      <strong>把素材整理成路书</strong>
                    </div>
                  </div>
                  <textarea
                    value={aiImportText}
                    placeholder="粘贴订票邮件、备注、复制的行程文本、景点票券或文件 OCR 文本。"
                    onChange={(event) => setAiImportText(event.target.value)}
                  />
                  <div className="ai-import-actions">
                    <label className="file-upload-button">
                      <ImageUp size={18} />
                      <span>{isOcrRunning ? "识别中" : "上传截图识别"}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        disabled={isOcrRunning || isAiRunning || !user}
                        onChange={requestScreenshotOcr}
                      />
                    </label>
                    <button className="sample-button" type="button" onClick={() => requestAiDraft("import")} disabled={isAiRunning || isOcrRunning || !aiImportText.trim() || !user}>
                      <FileUp size={18} />
                      <span>{isAiRunning ? "读取中" : "导入草稿"}</span>
                    </button>
                  </div>
                  {aiScreenshotNames.length ? (
                    <div className="ai-ocr-files" aria-live="polite">
                      {aiScreenshotNames.map((name) => <span key={name}>{name}</span>)}
                    </div>
                  ) : null}
                </div>

                {!user ? <div className="ai-status-card">运行 AI 草稿前请先用 Google 或 Apple 登录。</div> : null}
                {aiError ? <div className="sync-error">{aiError}</div> : null}

                {aiDraftPreview ? (
                  <div className="ai-preview">
                    <div className="ai-preview-heading">
                      <div>
                        <p className="eyebrow">{aiDraftPreview.provider}</p>
                        <strong>{aiDraftPreview.trip.title ?? "AI 路书草稿"}</strong>
                        <span>{aiDraftPreview.trip.destination} · {aiDraftPreview.model}</span>
                      </div>
                      <div className="row-actions">
                        <button className="save-button" type="button" onClick={applyAiDraftPreview}>
                          <CheckSquare size={18} />
                          <span>应用草稿</span>
                        </button>
                        <button className="icon-button" type="button" onClick={() => setAiDraftPreview(null)} title="清除 AI 草稿" aria-label="清除 AI 草稿">
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="ai-day-list">
                      {(aiDraftPreview.trip.days ?? []).map((day) => (
                        <article key={day.id ?? day.date} className="ai-day-preview">
                          <div>
                            <strong>{day.title}</strong>
                            <span>{day.date}</span>
                          </div>
                          {(day.items ?? []).map((item) => (
                            <p key={item.id ?? `${day.date}-${item.title}`}>
                              <b>{item.startTime ?? "--:--"}</b>
                              <span>{item.title}</span>
                              {item.locationName ? <em>{item.locationName}</em> : null}
                              {item.reason ? <small>{item.reason}</small> : null}
                            </p>
                          ))}
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className={aiAssistantOpen ? "ai-assistant open" : "ai-assistant"}>
        <AnimatePresence mode="popLayout">
        {aiAssistantOpen ? (
          <motion.section
            className="ai-assistant-panel"
            aria-label="AI 修改行程"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="ai-assistant-heading">
              <div>
                <p className="eyebrow">AI 修改</p>
                <h2>{aiPatchContext.label}</h2>
              </div>
              <button className="icon-button small" type="button" onClick={() => setAiAssistantOpen(false)} title="关闭 AI 修改" aria-label="关闭 AI 修改">
                <X size={16} />
              </button>
            </div>
            <div className="ai-assistant-prompt">
              <textarea
                value={aiPatchPrompt}
                placeholder="例如：把今天上午排松一点，午餐换成附近更有当地特色的餐厅。"
                onChange={(event) => setAiPatchPrompt(event.target.value)}
              />
              <button className="save-button" type="button" onClick={requestAiPatch} disabled={isAiPatchRunning || !aiPatchPrompt.trim() || !user}>
                <Sparkles size={17} />
                <span>{isAiPatchRunning ? "生成预览..." : "生成修改预览"}</span>
              </button>
            </div>
            {!user ? <div className="ai-assistant-note">登录后可使用 AI 修改行程。</div> : null}
            {aiPatchError ? <div className="sync-error compact">{aiPatchError}</div> : null}
            {aiPatchPreview ? (
              <div className="ai-patch-preview">
                <div className="ai-patch-preview-heading">
                  <div>
                    <strong>{aiPatchPreview.proposal.summary}</strong>
                    <span>{aiPatchPreview.proposal.operations.length ? "勾选要应用的修改" : "没有可应用修改"}</span>
                  </div>
                  <button className="save-button compact" type="button" onClick={applyAiPatchPreview} disabled={!selectedAiPatchOperationIds.length}>
                    <CheckSquare size={16} />
                    <span>应用勾选修改</span>
                  </button>
                </div>
                <div className="ai-operation-list">
                  {aiPatchPreview.proposal.operations.map((operation) => {
                    const description = describeAiPatchOperation(operation, draft);
                    return (
                      <label key={operation.id} className="ai-operation-row">
                        <input
                          type="checkbox"
                          checked={selectedAiPatchOperationIds.includes(operation.id)}
                          onChange={() => toggleAiPatchOperation(operation.id)}
                        />
                        <span>
                          <strong>{operation.summary}</strong>
                          <small>{description.dayTitle}</small>
                          <em>{description.before} → {description.after}</em>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="ai-before-after">
                  <div className="ai-route-column">
                    <strong>修改前</strong>
                    {aiPatchTouchedDayIds.map((dayId) => {
                      const day = draft.days.find((item) => item.id === dayId);
                      if (!day) return null;
                      return (
                        <article key={day.id} className="ai-route-mini-day">
                          <span>{day.title} · {day.date}</span>
                          {day.items.map((item) => <p key={item.id}><b>{item.startTime ?? "--:--"}</b>{item.title}</p>)}
                        </article>
                      );
                    })}
                  </div>
                  <div className="ai-route-column after">
                    <strong>修改后</strong>
                    {aiPatchTouchedDayIds.map((dayId) => {
                      const day = aiPatchPreviewTrip?.days.find((item) => item.id === dayId);
                      if (!day) return null;
                      return (
                        <article key={day.id} className="ai-route-mini-day">
                          <span>{day.title} · {day.date}</span>
                          {day.items.map((item) => <p key={item.id}><b>{item.startTime ?? "--:--"}</b>{item.title}</p>)}
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </motion.section>
        ) : (
          <motion.button
            className="ai-assistant-launcher"
            type="button"
            onClick={() => openAiAssistant({ source: "global", label: "整份路书" })}
            title="AI 修改路书"
            aria-label="AI 修改路书"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={{ y: -2, scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
          >
            <Sparkles size={22} />
          </motion.button>
        )}
        </AnimatePresence>
      </div>

      {showPlanHome ? (
        <div className="panel side-panel">
          <div className="plan-summary-card">
            <strong>{trips.length}</strong>
            <span>{trips.length === 1 ? "本账号 1 本路书" : `本账号 ${trips.length} 本路书`}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
