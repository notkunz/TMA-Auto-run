'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ResultsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [runs, setRuns] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase
        .from('users').select('id').eq('auth_id', user.id).single() as { data: any }
      const { data } = await supabase
        .from('vip_runs').select('*')
        .eq('user_id', p.id)
        .order('started_at', { ascending: false })
      setRuns(data || [])
    }
    load()
  }, [])

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-yellow-400 mb-6">📋 My TMA Results</h2>

      {runs.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-8 text-center">
          <p className="text-4xl mb-4">📭</p>
          <p className="text-gray-400">No TMA runs yet.</p>
          <button onClick={() => router.push('/dashboard/run-tma')}
            className="mt-4 bg-yellow-500 text-gray-900 px-6 py-2 rounded-xl font-bold text-sm">
            Begin TMA
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => (
            <div key={run.id} className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-bold text-white">{run.tma_round} — {run.noun_matric}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {new Date(run.started_at).toLocaleDateString()} | {run.results?.length || 0} questions
                  </p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                  run.status === 'completed' ? 'bg-green-900 text-green-400' :
                  run.status === 'failed' ? 'bg-red-900 text-red-400' :
                  'bg-blue-900 text-blue-400'
                }`}>{run.status}</span>
              </div>
              {run.status === 'completed' && (
                <button
                  onClick={() => router.push(`/dashboard/results/${run.id}`)}
                  className="text-xs text-yellow-400 hover:underline">
                  View answers →
                </button>
              )}
              {run.status === 'failed' && (
                <p className="text-red-400 text-xs mt-1">{run.error_message}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
