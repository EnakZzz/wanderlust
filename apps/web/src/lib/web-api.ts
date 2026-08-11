import { useQuery } from "@tanstack/react-query";
import type { SessionUser, TripSummary } from "@/app/routebook/types";

export type ProviderStatus = {
  google: { configured: boolean };
  apple: { configured: boolean };
};

export const fallbackProviders: ProviderStatus = {
  google: { configured: false },
  apple: { configured: false }
};

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
