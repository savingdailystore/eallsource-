import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchInventory, getMockInventory, type InventoryConnection } from '@/services/amazon/inventory';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;

  // Credentials passed as query params (sent from the client after user fills the connect form)
  const clientId = searchParams.get('clientId');
  const clientSecret = searchParams.get('clientSecret');
  const refreshToken = searchParams.get('refreshToken');
  const marketplaceId = searchParams.get('marketplaceId') ?? 'ATVPDKIKX0DER';

  // If no credentials supplied, return mock demo data
  if (!clientId || !clientSecret || !refreshToken) {
    return NextResponse.json({ success: true, data: getMockInventory(), demo: true });
  }

  try {
    const conn: InventoryConnection = { clientId, clientSecret, refreshToken, marketplaceId };
    const inventory = await fetchInventory(conn);
    return NextResponse.json({ success: true, data: inventory, demo: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}

// Validate credentials by attempting a token fetch
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { clientId, clientSecret, refreshToken, marketplaceId } = body;

  if (!clientId || !clientSecret || !refreshToken) {
    return NextResponse.json({ success: false, error: 'All credentials are required' }, { status: 400 });
  }

  try {
    const res = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ success: false, error: `Amazon rejected credentials: ${text}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Credentials verified successfully' });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Could not reach Amazon — check your network' }, { status: 502 });
  }
}
