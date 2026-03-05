import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { createLLMProvider } from '@/lib/llm/provider'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

function sanitizeFilename(name: string): string {
  return name
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    || 'upload.pdf'
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
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files accepted' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const safeName = sanitizeFilename(file.name)
    const storagePath = `${tenantId}/${Date.now()}-${safeName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await serviceClient.storage
      .from('cvs')
      .upload(storagePath, buffer, { contentType: 'application/pdf' })

    if (uploadError) {
      console.error('Storage upload failed:', uploadError.message)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

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

    if (insertError) {
      console.error('DB insert failed:', insertError.message)
      return NextResponse.json({ error: 'Failed to create candidate record' }, { status: 500 })
    }

    let rawText = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      const pdfData = await pdfParse(buffer)
      rawText = pdfData.text
    } catch (e) {
      console.error('PDF parse failed:', e)
      await serviceClient
        .from('candidates')
        .update({ status: 'error' })
        .eq('id', candidate.id)
      return NextResponse.json({ candidate_id: candidate.id, warning: 'PDF text extraction failed' })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const llmProviderName = ((profile as any).tenants?.llm_provider || 
      process.env.DEFAULT_LLM_PROVIDER || 'anthropic') as 'anthropic' | 'openai'
    const llm = createLLMProvider(llmProviderName)

    try {
      const candidateProfile = await llm.extractCandidateProfile(rawText)
      const emailMatch = rawText.match(/[\w.-]+@[\w.-]+\.\w+/)

      await serviceClient
        .from('candidates')
        .update({
          raw_text: rawText,
          profile: candidateProfile,
          full_name: candidateProfile.summary?.split(' ').slice(0, 2).join(' ') || null,
          email: emailMatch?.[0] || null,
          status: 'parsed'
        })
        .eq('id', candidate.id)
    } catch (e) {
      console.error('LLM extraction failed:', e)
      await serviceClient
        .from('candidates')
        .update({ raw_text: rawText, status: 'error' })
        .eq('id', candidate.id)
    }

    return NextResponse.json({ candidate_id: candidate.id })
  } catch (err) {
    console.error('Candidates POST error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Candidate ID is required' }, { status: 400 })

    const { data: candidate } = await supabase
      .from('candidates')
      .select('id, storage_path')
      .eq('id', id)
      .single()

    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

    if (candidate.storage_path) {
      const serviceClient = createServiceClient()
      await serviceClient.storage.from('cvs').remove([candidate.storage_path])
    }

    const { error } = await supabase.from('candidates').delete().eq('id', id)
    if (error) {
      console.error('Candidate delete failed:', error.message)
      return NextResponse.json({ error: 'Failed to delete candidate' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Candidates DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete candidate' }, { status: 500 })
  }
}
