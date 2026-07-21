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
  dayCount: number;
  placeCount: number;
  bookingCount: number;
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

  if (tripMatch && request.method === "DELETE") {
    return deleteTrip(request, env, decodeURIComponent(tripMatch[1]!));
  }

  const attachmentMatch = path.match(/^attachments\/(.+)$/);
  if (attachmentMatch) {
    const key = decodeURIComponent(attachmentMatch[1]!);
    if (request.method === "PUT") return putAttachment(request, env, key);
    if (request.method === "GET") return getAttachment(request, env, key);
    if (request.method === "DELETE") return deleteAttachment(request, env, key);
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
  const payload = JSON.parse(row.payload) as TripDraftPayload & {
    days?: unknown[];
    places?: unknown[];
    bookings?: unknown[];
  };
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    status: row.status,
    startDate: payload.startDate,
    endDate: payload.endDate,
    dayCount: payload.days?.length ?? 0,
    placeCount: payload.places?.length ?? 0,
    bookingCount: payload.bookings?.length ?? 0,
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

async function deleteTrip(request: Request, env: AuthEnv, id: string): Promise<Response> {
  const auth = await requireTripAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await auth.db.prepare("SELECT payload FROM trips WHERE id = ? AND owner_id = ?").bind(id, auth.ownerId).first<{ payload: string }>();
  if (!row) {
    return json({ error: "trip_not_found" }, 404);
  }

  await auth.db.prepare("DELETE FROM trips WHERE id = ? AND owner_id = ?").bind(id, auth.ownerId).run();

  if (env.ATTACHMENTS) {
    const payload = JSON.parse(row.payload) as { attachments?: Array<{ storagePath?: string }> };
    await Promise.all(
      (payload.attachments ?? [])
        .map((attachment) => attachment.storagePath)
        .filter((storagePath): storagePath is string => Boolean(storagePath))
        .map((storagePath) => env.ATTACHMENTS!.delete(buildOwnerAttachmentKey(auth.ownerId, storagePath)))
    );
  }

  return new Response(null, { status: 204 });
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

async function putAttachment(request: Request, env: AuthEnv, key: string): Promise<Response> {
  const auth = await requireStorageAuth(request, env);
  if (auth instanceof Response) return auth;

  const safeKey = buildOwnerAttachmentKey(auth.ownerId, key);
  const body = await request.arrayBuffer();
  await auth.bucket.put(safeKey, body, {
    httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" }
  });

  return json({ key: safeKey, size: body.byteLength }, 201);
}

async function getAttachment(request: Request, env: AuthEnv, key: string): Promise<Response> {
  const auth = await requireStorageAuth(request, env);
  if (auth instanceof Response) return auth;

  const safeKey = buildOwnerAttachmentKey(auth.ownerId, key);
  const object = await auth.bucket.get(safeKey);
  if (!object) {
    return json({ error: "attachment_not_found" }, 404);
  }

  const headers = new Headers({ "cache-control": "private, max-age=300" });
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}

async function deleteAttachment(request: Request, env: AuthEnv, key: string): Promise<Response> {
  const auth = await requireStorageAuth(request, env);
  if (auth instanceof Response) return auth;

  await auth.bucket.delete(buildOwnerAttachmentKey(auth.ownerId, key));
  return new Response(null, { status: 204 });
}

async function requireStorageAuth(request: Request, env: AuthEnv): Promise<{ ownerId: string; bucket: R2Bucket } | Response> {
  const user = await getSessionUser(request, env);
  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.ATTACHMENTS) {
    return json({ error: "attachments_not_configured" }, 503);
  }

  return { ownerId: getUserStorageId(user), bucket: env.ATTACHMENTS };
}

function buildOwnerAttachmentKey(ownerId: string, key: string): string {
  const ownerSegment = ownerId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanKey = key.replace(/^\/+/, "").replace(/\.\./g, "_");
  return `users/${ownerSegment}/${cleanKey}`;
}
