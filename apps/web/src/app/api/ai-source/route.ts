import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runAISourcing } from '@server/services/ai-sourcer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    query?: string;
    retailers?: string[];
    minRoi?: number;
    maxFbaSellers?: number;
    limit?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const query = (body.query ?? '').trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  const opportunities = await runAISourcing({
    query,
    retailers: (body.retailers ?? ['walmart']) as ('walmart' | 'target')[],
    minRoi: body.minRoi ?? 25,
    maxFbaSellers: body.maxFbaSellers ?? 15,
    limit: Math.min(body.limit ?? 10, 20),
  });

  return NextResponse.json({
    results: opportunities,
    count: opportunities.length,
    demoMode: !process.env.WALMART_API_KEY,
    aiMode: !!process.env.ANTHROPIC_API_KEY,
  });
}
