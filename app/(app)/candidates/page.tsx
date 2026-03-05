'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Candidate } from '@/types'
import { toast } from 'sonner'

const statusBadge = (s: string) => {
  const map: Record<string, { bg: string, color: string, label: string }> = {
    pending: { bg: '#fffbeb', color: '#d97706', label: 'Processing' },
    parsed: { bg: '#ecfdf5', color: '#059669', label: 'Ready' },
    error: { bg: '#fef2f2', color: '#dc2626', label: 'Error' }
  }
  return map[s] || { bg: '#f3f4f6', color: '#6b7280', label: s }
}

export default function CandidatesPage() {
  const supabase = createClient()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('candidates').select('*').order('created_at', { ascending: false })
    if (error) {
      toast.error('Failed to load candidates')
      console.error(error)
    }
    setCandidates(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const upload = async (files: FileList) => {
    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
    if (!pdfFiles.length) {
      toast.error('Please select PDF files only')
      return
    }
    setUploading(true)
    setUploadProgress({ current: 0, total: pdfFiles.length })
    let successCount = 0
    let failCount = 0

    for (const file of pdfFiles) {
      setUploadProgress(p => ({ ...p, current: p.current + 1 }))
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await fetch('/api/candidates', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) {
          failCount++
          toast.error(`Failed to upload ${file.name}: ${data.error}`)
        } else if (data.warning) {
          successCount++
          toast.warning(`${file.name}: ${data.warning}`)
        } else {
          successCount++
        }
      } catch {
        failCount++
        toast.error(`Failed to upload ${file.name}`)
      }
    }
    if (successCount > 0) toast.success(`${successCount} CV${successCount > 1 ? 's' : ''} uploaded successfully`)
    if (failCount > 0 && successCount === 0) toast.error('All uploads failed')
    await load()
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete "${name || 'this candidate'}"? This cannot be undone.`)) return
    const prev = candidates
    setCandidates(c => c.filter(x => x.id !== id))
    try {
      const res = await fetch('/api/candidates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (!res.ok) {
        setCandidates(prev)
        toast.error('Failed to delete candidate')
      } else {
        toast.success('Candidate deleted')
      }
    } catch {
      setCandidates(prev)
      toast.error('Failed to delete candidate')
    }
  }

  const filtered = candidates.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (c.full_name?.toLowerCase().includes(q)) ||
        (c.email?.toLowerCase().includes(q)) ||
        (c.profile?.domains?.some(d => d.toLowerCase().includes(q)))
    }
    return true
  })
  const parsed = candidates.filter(c => c.status === 'parsed').length

  return (
    <div style={{ padding: '32px', maxWidth: '860px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>CV Pool</h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>{candidates.length} candidates · {parsed} ready to evaluate</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={e => e.target.files && upload(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ padding: '9px 18px', background: '#2563eb', border: 'none', borderRadius: '8px', color: 'white', fontSize: '14px', fontWeight: 500, cursor: 'pointer', opacity: uploading ? 0.7 : 1 }}>
            {uploading ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` : '+ Upload CVs'}
          </button>
        </div>
      </div>

      <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files) upload(e.dataTransfer.files) }}
        onClick={() => { if (!uploading) fileRef.current?.click() }}
        role="button" tabIndex={0} aria-label="Upload CV files"
        onKeyDown={e => { if (e.key === 'Enter') fileRef.current?.click() }}
        style={{ border: '2px dashed #e5e7eb', borderRadius: '10px', padding: '28px', textAlign: 'center', marginBottom: '20px', cursor: uploading ? 'not-allowed' : 'pointer', background: '#fafafa' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>📄</div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>Drop PDF files here</div>
        <div style={{ fontSize: '13px', color: '#9ca3af' }}>or click to browse · max 10MB per file</div>
      </div>

      {candidates.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            type="text" placeholder="Search candidates..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: '200px', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', color: '#111827' }}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', color: '#374151', background: 'white' }}>
            <option value="all">All statuses</option>
            <option value="parsed">Ready</option>
            <option value="pending">Processing</option>
            <option value="error">Error</option>
          </select>
        </div>
      )}

      {loading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>Loading...</div>
      ) : candidates.length === 0 ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No CVs yet. Upload to get started.</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No candidates match your search.</div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
          {filtered.map((c, i) => {
            const badge = statusBadge(c.status)
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <div style={{ width: '36px', height: '36px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '14px', flexShrink: 0, fontSize: '16px' }}>👤</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name || 'Unnamed candidate'}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                    {c.email && <span>{c.email}</span>}
                    {c.profile?.seniority && <span> · {c.profile.seniority}{c.profile.domains?.[0] ? ` · ${c.profile.domains[0]}` : ''}</span>}
                  </div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 500, color: badge.color, background: badge.bg, padding: '3px 10px', borderRadius: '20px', marginRight: '12px', flexShrink: 0 }}>{badge.label}</span>
                <button
                  onClick={() => remove(c.id, c.full_name || 'Unnamed')}
                  aria-label={`Delete ${c.full_name || 'candidate'}`}
                  style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '18px', padding: '4px 8px', borderRadius: '4px' }}
                >×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
