'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function VIPSignupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '', email: '', password: '',
    matric_number: '', phone: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await res.json()
    setLoading(false)
    if (data.error) return setError(data.error)
    router.push('/login?registered=true')
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl shadow-xl p-8 w-full max-w-md border border-yellow-500/30">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-yellow-400">Join Rose Gold</h1>
          <p className="text-gray-400 text-sm mt-1">Your Assistant</p>
        </div>

        {error && (
          <p className="bg-red-900/50 text-red-400 text-sm p-3 rounded-lg mb-4">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
         <input type="email" placeholder="Email Address" required
            onChange={e => setForm({ ...form, email: e.target.value })}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white placeholder-gray-400" />
          <input placeholder="Phone Number" required
            onChange={e => setForm({ ...form, phone: e.target.value })}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white placeholder-gray-400" />
          <input type="password" placeholder="Password (min 8 chars)" required minLength={8}
            onChange={e => setForm({ ...form, password: e.target.value })}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white placeholder-gray-400" />

          <button type="submit" disabled={loading}
            className="w-full bg-yellow-500 text-gray-900 rounded-lg p-3 font-bold hover:bg-yellow-400 disabled:opacity-50 mt-2">
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account? <a href="/login" className="text-yellow-400 font-medium">Sign in</a>
        </p>
      </div>
    </div>
  )
}