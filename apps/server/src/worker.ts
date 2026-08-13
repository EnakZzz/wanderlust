import { Hono } from "hono";
import { cors } from "hono/cors";
import { TripSchema, createPersistedTripId, isPersistedTripId, reassignTripReferences } from "@wanderlust/domain";

export type Env = {
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
  APP_PUBLIC_URL: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], allowHeaders: ["content-type", "authorization"] }));

app.get("/health", (c) => c.json({ ok: true, service: "wanderlust-api" }));

app.post("/trips", async (c) => {
  const env = c.env;
  const parsed = TripSchema.parse(await c.req.json());
  const id = isPersistedTripId(parsed.id) ? parsed.id : createPersistedTripId();
  const trip = TripSchema.parse(reassignTripReferences(parsed, id));
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

  return c.json({ trip }, 201);
});

app.get("/trips/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT payload FROM trips WHERE id = ?").bind(c.req.param("id")).first<{ payload: string }>();
  if (!row) {
    return c.json({ error: "trip_not_found" }, 404);
  }

  return c.json({ trip: TripSchema.parse(JSON.parse(row.payload)) });
});

app.put("/attachments/*", async (c) => {
  const key = c.req.path.slice("/attachments/".length);
  const body = await c.req.arrayBuffer();
  await c.env.ATTACHMENTS.put(key, body, { httpMetadata: { contentType: c.req.header("content-type") ?? "application/octet-stream" } });
  return c.json({ key, size: body.byteLength }, 201);
});

app.get("/attachments/*", async (c) => {
  const key = c.req.path.slice("/attachments/".length);
  const object = await c.env.ATTACHMENTS.get(key);
  if (!object) {
    return c.json({ error: "attachment_not_found" }, 404);
  }

  const headers = new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization"
  });
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

app.delete("/attachments/*", async (c) => {
  const key = c.req.path.slice("/attachments/".length);
  await c.env.ATTACHMENTS.delete(key);
  return new Response(null, { status: 204 });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
