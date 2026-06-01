'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'

export default function VIPLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [tokens, setTokens] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push('/login')

      const { data: profile } = await supabase
        .from('users').select('id, full_name')
        .eq('auth_id', user.id).single() as { data: any }
      setUser(profile)

      const { data: tokenWallet } = await supabase
        .from('token_wallets').select('balance')
        .eq('user_id', profile?.id).single() as { data: any }
      setTokens(tokenWallet?.balance || 0)
    }
    load()
  }, [])

  useEffect(() => { setOpen(false) }, [pathname])

  const navLinks = [
    { label: '🏠 Dashboard', href: '/dashboard' },
    { label: '🚀 Begin TMA', href: '/dashboard/run-tma' },
    { label: '📋 My Results', href: '/dashboard/results' },
    { label: '🪙 Tokens', href: '/dashboard/tokens' },
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Navbar */}
      <nav className="bg-gray-800 border-b border-yellow-500/20 px-4 py-3 flex items-center justify-between fixed top-0 left-0 right-0 z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => setOpen(!open)}
            className="p-2 rounded-lg hover:bg-gray-700 text-xl">
            {open ? '✕' : '☰'}
          </button>
          <div>
            <span className="font-bold text-yellow-400">👑 Rose Gold</span>
            <span className="text-gray-500 text-xs ml-2">Auto TMA</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-gray-400 text-xs">Tokens</p>
            <p className="font-bold text-yellow-400">🪙 {tokens}</p>
          </div>
          <button onClick={() => router.push('/dashboard/tokens')}
            className="text-xs bg-yellow-500 text-gray-900 px-3 py-1.5 rounded-full font-bold hover:bg-yellow-400">
            Buy
          </button>
        </div>
      </nav>

      {/* Overlay */}
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 45 }} />
      )}

      {/* Sidebar */}
      <div style={{
        position: 'fixed', top: 0, left: 0,
        height: '100%', width: '260px',
        background: '#111827',
        borderRight: '1px solid rgba(234,179,8,0.2)',
        zIndex: 50,
        transform: open ? 'translateX(0)' : 'translateX(-260px)',
        transition: 'transform 0.3s ease',
        overflowY: 'auto'
      }}>
        <div style={{ padding: '24px' }}>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '13px', cursor: 'pointer', marginBottom: '24px' }}>
            ✕ Close
          </button>

          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '11px', color: '#6b7280' }}>Logged in as</p>
            <p style={{ fontWeight: 700, color: 'white' }}>{user?.full_name || 'VIP User'}</p>
          </div>

          <div style={{
            background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)',
            borderRadius: '12px', padding: '16px', marginBottom: '24px'
          }}>
            <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Token Balance</p>
            <p style={{ fontSize: '28px', fontWeight: 700, color: '#eab308' }}>🪙 {tokens}</p>
            <button onClick={() => router.push('/dashboard/tokens')}
              style={{
                marginTop: '8px', fontSize: '11px', background: '#eab308',
                color: '#111', border: 'none', padding: '4px 12px',
                borderRadius: '999px', fontWeight: 700, cursor: 'pointer'
              }}>
              Buy Tokens
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navLinks.map(link => (
              <a key={link.href} href={link.href}
                style={{
                  fontSize: '14px', padding: '10px 12px',
                  borderRadius: '8px', textDecoration: 'none',
                  background: pathname === link.href ? 'rgba(234,179,8,0.15)' : 'transparent',
                  color: pathname === link.href ? '#eab308' : '#9ca3af',
                  fontWeight: pathname === link.href ? 700 : 400
                }}>
                {link.label}
              </a>
            ))}
          </div>

          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #1f2937' }}>
            <button onClick={async () => {
              await supabase.auth.signOut()
              router.push('/login')
            }}
              style={{
                width: '100%', fontSize: '13px', background: 'none',
                color: '#6b7280', border: '1px solid #374151',
                padding: '8px 12px', borderRadius: '8px', cursor: 'pointer'
              }}>
              🚪 Logout
            </button>
          </div>
        </div>
      </div>

      <main style={{ paddingTop: '56px', padding: '72px 16px 32px' }}>
        {children}
      </main>
    </div>
  )
}