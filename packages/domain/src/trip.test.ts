import { describe, expect, it } from "vitest";
import {
  buildMapsUrl,
  createTripDays,
  getTodayTripDay,
  removeItineraryItem,
  sortItineraryItems,
  TripSchema,
  updateItineraryItem
} from "./index";

describe("TripSchema", () => {
  it("accepts a structured trip with days, items, places, bookings, and entitlements", () => {
    const parsed = TripSchema.parse({
      id: "trip_kyoto",
      ownerId: "user_1",
      title: "Kyoto Autumn",
      destination: "Kyoto, Japan",
      startDate: "2026-10-12",
      endDate: "2026-10-16",
      timezone: "Asia/Tokyo",
      status: "active",
      coverImageUrl: "https://example.com/kyoto.jpg",
      days: [
        {
          id: "day_1",
          tripId: "trip_kyoto",
          date: "2026-10-12",
          title: "Arrival",
          sortOrder: 0,
          items: [
            {
              id: "item_1",
              dayId: "day_1",
              type: "transport",
              title: "Haruka Express",
              startTime: "10:00",
              endTime: "11:20",
              sortOrder: 0,
              notes: "Keep rail pass ready."
            }
          ]
        }
      ],
      places: [
        {
          id: "place_1",
          tripId: "trip_kyoto",
          name: "Fushimi Inari Taisha",
          category: "culture",
          latitude: 34.9671,
          longitude: 135.7727,
          googlePlaceId: "google-place-id"
        }
      ],
      bookings: [],
      attachments: []
    });

    expect(parsed.days[0]?.items[0]?.type).toBe("transport");
  });
});

describe("createTripDays", () => {
  it("creates one dated day for every date in the inclusive trip range", () => {
    expect(createTripDays("trip_1", "2026-10-12", "2026-10-14")).toEqual([
      { id: "trip_1-2026-10-12", tripId: "trip_1", date: "2026-10-12", title: "Day 1", sortOrder: 0, items: [] },
      { id: "trip_1-2026-10-13", tripId: "trip_1", date: "2026-10-13", title: "Day 2", sortOrder: 1, items: [] },
      { id: "trip_1-2026-10-14", tripId: "trip_1", date: "2026-10-14", title: "Day 3", sortOrder: 2, items: [] }
    ]);
  });

  it("rejects an end date before the start date", () => {
    expect(() => createTripDays("trip_1", "2026-10-14", "2026-10-12")).toThrow("endDate must be on or after startDate");
  });
});

describe("sortItineraryItems", () => {
  it("orders fixed-time items first by time, then untimed notes by explicit sort order", () => {
    const sorted = sortItineraryItems([
      { id: "note", dayId: "day_1", type: "note", title: "Pack umbrella", sortOrder: 1 },
      { id: "lunch", dayId: "day_1", type: "food", title: "Lunch", startTime: "12:30", sortOrder: 2 },
      { id: "breakfast", dayId: "day_1", type: "food", title: "Breakfast", startTime: "08:00", sortOrder: 0 }
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["breakfast", "lunch", "note"]);
  });
});

describe("editable itinerary helpers", () => {
  it("updates an itinerary item and keeps the list sorted", () => {
    const updated = updateItineraryItem(
      [
        { id: "late", dayId: "day_1", type: "food", title: "Dinner", startTime: "20:00", sortOrder: 1 },
        { id: "early", dayId: "day_1", type: "place", title: "Temple", startTime: "09:00", sortOrder: 0 }
      ],
      "late",
      { title: "Breakfast market", startTime: "07:30" }
    );

    expect(updated.map((item) => item.id)).toEqual(["late", "early"]);
    expect(updated[0]?.title).toBe("Breakfast market");
  });

  it("removes an itinerary item by id", () => {
    const remaining = removeItineraryItem(
      [
        { id: "keep", dayId: "day_1", type: "place", title: "Temple", sortOrder: 0 },
        { id: "remove", dayId: "day_1", type: "note", title: "Old note", sortOrder: 1 }
      ],
      "remove"
    );

    expect(remaining.map((item) => item.id)).toEqual(["keep"]);
  });
});

describe("getTodayTripDay", () => {
  it("returns the matching trip day for a local ISO date", () => {
    const days = createTripDays("trip_1", "2026-10-12", "2026-10-14");
    expect(getTodayTripDay(days, "2026-10-13")?.title).toBe("Day 2");
  });
});

describe("buildMapsUrl", () => {
  it("builds platform-specific navigation links from coordinates", () => {
    const apple = buildMapsUrl({ latitude: 34.9671, longitude: 135.7727, label: "Fushimi Inari" }, "apple");
    const google = buildMapsUrl({ latitude: 34.9671, longitude: 135.7727, label: "Fushimi Inari" }, "google");

    expect(apple).toBe("http://maps.apple.com/?daddr=34.9671,135.7727&q=Fushimi%20Inari");
    expect(google).toBe("https://www.google.com/maps/dir/?api=1&destination=34.9671,135.7727&destination_place_id=&travelmode=walking");
  });
});
