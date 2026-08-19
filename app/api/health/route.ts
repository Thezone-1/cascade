import { NextResponse } from 'next/server';
import { ping } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await ping();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
