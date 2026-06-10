import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { reference, provider } = await req.json()
    console.log('Verifying payment:', reference, provider)

    const { data: transaction } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('id', reference)
      .single() as { data: any }

    console.log('Transaction found:', transaction?.status, transaction?.amount)

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 400 })
    }

    if (transaction.status === 'success') {
      // Already processed — return success without double crediting
      return NextResponse.json({ success: true, amount: transaction.amount, already_processed: true })
    }

    // ... rest of verification

  // 2. Verify with payment provider
  let verified = false

  if (provider === 'paystack') {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    })
    const data = await res.json()
    verified = data.data?.status === 'success'
  }

  if (provider === 'flutterwave') {
    const res = await fetch(`https://api.flutterwave.com/v3/transactions/${reference}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` }
    })
    const data = await res.json()
    verified = data.data?.status === 'successful'
  }

  // After: verified = data.data?.status === 'success' (paystack)
// Add amount double-check:

if (provider === 'paystack') {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
  })
  const data = await res.json()
  const paidAmount = data.data?.amount / 100 // convert kobo to naira
  verified = data.data?.status === 'success' && paidAmount === transaction.amount
}

if (provider === 'flutterwave') {
  const res = await fetch(`https://api.flutterwave.com/v3/transactions/${reference}/verify`, {
    headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` }
  })
  const data = await res.json()
  const paidAmount = data.data?.amount
  verified = data.data?.status === 'successful' && paidAmount === transaction.amount
}

  if (!verified) {
    await supabaseAdmin
      .from('transactions')
      .update({ status: 'failed' })
      .eq('id', reference)
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })
  }

  // 3. Credit the wallet (server-side only, never from frontend)
  await supabaseAdmin.rpc('credit_wallet', {
    p_user_id: transaction.user_id,
    p_amount: transaction.amount
  })

  // 4. Mark transaction as success
  await supabaseAdmin
    .from('transactions')
    .update({ status: 'success', payment_reference: reference })
    .eq('id', reference)

  return NextResponse.json({ success: true, amount: transaction.amount })
  } catch (error) {
    console.error('Verification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 