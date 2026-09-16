import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TOKEN_PRICE = 5000

export async function POST(req: Request) {
  try {
    const { token_amount } = await req.json()

    const supabase = await createServerSupabaseClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    const naira_cost = token_amount * TOKEN_PRICE

    // Check wallet
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('balance')
      .eq('user_id', profile.id)
      .maybeSingle()

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 }
      )
    }

    if (wallet.balance < naira_cost) {
      return NextResponse.json(
        { error: 'Insufficient wallet balance' },
        { status: 400 }
      )
    }

    // Convert tokens ONCE
    const { error: convertError } = await supabaseAdmin.rpc(
      'convert_wallet_to_tokens',
      {
        p_user_id: profile.id,
        p_token_amount: token_amount
      }
    )

    if (convertError) {
      console.error(convertError)

      return NextResponse.json(
        { error: convertError.message },
        { status: 500 }
      )
    }

    // Log transaction
    await supabaseAdmin.from('token_transactions').insert({
      user_id: profile.id,
      type: 'credit',
      amount: token_amount,
      naira_amount: naira_cost,
      description: `Converted ₦${naira_cost.toLocaleString()} → ${token_amount} token${token_amount > 1 ? 's' : ''}`,
      status: 'success'
    })

    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error(err)

    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}