import { describe, expect, it } from "vitest";
import {
  applyItineraryPatchOperations,
  buildTripEditorPath,
  buildMapsUrl,
  createTripDays,
  getTodayTripDay,
  parseTripIdFromEditorPath,
  removeItineraryItem,
  sortItineraryItems,
  TripSchema,
  getOfflineReadiness,
  updateItineraryItem
} from "./index";

describe("product brand", () => {
  it("uses Chinese routebook-first public naming instead of the internal Wanderlust codename", async () => {
    const { productBrand } = await import("./index");

    expect(productBrand.name).toBe("随身路书");
    expect(productBrand.shortName).toBe("路书");
    expect(productBrand.tagline).toContain("离线执行");
  });
});

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

  it("accepts itinerary item reasons separately from user notes", () => {
    const parsed = TripSchema.parse({
      id: "trip_reason",
      ownerId: "user_1",
      title: "Tokyo First Visit",
      destination: "Tokyo, Japan",
      startDate: "2026-11-01",
      endDate: "2026-11-01",
      timezone: "Asia/Tokyo",
      status: "draft",
      days: [
        {
          id: "day_1",
          tripId: "trip_reason",
          date: "2026-11-01",
          title: "Day 1",
          sortOrder: 0,
          items: [
            {
              id: "item_1",
              dayId: "day_1",
              type: "place",
              title: "Meiji Shrine",
              reason: "Good first stop because it opens early and sits near the next neighborhood.",
              notes: "User wants a quiet start.",
              sortOrder: 0
            }
          ]
        }
      ],
      places: [],
      bookings: [],
      attachments: []
    });

    expect(parsed.days[0]?.items[0]?.reason).toContain("opens early");
    expect(parsed.days[0]?.items[0]?.notes).toBe("User wants a quiet start.");
  });
});

describe("getOfflineReadiness", () => {
  it("summarizes the pre-departure offline package status", () => {
    const readiness = getOfflineReadiness({
      days: createTripDays("trip_1", "2026-10-12", "2026-10-13"),
      places: [{ id: "place_1", tripId: "trip_1", name: "Fushimi Inari", category: "culture", latitude: 34.9671, longitude: 135.7727 }],
      bookings: [],
      attachments: [],
      packingItems: [{ id: "pack_1", tripId: "trip_1", title: "Passport", category: "documents", quantity: 1, packed: true }],
      weather: []
    });

    expect(readiness.readyCount).toBe(3);
    expect(readiness.totalCount).toBe(6);
    expect(readiness.items.map((item) => `${item.key}:${item.ready}`)).toEqual([
      "itinerary:true",
      "places:true",
      "bookings:false",
      "files:false",
      "packing:true",
      "weather:false"
    ]);
  });
});

describe("createTripDays", () => {
  it("creates one dated day for every date in the inclusive trip range", () => {
    expect(createTripDays("trip_1", "2026-10-12", "2026-10-14")).toEqual([
      { id: "trip_1-2026-10-12", tripId: "trip_1", date: "2026-10-12", title: "第 1 天", sortOrder: 0, items: [] },
      { id: "trip_1-2026-10-13", tripId: "trip_1", date: "2026-10-13", title: "第 2 天", sortOrder: 1, items: [] },
      { id: "trip_1-2026-10-14", tripId: "trip_1", date: "2026-10-14", title: "第 3 天", sortOrder: 2, items: [] }
    ]);
  });

  it("rejects an end date before the start date", () => {
    expect(() => createTripDays("trip_1", "2026-10-14", "2026-10-12")).toThrow("结束日期必须晚于或等于开始日期");
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
    expect(getTodayTripDay(days, "2026-10-13")?.title).toBe("第 2 天");
  });
});

describe("routebook editor routes", () => {
  it("uses a path segment containing the trip id for saved trip editor URLs", () => {
    expect(buildTripEditorPath("trip_abc/123")).toBe("/journeys/trip_abc%2F123");
  });

  it("reads the trip id from the path based editor URL", () => {
    expect(parseTripIdFromEditorPath("/journeys/trip_abc%2F123")).toBe("trip_abc/123");
  });
});

describe("applyItineraryPatchOperations", () => {
  function createPatchTrip() {
    return TripSchema.parse({
      id: "trip_patch",
      ownerId: "user_1",
      title: "Kyoto Spring",
      destination: "Kyoto, Japan",
      startDate: "2026-04-01",
      endDate: "2026-04-02",
      timezone: "Asia/Tokyo",
      status: "draft",
      days: [
        {
          id: "day_1",
          tripId: "trip_patch",
          date: "2026-04-01",
          title: "Arrival",
          sortOrder: 0,
          items: [
            { id: "item_arrive", dayId: "day_1", type: "transport", title: "Arrive in Kyoto", startTime: "14:30", sortOrder: 0 },
            { id: "item_dinner", dayId: "day_1", type: "food", title: "Dinner", startTime: "19:00", sortOrder: 1 }
          ]
        },
        {
          id: "day_2",
          tripId: "trip_patch",
          date: "2026-04-02",
          title: "Temples",
          sortOrder: 1,
          items: [
            { id: "item_temple", dayId: "day_2", type: "place", title: "Kiyomizu-dera", startTime: "09:00", sortOrder: 0 }
          ]
        }
      ],
      places: [
        {
          id: "place_hotel",
          tripId: "trip_patch",
          name: "Old Hotel",
          category: "hotel",
          latitude: 35.01,
          longitude: 135.76,
          tags: [],
          isFavorite: false
        }
      ],
      bookings: [
        {
          id: "booking_hotel",
          tripId: "trip_patch",
          type: "hotel",
          title: "Hotel booking",
          status: "todo",
          attachmentIds: [],
          segments: []
        }
      ],
      attachments: [],
      packingItems: [
        {
          id: "pack_passport",
          tripId: "trip_patch",
          title: "Passport",
          category: "documents",
          quantity: 1,
          packed: false
        }
      ],
      budgetItems: [
        {
          id: "budget_hotel",
          tripId: "trip_patch",
          title: "Hotel deposit",
          category: "accommodation",
          amount: 120,
          currency: "USD",
          paidByMemberIds: [],
          splitWithMemberIds: []
        }
      ]
    });
  }

  it("applies only selected itinerary patch operations", () => {
    const trip = createPatchTrip();
    const result = applyItineraryPatchOperations(
      trip,
      [
        {
          id: "op_add",
          type: "add_item",
          summary: "新增咖啡休息",
          dayId: "day_1",
          after: {
            id: "item_coffee",
            dayId: "day_1",
            type: "food",
            title: "Coffee break",
            startTime: "16:00",
            attachmentIds: [],
            sortOrder: 2
          }
        },
        {
          id: "op_update",
          type: "update_item",
          summary: "晚餐改成怀石料理",
          dayId: "day_1",
          itemId: "item_dinner",
          after: { title: "Kaiseki dinner", reason: "A slower dinner keeps the arrival day relaxed." }
        },
        {
          id: "op_unchecked",
          type: "delete_item",
          summary: "删除清水寺",
          dayId: "day_2",
          itemId: "item_temple"
        }
      ],
      ["op_add", "op_update"]
    );

    expect(result.appliedOperationIds).toEqual(["op_add", "op_update"]);
    expect(result.skippedOperationIds).toEqual([]);
    expect(result.trip.days[0]?.items.map((item) => item.id)).toEqual(["item_arrive", "item_dinner", "item_coffee"]);
    expect(result.trip.days[0]?.items.find((item) => item.id === "item_dinner")).toMatchObject({
      title: "Kaiseki dinner",
      reason: "A slower dinner keeps the arrival day relaxed."
    });
    expect(result.trip.days[1]?.items.map((item) => item.id)).toEqual(["item_temple"]);
  });

  it("moves items, updates days, and reports missing targets as skipped", () => {
    const trip = createPatchTrip();
    const result = applyItineraryPatchOperations(
      trip,
      [
        {
          id: "op_move",
          type: "move_item",
          summary: "把晚餐移动到第二天",
          dayId: "day_1",
          itemId: "item_dinner",
          toDayId: "day_2",
          toSortOrder: 1
        },
        {
          id: "op_day",
          type: "update_day",
          summary: "更新第二天标题",
          dayId: "day_2",
          after: { title: "清水寺慢游" }
        },
        {
          id: "op_missing",
          type: "update_item",
          summary: "修改不存在的行程项",
          dayId: "day_2",
          itemId: "missing",
          after: { title: "Missing" }
        }
      ],
      ["op_move", "op_day", "op_missing"]
    );

    expect(result.appliedOperationIds).toEqual(["op_move", "op_day"]);
    expect(result.skippedOperationIds).toEqual(["op_missing"]);
    expect(result.trip.days[0]?.items.map((item) => item.id)).toEqual(["item_arrive"]);
    expect(result.trip.days[1]).toMatchObject({ title: "清水寺慢游" });
    expect(result.trip.days[1]?.items.map((item) => `${item.id}:${item.dayId}:${item.sortOrder}`)).toEqual([
      "item_temple:day_2:0",
      "item_dinner:day_2:1"
    ]);
  });

  it("applies selected module patch operations", () => {
    const trip = createPatchTrip();
    const result = applyItineraryPatchOperations(
      trip,
      [
        {
          id: "op_place",
          type: "update_place",
          summary: "补充酒店地址",
          placeId: "place_hotel",
          after: { name: "Ace Hotel Kyoto", address: "Nakagyo Ward", isFavorite: true }
        },
        {
          id: "op_booking",
          type: "update_booking",
          summary: "确认酒店预订",
          bookingId: "booking_hotel",
          after: { status: "confirmed", confirmationCode: "ABC123" }
        },
        {
          id: "op_pack",
          type: "update_packing",
          summary: "护照已确认",
          packingItemId: "pack_passport",
          after: { packed: true, notes: "Checked before departure." }
        },
        {
          id: "op_budget",
          type: "update_budget_item",
          summary: "更新酒店订金",
          budgetItemId: "budget_hotel",
          after: { amount: 180, currency: "JPY" }
        },
        {
          id: "op_missing_place",
          type: "update_place",
          summary: "修改不存在地点",
          placeId: "missing",
          after: { name: "Missing" }
        }
      ],
      ["op_place", "op_booking", "op_pack", "op_budget", "op_missing_place"]
    );

    expect(result.appliedOperationIds).toEqual(["op_place", "op_booking", "op_pack", "op_budget"]);
    expect(result.skippedOperationIds).toEqual(["op_missing_place"]);
    expect(result.trip.places[0]).toMatchObject({ id: "place_hotel", tripId: "trip_patch", name: "Ace Hotel Kyoto", address: "Nakagyo Ward", isFavorite: true });
    expect(result.trip.bookings[0]).toMatchObject({ id: "booking_hotel", tripId: "trip_patch", status: "confirmed", confirmationCode: "ABC123" });
    expect(result.trip.packingItems[0]).toMatchObject({ id: "pack_passport", tripId: "trip_patch", packed: true, notes: "Checked before departure." });
    expect(result.trip.budgetItems[0]).toMatchObject({ id: "budget_hotel", tripId: "trip_patch", amount: 180, currency: "JPY" });
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
