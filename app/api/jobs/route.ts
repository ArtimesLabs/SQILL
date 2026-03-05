import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { createLLMProvider } from '@/lib/llm/provider'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: jobs } = await supabase
      .from('job_ads')
      .select('*')
      .order('created_at', { ascending: false })

    return NextResponse.json({ jobs: jobs || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, tenants(llm_provider)')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const tenantId = profile.tenant_id
    const { title, raw_text } = await req.json()

    if (!title || !raw_text) {
      return NextResponse.json({ error: 'title and raw_text required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Insert job ad
    const { data: jobAd, error } = await serviceClient
      .from('job_ads')
      .insert({
        tenant_id: tenantId,
        title,
        raw_text,
        status: 'pending',
        created_by: user.id
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    // Parse with LLM
    const llmProviderName = (profile as any).tenants?.llm_provider || 
      process.env.DEFAULT_LLM_PROVIDER || 'anthropic'
    const llm = createLLMProvider(llmProviderName)

    try {
      const jobProfile = await llm.extractJobProfile(raw_text)
      await serviceClient
        .from('job_ads')
        .update({ profile: jobProfile, status: 'parsed' })
        .eq('id', jobAd.id)
    } catch {
      await serviceClient
        .from('job_ads')
        .update({ status: 'error' })
        .eq('id', jobAd.id)
    }

    return NextResponse.json({ job_ad_id: jobAd.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await req.json()
    await supabase.from('job_ads').delete().eq('id', id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
