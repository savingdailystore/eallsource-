import { NextResponse } from 'next/server';
import { prisma } from '@lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const count = await prisma.user.count();
    const dbUrl = process.env.DATABASE_URL ?? '';
    const hostMatch = dbUrl.match(/@([^/]+)\//);
    return NextResponse.json({ connected: true, userCount: count, dbHost: hostMatch?.[1] ?? 'unknown' });
  } catch (err) {
    return NextResponse.json({ connected: false, error: String(err) }, { status: 500 });
  }
}
