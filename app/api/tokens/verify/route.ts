import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { reference } = await req.json()

  const { data: transaction } = await supabaseAdmin
    .from('transactions').select('*')
    .eq('id', reference).eq('status', 'pending').single() as { data: any }

  if (!transaction) return NextResponse.json({ error: 'Not found' }, { status: 400 })

  const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
  })
  const data = await res.json()
  const verified = data.data?.status === 'success' &&
    data.data?.amount / 100 === transaction.amount

  if (!verified) {
    await supabaseAdmin.from('transactions').update({ status: 'failed' }).eq('id', reference)
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }

  // Credit naira wallet
  await supabaseAdmin.rpc('credit_wallet', {
    p_user_id: transaction.user_id,
    p_amount: transaction.amount
  })

  await supabaseAdmin.from('transactions')
    .update({ status: 'success' }).eq('id', reference)

  return NextResponse.json({ success: true, amount: transaction.amount })
}