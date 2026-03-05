'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'options' | 'email_password' | 'magic_link' | 'verify'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('options')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
  }
  const signInWithPassword = async () => {
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else { router.push('/candidates'); router.refresh() }
  }
  const signUpWithPassword = async () => {
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
    if (error) { setError(error.message); setLoading(false) }
    else setMode('verify')
  }
  const sendMagicLink = async () => {
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
    if (error) { setError(error.message); setLoading(false) }
    else setMode('verify')
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '14px', outline: 'none', color: '#111827', background: 'white' }
  const btnPrimary: React.CSSProperties = { width: '100%', padding: '11px', background: '#2563eb', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 500, cursor: 'pointer', marginBottom: '10px' }
  const btnSecondary: React.CSSProperties = { width: '100%', padding: '11px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', color: '#374151', fontWeight: 500, cursor: 'pointer', marginBottom: '10px' }
  const labelStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '36px', height: '36px', background: '#2563eb', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontWeight: 700, fontSize: '16px' }}>S</span>
            </div>
            <span style={{ fontSize: '22px', fontWeight: 700, color: '#111827' }}>SQILL</span>
          </div>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>AI-powered recruiting platform</p>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
          {mode === 'options' && <>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>Welcome back</h2>
            <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '24px' }}>Sign in to your workspace</p>
            <button onClick={signInWithGoogle} style={{ ...btnSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
              <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
            </div>
            <button onClick={() => setMode('email_password')} style={btnPrimary}>Email + Password</button>
            <button onClick={() => setMode('magic_link')} style={btnSecondary}>Send Magic Link</button>
          </>}
          {mode === 'email_password' && <>
            <button onClick={() => { setMode('options'); setError('') }} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '13px', cursor: 'pointer', marginBottom: '20px', padding: 0 }}>← Back</button>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>Sign in</h2>
            {error && <div style={{ fontSize: '13px', color: '#dc2626', marginBottom: '16px', padding: '10px 12px', background: '#fef2f2', borderRadius: '6px' }}>{error}</div>}
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={inputStyle} />
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && signInWithPassword()} style={inputStyle} />
            <button onClick={signInWithPassword} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>{loading ? 'Signing in...' : 'Sign In'}</button>
            <button onClick={signUpWithPassword} disabled={loading} style={btnSecondary}>Create Account</button>
          </>}
          {mode === 'magic_link' && <>
            <button onClick={() => { setMode('options'); setError('') }} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '13px', cursor: 'pointer', marginBottom: '20px', padding: 0 }}>← Back</button>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>Magic Link</h2>
            {error && <div style={{ fontSize: '13px', color: '#dc2626', marginBottom: '16px', padding: '10px 12px', background: '#fef2f2', borderRadius: '6px' }}>{error}</div>}
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={inputStyle} />
            <button onClick={sendMagicLink} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>{loading ? 'Sending...' : 'Send Link'}</button>
          </>}
          {mode === 'verify' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>📬</div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Check your email</h2>
              <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.6' }}>We sent a link to <strong>{email}</strong></p>
              <button onClick={() => setMode('options')} style={{ marginTop: '24px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 20px', color: '#6b7280', cursor: 'pointer' }}>← Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
