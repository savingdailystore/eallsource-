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
  };
}
