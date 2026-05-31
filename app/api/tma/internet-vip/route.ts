import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

export async function POST(req: Request) {
  try {
    const { question, options, course_code } = await req.json()

    const optionsText = options?.length > 0
      ? options.map((o: string, i: number) =>
          `${String.fromCharCode(65 + i)}. ${o}`
        ).join('\n')
      : ''

    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `You are an academic assistant for NOUN students.
Course: ${course_code}

Answer this multiple choice question:
QUESTION: "${question}"
${optionsText ? `OPTIONS:\n${optionsText}` : ''}

Reply with ONLY the letter and option text e.g "C. Radio rural forum"`
      }],
      max_tokens: 256
    })

    const answer = result.choices[0]?.message?.content || 'Could not find answer'
    return NextResponse.json({ answer })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}