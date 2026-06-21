import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MaintenanceCheck } from '@/components/MaintenanceCheck'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MaintenanceCheck>
          {children}
        </MaintenanceCheck>
      </body>
    </html>
  )
}


'use client'
import { useEffect, useState } from 'react'

export function MaintenanceCheck({ children }: { children: React.ReactNode }) {
  const [maintenance, setMaintenance] = useState(false)
  const [message, setMessage] = useState('')
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/status.json', { cache: 'no-store' })
        const data = await res.json()
        setMaintenance(data.maintenance)
        setMessage(data.message)
      } catch (e) {
        console.error('Status check failed', e)
      } finally {
        setChecked(true)
      }
    }
    check()
    const interval = setInterval(check, 30000) // recheck every 30s
    return () => clearInterval(interval)
  }, [])

  if (!checked) return null

  if (maintenance) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111827',
        color: 'white',
        padding: '24px',
        textAlign: 'center'
      }}>
        <div style={{
          width: '60px', height: '60px',
          border: '4px solid rgba(234,179,8,0.2)',
          borderTopColor: '#eab308',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '24px'
        }} />
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
          We'll be right back
        </h2>
        <p style={{ color: '#9ca3af', fontSize: '14px', maxWidth: '320px' }}>
          {message || 'The site is temporarily unavailable. Please check back shortly.'}
        </p>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  return <>{children}</>
}


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rose Gold — VIP TMA Assistant",
  description: "Premium auto-TMA service for NOUN students.",
  manifest: "/manifest.json",
  themeColor: "#eab308",
  openGraph: {
    title: "Rose Gold",
    description: "TMA service for NOUN students.",
    url: "https://rose-gold-two.vercel.app",
    siteName: "Rose Gold",
    images: [
      {
        url: "https://rose-gold-two.vercel.app/og-image.png",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
