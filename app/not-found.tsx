import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa', padding: '24px' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '64px', fontWeight: 700, color: '#e5e7eb', marginBottom: '8px' }}>404</div>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>Page not found</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/candidates"
          style={{
            display: 'inline-block', padding: '10px 24px', background: '#2563eb',
            borderRadius: '8px', color: 'white', fontSize: '14px',
            fontWeight: 500, textDecoration: 'none'
          }}
        >
          Go to CV Pool
        </Link>
      </div>
    </div>
  )
}
