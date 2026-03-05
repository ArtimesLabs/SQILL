'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Candidate } from '@/types'

const statusBadge = (s: string) => {
  const map: Record<string, { bg: string, color: string, label: string }> = {
    pending: { bg: '#fffbeb', color: '#d97706', label: 'Processing' },
    parsed: { bg: '#ecfdf5', color: '#059669', label: 'Ready' },
    error: { bg: '#fef2f2', color: '#dc2626', label: 'Error' }
  }
  return map[s] || { bg: '#f3f4f6', color: '#6b7280', label: s }
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const load = async () => {
    const { data } = await supabase.from('candidates').select('*').order('created_at', { ascending: false })
    setCandidates(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const upload = async (files: FileList) => {
    setUploading(true)
    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', file)
      await fetch('/api/candidates', { method: 'POST', body: formData })
    }
    await load()
    setUploading(false)
  }

  const remove = async (id: string) => {
    await supabase.from('candidates').delete().eq('id', id)
    setCandidates(c => c.filter(x => x.id !== id))
  }

  const parsed = candidates.filter(c => c.status === 'parsed').length

  return (
    <div style={{ padding: '32px', maxWidth: '860px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>CV Pool</h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>{candidates.length} candidates · {parsed} ready to evaluate</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={e => e.target.files && upload(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ padding: '9px 18px', background: '#2563eb', border: 'none', borderRadius: '8px', color: 'white', fontSize: '14px', fontWeight: 500, cursor: 'pointer', opacity: uploading ? 0.7 : 1 }}>
            {uploading ? 'Uploading...' : '+ Upload CVs'}
          </button>
        </div>
      </div>

      <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); e.dataTransfer.files && upload(e.dataTransfer.files) }}
        onClick={() => fileRef.current?.click()}
        style={{ border: '2px dashed #e5e7eb', borderRadius: '10px', padding: '28px', textAlign: 'center', marginBottom: '20px', cursor: 'pointer', background: '#fafafa' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>📄</div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>Drop PDF files here</div>
        <div style={{ fontSize: '13px', color: '#9ca3af' }}>or click to browse</div>
      </div>

      {loading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>Loading...</div>
      ) : candidates.length === 0 ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No CVs yet. Upload to get started.</div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
          {candidates.map((c, i) => {
            const badge = statusBadge(c.status)
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: i < candidates.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <div style={{ width: '36px', height: '36px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '14px', flexShrink: 0, fontSize: '16px' }}>👤</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, color: '#111827' }}>{c.full_name || 'Unnamed candidate'}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                    {c.email && <span>{c.email}</span>}
                    {c.profile?.seniority && <span> · {c.profile.seniority}{c.profile.domains?.[0] ? ` · ${c.profile.domains[0]}` : ''}</span>}
                  </div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 500, color: badge.color, background: badge.bg, padding: '3px 10px', borderRadius: '20px', marginRight: '12px' }}>{badge.label}</span>
                <button onClick={() => remove(c.id)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '18px' }}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
