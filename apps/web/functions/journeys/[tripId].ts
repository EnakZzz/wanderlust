type JourneyRouteEnv = {
  ASSETS: Fetcher;
};

export const onRequestGet: PagesFunction<JourneyRouteEnv> = async ({ request, env, params }) => {
  const rawTripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const tripId = String(rawTripId ?? "").trim();
  const requestUrl = new URL(request.url);
  const assetUrl = new URL("/journeys/edit", requestUrl.origin);

  requestUrl.searchParams.forEach((value, key) => {
    assetUrl.searchParams.append(key, value);
  });

  if (tripId && tripId !== "edit" && !assetUrl.searchParams.has("tripId")) {
    assetUrl.searchParams.set("tripId", tripId);
  }

  return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
};
