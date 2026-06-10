import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { course_id } = await req.json()
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .single() as { data: { id: string } | null }

if (!profile) return

  // Get course cost
  const { data: course } = await supabaseAdmin
    .from('courses')
    .select('tma_cost, course_code')
    .eq('id', course_id)
    .single()as { data: { tma_cost: number, course_code: string} | null }

if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  // Check wallet balance
  const { data: wallet } = await supabaseAdmin
    .from('wallets')
    .select('balance')
    .eq('user_id', profile.id)
    .single() as { data: { balance: number } | null }

if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

  if (wallet.balance < course.tma_cost) {
    return NextResponse.json({ error: 'Insufficient wallet balance. Please top up.' }, { status: 400 })
  }

  // Deduct wallet
  await supabaseAdmin.rpc('debit_wallet', {
    p_user_id: profile.id,
    p_amount: course.tma_cost
  })

  // Log debit transaction
  await supabaseAdmin.from('transactions').insert({
    user_id: profile.id,
    type: 'debit',
    amount: course.tma_cost,
    description: `TMA: ${course.course_code}`,
    payment_provider: 'system',
    status: 'success'
  })

  // Create TMA session
  const { data: session } = await supabaseAdmin
    .from('tma_sessions')
    .insert({ user_id: profile.id, course_id })
    .select()
    .single()

  return NextResponse.json({ success: true, session_id: session.id })
}