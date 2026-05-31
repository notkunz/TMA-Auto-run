import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const run_id = searchParams.get('run_id')
  if (!run_id) return NextResponse.json({ error: 'No run_id' }, { status: 400 })

  const { data: run } = await supabaseAdmin
    .from('vip_runs')
    .select('status, results, error_message')
    .eq('id', run_id)
    .single() as { data: any }

  return NextResponse.json(run)
}