import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  try {
    const { question, options, course_code, run_id, question_number } =
      await req.json();

    const optionsText =
      options?.length > 0
        ? options
            .map(
              (o: string, i: number) => `${String.fromCharCode(65 + i)}. ${o}`,
            )
            .join("\n")
        : "";

    const result = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "user",
          content: `You are an academic assistant for NOUN students.
Course: ${course_code}

Answer this multiple choice question:
QUESTION: "${question}"
${optionsText ? `OPTIONS:\n${optionsText}` : ""}

Reply with ONLY the letter and option text e.g "C. Radio rural forum"`,
        },
      ],
      max_tokens: 256,
    });

    const answer =
      result.choices[0]?.message?.content || "Could not find answer";

    // Save internet answer back to vip_runs results in Supabase
    if (run_id && question_number !== undefined) {
      const { data: run } = (await supabaseAdmin
        .from("vip_runs")
        .select("results")
        .eq("id", run_id)
        .single()) as { data: any };

      if (run?.results) {
        const updatedResults = run.results.map((r: any) => {
          if (r.questionNumber === question_number && r.question === question) {
            return {
              ...r,
              answer,
              internetAnswer: answer,
              source: "internet",
            };
          }
          return r;
        });

        await supabaseAdmin
          .from("vip_runs")
          .update({ results: updatedResults })
          .eq("id", run_id);
      }
    }

    return NextResponse.json({ answer });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
