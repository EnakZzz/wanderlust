import { describe, expect, it } from "vitest";
import {
  canAddCollaborator,
  canCreateAiJob,
  canKeepOfflineTrip,
  EntitlementSchema
} from "./index";

describe("EntitlementSchema", () => {
  it("accepts a subscription entitlement synced from the billing backend", () => {
    const entitlement = EntitlementSchema.parse({
      userId: "user_1",
      plan: "pro",
      status: "active",
      aiJobsUsedThisPeriod: 4,
      aiJobsLimit: 100,
      storageBytesUsed: 1024,
      storageBytesLimit: 10_000_000,
      collaboratorLimit: 10,
      offlineTripLimit: 6
    });

    expect(entitlement.plan).toBe("pro");
  });
});

describe("entitlement gates", () => {
  const free = {
    userId: "user_1",
    plan: "free" as const,
    status: "active" as const,
    aiJobsUsedThisPeriod: 2,
    aiJobsLimit: 2,
    storageBytesUsed: 0,
    storageBytesLimit: 100_000_000,
    collaboratorLimit: 1,
    offlineTripLimit: 1
  };

  it("blocks AI jobs when the period quota is exhausted", () => {
    expect(canCreateAiJob(free)).toEqual({ allowed: false, reason: "ai_quota_exhausted" });
  });

  it("allows AI jobs for an active subscriber with remaining quota", () => {
    expect(canCreateAiJob({ ...free, plan: "pro", aiJobsUsedThisPeriod: 9, aiJobsLimit: 100 })).toEqual({ allowed: true });
  });

  it("blocks extra collaborators at the plan limit", () => {
    expect(canAddCollaborator(free, 1)).toEqual({ allowed: false, reason: "collaborator_limit_reached" });
  });

  it("blocks keeping more offline trips than the plan allows", () => {
    expect(canKeepOfflineTrip(free, 1)).toEqual({ allowed: false, reason: "offline_trip_limit_reached" });
  });
});
