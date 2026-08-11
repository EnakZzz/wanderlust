import { describe, expect, test } from "vitest";
import { isPersistedTripId } from "@wanderlust/domain";
import worker, { type Env } from "./worker";

class MemoryD1 {
  private trips = new Map<string, Record<string, unknown>>();

  prepare(sql: string) {
    const db = this;
    const params: unknown[] = [];
    return {
      bind(...values: unknown[]) {
        params.push(...values);
        return this;
      },
      async first() {
        if (sql.includes("SELECT payload FROM trips WHERE id = ?")) {
          const id = String(params[0]);
          return db.trips.get(id) ?? null;
        }
        return null;
      },
      async run() {
        if (sql.includes("INSERT INTO trips")) {
          db.trips.set(String(params[0]), {
            id: params[0],
            owner_id: params[1],
            title: params[2],
            destination: params[3],
            status: params[4],
            payload: params[5]
          });
        }
        return { success: true };
      }
    };
  }
}

class MemoryR2 {
  private objects = new Map<string, Uint8Array>();

  async put(key: string, value: ArrayBuffer) {
    this.objects.set(key, new Uint8Array(value));
  }

  async get(key: string) {
    const value = this.objects.get(key);
    if (!value) return null;
    return {
      body: value,
      size: value.byteLength,
      httpEtag: "\"memory\"",
      writeHttpMetadata(headers: Headers) {
        headers.set("content-type", "text/plain");
      }
    };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

function createEnv(): Env {
  return {
    DB: new MemoryD1() as unknown as D1Database,
    ATTACHMENTS: new MemoryR2() as unknown as R2Bucket,
    APP_PUBLIC_URL: "https://wanderlust-web.pages.dev"
  };
}

const trip = {
  id: "trip_test",
  ownerId: "user_test",
  title: "Kyoto routebook",
  destination: "Kyoto",
  startDate: "2026-10-12",
  endDate: "2026-10-16",
  timezone: "Asia/Tokyo",
  status: "draft",
  days: [],
  places: [],
  bookings: [],
  attachments: [],
  packingItems: [],
  weather: [],
  budgetMembers: [],
  budgetItems: []
};

describe("wanderlust worker", () => {
  test("returns health status", async () => {
    const response = await worker.fetch(new Request("https://api.example.com/health"), createEnv());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, service: "wanderlust-api" });
  });

  test("stores and returns a trip routebook payload", async () => {
    const env = createEnv();
    const createResponse = await worker.fetch(
      new Request("https://api.example.com/trips", {
        method: "POST",
        body: JSON.stringify(trip),
        headers: { "content-type": "application/json" }
      }),
      env
    );

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { trip: typeof trip };
    expect(isPersistedTripId(created.trip.id)).toBe(true);
    expect(created.trip.id).not.toBe(trip.id);

    const getResponse = await worker.fetch(new Request(`https://api.example.com/trips/${created.trip.id}`), env);
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({ trip: created.trip });
  });

  test("stores and reads attachment bytes through R2", async () => {
    const env = createEnv();
    const putResponse = await worker.fetch(
      new Request("https://api.example.com/attachments/tickets/jr-pass.txt", {
        method: "PUT",
        body: "cached ticket",
        headers: { "content-type": "text/plain" }
      }),
      env
    );

    expect(putResponse.status).toBe(201);
    await expect(putResponse.json()).resolves.toEqual({ key: "tickets/jr-pass.txt", size: 13 });

    const getResponse = await worker.fetch(new Request("https://api.example.com/attachments/tickets/jr-pass.txt"), env);
    expect(getResponse.status).toBe(200);
    await expect(getResponse.text()).resolves.toBe("cached ticket");
  });
});
