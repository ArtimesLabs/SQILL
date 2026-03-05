// ============================================================
// SQILL Types
// ============================================================

export type LLMProvider = 'anthropic' | 'openai'

export type CandidateStatus = 'pending' | 'parsed' | 'error'
export type JobAdStatus = 'pending' | 'parsed' | 'error'
export type Recommendation = 'STRONG SHORTLIST' | 'CONSIDER' | 'WEAK' | 'REJECT'
export type Verdict = 'STRONG' | 'ADEQUATE' | 'WEAK' | 'DISQUALIFYING'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

// ============================================================
// Structured profiles (output of extraction)
// ============================================================

export interface Skill {
  name: string
  years?: number
  inferred: boolean
}

export interface CandidateProfile {
  skills: Skill[]
  seniority: string
  trajectory: string
  domains: string[]
  company_stages: string[]
  summary: string
}

export interface JobRequirement {
  text: string
  type: 'must_have' | 'nice_to_have'
}

export interface JobProfile {
  must_haves: JobRequirement[]
  nice_to_haves: JobRequirement[]
  seniority_range: string[]
  domains: string[]
  culture_signals: string[]
  summary: string
}

// ============================================================
// Evaluation result
// ============================================================

export interface EvaluationDimension {
  name: string
  verdict: Verdict
  evidence: string
  confidence: Confidence
}

export interface RequirementMatch {
  requirement: string
  type: 'must_have' | 'nice_to_have' | 'soft'
  status: 'MET' | 'PARTIAL' | 'MISSING'
  evidence: string
  job_ad_span?: string   // exact text from job ad that was matched
  cv_span?: string       // exact text from CV that matched it
}

export interface EvaluationResult {
  dimensions: EvaluationDimension[]
  requirements_match: RequirementMatch[]
  overall_recommendation: Recommendation
  recruiter_summary: string
  top_compensation: string | null
}

// ============================================================
// Database row types
// ============================================================

export interface Tenant {
  id: string
  name: string
  slug: string
  llm_provider: LLMProvider
  created_at: string
}

export interface Profile {
  id: string
  tenant_id: string
  full_name: string | null
  avatar_url: string | null
  role: 'admin' | 'recruiter'
  created_at: string
}

export interface Candidate {
  id: string
  tenant_id: string
  full_name: string | null
  email: string | null
  storage_path: string | null
  raw_text: string | null
  profile: CandidateProfile | null
  status: CandidateStatus
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export interface JobAd {
  id: string
  tenant_id: string
  title: string
  raw_text: string
  profile: JobProfile | null
  status: JobAdStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Evaluation {
  id: string
  tenant_id: string
  job_ad_id: string
  candidate_id: string
  result: EvaluationResult
  recommendation: Recommendation
  score: number
  is_stale: boolean
  recruiter_override: string | null
  created_at: string
  // Joined
  candidate?: Candidate
  job_ad?: JobAd
}
