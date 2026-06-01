'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function VIPDashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [tokens, setTokens] = useState(0)
  const [recentRuns, setRecentRuns] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: p } = await supabase
        .from('users').select('*').eq('auth_id', user.id).single() as { data: any }
      setProfile(p)

      const { data: tw } = await supabase
        .from('token_wallets').select('balance').eq('user_id', p.id).single() as { data: any }
      setTokens(tw?.balance || 0)

      const { data: runs } = await supabase
        .from('vip_runs').select('*')
        .eq('user_id', p.id)
        .order('started_at', { ascending: false })
        .limit(5)
      setRecentRuns(runs || [])
    }
    load()
  }, [])

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-yellow-400 mb-1">
        Welcome, {profile?.full_name?.split(' ')[0]} 👑
      </h2>
      <p className="text-gray-500 text-sm mb-6">{profile?.matric_number}</p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 border border-yellow-500/20 rounded-xl p-5">
          <p className="text-gray-400 text-xs mb-1">Token Balance</p>
          <p className="text-3xl font-bold text-yellow-400">🪙 {tokens}</p>
          <button onClick={() => router.push('/dashboard/tokens')}
            className="mt-2 text-xs text-yellow-400 hover:underline">
            Buy more →
          </button>
        </div>
        <div className="bg-gray-800 border border-yellow-500/20 rounded-xl p-5">
          <p className="text-gray-400 text-xs mb-1">TMA Sessions</p>
          <p className="text-3xl font-bold text-white">{recentRuns.length}</p>
          <p className="text-gray-500 text-xs mt-1">total sessions</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 mb-6">
        <h3 className="font-bold text-yellow-400 mb-4">🚀 Quick Actions</h3>
        <div className="grid grid-cols-3 gap-3">
          {['TMA1', 'TMA2', 'TMA3'].map(tma => (
            <button key={tma}
              onClick={() => router.push(`/dashboard/run-tma?round=${tma}`)}
              className="bg-yellow-500 text-gray-900 rounded-xl py-3 font-bold hover:bg-yellow-400 text-sm">
              Run {tma}
            </button>
          ))}
        </div>
        <p className="text-gray-500 text-xs mt-3 text-center">
          1 token per run • Answers all courses automatically
        </p>
      </div>

      {/* Recent Runs */}
      <div className="bg-gray-800 rounded-xl p-5">
        <h3 className="font-bold text-white mb-4">Recent TMA Sessions</h3>
        {recentRuns.length === 0 ? (
          <p className="text-gray-500 text-sm">No sessions yet. Buy a token to start your first TMA!</p>
        ) : (
          <div className="space-y-3">
            {recentRuns.map(run => (
              <div key={run.id} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <div>
                  <p className="font-semibold text-sm">{run.tma_round} — {run.noun_matric}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {new Date(run.started_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    run.status === 'completed' ? 'bg-green-900 text-green-400' :
                    run.status === 'running' ? 'bg-blue-900 text-blue-400' :
                    run.status === 'failed' ? 'bg-red-900 text-red-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>{run.status}</span>
                  {run.status === 'completed' && (
                    <button onClick={() => router.push(`/dashboard/results/${run.id}`)}
                      className="text-xs text-yellow-400 hover:underline">View →</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}