'use client'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa', padding: '24px' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>Something went wrong</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            padding: '10px 24px', background: '#2563eb', border: 'none',
            borderRadius: '8px', color: 'white', fontSize: '14px',
            fontWeight: 500, cursor: 'pointer'
          }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
