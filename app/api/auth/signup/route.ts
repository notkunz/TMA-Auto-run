import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { email, password, full_name, matric_number, phone } = await req.json()

  const { data: existing } = await supabaseAdmin
    .from('users').select('id').eq('matric_number', matric_number).single()
  if (existing) return NextResponse.json({ error: 'Matric number already registered' }, { status: 400 })

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const { error: profileError } = await supabaseAdmin.from('users').insert({
    auth_id: authData.user.id,
    full_name, email,
    matric_number: matric_number.toUpperCase(),
    phone
  })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}