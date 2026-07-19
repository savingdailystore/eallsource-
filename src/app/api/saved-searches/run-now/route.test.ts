import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock            = vi.fn();
const orgFindUnique       = vi.fn();
const savedSearchFindMany = vi.fn();
const savedSearchUpdate   = vi.fn();
const scanJobCreate       = vi.fn();
const runScanJobMock      = vi.fn();
const broadcastLeadsMock  = vi.fn();

vi.mock("@/lib/auth",   () => ({ auth: () => authMock() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: (...a: unknown[]) => orgFindUnique(...a) },
    savedSearch:  {
      findMany: (...a: unknown[]) => savedSearchFindMany(...a),
      update:   (...a: unknown[]) => savedSearchUpdate(...a),
    },
    scanJob: { create: (...a: unknown[]) => scanJobCreate(...a) },
  },
}));
vi.mock("@/services/run-scan",  () => ({ runScanJob:     (...a: unknown[]) => runScanJobMock(...a) }));
vi.mock("@/services/broadcast", () => ({ broadcastLeads: (...a: unknown[]) => broadcastLeadsMock(...a) }));

import { POST } from "./route";

const OWNER_SESSION       = { user: { id: "u1", role: "OWNER", orgId: "source-org" } };
const CUST_OWNER_SESSION  = { user: { id: "u2", role: "OWNER", orgId: "cust-org" } };
const NON_OWNER_SESSION   = { user: { id: "u3", role: "ADMIN", orgId: "source-org" } };

function makePost() {
  // POST() takes no request argument — the route reads session from auth()
}

const SCAN_RESULT = {
  found: 3, created: 2, updated: 1, leadIds: ["lead-1", "lead-2"],
  noMatch: 0, noPricing: 0, notProfitable: 0, demandTooLow: 0,
  velocityTooLow: 0, noBuyBox: 0, priceDeclining: 0, priceTooLow: 0, validationFailed: 0,
};

const SEARCH_ROW = { id: "s1", orgId: "source-org", retailer: "Walmart", query: "lego" };

describe("POST /api/saved-searches/run-now", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedSearchUpdate.mockResolvedValue({});
    scanJobCreate.mockResolvedValue({ id: "job-1" });
    runScanJobMock.mockResolvedValue(SCAN_RESULT);
    broadcastLeadsMock.mockResolvedValue(5);
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not OWNER", async () => {
    authMock.mockResolvedValue(NON_OWNER_SESSION);
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("returns 403 when scan is not enabled for the org", async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    orgFindUnique.mockResolvedValue({ scanEnabled: false });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("returns ok with message when no searches exist", async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    orgFindUnique.mockResolvedValue({ scanEnabled: true });
    savedSearchFindMany.mockResolvedValue([]);
    const res  = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ran).toBe(0);
  });

  it("source org: does NOT call broadcastLeads after scan produces leads", async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    orgFindUnique.mockResolvedValue({ scanEnabled: true });
    savedSearchFindMany.mockResolvedValue([SEARCH_ROW]);

    await POST();
    expect(broadcastLeadsMock).not.toHaveBeenCalled();
  });

  it("non-source customer org: does NOT call broadcastLeads", async () => {
    authMock.mockResolvedValue(CUST_OWNER_SESSION);
    orgFindUnique.mockResolvedValue({ scanEnabled: true });
    savedSearchFindMany.mockResolvedValue([{ ...SEARCH_ROW, orgId: "cust-org" }]);

    await POST();
    expect(broadcastLeadsMock).not.toHaveBeenCalled();
  });

  it("response has no broadcast field", async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    orgFindUnique.mockResolvedValue({ scanEnabled: true });
    savedSearchFindMany.mockResolvedValue([SEARCH_ROW]);

    const res  = await POST();
    const body = await res.json();
    expect(body).not.toHaveProperty("broadcast");
  });

  it("response includes message about weekly lead drop", async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    orgFindUnique.mockResolvedValue({ scanEnabled: true });
    savedSearchFindMany.mockResolvedValue([SEARCH_ROW]);

    const res  = await POST();
    const body = await res.json();
    expect(body.message).toMatch(/weekly lead drop/i);
  });

  it("runs scan jobs and returns counts", async () => {
    authMock.mockResolvedValue(OWNER_SESSION);
    orgFindUnique.mockResolvedValue({ scanEnabled: true });
    savedSearchFindMany.mockResolvedValue([SEARCH_ROW]);

    const res  = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ran).toBe(1);
    expect(body.leadsCreated).toBe(2);
  });
});
