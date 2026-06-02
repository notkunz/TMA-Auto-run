import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

export const maxDuration = 60
export const dynamic = 'force-dynamic'

async function slidingWindowSearch(question: string, materialCode: string): Promise<any[]> {
  const words = question
    .replace(/[^a-zA-Z\s]/g, ' ')
    .split(' ')
    .filter((w: string) => w.length > 2)

  const searchPhrases: string[] = []
  words.forEach((w: string) => searchPhrases.push(w))
  for (let i = 0; i < words.length - 1; i++) {
    searchPhrases.push(`${words[i]} ${words[i + 1]}`)
  }
  for (let i = 0; i < words.length - 2; i++) {
    searchPhrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  }

  const limited = searchPhrases.slice(0, 15)
  const chunkMap = new Map<string, string>()
  let found: any[] = []

  for (const phrase of limited) {
    if (found.length >= 6) break
    const { data: matched } = await supabaseAdmin
      .from('shared_material_chunks')
      .select('chunk_text')
      .eq('course_code', materialCode)
      .ilike('chunk_text', `%${phrase}%`)
      .limit(2) as { data: any[] | null }

    if (matched && matched.length > 0) {
      matched.forEach((m: any) => {
        if (!chunkMap.has(m.chunk_text)) chunkMap.set(m.chunk_text, m.chunk_text)
      })
      found = Array.from(chunkMap.values()).map(t => ({ chunk_text: t }))
    }
  }

  if (found.length === 0) {
    const { data: fallback } = await supabaseAdmin
      .from('shared_material_chunks')
      .select('chunk_text')
      .eq('course_code', materialCode)
      .limit(8) as { data: any[] | null }
    found = fallback || []
  }

  return found
}

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

    // Check token balance
    const { data: tokenWallet } = await supabaseAdmin
      .from('token_wallets')
      .select('balance')
      .eq('user_id', profile.id)
      .single() as { data: any }

    if (!tokenWallet || tokenWallet.balance < 1) {
      return NextResponse.json({ error: 'Insufficient tokens. Buy tokens to continue.' }, { status: 400 })
    }

    // Create run record — pending, no token deducted yet
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


      console.log('Calling Railway endpoint:', `${process.env.SCRAPER_URL}/run-full-tma`)
console.log('Run ID:', run.id)
console.log('User ID:', profile.id)
    // Start background scrape without awaiting
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
  console.log('Railway response status:', r.status)
  return r.json()
}).then(d => {
  console.log('Railway response:', JSON.stringify(d))
}).catch(err => {
  console.error('Railway failed fetch:', err.message)
})
    return NextResponse.json({ run_id: run.id, status: 'started' })
  } catch (err) {
    console.error('Run error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

async function updateLog(runId: string, message: string) {
  console.log(message)
  await supabaseAdmin.rpc('append_run_log', {
    p_run_id: runId,
    p_message: message
  })
}