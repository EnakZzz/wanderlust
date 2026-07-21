import type { Attachment, Booking, BudgetItem, PackingItem, Place } from "@wanderlust/domain";

import type { EditorModule } from "./types";

export const storageKey = "wanderlust.editorDraft.v2";
export const offlineStorageKey = "wanderlust.offlineBundles.v1";

export const moduleCopy: Record<EditorModule, string> = {
  itinerary: "Build the day-by-day routebook that the phone app will use offline.",
  places: "Store places once, then reuse them across itinerary, map, weather, and navigation.",
  map: "Use coordinates to preview the trip shape and open external navigation/search.",
  bookings: "Keep confirmations and uploaded files connected to the current plan.",
  files: "Keep passports, visas, tickets, insurance, receipts, and confirmations available in one center.",
  packing: "Track documents, clothing, electronics, health, money, toiletries, and custom items.",
  budget: "Record who paid and who split each expense, then calculate settlement suggestions."
};

export const placeCategories: Place["category"][] = ["culture", "nature", "food", "architecture", "hotel", "transport", "shopping", "other"];
export const bookingTypes: Booking["type"][] = ["flight", "hotel", "train", "restaurant", "ticket", "car", "other"];
export const packingCategories: PackingItem["category"][] = ["documents", "clothing", "electronics", "health", "money", "toiletries", "other"];
export const attachmentCategories: Attachment["category"][] = ["passport", "visa", "hotel", "ticket", "transport", "insurance", "receipt", "other"];
export const budgetCategories: BudgetItem["category"][] = ["accommodation", "transport", "food", "tickets", "shopping", "other"];
