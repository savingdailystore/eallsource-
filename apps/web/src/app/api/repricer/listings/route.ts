import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getMockListings, fetchSellerListings, type AmazonConnection } from '@server/services/amazon/repricer';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const clientId = searchParams.get('clientId');
    const clientSecret = searchParams.get('clientSecret');
    const refreshToken = searchParams.get('refreshToken');
    const sellerId = searchParams.get('sellerId');
    const marketplaceId = searchParams.get('marketplaceId') ?? 'ATVPDKIKX0DER';

    if (!clientId || !clientSecret || !refreshToken || !sellerId) {
      return NextResponse.json({ success: true, data: getMockListings(), demo: true });
    }

    const conn: AmazonConnection = { clientId, clientSecret, refreshToken, sellerId, marketplaceId };
    const listings = await fetchSellerListings(conn);
    return NextResponse.json({ success: true, data: listings, demo: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
