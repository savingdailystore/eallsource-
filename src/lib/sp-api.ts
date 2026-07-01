import { prisma } from './prisma';
import { decrypt, encrypt } from './encryption';

// ─── Marketplace → endpoint mapping ─────────────────────────────────────────
// SP-API no longer requires AWS SigV4 signing (deprecated 2023). Requests are
// authorized with the LWA access token in the x-amz-access-token header only.
const MARKETPLACE_ENDPOINT: Record<string, string> = {
  ATVPDKIKX0DER:  'https://sellingpartnerapi-na.amazon.com', // US
  A2EUQ1WTGCTBG2: 'https://sellingpartnerapi-na.amazon.com', // CA
  A1AM79C64UM0Y8: 'https://sellingpartnerapi-na.amazon.com', // MX
  A1F83G8C2ARO7P: 'https://sellingpartnerapi-eu.amazon.com', // UK
  A1PA6795UKMFR9: 'https://sellingpartnerapi-eu.amazon.com', // DE
  A13V1IB3VIYZZH: 'https://sellingpartnerapi-eu.amazon.com', // FR
  APJ6JRA9NG5V4:  'https://sellingpartnerapi-eu.amazon.com', // IT
  A1RKKUPIHCS9HS: 'https://sellingpartnerapi-eu.amazon.com', // ES
  A1VC38T7YXB528: 'https://sellingpartnerapi-fe.amazon.com', // JP
};

function endpointFor(marketplaceId: string): string {
  return MARKETPLACE_ENDPOINT[marketplaceId] ?? 'https://sellingpartnerapi-na.amazon.com';
}

// ─── LWA token refresh ──────────────────────────────────────────────────────
async function refreshLwaToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const clientId     = process.env.LWA_CLIENT_ID;
  const clientSecret = process.env.LWA_CLIENT_SECRET;

  if (!clientId || !clientSecret) throw new Error('LWA_CLIENT_ID / LWA_CLIENT_SECRET env vars not set');

  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) throw new Error(`LWA token refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

// ─── SP-API client factory ───────────────────────────────────────────────────
export async function getSpApiClient(orgId: string) {
  const cred = await prisma.amazonCredential.findUnique({ where: { orgId } });
  if (!cred?.isActive) throw new Error('Amazon account not connected');

  let accessToken    = decrypt(cred.accessToken);
  const refreshToken = decrypt(cred.refreshToken);

  // Refresh if expired or expiring within 60s
  const needsRefresh = !cred.tokenExpiresAt || cred.tokenExpiresAt.getTime() - Date.now() < 60_000;
  if (needsRefresh) {
    const { accessToken: newToken, expiresIn } = await refreshLwaToken(refreshToken);
    accessToken = newToken;
    await prisma.amazonCredential.update({
      where: { orgId },
      data: {
        accessToken:    encrypt(newToken),
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });
  }

  const endpoint = endpointFor(cred.marketplaceId);

  return {
    marketplaceId: cred.marketplaceId,
    sellerId:      cred.sellerId,

    async get(path: string, query: Record<string, string> = {}) {
      const qs  = new URLSearchParams(query).toString();
      const url = `${endpoint}${path}${qs ? '?' + qs : ''}`;

      const res = await fetch(url, {
        headers: {
          'x-amz-access-token': accessToken,
          'content-type':       'application/json',
        },
      });

      if (!res.ok) throw new Error(`SP-API ${path} → ${res.status}: ${await res.text()}`);
      return res.json();
    },

    async patch(path: string, query: Record<string, string>, body: unknown) {
      const qs  = new URLSearchParams(query).toString();
      const url = `${endpoint}${path}${qs ? '?' + qs : ''}`;

      const res = await fetch(url, {
        method:  'PATCH',
        headers: {
          'x-amz-access-token': accessToken,
          'content-type':       'application/json',
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(`SP-API ${path} → ${res.status}: ${text}`);
      return text ? JSON.parse(text) : {};
    },

    async post(path: string, body: unknown) {
      const url = `${endpoint}${path}`;

      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'x-amz-access-token': accessToken,
          'content-type':       'application/json',
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(`SP-API POST ${path} → ${res.status}: ${text}`);
      return text ? JSON.parse(text) : {};
    },

    // ─── Reports API helpers ─────────────────────────────────────────────────
    // Amazon Reports API v2021-06-30
    // Requires the report type to be enabled in the SP-API application role.
    // Docs: https://developer-docs.amazon.com/sp-api/docs/reports-api-v2021-06-30-reference

    /** Request a new report. Returns the reportId. */
    async createReport(reportType: string, options: {
      dataStartTime?: string;
      dataEndTime?:   string;
      marketplaceIds?: string[];
    } = {}): Promise<string> {
      const body = {
        reportType,
        marketplaceIds: options.marketplaceIds ?? [cred.marketplaceId],
        ...(options.dataStartTime ? { dataStartTime: options.dataStartTime } : {}),
        ...(options.dataEndTime   ? { dataEndTime:   options.dataEndTime   } : {}),
      };
      const data = await this.post('/reports/2021-06-30/reports', body);
      if (!data?.reportId) throw new Error(`createReport: no reportId in response: ${JSON.stringify(data)}`);
      return data.reportId as string;
    },

    /** Poll report status. Returns processingStatus and reportDocumentId when DONE. */
    async getReport(reportId: string): Promise<{
      processingStatus: 'IN_QUEUE' | 'IN_PROGRESS' | 'DONE' | 'FATAL' | 'CANCELLED';
      reportDocumentId?: string;
    }> {
      const data = await this.get(`/reports/2021-06-30/reports/${reportId}`);
      return {
        processingStatus: data?.processingStatus,
        reportDocumentId: data?.reportDocumentId,
      };
    },

    /** Get the document metadata (download URL + optional compression). */
    async getReportDocument(reportDocumentId: string): Promise<{
      url: string;
      compressionAlgorithm?: string;
    }> {
      const data = await this.get(`/reports/2021-06-30/documents/${reportDocumentId}`);
      return {
        url:                  data?.url,
        compressionAlgorithm: data?.compressionAlgorithm,
      };
    },

    /** Download and decompress the report document. Returns raw string content. */
    async downloadReportDocument(reportDocumentId: string): Promise<string> {
      const { url, compressionAlgorithm } = await this.getReportDocument(reportDocumentId);
      if (!url) throw new Error(`getReportDocument: no URL returned for ${reportDocumentId}`);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Report document download failed: ${res.status}`);

      if (compressionAlgorithm === 'GZIP') {
        // Decompress GZIP — available in Node.js 18+ via CompressionStream
        const buffer     = await res.arrayBuffer();
        const compressed = new Uint8Array(buffer);
        const ds         = new DecompressionStream('gzip');
        const writer     = ds.writable.getWriter();
        writer.write(compressed);
        writer.close();
        const chunks: Uint8Array[] = [];
        const reader = ds.readable.getReader();
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          if (value) chunks.push(value);
          done = d;
        }
        const total  = chunks.reduce((sum, c) => sum + c.length, 0);
        const merged = new Uint8Array(total);
        let offset   = 0;
        for (const c of chunks) { merged.set(c, offset); offset += c.length; }
        return new TextDecoder().decode(merged);
      }

      return res.text();
    },
  };
}
