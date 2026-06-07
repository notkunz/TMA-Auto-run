'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setMessage('Password must be at least 8 characters')
    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) return setMessage('Error: ' + error.message)
    setMessage('Password updated! Redirecting...')
    setTimeout(() => router.push('/login'), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm border border-yellow-500/30">
        <h1 className="text-xl font-bold text-yellow-400 mb-6 text-center">
          Set New Password
        </h1>
        {message && (
          <p className={`text-sm p-3 rounded-lg mb-4 ${
            message.includes('✅') ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
          }`}>{message}</p>
        )}
        <form onSubmit={handleReset} className="space-y-4">
          <input type="password" placeholder="New password (min 8 chars)"
            value={password} onChange={e => setPassword(e.target.value)}
            minLength={8} required
            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white" />
          <button type="submit" disabled={loading}
            className="w-full bg-yellow-500 text-gray-900 rounded-xl py-3 font-bold disabled:opacity-50">
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}