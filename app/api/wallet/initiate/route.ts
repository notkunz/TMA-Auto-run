import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { amount } = await req.json()
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users').select('id, email')
      .eq('auth_id', user.id).single() as { data: any, error: any }

    if (profileError || !profile) {
      console.error('Profile lookup failed:', profileError)
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const reference = `txn_${Date.now()}_${profile.id.slice(0, 8)}`

    const { data: transaction, error: txnError } = await supabaseAdmin
      .from('transactions').insert({
        id: reference,
        user_id: profile.id,
        type: 'credit',
        amount,
        description: 'VIP Wallet top-up',
        payment_provider: 'paystack',
        status: 'pending'
      }).select().single() as { data: any, error: any }

    if (txnError || !transaction) {
      console.error('Transaction insert failed:', txnError)
      return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
    }

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: profile.email,
        amount: amount * 100,
        reference: transaction.id,
        callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/tokens?verify=paystack`
      })
    })

    const data = await res.json()

    if (!data.status) {
      console.error('Paystack error:', data)
      return NextResponse.json({ error: data.message || 'Paystack initialization failed' }, { status: 500 })
    }

    return NextResponse.json({ url: data.data?.authorization_url })

  } catch (err: any) {
    console.error('Wallet initiate error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}