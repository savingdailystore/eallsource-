import { NextResponse } from 'next/server';

export async function GET() { return NextResponse.json({ success: true, data: [] }); }
export async function POST() { return NextResponse.json({ error: 'Not implemented' }, { status: 501 }); }
export async function DELETE() { return NextResponse.json({ error: 'Not implemented' }, { status: 501 }); }
export async function PATCH() { return NextResponse.json({ error: 'Not implemented' }, { status: 501 }); }
