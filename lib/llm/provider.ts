// ============================================================
// LLM Provider Abstraction
// ============================================================

import { EvaluationResult, CandidateProfile, JobProfile, JobAd, Candidate } from '@/types'

export interface LLMProvider {
  extractCandidateProfile(rawText: string): Promise<CandidateProfile>
  extractJobProfile(rawText: string): Promise<JobProfile>
  evaluateCandidate(candidate: Candidate, jobAd: JobAd): Promise<EvaluationResult>
}

// ============================================================
// Shared prompts
// ============================================================

const CANDIDATE_EXTRACTION_PROMPT = `You are a precise CV parser. Extract structured information from the CV text.

Respond ONLY with valid JSON, no markdown, no explanation.

{
  "skills": [{"name": "string", "years": number_or_null, "inferred": boolean}],
  "seniority": "junior|mid|senior|lead|principal|executive",
  "trajectory": "brief description of career arc",
  "domains": ["array of industry/domain strings"],
  "company_stages": ["startup|series_a|series_b|series_c|enterprise|agency"],
  "summary": "2 sentence professional summary"
}`

const JOB_EXTRACTION_PROMPT = `You are a precise job description parser. Extract structured requirements.

Respond ONLY with valid JSON, no markdown, no explanation.

{
  "must_haves": [{"text": "requirement text", "type": "must_have"}],
  "nice_to_haves": [{"text": "requirement text", "type": "nice_to_have"}],
  "seniority_range": ["junior|mid|senior|lead"],
  "domains": ["domain strings"],
  "culture_signals": ["culture signal strings"],
  "summary": "2 sentence role summary"
}`

const EVALUATION_SYSTEM_PROMPT = `You are a senior technical recruiter with 15 years experience. You evaluate candidates with rigorous, honest judgment — not keyword matching.

Evaluate the candidate across exactly 5 dimensions:
1. Capability Match — Can they actually do the core work?
2. Domain Fit — Is their background domain relevant?
3. Seniority Calibration — Are they the right level?
4. Trajectory Signal — Are they growing toward this role or away from it?
5. Risk Factors — What could go wrong with this hire?

For each dimension:
- verdict: STRONG / ADEQUATE / WEAK / DISQUALIFYING
- evidence: one specific sentence pulled from the CV (concrete, not generic)
- confidence: HIGH / MEDIUM / LOW

Rules:
- Any DISQUALIFYING verdict = overall recommendation is REJECT
- Missing hard requirements = DISQUALIFYING
- Be honest. Do not inflate verdicts.

Also return requirements_match — map EVERY requirement from the job ad:
- requirement: exact text of the requirement
- type: must_have | nice_to_have | soft
- status: MET | PARTIAL | MISSING
- evidence: specific text from the CV supporting this status
- job_ad_span: exact phrase from the job ad (for highlighting)
- cv_span: exact phrase from CV that matched (for highlighting), null if missing

Overall outputs:
- overall_recommendation: STRONG SHORTLIST / CONSIDER / WEAK / REJECT
- recruiter_summary: 2-3 sentences, specific, what you'd tell a hiring manager
- top_compensation: strongest compensating signal if any weakness exists, else null

Respond ONLY with valid JSON, no markdown.

{
  "dimensions": [...],
  "requirements_match": [...],
  "overall_recommendation": "...",
  "recruiter_summary": "...",
  "top_compensation": "..."
}`

function buildEvaluationUserMessage(candidate: Candidate, jobAd: JobAd): string {
  return `CV:\n${candidate.raw_text}\n\nCANDIDATE PROFILE:\n${JSON.stringify(candidate.profile, null, 2)}\n\nJOB DESCRIPTION:\n${jobAd.raw_text}\n\nJOB PROFILE:\n${JSON.stringify(jobAd.profile, null, 2)}`
}

function recommendationToScore(rec: string): number {
  const map: Record<string, number> = {
    'STRONG SHORTLIST': 92,
    'CONSIDER': 68,
    'WEAK': 35,
    'REJECT': 10
  }
  return map[rec] ?? 50
}

// ============================================================
// Anthropic Provider
// ============================================================

export class AnthropicProvider implements LLMProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async call(system: string, user: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user }]
      })
    })
    const data = await response.json()
    return data.content?.map((b: any) => b.text || '').join('') || ''
  }

  async extractCandidateProfile(rawText: string): Promise<CandidateProfile> {
    const text = await this.call(CANDIDATE_EXTRACTION_PROMPT, rawText)
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  }

  async extractJobProfile(rawText: string): Promise<JobProfile> {
    const text = await this.call(JOB_EXTRACTION_PROMPT, rawText)
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  }

  async evaluateCandidate(candidate: Candidate, jobAd: JobAd): Promise<EvaluationResult> {
    const text = await this.call(EVALUATION_SYSTEM_PROMPT, buildEvaluationUserMessage(candidate, jobAd))
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  }
}

// ============================================================
// OpenAI Provider
// ============================================================

export class OpenAIProvider implements LLMProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async call(system: string, user: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000
      })
    })
    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  }

  async extractCandidateProfile(rawText: string): Promise<CandidateProfile> {
    const text = await this.call(CANDIDATE_EXTRACTION_PROMPT, rawText)
    return JSON.parse(text)
  }

  async extractJobProfile(rawText: string): Promise<JobProfile> {
    const text = await this.call(JOB_EXTRACTION_PROMPT, rawText)
    return JSON.parse(text)
  }

  async evaluateCandidate(candidate: Candidate, jobAd: JobAd): Promise<EvaluationResult> {
    const text = await this.call(EVALUATION_SYSTEM_PROMPT, buildEvaluationUserMessage(candidate, jobAd))
    return JSON.parse(text)
  }
}

// ============================================================
// Factory
// ============================================================

export function createLLMProvider(provider: 'anthropic' | 'openai'): LLMProvider {
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error('ANTHROPIC_API_KEY not set')
    return new AnthropicProvider(key)
  }
  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error('OPENAI_API_KEY not set')
    return new OpenAIProvider(key)
  }
  throw new Error(`Unknown LLM provider: ${provider}`)
}

export { recommendationToScore }
