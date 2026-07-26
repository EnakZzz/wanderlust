import { describe, expect, it } from "vitest";
import { normalizeAiOcrImages, normalizeAiTripDraft } from "./index";

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
          locationName: "Fushimi Inari",
          latitude: 34.9671,
          longitude: 135.7727
        }
      ]
    });

    expect(draft.trip.days).toHaveLength(2);
    expect(draft.trip.days[1]?.items.map((item) => item.title)).toEqual(["Fushimi Inari", "Soba lunch"]);
    expect(draft.trip.days[1]?.items[0]).toMatchObject({
      locationName: "Fushimi Inari",
      latitude: 34.9671,
      longitude: 135.7727
    });
    expect(draft.trip.places[0]).toMatchObject({
      name: "Fushimi Inari",
      latitude: 34.9671,
      longitude: 135.7727
    });
  });

  it("preserves AI placement reasons on normalized itinerary items", () => {
    const draft = normalizeAiTripDraft({
      title: "Tokyo First Visit",
      destination: "Tokyo, Japan",
      startDate: "2026-11-01",
      endDate: "2026-11-01",
      timezone: "Asia/Tokyo",
      items: [
        {
          date: "2026-11-01",
          type: "place",
          title: "Meiji Shrine",
          startTime: "09:00",
          reason: "Starts the morning in a calm open-air area before nearby Harajuku gets crowded.",
          notes: "Check if there is a ceremony."
        }
      ]
    });

    expect(draft.trip.days[0]?.items[0]).toMatchObject({
      title: "Meiji Shrine",
      reason: "Starts the morning in a calm open-air area before nearby Harajuku gets crowded.",
      notes: "Check if there is a ceremony."
    });
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
    ).toThrow("AI 草稿条目的日期超出行程范围");
  });
});

describe("normalizeAiOcrImages", () => {
  const tinyPng = "data:image/png;base64,aGVsbG8=";

  it("accepts supported screenshot data URLs", () => {
    expect(normalizeAiOcrImages([{ name: "flight.png", type: "image/png", dataUrl: tinyPng }])).toEqual([
      {
        name: "flight.png",
        type: "image/png",
        dataUrl: tinyPng,
        byteLength: 5
      }
    ]);
  });

  it("rejects unsupported file types", () => {
    expect(() => normalizeAiOcrImages([{ name: "trip.gif", type: "image/gif", dataUrl: "data:image/gif;base64,aGVsbG8=" }])).toThrow("仅支持 JPG、PNG 或 WebP 截图");
  });

  it("limits screenshot count", () => {
    expect(() => normalizeAiOcrImages(new Array(5).fill({ name: "trip.png", type: "image/png", dataUrl: tinyPng }))).toThrow("一次最多识别 4 张截图");
  });
});
