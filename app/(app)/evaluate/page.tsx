'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { JobAd, Candidate, Evaluation } from '@/types'
import { toast } from 'sonner'

const recColor = (r: string) => ({ 'STRONG SHORTLIST': '#059669', 'CONSIDER': '#2563eb', 'WEAK': '#d97706', 'REJECT': '#dc2626' }[r] || '#6b7280')
const recBg = (r: string) => ({ 'STRONG SHORTLIST': '#ecfdf5', 'CONSIDER': '#eff6ff', 'WEAK': '#fffbeb', 'REJECT': '#fef2f2' }[r] || '#f3f4f6')
const verdictColor = (v: string) => ({ STRONG: '#059669', ADEQUATE: '#2563eb', WEAK: '#d97706', DISQUALIFYING: '#dc2626' }[v] || '#6b7280')
const statusColor = (s: string) => ({ MET: '#059669', PARTIAL: '#d97706', MISSING: '#dc2626' }[s] || '#6b7280')

function HighlightedJobAd({ rawText, spans }: { rawText: string, spans: string[] }) {
  if (!spans.length) return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.8', color: '#6b7280' }}>{rawText}</pre>

  let parts: { text: string, highlight: boolean }[] = [{ text: rawText, highlight: false }]
  spans.forEach(span => {
    if (!span) return
    parts = parts.flatMap(part => {
      if (part.highlight) return [part]
      const idx = part.text.toLowerCase().indexOf(span.toLowerCase())
      if (idx === -1) return [part]
      return [
        { text: part.text.slice(0, idx), highlight: false },
        { text: part.text.slice(idx, idx + span.length), highlight: true },
        { text: part.text.slice(idx + span.length), highlight: false }
      ].filter(p => p.text)
    })
  })

  return (
    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.8', color: '#6b7280' }}>
      {parts.map((p, i) => p.highlight
        ? <mark key={i} style={{ background: '#dcfce7', color: '#059669', borderRadius: '2px', padding: '0 2px' }}>{p.text}</mark>
        : <span key={i}>{p.text}</span>
      )}
    </pre>
  )
}

function CandidateDetail({ evaluation, jobAd, onClose }: { evaluation: Evaluation, jobAd: JobAd, onClose: () => void }) {
  const [tab, setTab] = useState<'dimensions' | 'requirements' | 'jobad'>('dimensions')
  const result = evaluation.result

  const jobAdSpans = result.requirements_match
    ?.filter(r => r.status === 'MET' || r.status === 'PARTIAL')
    .map(r => r.job_ad_span)
    .filter(Boolean) as string[]

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: '520px', maxWidth: '100vw',
      background: 'white', borderLeft: '1px solid #e5e7eb',
      display: 'flex', flexDirection: 'column', zIndex: 100,
      animation: 'slideIn 0.2s ease', boxShadow: '-4px 0 24px rgba(0,0,0,0.08)'
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

      <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '15px', color: '#111827', fontWeight: 600 }}>
            {evaluation.candidate?.full_name || 'Candidate'}
          </div>
          <div style={{
            fontSize: '11px', color: recColor(evaluation.recommendation), marginTop: '4px',
            fontWeight: 600, letterSpacing: '0.5px',
            background: recBg(evaluation.recommendation), padding: '2px 8px', borderRadius: '4px', display: 'inline-block'
          }}>
            {evaluation.recommendation}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close panel" style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '20px', padding: '4px' }}>×</button>
      </div>

      <div style={{ padding: '16px 24px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7' }}>{result.recruiter_summary}</div>
        {result.top_compensation && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#059669', borderLeft: '2px solid #059669', paddingLeft: '10px' }}>
            {result.top_compensation}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
        {(['dimensions', 'requirements', 'jobad'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '12px', background: 'none',
            border: 'none', borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
            color: tab === t ? '#2563eb' : '#6b7280', fontSize: '12px',
            fontWeight: tab === t ? 600 : 400, cursor: 'pointer',
            fontFamily: 'inherit', transition: 'all 0.15s'
          }}>
            {t === 'jobad' ? 'Job Ad' : t === 'dimensions' ? 'Dimensions' : 'Requirements'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {tab === 'dimensions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {result.dimensions?.map((dim, i) => (
              <div key={i} style={{
                padding: '14px 16px', background: '#f9fafb',
                borderLeft: `3px solid ${verdictColor(dim.verdict)}`,
                borderRadius: '0 8px 8px 0', border: '1px solid #e5e7eb',
                borderLeftWidth: '3px', borderLeftColor: verdictColor(dim.verdict)
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ fontSize: '13px', color: '#111827', fontWeight: 600 }}>{dim.name}</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>{dim.confidence}</span>
                    <span style={{
                      fontSize: '11px', color: verdictColor(dim.verdict),
                      padding: '2px 8px', background: `${verdictColor(dim.verdict)}15`,
                      borderRadius: '4px', fontWeight: 600
                    }}>{dim.verdict}</span>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.6', fontStyle: 'italic' }}>&ldquo;{dim.evidence}&rdquo;</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'requirements' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {['must_have', 'nice_to_have', 'soft'].map(type => {
              const reqs = result.requirements_match?.filter(r => r.type === type) || []
              if (!reqs.length) return null
              return (
                <div key={type}>
                  <div style={{ fontSize: '11px', letterSpacing: '1px', color: '#9ca3af', marginBottom: '8px', marginTop: '8px', textTransform: 'uppercase', fontWeight: 600 }}>
                    {type === 'must_have' ? 'Must Haves' : type === 'nice_to_have' ? 'Nice to Haves' : 'Soft Signals'}
                  </div>
                  {reqs.map((r, i) => (
                    <div key={i} style={{
                      padding: '12px 14px', background: '#f9fafb', borderRadius: '8px',
                      marginBottom: '6px', borderLeft: `3px solid ${statusColor(r.status)}`, border: '1px solid #e5e7eb',
                      borderLeftWidth: '3px', borderLeftColor: statusColor(r.status)
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div style={{ fontSize: '13px', color: '#111827', flex: 1, paddingRight: '12px' }}>{r.requirement}</div>
                        <span style={{ fontSize: '11px', color: statusColor(r.status), fontWeight: 600, flexShrink: 0 }}>{r.status}</span>
                      </div>
                      {r.evidence && (
                        <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.5', fontStyle: 'italic' }}>
                          {r.cv_span
                            ? <><span style={{ color: '#9ca3af' }}>CV: </span><mark style={{ background: '#dbeafe', color: '#2563eb', borderRadius: '2px', padding: '0 2px' }}>{r.cv_span}</mark></>
                            : r.evidence
                          }
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'jobad' && (
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '1px', color: '#9ca3af', marginBottom: '12px', fontWeight: 600 }}>
              MATCHED REQUIREMENTS HIGHLIGHTED
            </div>
            <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
              <HighlightedJobAd rawText={jobAd.raw_text} spans={jobAdSpans} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Bucket({ label, color, evaluations, onSelect }: {
  label: string, color: string,
  evaluations: Evaluation[], onSelect: (e: Evaluation) => void
}) {
  return (
    <div style={{ flex: 1, minWidth: '200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
        <div style={{ fontSize: '12px', fontWeight: 600, color }}>{label}</div>
        <div style={{ fontSize: '12px', color: '#9ca3af', marginLeft: 'auto', background: '#f3f4f6', borderRadius: '10px', padding: '1px 8px' }}>{evaluations.length}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {evaluations.map(ev => (
          <div key={ev.id}
            onClick={() => onSelect(ev)}
            style={{
              padding: '14px', background: 'white', border: '1px solid #e5e7eb',
              borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
              borderLeft: `3px solid ${color}`
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{ fontSize: '13px', color: '#111827', fontWeight: 500, marginBottom: '4px' }}>
              {ev.candidate?.full_name || 'Candidate'}
            </div>
            {ev.candidate?.profile?.seniority && (
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                {ev.candidate.profile.seniority}{ev.candidate.profile.domains?.[0] ? ` · ${ev.candidate.profile.domains[0]}` : ''}
              </div>
            )}
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px', lineHeight: '1.5' }}>
              {ev.result?.recruiter_summary?.slice(0, 80)}...
            </div>
            <div style={{ fontSize: '11px', color, marginTop: '8px', fontWeight: 500 }}>
              View details →
            </div>
          </div>
        ))}
        {evaluations.length === 0 && (
          <div style={{ fontSize: '12px', color: '#d1d5db', padding: '20px 0', textAlign: 'center', background: '#f9fafb', borderRadius: '8px', border: '1px dashed #e5e7eb' }}>None</div>
        )}
      </div>
    </div>
  )
}

const supabase = createClient()

function EvaluatePageInner() {
  const searchParams = useSearchParams()
  const jobIdParam = searchParams.get('job_id')

  const [jobs, setJobs] = useState<JobAd[]>([])
  const [selectedJob, setSelectedJob] = useState<JobAd | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [running, setRunning] = useState(false)
  const [selected, setSelected] = useState<Evaluation | null>(null)

  useEffect(() => {
    supabase.from('job_ads').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error) toast.error('Failed to load jobs')
      setJobs(data || [])
      if (jobIdParam) {
        const job = (data || []).find((j: JobAd) => j.id === jobIdParam)
        if (job) setSelectedJob(job)
      }
    })
    supabase.from('candidates').select('*').eq('status', 'parsed').then(({ data, error }) => {
      if (error) toast.error('Failed to load candidates')
      setCandidates(data || [])
    })
  }, [jobIdParam])

  useEffect(() => {
    if (!selectedJob) return
    supabase.from('evaluations')
      .select('*, candidate:candidates(*)')
      .eq('job_ad_id', selectedJob.id)
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load evaluations')
        setEvaluations(data || [])
      })
  }, [selectedJob])

  const runEvaluation = async () => {
    if (!selectedJob || !candidates.length) return
    setRunning(true)
    const unevaluated = candidates.filter(c => !evaluations.find(e => e.candidate_id === c.id))
    if (!unevaluated.length) {
      toast.info('All candidates have already been evaluated')
      setRunning(false)
      return
    }

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_ad_id: selectedJob.id, candidate_ids: unevaluated.map(c => c.id) })
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Evaluation failed')
      } else {
        const failed = data.results?.filter((r: { error: string | null }) => r.error)?.length || 0
        const succeeded = data.results?.filter((r: { error: string | null }) => !r.error)?.length || 0
        if (succeeded > 0) toast.success(`${succeeded} candidate${succeeded > 1 ? 's' : ''} evaluated`)
        if (failed > 0) toast.warning(`${failed} evaluation${failed > 1 ? 's' : ''} failed`)
      }
    } catch {
      toast.error('Evaluation request failed')
    }

    const { data } = await supabase.from('evaluations')
      .select('*, candidate:candidates(*)')
      .eq('job_ad_id', selectedJob.id)
    setEvaluations(data || [])
    setRunning(false)
  }

  const buckets = {
    green: evaluations.filter(e => e.recommendation === 'STRONG SHORTLIST'),
    blue: evaluations.filter(e => e.recommendation === 'CONSIDER'),
    amber: evaluations.filter(e => e.recommendation === 'WEAK'),
    red: evaluations.filter(e => e.recommendation === 'REJECT'),
  }

  const unevaluatedCount = candidates.filter(c => !evaluations.find(e => e.candidate_id === c.id)).length

  return (
    <div style={{ padding: '32px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '2px', color: '#9ca3af', marginBottom: '6px', fontWeight: 600 }}>EVALUATE</div>
          <h1 style={{ fontSize: '24px', color: '#111827', fontWeight: 600 }}>
            {selectedJob ? selectedJob.title : 'Select a job ad'}
          </h1>
          {selectedJob && (
            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
              {candidates.length} candidates in pool · {evaluations.length} evaluated
              {unevaluatedCount > 0 && ` · ${unevaluatedCount} pending`}
            </div>
          )}
        </div>
        {selectedJob && unevaluatedCount > 0 && (
          <button
            onClick={runEvaluation} disabled={running}
            style={{
              padding: '12px 24px', background: running ? 'white' : '#2563eb',
              border: running ? '1px solid #2563eb' : 'none', borderRadius: '8px',
              color: running ? '#2563eb' : 'white', fontSize: '14px',
              cursor: running ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', fontWeight: 500, opacity: running ? 0.8 : 1
            }}
          >
            {running ? `Evaluating ${unevaluatedCount} candidates...` : `Run Evaluation (${unevaluatedCount})`}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {jobs.filter(j => j.status === 'parsed').map(j => (
          <button key={j.id} onClick={() => setSelectedJob(j)} style={{
            padding: '8px 14px',
            background: selectedJob?.id === j.id ? '#eff6ff' : 'white',
            border: selectedJob?.id === j.id ? '1px solid #2563eb' : '1px solid #e5e7eb',
            borderRadius: '8px', color: selectedJob?.id === j.id ? '#2563eb' : '#374151',
            fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            fontWeight: selectedJob?.id === j.id ? 500 : 400
          }}>{j.title}</button>
        ))}
        {jobs.filter(j => j.status === 'parsed').length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: '13px' }}>No parsed job ads yet. Create one first.</div>
        )}
      </div>

      {selectedJob && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <Bucket label="Strong Shortlist" color="#059669" evaluations={buckets.green} onSelect={setSelected} />
          <Bucket label="Consider" color="#2563eb" evaluations={buckets.blue} onSelect={setSelected} />
          <Bucket label="Weak" color="#d97706" evaluations={buckets.amber} onSelect={setSelected} />
          <Bucket label="Reject" color="#dc2626" evaluations={buckets.red} onSelect={setSelected} />
        </div>
      )}

      {!selectedJob && (
        <div style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'center', padding: '80px 0' }}>
          Select a job ad above to start evaluating your CV pool
        </div>
      )}

      {selected && selectedJob && (
        <>
          <div onClick={() => setSelected(null)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 99
          }} />
          <CandidateDetail evaluation={selected} jobAd={selectedJob} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  )
}

export default function EvaluatePage() {
  return (
    <Suspense fallback={<div style={{ padding: '32px', color: '#9ca3af', fontSize: '13px' }}>Loading...</div>}>
      <EvaluatePageInner />
    </Suspense>
  )
}
