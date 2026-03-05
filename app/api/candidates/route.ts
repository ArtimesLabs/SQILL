import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { createLLMProvider } from '@/lib/llm/provider'

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
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files accepted' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const storagePath = `${tenantId}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`

    // Upload to Supabase Storage
    const { error: uploadError } = await serviceClient.storage
      .from('cvs')
      .upload(storagePath, file, { contentType: 'application/pdf' })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    // Create candidate record as pending
    const { data: candidate, error: insertError } = await serviceClient
      .from('candidates')
      .insert({
        tenant_id: tenantId,
        storage_path: storagePath,
        status: 'pending',
        uploaded_by: user.id
      })
      .select()
      .single()

    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`)

    // Extract text from PDF using pdf-parse
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    let rawText = ''
    try {
      const pdfParse = require('pdf-parse')
      const pdfData = await pdfParse(buffer)
      rawText = pdfData.text
    } catch {
      // Fallback: use raw buffer as text (won't be great but won't crash)
      rawText = buffer.toString('utf-8').replace(/[^\x20-\x7E\n]/g, ' ')
    }

    // Parse with LLM
    const llmProviderName = (profile as any).tenants?.llm_provider || 
      process.env.DEFAULT_LLM_PROVIDER || 'anthropic'
    const llm = createLLMProvider(llmProviderName)

    try {
      const candidateProfile = await llm.extractCandidateProfile(rawText)
      
      // Extract name and email from profile if possible
      const nameMatch = rawText.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/m)
      const emailMatch = rawText.match(/[\w.-]+@[\w.-]+\.\w+/)

      await serviceClient
        .from('candidates')
        .update({
          raw_text: rawText,
          profile: candidateProfile,
          full_name: nameMatch?.[1] || candidateProfile.summary.split(' ').slice(0, 2).join(' '),
          email: emailMatch?.[0] || null,
          status: 'parsed'
        })
        .eq('id', candidate.id)
    } catch {
      await serviceClient
        .from('candidates')
        .update({ raw_text: rawText, status: 'error' })
        .eq('id', candidate.id)
    }

    return NextResponse.json({ candidate_id: candidate.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
