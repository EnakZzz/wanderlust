import { useQuery } from "@tanstack/react-query";
import type { Trip } from "@wanderlust/domain";
import type { DestinationMeta, RoutebookShare, SessionUser, TripDraft, TripSummary } from "@/app/routebook/types";

export type ProviderStatus = {
  google: { configured: boolean };
  apple: { configured: boolean };
};

export type PublicShare = {
  id: string;
  tripId: string;
  token: string;
  visibility: "public" | "private";
  allowCopy: boolean;
  revokedAt: string | null;
  expiresAt: string | null;
};

export type PublicShareResponse = {
  share: PublicShare;
  trip: Trip;
};

export const fallbackProviders: ProviderStatus = {
  google: { configured: false },
  apple: { configured: false }
};

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  let payload: (T & { error?: string; message?: string }) | null = null;
  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      payload = await response.json() as T & { error?: string; message?: string };
    } catch {
      payload = null;
    }
  }

  if (!response.ok) throw new Error(payload?.message || payload?.error || fallbackMessage);
  if (!payload) throw new Error(fallbackMessage);
  return payload;
}

export async function readSession(): Promise<SessionUser | null> {
  const response = await fetch("/auth/session", { credentials: "include" });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return null;
  const session = (await response.json()) as { user?: SessionUser | null };
  return session.user ?? null;
}

export async function readAuthConfig(): Promise<ProviderStatus> {
  const response = await fetch("/auth/config");
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return fallbackProviders;
  const config = (await response.json()) as { providers?: ProviderStatus };
  return config.providers ?? fallbackProviders;
}

export async function readTrips(): Promise<TripSummary[]> {
  const response = await fetch("/api/trips", { credentials: "include" });
  if (!response.ok) throw new Error("无法加载路书");
  const payload = (await response.json()) as { trips: TripSummary[] };
  return payload.trips;
}

export async function readTrip(tripId: string): Promise<TripDraft> {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, { credentials: "include" });
  if (!response.ok) throw new Error("无法打开路书");
  const payload = (await response.json()) as { trip: TripDraft };
  return payload.trip;
}

export async function saveTrip(trip: TripDraft, existing: boolean): Promise<TripDraft> {
  const response = await fetch(existing ? `/api/trips/${encodeURIComponent(trip.id)}` : "/api/trips", {
    method: existing ? "PUT" : "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(trip)
  });
  if (!response.ok) throw new Error("无法保存路书");
  const payload = (await response.json()) as { trip: TripDraft };
  return payload.trip;
}

export async function removeTrip(tripId: string): Promise<void> {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) throw new Error("无法删除路书");
}

export async function createTripShare(tripId: string): Promise<RoutebookShare> {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/share`, {
    method: "POST",
    credentials: "include"
  });
  const payload = await readJson<{ share: RoutebookShare | null }>(response, "无法创建分享链接");
  if (!payload.share) throw new Error("无法创建分享链接");
  return payload.share;
}

export async function deleteShare(shareId: string): Promise<void> {
  const response = await fetch(`/api/shares/${encodeURIComponent(shareId)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) throw new Error("无法取消分享");
}

export async function uploadAttachmentBlob(relativeKey: string, file: File): Promise<void> {
  const response = await fetch(`/api/attachments/${encodeURIComponent(relativeKey)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file
  });
  if (!response.ok) throw new Error("无法上传附件");
}

export async function searchDestinations(query: string, signal?: AbortSignal): Promise<{ candidates: DestinationMeta[]; providerError?: string }> {
  const response = await fetch(`/api/geo/search?q=${encodeURIComponent(query)}`, { signal });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("API Worker 启动后才能使用目的地搜索。");
  }
  return readJson<{ candidates: DestinationMeta[]; providerError?: string }>(response, "无法搜索目的地");
}

export async function requestAiDraftPayload<TResponse>(mode: "plan" | "import", body: unknown): Promise<TResponse> {
  const response = await fetch(`/api/ai/${mode}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJson<TResponse>(response, "AI 草稿生成失败");
}

export async function requestAiPatchPayload<TResponse>(body: unknown): Promise<TResponse> {
  const response = await fetch("/api/ai/patch", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJson<TResponse>(response, "AI 修改预览生成失败");
}

export async function requestAiOcrPayload<TResponse>(body: unknown): Promise<TResponse> {
  const response = await fetch("/api/ai/ocr", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJson<TResponse>(response, "截图识别失败");
}

export async function readPublicShare(token: string): Promise<PublicShareResponse> {
  const response = await fetch(`/api/share/${encodeURIComponent(token)}`);
  return readJson<PublicShareResponse>(response, "无法打开分享路书");
}

export function useSessionQuery() {
  return useQuery({
    queryKey: ["session"],
    queryFn: readSession
  });
}

export function useAuthConfigQuery() {
  return useQuery({
    queryKey: ["auth-config"],
    queryFn: readAuthConfig
  });
}

export function useTripsQuery(enabled = true) {
  return useQuery({
    queryKey: ["trips"],
    queryFn: readTrips,
    enabled
  });
}

export function useDashboardData() {
  const session = useSessionQuery();
  const trips = useTripsQuery(Boolean(session.data));
  const error = session.error ?? trips.error;
  return {
    user: session.data ?? null,
    trips: trips.data ?? [],
    loaded: !session.isLoading && (!session.data || !trips.isLoading),
    isLoading: session.isLoading || (Boolean(session.data) && trips.isLoading),
    error,
    errorMessage: error instanceof Error ? error.message : error ? "无法加载数据" : undefined
  };
}
