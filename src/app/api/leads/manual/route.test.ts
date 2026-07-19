import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock               = vi.fn();
const userFindUnique         = vi.fn();
const orgFindUnique          = vi.fn();
const entitlementUpsert      = vi.fn();
const processRetailerProduct = vi.fn();
const broadcastLeadsMock     = vi.fn();
const getWeeklyLeadUsageMock = vi.fn();

vi.mock("@/lib/auth",   () => ({ auth: () => authMock() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user:            { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    organization:    { findUnique: (...a: unknown[]) => orgFindUnique(...a) },
    leadEntitlement: { upsert:     (...a: unknown[]) => entitlementUpsert(...a) },
  },
}));
vi.mock("@/services/pipeline", () => ({
  processRetailerProduct: (...a: unknown[]) => processRetailerProduct(...a),
}));
vi.mock("@/services/broadcast", () => ({
  broadcastLeads: (...a: unknown[]) => broadcastLeadsMock(...a),
}));
vi.mock("@/lib/lead-delivery", () => ({
  getCurrentDeliveryWeekStart: () => new Date("2026-07-20T13:00:00Z"),
  getWeeklyLeadUsage:          (...a: unknown[]) => getWeeklyLeadUsageMock(...a),
}));

import { POST } from "./route";

const SOURCE_SESSION  = { user: { id: "u1", role: "OWNER", orgId: "source-org",   plan: "ENTERPRISE" } };
const CUST_SESSION    = { user: { id: "u2", role: "OWNER", orgId: "cust-org-1",   plan: "PRO" } };
const STARTER_SESSION = { user: { id: "u3", role: "OWNER", orgId: "cust-starter", plan: "STARTER" } };

function makeBody(overrides = {}) {
  return {
    amazonUrl:   "https://www.amazon.com/dp/B001BASIC01",
    retailerUrl: "https://www.walmart.com/ip/test/123456",
    retailer:    "Walmart",
    sourcePrice: 10,
    ...overrides,
  };
}

function makePost(body = {}) {
  return new NextRequest("http://localhost/api/leads/manual", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(makeBody(body)),
  });
}

describe("POST /api/leads/manual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlementUpsert.mockResolvedValue({});
    broadcastLeadsMock.mockResolvedValue(1);
    getWeeklyLeadUsageMock.mockResolvedValue(0);
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makePost());
    expect(res.status).toBe(401);
  });

  it("returns 403 when non-OWNER user lacks canManualLead", async () => {
    authMock.mockResolvedValue({ user: { id: "u2", role: "ADMIN", orgId: "cust-org-1", plan: "PRO" } });
    userFindUnique.mockResolvedValue({ canManualLead: false });
    const res = await POST(makePost());
    expect(res.status).toBe(403);
  });

  it("returns 400 for bad ASIN URL", async () => {
    authMock.mockResolvedValue(CUST_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false, plan: "PRO" });
    const res = await POST(makePost({ amazonUrl: "https://www.amazon.com/not-a-dp-link" }));
    expect(res.status).toBe(400);
  });

  it("source org manual lead is added to source pool only — no immediate broadcast", async () => {
    authMock.mockResolvedValue(SOURCE_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: true, plan: "ENTERPRISE" });
    processRetailerProduct.mockResolvedValue({ outcome: "lead_created", leadId: "src-lead-1", score: 85 });

    const res  = await POST(makePost());
    const body = await res.json();
    expect(res.status).toBe(200);
    // Must NOT call broadcastLeads — source manual leads go to the pool, not customers
    expect(broadcastLeadsMock).not.toHaveBeenCalled();
    // Must NOT create an entitlement for the source org itself
    expect(entitlementUpsert).not.toHaveBeenCalled();
    // Response has no broadcast field
    expect(body).not.toHaveProperty("broadcast");
    expect(body.ok).toBe(true);
  });

  it("source org manual lead does not create entitlement for itself", async () => {
    authMock.mockResolvedValue(SOURCE_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: true, plan: "ENTERPRISE" });
    processRetailerProduct.mockResolvedValue({ outcome: "lead_created", leadId: "src-lead-1", score: 85 });

    await POST(makePost());
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it("source org is never blocked by weekly quota check", async () => {
    authMock.mockResolvedValue(SOURCE_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: true, plan: "ENTERPRISE" });
    processRetailerProduct.mockResolvedValue({ outcome: "lead_created", leadId: "src-lead-1", score: 85 });
    getWeeklyLeadUsageMock.mockResolvedValue(9999);

    const res = await POST(makePost());
    expect(res.status).toBe(200);
    expect(getWeeklyLeadUsageMock).not.toHaveBeenCalled();
  });

  it("customer org: creates CUSTOMER_MANUAL entitlement after lead creation", async () => {
    authMock.mockResolvedValue(CUST_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false, plan: "PRO" });
    processRetailerProduct.mockResolvedValue({ outcome: "lead_created", leadId: "cust-lead-1", score: 80 });

    const res  = await POST(makePost());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(entitlementUpsert).toHaveBeenCalledOnce();
    const call = entitlementUpsert.mock.calls[0][0];
    expect(call.create.orgId).toBe("cust-org-1");
    expect(call.create.leadId).toBe("cust-lead-1");
    expect(call.create.deliverySource).toBe("CUSTOMER_MANUAL");
    expect(call.create.countsTowardWeeklyLimit).toBe(true);
    expect(call.create.leadTierAtDelivery).toBe("BASIC");
    expect(body).not.toHaveProperty("broadcast"); // customer leads are private, no broadcast field
  });

  it("customer org: does not broadcast to other orgs", async () => {
    authMock.mockResolvedValue(CUST_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false, plan: "PRO" });
    processRetailerProduct.mockResolvedValue({ outcome: "lead_created", leadId: "cust-lead-1", score: 80 });

    await POST(makePost());
    expect(broadcastLeadsMock).not.toHaveBeenCalled();
  });

  it("customer org: returns 429 when weekly limit is reached", async () => {
    authMock.mockResolvedValue(STARTER_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false, plan: "STARTER" });
    getWeeklyLeadUsageMock.mockResolvedValue(3);

    const res  = await POST(makePost());
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.error).toMatch(/weekly lead limit/i);
    expect(processRetailerProduct).not.toHaveBeenCalled();
  });

  it("customer at limit: lead is not created", async () => {
    authMock.mockResolvedValue(STARTER_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false, plan: "STARTER" });
    getWeeklyLeadUsageMock.mockResolvedValue(3);

    await POST(makePost());
    expect(processRetailerProduct).not.toHaveBeenCalled();
    expect(entitlementUpsert).not.toHaveBeenCalled();
  });

  it("customer OWNER role does not bypass weekly quota", async () => {
    authMock.mockResolvedValue(CUST_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false, plan: "PRO" });
    getWeeklyLeadUsageMock.mockResolvedValue(15);

    const res = await POST(makePost());
    expect(res.status).toBe(429);
    expect(processRetailerProduct).not.toHaveBeenCalled();
  });

  it("entitlement upsert update is no-op — idempotent on re-submitted same lead", async () => {
    authMock.mockResolvedValue(CUST_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false, plan: "PRO" });
    processRetailerProduct.mockResolvedValue({ outcome: "lead_updated", leadId: "cust-lead-1", score: 80 });

    await POST(makePost());
    const call = entitlementUpsert.mock.calls[0][0];
    expect(call.update).toEqual({});
  });

  it("no leadTier filter added to read paths — entitlement existence is the only gate", async () => {
    authMock.mockResolvedValue(CUST_SESSION);
    orgFindUnique.mockResolvedValue({ isBroadcastSource: false, plan: "PRO" });
    processRetailerProduct.mockResolvedValue({ outcome: "lead_created", leadId: "cust-lead-1", score: 80 });

    const res = await POST(makePost());
    expect(res.status).toBe(200);
    expect(entitlementUpsert).toHaveBeenCalledOnce();
  });
});
