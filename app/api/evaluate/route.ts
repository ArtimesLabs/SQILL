import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { createLLMProvider, recommendationToScore } from '@/lib/llm/provider'
import { Candidate, JobAd } from '@/types'

const MAX_CANDIDATES_PER_REQUEST = 50

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { job_ad_id, candidate_ids } = await req.json()
    if (!job_ad_id || !candidate_ids?.length) {
      return NextResponse.json({ error: 'Job ad and candidate selection required' }, { status: 400 })
    }

    if (candidate_ids.length > MAX_CANDIDATES_PER_REQUEST) {
      return NextResponse.json({ error: `Maximum ${MAX_CANDIDATES_PER_REQUEST} candidates per evaluation run` }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, tenants(llm_provider)')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const tenantId = profile.tenant_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const llmProviderName = ((profile as any).tenants?.llm_provider || 
      process.env.DEFAULT_LLM_PROVIDER || 'anthropic') as 'anthropic' | 'openai'

    const { data: jobAd } = await supabase
      .from('job_ads')
      .select('*')
      .eq('id', job_ad_id)
      .eq('tenant_id', tenantId)
      .single()

    if (!jobAd) return NextResponse.json({ error: 'Job ad not found' }, { status: 404 })

    const { data: candidates } = await supabase
      .from('candidates')
      .select('*')
      .in('id', candidate_ids)
      .eq('tenant_id', tenantId)
      .eq('status', 'parsed')

    if (!candidates?.length) {
      return NextResponse.json({ error: 'No parsed candidates found' }, { status: 404 })
    }

    const llm = createLLMProvider(llmProviderName)
    const serviceClient = createServiceClient()
    const results = []

    const CONCURRENCY = 3
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map(async (candidate: Candidate) => {
          try {
            const evalResult = await llm.evaluateCandidate(candidate, jobAd as JobAd)
            const score = recommendationToScore(evalResult.overall_recommendation)

            const { data: evaluation } = await serviceClient
              .from('evaluations')
              .upsert({
                tenant_id: tenantId,
                job_ad_id,
                candidate_id: candidate.id,
                result: evalResult,
                recommendation: evalResult.overall_recommendation,
                score,
                is_stale: false
              }, { onConflict: 'job_ad_id,candidate_id' })
              .select()
              .single()

            return { candidate_id: candidate.id, evaluation, error: null }
          } catch (err) {
            console.error(`Evaluation failed for candidate ${candidate.id}:`, err)
            return { candidate_id: candidate.id, evaluation: null, error: 'Evaluation failed' }
          }
        })
      )
      results.push(...batchResults)
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error('Evaluate POST error:', err)
    return NextResponse.json({ error: 'Evaluation failed' }, { status: 500 })
  }
}
