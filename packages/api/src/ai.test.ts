import { describe, expect, it } from "vitest";
import { normalizeAiTripDraft } from "./index";

describe("normalizeAiTripDraft", () => {
  it("turns a structured AI draft into dated trip days and sorted items", () => {
    const draft = normalizeAiTripDraft({
      title: "Kyoto Autumn",
      destination: "Kyoto, Japan",
      startDate: "2026-10-12",
      endDate: "2026-10-13",
      timezone: "Asia/Tokyo",
      items: [
        {
          date: "2026-10-13",
          type: "food",
          title: "Soba lunch",
          startTime: "12:30",
          notes: "Near Arashiyama"
        },
        {
          date: "2026-10-13",
          type: "place",
          title: "Fushimi Inari",
          startTime: "08:00",
          latitude: 34.9671,
          longitude: 135.7727
        }
      ]
    });

    expect(draft.trip.days).toHaveLength(2);
    expect(draft.trip.days[1]?.items.map((item) => item.title)).toEqual(["Fushimi Inari", "Soba lunch"]);
  });

  it("rejects AI items outside the trip date range", () => {
    expect(() =>
      normalizeAiTripDraft({
        title: "Kyoto Autumn",
        destination: "Kyoto, Japan",
        startDate: "2026-10-12",
        endDate: "2026-10-13",
        timezone: "Asia/Tokyo",
        items: [{ date: "2026-10-14", type: "note", title: "Too late" }]
      })
    ).toThrow("AI draft item date is outside the trip range");
  });
});
