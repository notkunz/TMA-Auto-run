import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { subject, message, category, user_name, user_email, user_matric } = await req.json()

    // Send via Resend (free email API — sign up at resend.com)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'support@noun-tma.app <onboarding@resend.dev>',
        to: process.env.SUPPORT_EMAIL,
        subject: `[${category.toUpperCase()}] ${subject || 'Support Request'} — ${user_name}`,
        html: `
          <h2>Support Request</h2>
          <p><strong>From:</strong> ${user_name} (${user_matric})</p>
          <p><strong>Email:</strong> ${user_email}</p>
          <p><strong>Category:</strong> ${category}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <hr/>
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
        `
      })
    })

    if (!res.ok) {
      const err = await res.json()
      console.error('Email error:', err)
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}