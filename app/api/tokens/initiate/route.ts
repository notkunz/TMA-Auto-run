import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { token_amount, naira_amount } = await req.json()
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('users').select('id, email').eq('auth_id', user.id).single() as { data: any }

  // Create pending transaction
  const { data: transaction } = await supabaseAdmin
    .from('token_transactions').insert({
      user_id: profile.id,
      type: 'credit',
      amount: token_amount,
      naira_amount,
      description: `${token_amount} token${token_amount > 1 ? 's' : ''} purchase`,
      status: 'pending'
    }).select().single() as { data: any }

  // Initiate Paystack payment
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: profile.email,
      amount: naira_amount * 100,
      reference: transaction.id,
      callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/tokens?verify=paystack`
    })
  })

  const data = await res.json()
  return NextResponse.json({ url: data.data?.authorization_url })
}