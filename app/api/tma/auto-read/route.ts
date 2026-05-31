import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

export async function POST(req: Request) {
  try {
    const { matric, noun_password, session_id, course_id } = await req.json()

    if (!matric || !noun_password) {
      return NextResponse.json({ error: 'NOUN credentials required' }, { status: 400 })
    }

    // Call scraper service
    const scraperRes = await fetch(`${process.env.SCRAPER_URL}/scrape-tma`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matric,
        password: noun_password,
        secret: process.env.SCRAPER_SECRET
      })
    })

    const scraperData = await scraperRes.json()

    if (!scraperRes.ok || scraperData.error) {
      return NextResponse.json({ error: scraperData.error }, { status: 400 })
    }

    if (!scraperData.quizzes || scraperData.quizzes.length === 0) {
      return NextResponse.json({ error: 'No TMA quizzes found on your NOUN dashboard' }, { status: 404 })
    }

    // Get course data for AI context
    const { data: courseData } = await supabaseAdmin
      .from('courses')
      .select('course_title, course_code, shared_material_code')
      .eq('id', course_id)
      .single() as { data: any }

    // Get session
    const { data: session } = await supabaseAdmin
      .from('tma_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('status', 'active')
      .single() as { data: any }

    if (!session) return NextResponse.json({ error: 'No active session found' }, { status: 400 })

    // Take the first matching quiz
    const quiz = scraperData.quizzes[0]
    const questions = quiz.questions.slice(0, 10)

    // Get material context
    const materialCode = courseData?.shared_material_code || courseData?.course_code
    let materialContext = ''

    if (materialCode) {
      const { data: chunks } = await supabaseAdmin
        .from('shared_material_chunks')
        .select('chunk_text')
        .eq('course_code', materialCode)
        .limit(10) as { data: any[] | null }

      if (chunks && chunks.length > 0) {
        materialContext = chunks.map(c => c.chunk_text).join('\n\n---\n\n')
      }
    }

    // Answer all questions at once with one Groq call
    const questionsText = questions.map((q: any, i: number) => {
      const optionsText = q.options.length > 0
        ? `\nOptions:\n${q.options.map((o: string, j: number) => `${String.fromCharCode(65 + j)}. ${o}`).join('\n')}`
        : ''
      return `Question ${i + 1}: ${q.questionText}${optionsText}`
    }).join('\n\n')

    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `You are a NOUN TMA assistant for ${courseData?.course_title} (${courseData?.course_code}).
${materialContext ? `COURSE MATERIAL:\n${materialContext}\n\n` : ''}
Answer ALL these TMA questions. For each question reply with ONLY:
Q[number]: [Letter]. [Option text]
Example: Q1: B. Success

${questionsText}

Answer all questions now:`
      }],
      max_tokens: 1024
    })

    const aiResponse = result.choices[0]?.message?.content || ''

    // Parse AI answers
    const answersMap: Record<number, string> = {}
    const lines = aiResponse.split('\n')
    lines.forEach(line => {
      const match = line.match(/Q(\d+):\s*(.+)/)
      if (match) {
        answersMap[parseInt(match[1])] = match[2].trim()
      }
    })

    // Build final Q&A pairs
    const answeredQuestions = questions.map((q: any, i: number) => ({
      question: q.questionText,
      options: q.options,
      answer: answersMap[i + 1] || 'Could not determine answer',
      questionNumber: i + 1
    }))

    // Save all to tma_questions
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', (await supabaseAdmin.auth.getUser()).data.user?.id)
      .single() as { data: any }

    for (const q of answeredQuestions) {
      await supabaseAdmin.from('tma_questions').insert({
        session_id,
        user_id: session.user_id,
        course_id,
        question_text: q.question,
        answer_text: q.answer,
        source: materialContext ? 'course_material' : 'internet',
        question_number: q.questionNumber
      })
    }

    await supabaseAdmin
      .from('tma_sessions')
      .update({ question_count: answeredQuestions.length })
      .eq('id', session_id)

    return NextResponse.json({
      success: true,
      quiz_title: quiz.title,
      questions: answeredQuestions
    })

  } catch (err: any) {
    console.error('Auto-read error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}