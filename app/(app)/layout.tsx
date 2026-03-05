'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/candidates', label: 'CV Pool', icon: '👥' },
  { href: '/jobs', label: 'Job Ads', icon: '📋' },
  { href: '/evaluate', label: 'Evaluate', icon: '⚡' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
      else setUser(user)
      setLoading(false)
    })
  }, [router])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f9fa' }}>
        <div style={{ width: '220px', background: 'white', borderRight: '1px solid #e5e7eb', flexShrink: 0 }} />
        <div style={{ flex: 1, padding: '32px' }}>
          <div style={{ width: '200px', height: '24px', background: '#e5e7eb', borderRadius: '6px', marginBottom: '16px', animation: 'pulse 1.5s infinite' }} />
          <div style={{ width: '300px', height: '16px', background: '#f3f4f6', borderRadius: '6px', marginBottom: '32px', animation: 'pulse 1.5s infinite' }} />
          <div style={{ width: '100%', height: '120px', background: '#f3f4f6', borderRadius: '10px', animation: 'pulse 1.5s infinite' }} />
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f9fa' }}>
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40 }}
          className="sidebar-overlay"
        />
      )}

      <div
        className="sidebar"
        style={{
          width: '220px', background: 'white', borderRight: '1px solid #e5e7eb',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 50,
          transition: 'transform 0.2s ease',
        }}
      >
        <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', background: '#2563eb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontWeight: 700, fontSize: '14px' }}>S</span>
            </div>
            <span style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>SQILL</span>
          </div>
        </div>
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {NAV.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 12px', borderRadius: '8px', marginBottom: '2px',
                textDecoration: 'none', fontSize: '14px', fontWeight: active ? 500 : 400,
                background: active ? '#eff6ff' : 'transparent',
                color: active ? '#2563eb' : '#374151',
              }}>
                <span>{item.icon}</span>{item.label}
              </Link>
            )
          })}
        </nav>
        <div style={{ padding: '14px 16px', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
          <button onClick={signOut} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '13px', cursor: 'pointer', padding: 0 }}>Sign out →</button>
        </div>
      </div>

      <div className="main-content" style={{ flex: 1, marginLeft: '220px', overflow: 'auto' }}>
        <div className="mobile-header" style={{ display: 'none', padding: '12px 16px', background: 'white', borderBottom: '1px solid #e5e7eb', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px' }} aria-label="Toggle menu">
            ☰
          </button>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>SQILL</span>
        </div>
        {children}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .sidebar { transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'}; }
          .sidebar-overlay { display: ${sidebarOpen ? 'block' : 'none'} !important; }
          .main-content { margin-left: 0 !important; }
          .mobile-header { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
