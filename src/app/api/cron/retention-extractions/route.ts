// MGT-081 — Authenticated cron endpoint for 30-day extraction-log retention.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runExtractionRetention } from '@/lib/retention/extractions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.trim() === '') {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured on the server.' },
      { status: 503 },
    )
  }

  const auth = request.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const result = await runExtractionRetention({ admin })
  return NextResponse.json(result)
}
