import { getSessionUser, getUserStorageId, json, type AuthEnv } from "../_auth";

type TripDraftPayload = {
  id?: string;
  title?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  status?: "draft" | "active" | "archived";
};

type TripRow = {
  id: string;
  title: string;
  destination: string;
  status: "draft" | "active" | "archived";
  payload: string;
  updated_at: string;
};

type TripSummary = {
  id: string;
  title: string;
  destination: string;
  status: "draft" | "active" | "archived";
  startDate?: string;
  endDate?: string;
  updatedAt: string;
};

export const onRequest: PagesFunction<AuthEnv> = async ({ request, env, params }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path ?? "");
  const url = new URL(request.url);

  if (url.pathname === "/api/trips" && request.method === "GET") {
    return listTrips(request, env);
  }

  if (url.pathname === "/api/trips" && request.method === "POST") {
    return createTrip(request, env);
  }

  const tripMatch = path.match(/^trips\/([^/]+)$/);
  if (tripMatch && request.method === "GET") {
    return getTrip(request, env, decodeURIComponent(tripMatch[1]!));
  }

  if (tripMatch && request.method === "PUT") {
    return updateTrip(request, env, decodeURIComponent(tripMatch[1]!));
  }

  return json({ error: "not_found" }, 404);
};

async function listTrips(request: Request, env: AuthEnv): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const result = await auth.db.prepare(
    `SELECT id, title, destination, status, payload, updated_at
     FROM trips
     WHERE owner_id = ?
     ORDER BY updated_at DESC`
  )
    .bind(auth.ownerId)
    .all<TripRow>();

  return json({ trips: result.results.map(rowToTripSummary) });
}

async function createTrip(request: Request, env: AuthEnv): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const draft = await request.json<TripDraftPayload>();
  const id = draft.id || `trip_${crypto.randomUUID()}`;
  const title = draft.title?.trim() || "Untitled trip";
  const destination = draft.destination?.trim() || "New destination";
  const status = draft.status ?? "draft";
  const payload = JSON.stringify({ ...draft, id, title, destination, status });

  await auth.db.prepare(
    `INSERT INTO trips (id, owner_id, title, destination, status, payload, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  )
    .bind(id, auth.ownerId, title, destination, status, payload)
    .run();

  return json({ trip: JSON.parse(payload) }, 201);
}

function rowToTripSummary(row: TripRow): TripSummary {
  const payload = JSON.parse(row.payload) as TripDraftPayload;
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    status: row.status,
    startDate: payload.startDate,
    endDate: payload.endDate,
    updatedAt: row.updated_at
  };
}

async function getTrip(request: Request, env: AuthEnv, id: string): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await auth.db.prepare("SELECT payload FROM trips WHERE id = ? AND owner_id = ?").bind(id, auth.ownerId).first<{ payload: string }>();
  if (!row) {
    return json({ error: "trip_not_found" }, 404);
  }

  return json({ trip: JSON.parse(row.payload) });
}

async function updateTrip(request: Request, env: AuthEnv, id: string): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const existing = await auth.db.prepare("SELECT id FROM trips WHERE id = ? AND owner_id = ?").bind(id, auth.ownerId).first<{ id: string }>();
  if (!existing) {
    return json({ error: "trip_not_found" }, 404);
  }

  const draft = await request.json<TripDraftPayload>();
  const title = draft.title?.trim() || "Untitled trip";
  const destination = draft.destination?.trim() || "New destination";
  const status = draft.status ?? "draft";
  const payload = JSON.stringify({ ...draft, id, title, destination, status });

  await auth.db.prepare(
    `UPDATE trips
     SET title = ?, destination = ?, status = ?, payload = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND owner_id = ?`
  )
    .bind(title, destination, status, payload, id, auth.ownerId)
    .run();

  return json({ trip: JSON.parse(payload) });
}

async function requireTripAuth(request: Request, env: AuthEnv): Promise<{ ownerId: string; db: D1Database } | Response> {
  const user = await getSessionUser(request, env);
  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.DB) {
    return json({ error: "database_not_configured" }, 503);
  }

  return { ownerId: getUserStorageId(user), db: env.DB };
}
