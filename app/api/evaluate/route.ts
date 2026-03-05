import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { createLLMProvider, recommendationToScore } from '@/lib/llm/provider'
import { Candidate, JobAd } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { job_ad_id, candidate_ids } = await req.json()
    if (!job_ad_id || !candidate_ids?.length) {
      return NextResponse.json({ error: 'job_ad_id and candidate_ids required' }, { status: 400 })
    }

    // Get tenant + LLM provider preference
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, tenants(llm_provider)')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const tenantId = profile.tenant_id
    const llmProviderName = (profile as any).tenants?.llm_provider || 
      process.env.DEFAULT_LLM_PROVIDER || 'anthropic'

    // Fetch job ad
    const { data: jobAd } = await supabase
      .from('job_ads')
      .select('*')
      .eq('id', job_ad_id)
      .eq('tenant_id', tenantId)
      .single()

    if (!jobAd) return NextResponse.json({ error: 'Job ad not found' }, { status: 404 })

    // Fetch candidates
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

    // Run evaluations (parallel with concurrency limit)
    const CONCURRENCY = 3
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map(async (candidate: Candidate) => {
          try {
            const evalResult = await llm.evaluateCandidate(candidate, jobAd as JobAd)
            const score = recommendationToScore(evalResult.overall_recommendation)

            // Upsert evaluation
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
          } catch (err: any) {
            return { candidate_id: candidate.id, evaluation: null, error: err.message }
          }
        })
      )
      results.push(...batchResults)
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
