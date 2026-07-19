import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const savedSearchFindMany  = vi.fn();
const savedSearchUpdate    = vi.fn();
const scanJobCreate        = vi.fn();
const runScanJobMock       = vi.fn();
const broadcastLeadsMock   = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    savedSearch: {
      findMany: (...a: unknown[]) => savedSearchFindMany(...a),
      update:   (...a: unknown[]) => savedSearchUpdate(...a),
    },
    scanJob: { create: (...a: unknown[]) => scanJobCreate(...a) },
  },
}));
vi.mock("@/services/run-scan",  () => ({ runScanJob:     (...a: unknown[]) => runScanJobMock(...a) }));
vi.mock("@/services/broadcast", () => ({ broadcastLeads: (...a: unknown[]) => broadcastLeadsMock(...a) }));

import { GET } from "./route";

const VALID_SECRET = "test-cron-secret";

function makeReq(authHeader?: string) {
  return new NextRequest("http://localhost/api/cron/source-scan", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

const SCAN_RESULT = {
  found: 3, created: 2, updated: 1, leadIds: ["lead-1", "lead-2"],
  noMatch: 0, noPricing: 0, notProfitable: 0, demandTooLow: 0,
  velocityTooLow: 0, noBuyBox: 0, priceDeclining: 0, priceTooLow: 0, validationFailed: 0,
};

const SEARCH_ROW = { id: "s1", orgId: "source-org", retailer: "Walmart", query: "lego" };

describe("GET /api/cron/source-scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", VALID_SECRET);
    savedSearchUpdate.mockResolvedValue({});
    scanJobCreate.mockResolvedValue({ id: "job-1" });
    runScanJobMock.mockResolvedValue(SCAN_RESULT);
    broadcastLeadsMock.mockResolvedValue(5);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header is wrong", async () => {
    const res = await GET(makeReq("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 500 when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(makeReq(`Bearer ${VALID_SECRET}`));
    expect(res.status).toBe(500);
  });

  it("returns 200 with scan summary when auth is correct", async () => {
    savedSearchFindMany.mockResolvedValue([SEARCH_ROW]);
    const res  = await GET(makeReq(`Bearer ${VALID_SECRET}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ran).toBe(1);
    expect(body.leadsCreated).toBe(2);
  });

  it("does NOT call broadcastLeads even when source org produces leads", async () => {
    savedSearchFindMany.mockResolvedValue([SEARCH_ROW]);
    await GET(makeReq(`Bearer ${VALID_SECRET}`));
    expect(broadcastLeadsMock).not.toHaveBeenCalled();
  });

  it("does NOT call broadcastLeads when no searches are stale", async () => {
    savedSearchFindMany.mockResolvedValue([]);
    await GET(makeReq(`Bearer ${VALID_SECRET}`));
    expect(broadcastLeadsMock).not.toHaveBeenCalled();
  });

  it("does NOT call broadcastLeads even on scan failure", async () => {
    savedSearchFindMany.mockResolvedValue([SEARCH_ROW]);
    runScanJobMock.mockRejectedValue(new Error("Apify timeout"));
    await GET(makeReq(`Bearer ${VALID_SECRET}`));
    expect(broadcastLeadsMock).not.toHaveBeenCalled();
  });

  it("applies stale-search staleness filter in findMany query", async () => {
    savedSearchFindMany.mockResolvedValue([]);
    await GET(makeReq(`Bearer ${VALID_SECRET}`));
    const call = savedSearchFindMany.mock.calls[0][0];
    // Must filter by enabled=true and staleness OR clause
    expect(call.where.enabled).toBe(true);
    expect(call.where.OR).toBeDefined();
  });

  it("records failures without crashing", async () => {
    savedSearchFindMany.mockResolvedValue([SEARCH_ROW]);
    runScanJobMock.mockRejectedValue(new Error("Apify timeout"));
    const res  = await GET(makeReq(`Bearer ${VALID_SECRET}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.failures).toBe(1);
    expect(body.ran).toBe(0);
  });
});
