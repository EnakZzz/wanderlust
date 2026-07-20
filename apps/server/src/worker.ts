import { TripSchema } from "@wanderlust/domain";

export type Env = {
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
  APP_PUBLIC_URL: string;
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "wanderlust-api" });
      }

      if (request.method === "POST" && url.pathname === "/trips") {
        return createTrip(request, env);
      }

      const tripMatch = url.pathname.match(/^\/trips\/([^/]+)$/);
      if (request.method === "GET" && tripMatch) {
        return getTrip(decodeURIComponent(tripMatch[1]!), env);
      }

      const attachmentMatch = url.pathname.match(/^\/attachments\/(.+)$/);
      if (attachmentMatch) {
        const key = decodeURIComponent(attachmentMatch[1]!);
        if (request.method === "PUT") return putAttachment(key, request, env);
        if (request.method === "GET") return getAttachment(key, env);
        if (request.method === "DELETE") return deleteAttachment(key, env);
      }

      return json({ error: "not_found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "internal_error";
      return json({ error: message }, 400);
    }
  }
};

async function createTrip(request: Request, env: Env): Promise<Response> {
  const trip = TripSchema.parse(await request.json());
  await env.DB.prepare(
    `INSERT INTO trips (id, owner_id, title, destination, status, payload, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       owner_id = excluded.owner_id,
       title = excluded.title,
       destination = excluded.destination,
       status = excluded.status,
       payload = excluded.payload,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(trip.id, trip.ownerId, trip.title, trip.destination, trip.status, JSON.stringify(trip))
    .run();

  return json({ trip }, 201);
}

async function getTrip(id: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare("SELECT payload FROM trips WHERE id = ?").bind(id).first<{ payload: string }>();
  if (!row) {
    return json({ error: "trip_not_found" }, 404);
  }

  return json({ trip: TripSchema.parse(JSON.parse(row.payload)) });
}

async function putAttachment(key: string, request: Request, env: Env): Promise<Response> {
  const body = await request.arrayBuffer();
  await env.ATTACHMENTS.put(key, body, {
    httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" }
  });
  return json({ key, size: body.byteLength }, 201);
}

async function getAttachment(key: string, env: Env): Promise<Response> {
  const object = await env.ATTACHMENTS.get(key);
  if (!object) {
    return json({ error: "attachment_not_found" }, 404);
  }

  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}

async function deleteAttachment(key: string, env: Env): Promise<Response> {
  await env.ATTACHMENTS.delete(key);
  return new Response(null, { status: 204, headers: corsHeaders });
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}
