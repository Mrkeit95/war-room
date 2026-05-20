import { NextResponse } from 'next/server'
import { runSync } from '@/lib/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel: cron-friendly upper bound

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization')
  if (header === `Bearer ${secret}`) return true
  // Vercel cron sends the secret in this header
  const vercelCron = req.headers.get('x-vercel-cron-signature')
  return vercelCron === secret
}

async function handle(req: Request, triggeredBy: 'cron' | 'manual' | 'api') {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runSync(triggeredBy)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return handle(req, 'manual')
}

export async function GET(req: Request) {
  // Cron invocations from Vercel use GET
  const isCron = req.headers.has('x-vercel-cron-signature')
  return handle(req, isCron ? 'cron' : 'api')
}
