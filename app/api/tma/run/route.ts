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

    // Start background scrape without awaiting
// Replace triggerScrape call with:
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
}).catch(err => console.error('Scraper call failed:', err))
}

async function updateLog(runId: string, message: string) {
  console.log(message)
  await supabaseAdmin.rpc('append_run_log', {
    p_run_id: runId,
    p_message: message
  })
}

/*async function triggerScrape(
  runId: string,
  matric: string,
  nounPassword: string,
  tmaRound: string,
  userId: string
) {
 try {
    await supabaseAdmin.from('vip_runs')
      .update({ status: 'running' }).eq('id', runId)

    await updateLog(runId, '🔄 Connecting to NOUN portal...')

    const scraperRes = await fetch(`${process.env.SCRAPER_URL}/scrape-tma`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matric, password: nounPassword,
        secret: process.env.SCRAPER_SECRET,
        tma_round: tmaRound
      })
    })

    if (!scraperRes.ok) {
      await updateLog(runId, '❌ Failed to connect to NOUN portal')
      await supabaseAdmin.from('vip_runs')
        .update({ status: 'failed', error_message: 'Could not connect' })
        .eq('id', runId)
      return
    }

    const scraperData = await scraperRes.json()

    if (scraperData.error) {
      await updateLog(runId, `❌ ${scraperData.error}`)
      await supabaseAdmin.from('vip_runs')
        .update({ status: 'failed', error_message: scraperData.error })
        .eq('id', runId)
      return
    }

    if (!scraperData.quizzes?.length) {
      await updateLog(runId, `❌ No ${tmaRound} found on your portal`)
      await supabaseAdmin.from('vip_runs')
        .update({ status: 'failed', error_message: `No ${tmaRound} found` })
        .eq('id', runId)
      return
    }

    await updateLog(runId, `✅ Logged in successfully`)
    await updateLog(runId, `📚 Found ${tmaRound} for ${scraperData.quizzes.length} course(s)`)

    // Deduct token
    await supabaseAdmin.rpc('debit_token_wallet', { p_user_id: userId, p_amount: 1 })
    await supabaseAdmin.from('token_transactions').insert({
      user_id: userId, type: 'debit', amount: 1,
      description: `Used 1 token for ${tmaRound}`, status: 'success'
    })

    await updateLog(runId, '🪙 Token deducted')
    await updateLog(runId, '🤖 AI is answering questions...')

    const allResults: any[] = []

    for (const quiz of scraperData.quizzes) {
      const courseCode = quiz.course_code || 'UNKNOWN'
      await updateLog(runId, `📖 Answering ${courseCode}...`)

const cleanCode = courseCode.replace(/\s+/g, '')
const { data: course } = await supabaseAdmin
  .from('courses')
  .select('id, shared_material_code, course_code')
  .or(`course_code.ilike.%${cleanCode}%,course_code.ilike.%${courseCode}%`)
  .limit(1)
  .single() as { data: any }

      const courseTitle = quiz.course_title || course?.course_code || courseCode
      const materialCode = course?.shared_material_code || courseCode

      for (const q of quiz.questions.slice(0, 10)) {
        let bankHit = null
        let answer = ''

        if (course?.id) {

          const { data: existing } = await supabaseAdmin
    .from('question_bank')
    .select('id')
    .eq('course_id', course.id)
    .ilike('question_text', `%${q.questionText.slice(0, 80)}%`)
    .single() as { data: any }

  if (!existing) {
    const { error: insertError } = await supabaseAdmin
      .from('question_bank')
      .insert({
        course_id: course.id,
        question_text: q.questionText,
        answer_text: answer,
        source: 'course_material',
        contributed_by: userId
      })
    if (insertError) {
      console.error('Question bank insert error:', insertError.message)
    } else {
      console.log('Saved to question bank:', q.questionText.slice(0, 50))
    }
  }
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

 await updateLog(runId, `🎉 Done! ${allResults.length} questions answered`)

    await supabaseAdmin.from('vip_runs').update({
      status: 'completed',
      results: allResults,
      completed_at: new Date().toISOString()
    }).eq('id', runId)

  } catch (err: any) {
    await updateLog(runId, `❌ Error: ${err.message}`)
  }
}*/