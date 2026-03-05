'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { JobAd, Candidate, Evaluation, Recommendation } from '@/types'

// ─── Colors ────────────────────────────────────────────────
const recColor = (r: string) => ({ 'STRONG SHORTLIST': '#00d4a0', 'CONSIDER': '#4a9eff', 'WEAK': '#f6ad55', 'REJECT': '#fc5c65' }[r] || '#4a5568')
const verdictColor = (v: string) => ({ STRONG: '#00d4a0', ADEQUATE: '#4a9eff', WEAK: '#f6ad55', DISQUALIFYING: '#fc5c65' }[v] || '#4a5568')
const statusColor = (s: string) => ({ MET: '#00d4a0', PARTIAL: '#f6ad55', MISSING: '#fc5c65' }[s] || '#4a5568')

// ─── Highlight job ad text ──────────────────────────────────
function HighlightedJobAd({ rawText, spans }: { rawText: string, spans: string[] }) {
  if (!spans.length) return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px', lineHeight: '1.8', color: '#718096' }}>{rawText}</pre>

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
    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px', lineHeight: '1.8', color: '#718096' }}>
      {parts.map((p, i) => p.highlight
        ? <mark key={i} style={{ background: 'rgba(0,212,160,0.2)', color: '#00d4a0', borderRadius: '2px', padding: '0 2px' }}>{p.text}</mark>
        : <span key={i}>{p.text}</span>
      )}
    </pre>
  )
}

// ─── Candidate detail panel ────────────────────────────────
function CandidateDetail({ evaluation, jobAd, onClose }: { evaluation: Evaluation, jobAd: JobAd, onClose: () => void }) {
  const [tab, setTab] = useState<'dimensions' | 'requirements' | 'jobad'>('dimensions')
  const result = evaluation.result

  const jobAdSpans = result.requirements_match
    ?.filter(r => r.status === 'MET' || r.status === 'PARTIAL')
    .map(r => r.job_ad_span)
    .filter(Boolean) as string[]

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: '520px',
      background: '#0d1117', borderLeft: '1px solid #1a2030',
      display: 'flex', flexDirection: 'column', zIndex: 100,
      animation: 'slideIn 0.2s ease'
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

      {/* Panel header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #1a2030', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>
            {evaluation.candidate?.full_name || 'Candidate'}
          </div>
          <div style={{ fontSize: '10px', color: recColor(evaluation.recommendation), marginTop: '2px', letterSpacing: '1px' }}>
            {evaluation.recommendation}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: '18px' }}>×</button>
      </div>

      {/* Recruiter summary */}
      <div style={{ padding: '16px 24px', background: `${recColor(evaluation.recommendation)}0d`, borderBottom: '1px solid #1a2030' }}>
        <div style={{ fontSize: '11px', color: '#a0aec0', lineHeight: '1.7' }}>{result.recruiter_summary}</div>
        {result.top_compensation && (
          <div style={{ marginTop: '10px', fontSize: '10px', color: '#00d4a0', borderLeft: '2px solid #00d4a0', paddingLeft: '10px' }}>
            ↗ {result.top_compensation}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1a2030' }}>
        {(['dimensions', 'requirements', 'jobad'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '12px', background: 'none',
            border: 'none', borderBottom: tab === t ? '2px solid #00d4a0' : '2px solid transparent',
            color: tab === t ? '#00d4a0' : '#4a5568', fontSize: '9px',
            letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer',
            fontFamily: 'inherit', transition: 'all 0.15s'
          }}>
            {t === 'jobad' ? 'Job Ad' : t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* Dimensions tab */}
        {tab === 'dimensions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {result.dimensions?.map((dim, i) => (
              <div key={i} style={{
                padding: '14px 16px', background: '#111827',
                borderLeft: `3px solid ${verdictColor(dim.verdict)}`,
                borderRadius: '0 6px 6px 0', border: `1px solid ${verdictColor(dim.verdict)}25`,
                borderLeftWidth: '3px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 600 }}>{dim.name}</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', color: '#4a5568' }}>{dim.confidence}</span>
                    <span style={{
                      fontSize: '9px', color: verdictColor(dim.verdict), letterSpacing: '1px',
                      padding: '2px 6px', background: `${verdictColor(dim.verdict)}18`,
                      borderRadius: '3px', fontWeight: 700
                    }}>{dim.verdict}</span>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#718096', lineHeight: '1.6', fontStyle: 'italic' }}>"{dim.evidence}"</div>
              </div>
            ))}
          </div>
        )}

        {/* Requirements tab */}
        {tab === 'requirements' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {['must_have', 'nice_to_have', 'soft'].map(type => {
              const reqs = result.requirements_match?.filter(r => r.type === type) || []
              if (!reqs.length) return null
              return (
                <div key={type}>
                  <div style={{ fontSize: '9px', letterSpacing: '2px', color: '#4a5568', marginBottom: '8px', marginTop: '8px', textTransform: 'uppercase' }}>
                    {type === 'must_have' ? 'Must Haves' : type === 'nice_to_have' ? 'Nice to Haves' : 'Soft Signals'}
                  </div>
                  {reqs.map((r, i) => (
                    <div key={i} style={{
                      padding: '12px 14px', background: '#111827', borderRadius: '6px',
                      marginBottom: '6px', borderLeft: `3px solid ${statusColor(r.status)}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div style={{ fontSize: '11px', color: '#e2e8f0', flex: 1, paddingRight: '12px' }}>{r.requirement}</div>
                        <span style={{
                          fontSize: '9px', color: statusColor(r.status), letterSpacing: '1px',
                          fontWeight: 700, flexShrink: 0
                        }}>{r.status}</span>
                      </div>
                      {r.evidence && (
                        <div style={{ fontSize: '10px', color: '#4a5568', lineHeight: '1.5', fontStyle: 'italic' }}>
                          {r.cv_span
                            ? <><span style={{ color: '#718096' }}>CV: </span><mark style={{ background: 'rgba(74,158,255,0.15)', color: '#4a9eff', borderRadius: '2px', padding: '0 2px' }}>{r.cv_span}</mark></>
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

        {/* Job Ad tab with highlights */}
        {tab === 'jobad' && (
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '2px', color: '#4a5568', marginBottom: '12px' }}>
              MATCHED REQUIREMENTS HIGHLIGHTED
            </div>
            <div style={{ background: '#111827', borderRadius: '6px', padding: '16px' }}>
              <HighlightedJobAd rawText={jobAd.raw_text} spans={jobAdSpans} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Bucket column ─────────────────────────────────────────
function Bucket({ label, color, evaluations, onSelect }: {
  label: string, color: string,
  evaluations: Evaluation[], onSelect: (e: Evaluation) => void
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
        <div style={{ fontSize: '10px', letterSpacing: '2px', color, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: '10px', color: '#4a5568', marginLeft: 'auto' }}>{evaluations.length}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {evaluations.map(ev => (
          <div key={ev.id}
            onClick={() => onSelect(ev)}
            style={{
              padding: '14px', background: '#0d1117', border: `1px solid #1a2030`,
              borderRadius: '6px', cursor: 'pointer', transition: 'border-color 0.15s',
              borderLeft: `3px solid ${color}`
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = color)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#1a2030')}
          >
            <div style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 500, marginBottom: '4px' }}>
              {ev.candidate?.full_name || 'Candidate'}
            </div>
            {ev.candidate?.profile?.seniority && (
              <div style={{ fontSize: '10px', color: '#4a5568' }}>
                {ev.candidate.profile.seniority} · {ev.candidate.profile.domains?.[0]}
              </div>
            )}
            <div style={{ fontSize: '10px', color: '#718096', marginTop: '6px', lineHeight: '1.5' }}>
              {ev.result?.recruiter_summary?.slice(0, 80)}...
            </div>
            <div style={{ fontSize: '9px', color: color, marginTop: '8px', letterSpacing: '1px' }}>
              View details →
            </div>
          </div>
        ))}
        {evaluations.length === 0 && (
          <div style={{ fontSize: '10px', color: '#2d3748', padding: '20px 0', textAlign: 'center' }}>None</div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────
function EvaluatePageInner() {
  const searchParams = useSearchParams()
  const jobIdParam = searchParams.get('job_id')

  const [jobs, setJobs] = useState<JobAd[]>([])
  const [selectedJob, setSelectedJob] = useState<JobAd | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [running, setRunning] = useState(false)
  const [selected, setSelected] = useState<Evaluation | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('job_ads').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setJobs(data || [])
      if (jobIdParam) {
        const job = (data || []).find((j: JobAd) => j.id === jobIdParam)
        if (job) setSelectedJob(job)
      }
    })
    supabase.from('candidates').select('*').eq('status', 'parsed').then(({ data }) => setCandidates(data || []))
  }, [])

  useEffect(() => {
    if (!selectedJob) return
    supabase.from('evaluations')
      .select('*, candidate:candidates(*)')
      .eq('job_ad_id', selectedJob.id)
      .then(({ data }) => setEvaluations(data || []))
  }, [selectedJob])

  const runEvaluation = async () => {
    if (!selectedJob || !candidates.length) return
    setRunning(true)
    const unevaluated = candidates.filter(c => !evaluations.find(e => e.candidate_id === c.id))
    if (!unevaluated.length) { setRunning(false); return }

    await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_ad_id: selectedJob.id, candidate_ids: unevaluated.map(c => c.id) })
    })

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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '3px', color: '#4a5568', marginBottom: '6px' }}>EVALUATE</div>
          <div style={{ fontSize: '24px', color: '#fff', fontWeight: 600 }}>
            {selectedJob ? selectedJob.title : 'Select a job ad'}
          </div>
          {selectedJob && (
            <div style={{ fontSize: '11px', color: '#4a5568', marginTop: '4px' }}>
              {candidates.length} candidates in pool · {evaluations.length} evaluated
              {unevaluatedCount > 0 && ` · ${unevaluatedCount} pending`}
            </div>
          )}
        </div>
        {selectedJob && unevaluatedCount > 0 && (
          <button
            onClick={runEvaluation} disabled={running}
            style={{
              padding: '12px 24px', background: running ? 'transparent' : '#00d4a0',
              border: '1px solid #00d4a0', borderRadius: '6px',
              color: running ? '#00d4a0' : '#0a0c10', fontSize: '10px',
              letterSpacing: '2px', cursor: running ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', fontWeight: 600, opacity: running ? 0.6 : 1
            }}
          >
            {running ? 'Evaluating...' : `Run Evaluation (${unevaluatedCount})`}
          </button>
        )}
      </div>

      {/* Job selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {jobs.map(j => (
          <button key={j.id} onClick={() => setSelectedJob(j)} style={{
            padding: '8px 14px', background: selectedJob?.id === j.id ? 'rgba(0,212,160,0.1)' : 'transparent',
            border: selectedJob?.id === j.id ? '1px solid rgba(0,212,160,0.4)' : '1px solid #1a2030',
            borderRadius: '6px', color: selectedJob?.id === j.id ? '#00d4a0' : '#4a5568',
            fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
          }}>{j.title}</button>
        ))}
      </div>

      {/* Buckets */}
      {selectedJob && (
        <div style={{ display: 'flex', gap: '16px' }}>
          <Bucket label="Strong Shortlist" color="#00d4a0" evaluations={buckets.green} onSelect={setSelected} />
          <Bucket label="Consider" color="#4a9eff" evaluations={buckets.blue} onSelect={setSelected} />
          <Bucket label="Weak" color="#f6ad55" evaluations={buckets.amber} onSelect={setSelected} />
          <Bucket label="Reject" color="#fc5c65" evaluations={buckets.red} onSelect={setSelected} />
        </div>
      )}

      {!selectedJob && (
        <div style={{ color: '#4a5568', fontSize: '11px', textAlign: 'center', padding: '80px 0', letterSpacing: '1px' }}>
          Select a job ad above to start evaluating your CV pool
        </div>
      )}

      {/* Detail panel */}
      {selected && selectedJob && (
        <>
          <div onClick={() => setSelected(null)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99
          }} />
          <CandidateDetail evaluation={selected} jobAd={selectedJob} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  )
}

export default function EvaluatePage() {
  return (
    <Suspense fallback={<div style={{ padding: '32px', color: '#4a5568', fontSize: '11px' }}>Loading...</div>}>
      <EvaluatePageInner />
    </Suspense>
  )
}
