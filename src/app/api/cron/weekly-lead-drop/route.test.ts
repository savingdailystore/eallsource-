import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const orgFindMany         = vi.fn();
const leadFindMany        = vi.fn();
const broadcastLeadsMock  = vi.fn();
const runScanJobMock      = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findMany: (...a: unknown[]) => orgFindMany(...a) },
    lead:         { findMany: (...a: unknown[]) => leadFindMany(...a) },
  },
}));
vi.mock("@/services/broadcast", () => ({ broadcastLeads: (...a: unknown[]) => broadcastLeadsMock(...a) }));
vi.mock("@/services/run-scan",  () => ({ runScanJob:     (...a: unknown[]) => runScanJobMock(...a) }));

import { GET } from "./route";

const VALID_SECRET = "test-cron-secret";

function makeReq(authHeader?: string) {
  return new NextRequest("http://localhost/api/cron/weekly-lead-drop", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe("GET /api/cron/weekly-lead-drop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", VALID_SECRET);
    broadcastLeadsMock.mockResolvedValue(3);
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

  it("returns 200 with zero delivery when no source orgs exist", async () => {
    orgFindMany.mockResolvedValue([]);
    const res  = await GET(makeReq(`Bearer ${VALID_SECRET}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sourceOrgCount).toBe(0);
    expect(body.totalDelivered).toBe(0);
    expect(broadcastLeadsMock).not.toHaveBeenCalled();
  });

  it("calls broadcastLeads for each source org that has leads", async () => {
    orgFindMany.mockResolvedValue([{ id: "source-1" }, { id: "source-2" }]);
    leadFindMany
      .mockResolvedValueOnce([{ id: "lead-a" }, { id: "lead-b" }])
      .mockResolvedValueOnce([{ id: "lead-c" }]);
    broadcastLeadsMock.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const res  = await GET(makeReq(`Bearer ${VALID_SECRET}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(broadcastLeadsMock).toHaveBeenCalledTimes(2);
    expect(broadcastLeadsMock).toHaveBeenCalledWith("source-1", ["lead-a", "lead-b"]);
    expect(broadcastLeadsMock).toHaveBeenCalledWith("source-2", ["lead-c"]);
    expect(body.totalDelivered).toBe(3);
    expect(body.sourceLeadCount).toBe(3);
  });

  it("does NOT call broadcastLeads when source org has no active leads", async () => {
    orgFindMany.mockResolvedValue([{ id: "source-1" }]);
    leadFindMany.mockResolvedValue([]);

    const res  = await GET(makeReq(`Bearer ${VALID_SECRET}`));
    const body = await res.json();
    expect(broadcastLeadsMock).not.toHaveBeenCalled();
    expect(body.totalDelivered).toBe(0);
  });

  it("does NOT call runScanJob — this route does not run scanners", async () => {
    orgFindMany.mockResolvedValue([{ id: "source-1" }]);
    leadFindMany.mockResolvedValue([{ id: "lead-a" }]);
    await GET(makeReq(`Bearer ${VALID_SECRET}`));
    expect(runScanJobMock).not.toHaveBeenCalled();
  });

  it("returns per-org delivery breakdown in response", async () => {
    orgFindMany.mockResolvedValue([{ id: "source-1" }]);
    leadFindMany.mockResolvedValue([{ id: "lead-a" }, { id: "lead-b" }]);
    broadcastLeadsMock.mockResolvedValue(2);

    const res  = await GET(makeReq(`Bearer ${VALID_SECRET}`));
    const body = await res.json();
    expect(body.perOrg).toHaveLength(1);
    expect(body.perOrg[0].sourceOrgId).toBe("source-1");
    expect(body.perOrg[0].leadCount).toBe(2);
    expect(body.perOrg[0].delivered).toBe(2);
  });

  it("continues to next source org if broadcastLeads throws for one", async () => {
    orgFindMany.mockResolvedValue([{ id: "source-1" }, { id: "source-2" }]);
    leadFindMany
      .mockResolvedValueOnce([{ id: "lead-a" }])
      .mockResolvedValueOnce([{ id: "lead-b" }]);
    broadcastLeadsMock
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce(1);

    const res  = await GET(makeReq(`Bearer ${VALID_SECRET}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.totalDelivered).toBe(1);
  });

  it("queries source orgs by isBroadcastSource=true only", async () => {
    orgFindMany.mockResolvedValue([]);
    await GET(makeReq(`Bearer ${VALID_SECRET}`));
    const call = orgFindMany.mock.calls[0][0];
    expect(call.where.isBroadcastSource).toBe(true);
  });

  it("excludes REJECTED and EXPIRED leads from broadcast candidate set", async () => {
    orgFindMany.mockResolvedValue([{ id: "source-1" }]);
    leadFindMany.mockResolvedValue([{ id: "lead-a" }]);
    broadcastLeadsMock.mockResolvedValue(1);
    await GET(makeReq(`Bearer ${VALID_SECRET}`));
    const call = leadFindMany.mock.calls[0][0];
    expect(call.where.status).toEqual({ notIn: ["REJECTED", "EXPIRED"] });
  });
});
