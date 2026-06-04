import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { matric, noun_password, tma_round } = await req.json()
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single() as { data: any }

    if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: tokenWallet } = await supabaseAdmin
      .from('token_wallets')
      .select('balance')
      .eq('user_id', profile.id)
      .single() as { data: any }

    if (!tokenWallet || tokenWallet.balance < 1) {
      return NextResponse.json({ error: 'Insufficient tokens. Buy tokens to continue.' }, { status: 400 })
    }

    const { data: run } = await supabaseAdmin
      .from('vip_runs')
      .insert({
        user_id: profile.id,
        noun_matric: matric.toUpperCase(),
        tma_round,
        status: 'pending',
        tokens_used: 1
      })
      .select()
      .single() as { data: any }

    if (!run) return NextResponse.json({ error: 'Failed to create run' }, { status: 500 })

    console.log('Calling Railway:', `${process.env.SCRAPER_URL}/run-full-tma`, 'run_id:', run.id)

    fetch(`${process.env.SCRAPER_URL}/run-full-tma`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matric,
        password: noun_password,
        secret: process.env.SCRAPER_SECRET,
        tma_round,
        run_id: run.id,
        user_id: profile.id
      })
    }).then(r => {
      console.log('Railway status:', r.status)
    }).catch(err => {
      console.error('Railway fetch failed:', err.message)
    })

    return NextResponse.json({ run_id: run.id, status: 'started' })

  } catch (err: any) {
    console.error('Run error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}