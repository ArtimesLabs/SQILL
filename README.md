# SQILL — Setup Guide

## 1. Supabase (do this first)

1. Go to your Supabase project → **SQL Editor**
2. Paste the entire contents of `supabase/schema.sql` and run it
3. Go to **Authentication → Providers → Google** and enable it
   - Add your Google OAuth credentials (from Google Cloud Console)
   - Set redirect URL to: `https://sqill.ai/auth/callback`
4. Go to **Project Settings → API** and copy:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## 2. Drop files into your repo

Copy all files into your existing Next.js 14 repo, merging with your existing structure.

If starting fresh:
```bash
npx create-next-app@14 sqill --typescript --tailwind --app
```
Then replace the generated files with these.

## 3. Environment variables in Vercel

In your Vercel project → Settings → Environment Variables, add:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
OPENAI_API_KEY
DEFAULT_LLM_PROVIDER=anthropic
```

## 4. Cloudflare domain

Your sqill.ai domain on Cloudflare should already point to Vercel.
Make sure in Vercel → Domains that `sqill.ai` is added.

## 5. Push to GitHub

```bash
git add .
git commit -m "feat: SQILL v1 - CV pool, job ads, rubric evaluation"
git push origin main
```

Vercel auto-deploys. Visit sqill.ai — done.

---

## File structure

```
app/
├── login/page.tsx          → Google SSO login
├── auth/callback/route.ts  → OAuth callback
├── (app)/
│   ├── layout.tsx          → Sidebar nav + auth guard
│   ├── candidates/page.tsx → CV pool (upload, manage)
│   ├── jobs/page.tsx       → Job ads (create, manage)
│   └── evaluate/page.tsx   → Buckets + detail panel
├── api/
│   ├── candidates/route.ts → Upload + parse CV
│   ├── jobs/route.ts       → Job ad CRUD + parse
│   └── evaluate/route.ts   → Run evaluation engine
lib/
├── llm/provider.ts         → Anthropic + OpenAI abstraction
└── supabase/client.ts      → Browser + server + service clients
types/index.ts              → All TypeScript types
middleware.ts               → Auth guard + redirects
supabase/schema.sql         → Full DB schema + RLS
```

## How it works

1. Recruiter uploads PDFs → parsed async → structured CandidateProfile stored
2. Recruiter creates job ad → parsed → structured JobProfile stored
3. Recruiter clicks Evaluate → engine runs rubric evaluation per candidate:
   - Hard filter (binary disqualifiers)
   - 5-dimension LLM judgment (Capability, Domain, Seniority, Trajectory, Risk)
   - Requirements mapping (must-haves, nice-to-haves, soft signals)
   - Job ad highlighting (matched spans)
4. Results bucketed: Strong Shortlist / Consider / Weak / Reject
5. Recruiter clicks any card → detail panel with 3 tabs:
   - Dimensions (the 5-dimension verdict)
   - Requirements (line-by-line mapping)
   - Job Ad (highlighted matches)
