'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'

export default function RunResultPage() {
  const supabase = createClient()
  const { runId } = useParams()
  const router = useRouter()
  const [run, setRun] = useState<any>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('vip_runs').select('*').eq('id', runId).single() as { data: any }
      setRun(data)
    }
    load()
  }, [])

  if (!run) return <div className="text-gray-400 p-8">Loading...</div>

  const results = run.results || []
const grouped: Record<string, any[]> = {}
results.forEach((r: any) => {
  if (!grouped[r.courseCode]) grouped[r.courseCode] = []
  grouped[r.courseCode].push(r)
})

const groupedEntries = Object.entries(grouped)

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <div>
          <h2 className="text-xl font-bold text-yellow-400">{run.tma_round} Results</h2>
          <p className="text-gray-400 text-xs">{run.noun_matric} • {new Date(run.started_at).toLocaleDateString()}</p>
        </div>
      </div>

     {groupedEntries.map(([courseCode, questions]) => (
        <div key={courseCode} className="bg-gray-800 rounded-xl overflow-hidden mb-4">
          <div className="bg-gray-700 px-5 py-3 flex items-center gap-3">
            <span className="bg-yellow-500 text-gray-900 text-xs font-bold px-2 py-1 rounded-lg">
              {courseCode}
            </span>
            <span className="text-white font-semibold text-sm">{questions[0].courseTitle}</span>
          </div>
          <div className="divide-y divide-gray-700">
            {questions.map((q: any, i: number) => (
              <div key={i} className="p-5">
                <p className="text-gray-300 text-sm mb-3">
                  <span className="text-yellow-400 font-bold mr-2">Q{q.questionNumber}.</span>
                  {q.question}
                </p>
                {q.source === 'not_found' ? (
  <div>
    <p style={{ color: '#f87171', fontSize: '13px' }}>
      Answer not found in course material
    </p>
    {q.internetAnswer && (
      <div style={{
        marginTop: '8px', background: 'rgba(59,130,246,0.1)',
        border: '1px solid rgba(59,130,246,0.3)',
        borderRadius: '8px', padding: '10px'
      }}>
        <p style={{ fontSize: '11px', color: '#93c5fd', marginBottom: '4px' }}>Internet Answer:</p>
        <p style={{ color: 'white', fontWeight: 600, fontSize: '14px' }}>{q.internetAnswer}</p>
      </div>
    )}
  </div>
) : (
                  <div className={`rounded-lg p-3 ${
                    q.source === 'question_bank' ? 'bg-purple-900/30 border border-purple-500/30' :
                    q.source === 'internet' ? 'bg-blue-900/30 border border-blue-500/30' :
                    'bg-green-900/30 border border-green-500/30'
                  }`}>
                    <p className="text-white font-bold">{q.answer}</p>
                    <p className="text-xs mt-1 text-gray-400">
                      {q.source === 'question_bank' && '⚡ Question bank'}
                      {q.source === 'course_material' && '📖 Course material'}
                      {q.source === 'internet' && '🌐 Internet'}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}