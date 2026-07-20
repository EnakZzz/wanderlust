import { describe, expect, it } from "vitest";
import { canViewShare, ShareSchema } from "./index";

describe("ShareSchema", () => {
  it("accepts a routebook share token with visibility and copy policy", () => {
    const share = ShareSchema.parse({
      id: "share_1",
      tripId: "trip_1",
      token: "share-token",
      visibility: "public",
      allowCopy: false,
      revokedAt: null,
      expiresAt: "2026-10-20T00:00:00.000Z"
    });

    expect(share.visibility).toBe("public");
  });
});

describe("canViewShare", () => {
  const activeShare = {
    id: "share_1",
    tripId: "trip_1",
    token: "share-token",
    visibility: "public" as const,
    allowCopy: false,
    revokedAt: null,
    expiresAt: "2026-10-20T00:00:00.000Z"
  };

  it("allows an active public share before expiry", () => {
    expect(canViewShare(activeShare, "2026-10-19T00:00:00.000Z")).toEqual({ allowed: true });
  });

  it("blocks a revoked share", () => {
    expect(canViewShare({ ...activeShare, revokedAt: "2026-10-18T00:00:00.000Z" }, "2026-10-19T00:00:00.000Z")).toEqual({
      allowed: false,
      reason: "share_revoked"
    });
  });

  it("blocks an expired share", () => {
    expect(canViewShare(activeShare, "2026-10-21T00:00:00.000Z")).toEqual({
      allowed: false,
      reason: "share_expired"
    });
  });

  it("requires a member session for private shares", () => {
    expect(canViewShare({ ...activeShare, visibility: "private" }, "2026-10-19T00:00:00.000Z")).toEqual({
      allowed: false,
      reason: "share_private"
    });
  });
});
