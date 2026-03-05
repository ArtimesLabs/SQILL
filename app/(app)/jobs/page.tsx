'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { JobAd } from '@/types'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const supabase = createClient()

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobAd[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [rawText, setRawText] = useState('')
  const [search, setSearch] = useState('')
  const router = useRouter()

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('job_ads').select('*').order('created_at', { ascending: false })
    if (error) {
      toast.error('Failed to load jobs')
      console.error(error)
    }
    setJobs(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!title.trim() || !rawText.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, raw_text: rawText })
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to create job ad')
      } else {
        toast.success('Job ad created successfully')
        setTitle(''); setRawText(''); setShowForm(false)
        await load()
      }
    } catch {
      toast.error('Failed to create job ad')
    }
    setCreating(false)
  }

  const remove = async (id: string, jobTitle: string) => {
    if (!confirm(`Delete "${jobTitle}"? This will also remove all evaluations for this job.`)) return
    const prev = jobs
    setJobs(j => j.filter(x => x.id !== id))
    try {
      const res = await fetch('/api/jobs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (!res.ok) {
        setJobs(prev)
        toast.error('Failed to delete job ad')
      } else {
        toast.success('Job ad deleted')
      }
    } catch {
      setJobs(prev)
      toast.error('Failed to delete job ad')
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string, color: string, label: string }> = {
      pending: { bg: '#fffbeb', color: '#d97706', label: 'Processing' },
      parsed: { bg: '#ecfdf5', color: '#059669', label: 'Ready' },
      error: { bg: '#fef2f2', color: '#dc2626', label: 'Error' }
    }
    return map[s] || { bg: '#f3f4f6', color: '#6b7280', label: s }
  }

  const filtered = jobs.filter(j => {
    if (!search) return true
    const q = search.toLowerCase()
    return j.title.toLowerCase().includes(q) ||
      j.profile?.domains?.some(d => d.toLowerCase().includes(q))
  })

  return (
    <div style={{ padding: '32px', maxWidth: '860px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>Job Ads</h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>{jobs.length} open roles</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{ padding: '9px 18px', background: showForm ? 'white' : '#2563eb', border: showForm ? '1px solid #e5e7eb' : 'none', borderRadius: '8px', color: showForm ? '#374151' : 'white', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ New Job Ad'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '24px', marginBottom: '20px' }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Job title (e.g. Senior Backend Engineer)"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '12px', outline: 'none', color: '#111827' }} />
          <textarea value={rawText} onChange={e => setRawText(e.target.value)} placeholder="Paste the full job description here..." rows={10}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', lineHeight: '1.6', resize: 'vertical', outline: 'none', marginBottom: '16px', color: '#374151' }} />
          <button onClick={create} disabled={creating || !title || !rawText}
            style={{ padding: '9px 20px', background: '#2563eb', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 500, cursor: 'pointer', opacity: creating || !title || !rawText ? 0.6 : 1 }}>
            {creating ? 'Saving...' : 'Save Job Ad'}
          </button>
        </div>
      )}

      {jobs.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <input
            type="text" placeholder="Search jobs..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', maxWidth: '400px', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', color: '#111827' }}
          />
        </div>
      )}

      {loading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>Loading...</div>
      ) : jobs.length === 0 ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No job ads yet.</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>No jobs match your search.</div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
          {filtered.map((j, i) => {
            const badge = statusBadge(j.status)
            return (
              <div key={j.id} onClick={() => router.push(`/evaluate?job_id=${j.id}`)}
                style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                <div style={{ width: '36px', height: '36px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '14px', flexShrink: 0, fontSize: '16px' }}>📋</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                    {j.profile?.must_haves?.length || 0} must-haves · {new Date(j.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 500, color: badge.color, background: badge.bg, padding: '3px 10px', borderRadius: '20px', marginRight: '12px', flexShrink: 0 }}>{badge.label}</span>
                <span style={{ fontSize: '13px', color: '#2563eb', marginRight: '12px', fontWeight: 500, flexShrink: 0 }}>Evaluate →</span>
                <button onClick={e => { e.stopPropagation(); remove(j.id, j.title) }}
                  aria-label={`Delete ${j.title}`}
                  style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '18px', padding: '4px 8px', borderRadius: '4px' }}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
