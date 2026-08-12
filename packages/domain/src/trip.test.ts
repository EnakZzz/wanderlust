import { describe, expect, it } from "vitest";
import {
  applyItineraryPatchOperations,
  buildGoogleMapsPlaceUrl,
  buildTripEditorPath,
  buildMapsUrl,
  createPersistedTripId,
  createTripDays,
  enforceAiPatchContext,
  getTodayTripDay,
  isPersistedTripId,
  parseTripIdFromEditorPath,
  reassignTripReferences,
  removeItineraryItem,
  sortItineraryItems,
  TripSchema,
  getOfflineReadiness,
  updateItineraryItem,
  type AiItineraryPatchOperation
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
      days: [
        {
          ...createTripDays("trip_1", "2026-10-12", "2026-10-12")[0]!,
          items: [
            {
              id: "item_1",
              dayId: "trip_1-2026-10-12",
              type: "activity",
              title: "Fushimi Inari",
              sortOrder: 0,
              attachmentIds: []
            }
          ]
        },
        ...createTripDays("trip_1", "2026-10-13", "2026-10-13")
      ],
      places: [{ id: "place_1", tripId: "trip_1", name: "Fushimi Inari", category: "culture", latitude: 34.9671, longitude: 135.7727 }],
      bookings: [],
      attachments: [],
      packingItems: [{ id: "pack_1", tripId: "trip_1", title: "Passport", category: "documents", quantity: 1, packed: true }],
      weather: []
    });

    expect(readiness.readyCount).toBe(3);
    expect(readiness.totalCount).toBe(5);
    expect(readiness.items.map((item) => `${item.key}:${item.ready}`)).toEqual([
      "itinerary:true",
      "places:true",
      "bookings:false",
      "files:false",
      "packing:true"
    ]);
  });

  it("does not mark an empty dated itinerary as ready", () => {
    const readiness = getOfflineReadiness({
      days: createTripDays("trip_1", "2026-10-12", "2026-10-13"),
      places: [],
      bookings: [],
      attachments: [],
      packingItems: [],
      weather: []
    });

    expect(readiness.readyCount).toBe(0);
    expect(readiness.items.find((item) => item.key === "itinerary")).toMatchObject({
      ready: false,
      count: 0
    });
  });

  it("does not mark placeholder places without usable coordinates as ready", () => {
    const readiness = getOfflineReadiness({
      days: [],
      places: [{ id: "place_1", tripId: "trip_1", name: "New place", category: "other", latitude: 0, longitude: 0 }],
      bookings: [],
      attachments: [],
      packingItems: [],
      weather: []
    });

    expect(readiness.readyCount).toBe(0);
    expect(readiness.items.find((item) => item.key === "places")).toMatchObject({
      ready: false,
      count: 0
    });
  });

  it("does not mark placeholder bookings without confirmation details as ready", () => {
    const readiness = getOfflineReadiness({
      days: [],
      places: [],
      bookings: [{ id: "booking_1", tripId: "trip_1", type: "ticket", title: "新的预订", status: "todo", attachmentIds: [], segments: [] }],
      attachments: [],
      packingItems: [],
      weather: []
    });

    expect(readiness.readyCount).toBe(0);
    expect(readiness.items.find((item) => item.key === "bookings")).toMatchObject({
      ready: false,
      count: 0
    });
  });

  it("marks bookings with confirmation details as ready", () => {
    const readiness = getOfflineReadiness({
      days: [],
      places: [],
      bookings: [{ id: "booking_1", tripId: "trip_1", type: "hotel", title: "Hotel Niwa", status: "confirmed", confirmationCode: "ABC123", attachmentIds: [], segments: [] }],
      attachments: [],
      packingItems: [],
      weather: []
    });

    expect(readiness.items.find((item) => item.key === "bookings")).toMatchObject({
      ready: true,
      count: 1
    });
  });

  it("does not mark attachments without a retrievable file reference as ready", () => {
    const readiness = getOfflineReadiness({
      days: [],
      places: [],
      bookings: [],
      attachments: [{ id: "file_1", tripId: "trip_1", type: "pdf", category: "ticket", linkedType: "trip", title: "Ticket PDF" } as never],
      packingItems: [],
      weather: []
    });

    expect(readiness.readyCount).toBe(0);
    expect(readiness.items.find((item) => item.key === "files")).toMatchObject({
      ready: false,
      count: 0
    });
  });

  it("marks attachments with a retrievable file reference as ready", () => {
    const readiness = getOfflineReadiness({
      days: [],
      places: [],
      bookings: [],
      attachments: [{ id: "file_1", tripId: "trip_1", type: "pdf", category: "ticket", linkedType: "trip", storagePath: "tickets/ticket.pdf", title: "Ticket PDF" }],
      packingItems: [],
      weather: []
    });

    expect(readiness.items.find((item) => item.key === "files")).toMatchObject({
      ready: true,
      count: 1
    });
  });

  it("does not mark unnamed packed items as ready", () => {
    const readiness = getOfflineReadiness({
      days: [],
      places: [],
      bookings: [],
      attachments: [],
      packingItems: [{ id: "pack_1", tripId: "trip_1", title: "   ", category: "documents", quantity: 1, packed: true }],
      weather: []
    });

    expect(readiness.readyCount).toBe(0);
    expect(readiness.items.find((item) => item.key === "packing")).toMatchObject({
      ready: false,
      count: 0
    });
  });

  it("marks named packed items as ready", () => {
    const readiness = getOfflineReadiness({
      days: [],
      places: [],
      bookings: [],
      attachments: [],
      packingItems: [{ id: "pack_1", tripId: "trip_1", title: "Passport", category: "documents", quantity: 1, packed: true }],
      weather: []
    });

    expect(readiness.items.find((item) => item.key === "packing")).toMatchObject({
      ready: true,
      count: 1
    });
  });

  it("does not block readiness on weather when no forecast has been generated", () => {
    const readiness = getOfflineReadiness({
      days: [],
      places: [],
      bookings: [],
      attachments: [],
      packingItems: [],
      weather: []
    });

    expect(readiness.totalCount).toBe(5);
    expect(readiness.items.map((item) => item.key)).not.toContain("weather");
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
  it("creates persisted trip ids with a UUID payload", () => {
    const id = createPersistedTripId(() => "123e4567-e89b-42d3-a456-426614174000");
    expect(id).toBe("trip_123e4567-e89b-42d3-a456-426614174000");
    expect(isPersistedTripId(id)).toBe(true);
    expect(isPersistedTripId("local_draft")).toBe(false);
    expect(isPersistedTripId("trip_ai_draft")).toBe(false);
  });

  it("reassigns trip-scoped references when a draft becomes a persisted routebook", () => {
    const trip = TripSchema.parse({
      id: "trip_ai_draft",
      ownerId: "ai_preview",
      title: "AI draft",
      destination: "Kyoto",
      startDate: "2026-04-01",
      endDate: "2026-04-01",
      timezone: "Asia/Tokyo",
      status: "draft",
      days: [{
        id: "trip_ai_draft-2026-04-01",
        tripId: "trip_ai_draft",
        date: "2026-04-01",
        title: "第 1 天",
        sortOrder: 0,
        items: [{ id: "item_1", dayId: "trip_ai_draft-2026-04-01", type: "place", title: "Temple", sortOrder: 0 }]
      }],
      places: [{ id: "place_1", tripId: "trip_ai_draft", name: "Temple", category: "culture", latitude: 35, longitude: 135 }],
      bookings: [{ id: "booking_1", tripId: "trip_ai_draft", dayId: "trip_ai_draft-2026-04-01", type: "ticket", title: "Ticket", status: "todo", attachmentIds: [] }],
      attachments: [{ id: "file_1", tripId: "trip_ai_draft", type: "pdf", title: "Ticket PDF", storagePath: "tickets/ticket.pdf" }],
      packingItems: [{ id: "pack_1", tripId: "trip_ai_draft", title: "Passport", category: "documents", quantity: 1, packed: false }],
      weather: [{ dayId: "trip_ai_draft-2026-04-01", date: "2026-04-01", summary: "Clear" }],
      budgetMembers: [{ id: "member_1", tripId: "trip_ai_draft", name: "Me" }],
      budgetItems: [{ id: "budget_1", tripId: "trip_ai_draft", title: "Lunch", amount: 20, currency: "JPY", paidByMemberIds: [], splitWithMemberIds: [] }],
      offlineBundle: { tripId: "trip_ai_draft", version: 1, generatedAt: "2026-01-01T00:00:00.000Z", includes: { itinerary: true, places: true, bookings: true, attachments: true, packing: true, weather: true } }
    });

    const next = TripSchema.parse(reassignTripReferences(trip, "trip_123e4567-e89b-42d3-a456-426614174000", "user_1"));
    expect(next.ownerId).toBe("user_1");
    expect(next.days[0]?.id).toBe("trip_123e4567-e89b-42d3-a456-426614174000-2026-04-01");
    expect(next.days[0]?.tripId).toBe(next.id);
    expect(next.days[0]?.items[0]?.dayId).toBe(next.days[0]?.id);
    expect(next.places[0]?.tripId).toBe(next.id);
    expect(next.bookings[0]).toMatchObject({ tripId: next.id, dayId: next.days[0]?.id });
    expect(next.weather[0]?.dayId).toBe(next.days[0]?.id);
    expect(next.offlineBundle?.tripId).toBe(next.id);
  });

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
      attachments: [
        {
          id: "file_hotel",
          tripId: "trip_patch",
          type: "pdf",
          category: "hotel",
          linkedType: "booking",
          linkedId: "booking_hotel",
          storagePath: "attachments/hotel.pdf",
          title: "Hotel PDF"
        }
      ],
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
          id: "op_attachment",
          type: "update_attachment",
          summary: "整理酒店确认单",
          attachmentId: "file_hotel",
          after: { title: "Ace Hotel confirmation", category: "hotel", linkedType: "booking", linkedId: "booking_hotel" }
        },
        {
          id: "op_missing_place",
          type: "update_place",
          summary: "修改不存在地点",
          placeId: "missing",
          after: { name: "Missing" }
        }
      ],
      ["op_place", "op_booking", "op_pack", "op_budget", "op_attachment", "op_missing_place"]
    );

    expect(result.appliedOperationIds).toEqual(["op_place", "op_booking", "op_pack", "op_budget", "op_attachment"]);
    expect(result.skippedOperationIds).toEqual(["op_missing_place"]);
    expect(result.trip.places[0]).toMatchObject({ id: "place_hotel", tripId: "trip_patch", name: "Ace Hotel Kyoto", address: "Nakagyo Ward", isFavorite: true });
    expect(result.trip.bookings[0]).toMatchObject({ id: "booking_hotel", tripId: "trip_patch", status: "confirmed", confirmationCode: "ABC123" });
    expect(result.trip.packingItems[0]).toMatchObject({ id: "pack_passport", tripId: "trip_patch", packed: true, notes: "Checked before departure." });
    expect(result.trip.budgetItems[0]).toMatchObject({ id: "budget_hotel", tripId: "trip_patch", amount: 180, currency: "JPY" });
    expect(result.trip.attachments[0]).toMatchObject({ id: "file_hotel", tripId: "trip_patch", storagePath: "attachments/hotel.pdf", title: "Ace Hotel confirmation", linkedId: "booking_hotel" });
  });

  it("filters AI patch operations to the active day context", () => {
    const proposal = {
      id: "proposal_day",
      summary: "优化当天行程",
      operations: [
        {
          id: "op_keep",
          type: "update_item",
          summary: "更新第一天晚餐",
          dayId: "day_1",
          itemId: "item_dinner",
          after: { title: "Slow dinner" }
        },
        {
          id: "op_drop",
          type: "update_place",
          summary: "越界修改地点",
          placeId: "place_hotel",
          after: { name: "Other hotel" }
        }
      ] satisfies AiItineraryPatchOperation[]
    };

    const scoped = enforceAiPatchContext(proposal, { source: "day", dayId: "day_1" });
    expect(scoped.operations.map((operation) => operation.id)).toEqual(["op_keep"]);
    expect(scoped.summary).toContain("已移除 1 项");
  });

  it("filters AI patch operations to the active module context", () => {
    const proposal = {
      id: "proposal_module",
      summary: "优化预订",
      operations: [
        {
          id: "op_booking",
          type: "update_booking",
          summary: "确认酒店",
          bookingId: "booking_hotel",
          after: { status: "confirmed" }
        },
        {
          id: "op_budget",
          type: "update_budget_item",
          summary: "越界修改预算",
          budgetItemId: "budget_hotel",
          after: { amount: 200 }
        }
      ] satisfies AiItineraryPatchOperation[]
    };

    const scoped = enforceAiPatchContext(proposal, { source: "module", moduleId: "bookings" });
    expect(scoped.operations.map((operation) => operation.id)).toEqual(["op_booking"]);
  });

  it("filters AI patch operations to the selected entity context", () => {
    const proposal = {
      id: "proposal_entity",
      summary: "优化文件",
      operations: [
        {
          id: "op_file",
          type: "update_attachment",
          summary: "整理酒店确认单",
          attachmentId: "file_hotel",
          after: { title: "Ace Hotel confirmation" }
        },
        {
          id: "op_other_file",
          type: "update_attachment",
          summary: "越界整理其他文件",
          attachmentId: "file_other",
          after: { title: "Other file" }
        }
      ] satisfies AiItineraryPatchOperation[]
    };

    const scoped = enforceAiPatchContext(proposal, { source: "entity", entityType: "attachment", entityId: "file_hotel" });
    expect(scoped.operations.map((operation) => operation.id)).toEqual(["op_file"]);
  });

  it("returns an empty scoped proposal when every operation is outside the edit context", () => {
    const proposal = {
      id: "proposal_empty",
      summary: "越界修改",
      operations: [
        {
          id: "op_place",
          type: "update_place",
          summary: "改地点",
          placeId: "place_hotel",
          after: { name: "Other hotel" }
        }
      ] satisfies AiItineraryPatchOperation[]
    };

    const scoped = enforceAiPatchContext(proposal, { source: "entity", entityType: "booking", entityId: "booking_hotel" });
    expect(scoped.operations).toEqual([]);
    expect(scoped.summary).toContain("已全部拦截");
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

describe("buildGoogleMapsPlaceUrl", () => {
  it("builds Google Maps place display links instead of navigation routes", () => {
    const href = buildGoogleMapsPlaceUrl({
      latitude: 34.9671,
      longitude: 135.7727,
      label: "Fushimi Inari",
      googlePlaceId: "ChIJBSFD3ur_AWARsrB-oN69U5w"
    });

    expect(href).toBe("https://www.google.com/maps/search/?api=1&query=Fushimi+Inari+34.9671%2C135.7727&query_place_id=ChIJBSFD3ur_AWARsrB-oN69U5w");
    expect(href).not.toContain("/maps/dir/");
  });
});
