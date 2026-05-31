import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function createGroqChatCompletion(options: {
  model: string
  messages: Array<{ role: string; content: string }>
  max_tokens?: number
}) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('Missing GROQ_API_KEY')

  const response = await fetch('https://api.groq.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(options)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Groq API error: ${response.status} ${errorText}`)
  }

  return response.json()
}

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

async function refundToken(userId: string, runId: string, reason: string) {
  try {
    await supabaseAdmin.rpc('credit_token_wallet', {
      p_user_id: userId,
      p_amount: 1
    })
    await supabaseAdmin.from('token_transactions').insert({
      user_id: userId,
      type: 'credit',
      amount: 1,
      description: `Token refunded — ${reason}`,
      status: 'success'
    })
    await supabaseAdmin.from('vip_runs')
      .update({ status: 'failed', error_message: reason })
      .eq('id', runId)
  } catch (e) {
    console.error('Refund error:', e)
  }
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

    // Start background scrape without awaiting
    triggerScrape(run.id, matric, noun_password, tma_round, profile.id)

    // Return immediately so frontend can start polling
    return NextResponse.json({ success: true, run_id: run.id, status: 'pending' })

  } catch (err: any) {
    console.error('VIP run error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function triggerScrape(
  runId: string,
  matric: string,
  nounPassword: string,
  tmaRound: string,
  userId: string
) {
  try {
    await supabaseAdmin.from('vip_runs')
      .update({ status: 'running' })
      .eq('id', runId)

    console.log('Calling scraper:', process.env.SCRAPER_URL)

    const scraperRes = await fetch(`${process.env.SCRAPER_URL}/scrape-tma`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matric,
        password: nounPassword,
        secret: process.env.SCRAPER_SECRET,
        tma_round: tmaRound
      })
    })

    if (!scraperRes.ok) {
      const errorText = await scraperRes.text()
      console.error('Scraper HTTP error:', errorText)
      await supabaseAdmin.from('vip_runs')
        .update({ status: 'failed', error_message: 'Could not connect to NOUN portal' })
        .eq('id', runId)
      return
    }

    const scraperData = await scraperRes.json()

    if (scraperData.error) {
      await supabaseAdmin.from('vip_runs')
        .update({ status: 'failed', error_message: scraperData.error })
        .eq('id', runId)
      return
    }

    if (!scraperData.quizzes || scraperData.quizzes.length === 0) {
      await supabaseAdmin.from('vip_runs')
        .update({
          status: 'failed',
          error_message: `No ${tmaRound} found on your NOUN portal. Make sure the TMA is open.`
        })
        .eq('id', runId)
      return
    }

    // Scraping succeeded — now deduct token
    await supabaseAdmin.rpc('debit_token_wallet', {
      p_user_id: userId,
      p_amount: 1
    })
    await supabaseAdmin.from('token_transactions').insert({
      user_id: userId,
      type: 'debit',
      amount: 1,
      description: `Used 1 token for ${tmaRound}`,
      status: 'success'
    })

    // Answer all questions
    const allResults: any[] = []

    for (const quiz of scraperData.quizzes) {
      const courseCode = quiz.course_code || 'UNKNOWN'
      const courseTitle = quiz.title || courseCode

      const { data: course } = await supabaseAdmin
        .from('courses')
        .select('id, shared_material_code, course_code')
        .ilike('course_code', `%${courseCode}%`)
        .limit(1)
        .single() as { data: any }

      const materialCode = course?.shared_material_code || courseCode

      for (const q of quiz.questions.slice(0, 10)) {
        let bankHit = null

        if (course?.id) {
          const { data: bankEntries } = await supabaseAdmin
            .from('question_bank')
            .select('id, question_text, answer_text, times_asked')
            .eq('course_id', course.id)
            .limit(30) as { data: any[] | null }

          if (bankEntries && bankEntries.length > 0) {
            const bankList = bankEntries.map((e, i) => `[${i}] ${e.question_text}`).join('\n')
            try {
              const matchResult = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [{
                  role: 'user',
                  content: `Exact match only.
Student question: "${q.questionText}"
Bank:\n${bankList}
Reply MATCH:N or NO_MATCH only.`
                }],
                max_tokens: 10
              })
              const match = matchResult.choices[0]?.message?.content?.trim() || ''
              if (match.startsWith('MATCH:')) {
                const idx = parseInt(match.replace('MATCH:', '').trim())
                if (!isNaN(idx) && bankEntries[idx]) bankHit = bankEntries[idx]
              }
            } catch (_) {}
          }
        }

        if (bankHit) {
          allResults.push({
            courseCode, courseTitle,
            questionNumber: q.index,
            question: q.questionText,
            options: q.options,
            answer: bankHit.answer_text,
            source: 'question_bank'
          })
          continue
        }

        const chunks = await slidingWindowSearch(q.questionText, materialCode)
        const materialContext = chunks.map((c: any) => c.chunk_text).join('\n\n---\n\n')
        const hasMaterial = materialContext.length > 0

        const optionsText = q.options?.length > 0
          ? q.options.map((o: string, i: number) =>
              `${String.fromCharCode(65 + i)}. ${o}`
            ).join('\n')
          : ''

        try {
          const result = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
              role: 'user',
              content: `You are a NOUN TMA assistant.
${hasMaterial ? `COURSE MATERIAL:\n${materialContext}\n\n` : ''}
QUESTION: "${q.questionText}"
${optionsText ? `OPTIONS:\n${optionsText}` : ''}

RULES:
1. Find the answer in the material
2. For fill-in-the-blank find the sentence with those words completed
3. Match to the closest option
4. Reply ONLY with letter and option text e.g "B. Success"
5. If not found reply: ANSWER_NOT_FOUND`
            }],
            max_tokens: 256
          })

          const answer = result.choices[0]?.message?.content?.trim() || 'ANSWER_NOT_FOUND'

          if (answer === 'ANSWER_NOT_FOUND') {
            allResults.push({
              courseCode, courseTitle,
              questionNumber: q.index,
              question: q.questionText,
              options: q.options,
              answer: '',
              source: 'not_found'
            })
          } else {
            if (course?.id) {
              try {
                await supabaseAdmin.from('question_bank').insert({
                  course_id: course.id,
                  question_text: q.questionText,
                  answer_text: answer,
                  source: 'course_material',
                  contributed_by: userId
                })
              } catch (_) {}
            }

            allResults.push({
              courseCode, courseTitle,
              questionNumber: q.index,
              question: q.questionText,
              options: q.options,
              answer,
              source: hasMaterial ? 'course_material' : 'internet'
            })
          }
        } catch (groqErr: any) {
          console.error('Groq error for question:', groqErr.message)
          allResults.push({
            courseCode, courseTitle,
            questionNumber: q.index,
            question: q.questionText,
            options: q.options,
            answer: '',
            source: 'not_found'
          })
        }
      }
    }

    await supabaseAdmin.from('vip_runs').update({
      status: 'completed',
      results: allResults,
      completed_at: new Date().toISOString()
    }).eq('id', runId)

    console.log(`Run ${runId} completed with ${allResults.length} answers`)

  } catch (err: any) {
    console.error('Background scrape error:', err)
    await refundToken(userId, runId, err.message)
  }
}