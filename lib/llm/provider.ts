import { EvaluationResult, CandidateProfile, JobProfile, JobAd, Candidate } from '@/types'

export interface LLMProvider {
  extractCandidateProfile(rawText: string): Promise<CandidateProfile>
  extractJobProfile(rawText: string): Promise<JobProfile>
  evaluateCandidate(candidate: Candidate, jobAd: JobAd): Promise<EvaluationResult>
}

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

const MAX_INPUT_CHARS = 30000
const FETCH_TIMEOUT_MS = 60000
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1000

function truncateInput(text: string): string {
  if (text.length <= MAX_INPUT_CHARS) return text
  return text.slice(0, MAX_INPUT_CHARS) + '\n\n[Text truncated due to length]'
}

function parseJSON<T>(text: string): T {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  if (!cleaned) throw new Error('Empty response from LLM')
  return JSON.parse(cleaned)
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries: number = MAX_RETRIES): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err as Error
      const msg = (err as Error)?.message || ''
      const isRetryable = (err as Error)?.name === 'AbortError' ||
        msg.includes('429') ||
        msg.includes('500') ||
        msg.includes('502') ||
        msg.includes('503')
      if (!isRetryable || attempt === retries) break
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)))
    }
  }
  throw lastError
}

function buildEvaluationUserMessage(candidate: Candidate, jobAd: JobAd): string {
  const cvText = truncateInput(candidate.raw_text || '')
  const jobText = truncateInput(jobAd.raw_text)
  return `CV:\n${cvText}\n\nCANDIDATE PROFILE:\n${JSON.stringify(candidate.profile, null, 2)}\n\nJOB DESCRIPTION:\n${jobText}\n\nJOB PROFILE:\n${JSON.stringify(jobAd.profile, null, 2)}`
}

function recommendationToScore(rec: string): number {
  const normalized = (rec || '').trim().toUpperCase()
  const map: Record<string, number> = {
    'STRONG SHORTLIST': 92,
    'CONSIDER': 68,
    'WEAK': 35,
    'REJECT': 10
  }
  return map[normalized] ?? 50
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
    return withRetry(async () => {
      const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system,
          messages: [{ role: 'user', content: user }]
        })
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 200)}`)
      }

      const data = await response.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.content?.map((b: any) => b.text || '').join('') || ''
    })
  }

  async extractCandidateProfile(rawText: string): Promise<CandidateProfile> {
    const text = await this.call(CANDIDATE_EXTRACTION_PROMPT, truncateInput(rawText))
    return parseJSON<CandidateProfile>(text)
  }

  async extractJobProfile(rawText: string): Promise<JobProfile> {
    const text = await this.call(JOB_EXTRACTION_PROMPT, truncateInput(rawText))
    return parseJSON<JobProfile>(text)
  }

  async evaluateCandidate(candidate: Candidate, jobAd: JobAd): Promise<EvaluationResult> {
    const text = await this.call(EVALUATION_SYSTEM_PROMPT, buildEvaluationUserMessage(candidate, jobAd))
    return parseJSON<EvaluationResult>(text)
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
    return withRetry(async () => {
      const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
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
          max_tokens: 4096
        })
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 200)}`)
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content || ''
    })
  }

  async extractCandidateProfile(rawText: string): Promise<CandidateProfile> {
    const text = await this.call(CANDIDATE_EXTRACTION_PROMPT, truncateInput(rawText))
    return parseJSON<CandidateProfile>(text)
  }

  async extractJobProfile(rawText: string): Promise<JobProfile> {
    const text = await this.call(JOB_EXTRACTION_PROMPT, truncateInput(rawText))
    return parseJSON<JobProfile>(text)
  }

  async evaluateCandidate(candidate: Candidate, jobAd: JobAd): Promise<EvaluationResult> {
    const text = await this.call(EVALUATION_SYSTEM_PROMPT, buildEvaluationUserMessage(candidate, jobAd))
    return parseJSON<EvaluationResult>(text)
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
