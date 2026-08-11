import type { TripDraft, TripSummary } from "./types";

const tripStatusLabels: Record<TripDraft["status"] | "published", string> = {
  draft: "草稿",
  active: "进行中",
  archived: "已归档",
  published: "已发布"
};

export function formatTripStatus(status: TripSummary["status"] | TripDraft["status"] | string): string {
  return tripStatusLabels[status as keyof typeof tripStatusLabels] ?? "路书";
}
