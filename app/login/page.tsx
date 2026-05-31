'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function VIPLoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMessage, setForgotMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword(form)
    setLoading(false)
    if (error) return setError('Invalid email or password')
    router.push('/dashboard')
    router.refresh()
  }

  const handleForgotPassword = async () => {
  if (!forgotEmail) return
  setForgotLoading(true)
  const supabase = createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
  redirectTo: `${window.location.origin}/reset-password`
})
  setForgotLoading(false)
  if (error) setForgotMessage('Error: ' + error.message)
  else setForgotMessage('✅ Reset link sent! Check your email.')
}

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl shadow-xl p-8 w-full max-w-sm border border-yellow-500/30">
        <div className="text-center mb-8">
          <p className="text-4xl mb-2 font-bold text-yellow-400">YOUR</p>
          <h1 className="text-2xl font-bold text-yellow-400">NTA</h1>
          <p className="text-gray-400 text-sm mt-1">TMA Assistant</p>
        </div>

        {error && (
          <p className="bg-red-900/50 text-red-400 text-sm p-3 rounded-lg mb-4">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" placeholder="Email Address" required
            onChange={e => setForm({ ...form, email: e.target.value })}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500" />
          <input type="password" placeholder="Password" required
            onChange={e => setForm({ ...form, password: e.target.value })}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500" />
          <button type="submit" disabled={loading}
            className="w-full bg-yellow-500 text-gray-900 rounded-lg p-3 font-bold hover:bg-yellow-400 disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
          {/* Forgot Password */}
<div className="mt-4 text-center">
  <button onClick={() => setShowForgot(!showForgot)}
    className="text-xs text-gray-500 hover:text-yellow-400">
    Forgot password?
  </button>
</div>

{showForgot && (
  <div className="mt-4 bg-gray-700 rounded-xl p-4">
    <p className="text-gray-300 text-xs mb-3">
      Enter your email and we'll send a reset link
    </p>
    <input type="email" placeholder="Your email address"
      value={forgotEmail}
      onChange={e => setForgotEmail(e.target.value)}
      className="w-full bg-gray-600 border border-gray-500 rounded-lg p-2.5 text-sm text-white placeholder-gray-400 mb-2" />
    {forgotMessage && (
      <p className={`text-xs mb-2 ${forgotMessage.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>
        {forgotMessage}
      </p>
    )}
    <button onClick={handleForgotPassword} disabled={forgotLoading}
      className="w-full bg-yellow-500 text-gray-900 rounded-lg py-2 text-sm font-bold disabled:opacity-50">
      {forgotLoading ? 'Sending...' : 'Send Reset Link'}
    </button>
  </div>
)}
        <p className="text-center text-sm text-gray-500 mt-4">
          No account? <a href="/signup" className="text-yellow-400 font-medium">Create one</a>
        </p>
      </div>
    </div>
    
  )
}