# Secure Development Audit

**EALLsource — Production Security Readiness Review**

---

## 0. Methodology and a Correction Made During This Audit

This audit reviewed the EALLsource codebase against the policies in `docs/security/`, covering authentication, authorization, session management, OAuth, Amazon SP-API integration, credential encryption, secret management, database security, logging, error handling, input validation, CSRF, XSS, SQL injection, rate limiting, dependency security, HTTP security headers, CSP, secure cookies, TLS, file uploads, SSRF, API authentication, environment variables, backups, access control, and multi-tenant isolation.

**One finding required correction before inclusion here.** An early pass surfaced `infra/nginx/nginx.conf` and `infra/docker-compose.yml`, which configure rate limiting (`limit_req_zone`) and security headers (`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) for an nginx-fronted Docker Compose deployment. **This is dead infrastructure.** EALLsource's actual production deployment is Vercel (`vercel.json`, confirmed throughout this project's deployment history — every release this project has shipped went out via `vercel deploy`/git-push-to-`main`). The `infra/` directory appears to be unused scaffolding from an earlier or alternative deployment plan. **None of the protections in `infra/nginx/nginx.conf` apply to the live eallsource.com site.** This audit evaluates the application as it actually runs in production — Next.js on Vercel, with no nginx in front of it — and treats the nginx config as non-existent for risk purposes. This is itself a documentation-hygiene finding (Section 8).

All findings below were verified by reading the cited file and line directly; none are inferred from a tool's summary alone.

---

## 1. Findings

Each finding lists: **Severity**, **Description**, **Evidence**, **Recommendation**, **Blocks SP-API approval?**

### 1.1 Authentication

**F-01 — No brute-force protection on login or MFA verification**
- **Severity:** High
- **Description:** Login (`mfa-check` + NextAuth `authorize()`) and TOTP verification have no attempt counter, lockout, or delay. An attacker can submit unlimited password or 6-digit TOTP guesses.
- **Evidence:** [src/app/api/auth/mfa-check/route.ts](../../src/app/api/auth/mfa-check/route.ts) — no rate limiting; [src/lib/auth.ts:23-45](../../src/lib/auth.ts) `authorize()` — same; confirmed no rate-limiting code exists anywhere in `src/` (only a retry/backoff loop in `src/lib/amazon.ts` for SP-API calls, unrelated to login).
- **Recommendation:** Add attempt tracking (Redis is already a dependency — `ioredis`/`bullmq` are in `package.json`) keyed by email+IP; lock out after 5 failures for 15 minutes; same for TOTP attempts.
- **Blocks SP-API approval?** Maybe — Amazon's review focuses on data protection more than account brute-force defense, but this is a real production risk independent of SP-API and should be fixed regardless.

**F-02 — `mfa-check` endpoint enables account enumeration**
- **Severity:** Low
- **Description:** The endpoint returns a different shape for "no such user" (`{valid:false}`) vs. "valid password, MFA enabled" (`{valid:true, mfaRequired:true}`), letting an attacker enumerate which emails have accounts.
- **Evidence:** [src/app/api/auth/mfa-check/route.ts:17-23](../../src/app/api/auth/mfa-check/route.ts) — confirmed by direct read.
- **Recommendation:** Low priority — registration is already public, so email existence is not strongly protected elsewhere either. Optional: return a uniform shape.
- **Blocks SP-API approval?** No.

**F-03 — No explicit session expiry (`maxAge`) configured**
- **Severity:** Medium
- **Description:** `auth.ts` sets `session: { strategy: 'jwt' }` with no `maxAge`, so NextAuth's 30-day default applies to every session, including admin sessions.
- **Evidence:** [src/lib/auth.ts:8-9](../../src/lib/auth.ts) — verified: no `maxAge` key present anywhere in the file.
- **Recommendation:** Set an explicit, shorter `maxAge` (e.g., 8–24 hours) given the app handles Amazon seller credentials and billing.
- **Blocks SP-API approval?** Maybe — long-lived sessions on an app with SP-API access are a reasonable thing for Amazon's reviewer to flag.

### 1.2 Authorization / Multi-Tenant Isolation

**F-04 — Multi-tenant isolation is consistently enforced**
- **Severity:** Strength (not a finding requiring action)
- **Description:** Every data-bearing API route scopes its Prisma query by `session.user.orgId`, and ID-based routes (`/api/products/[id]`, `/api/leads`, `/api/repricing/rules/[id]`, `/api/saved-searches/[id]`, `/api/inventory/[id]`, `/api/team/[id]`) verify the record's `orgId` matches the caller's before reading or mutating it. No cross-tenant IDOR path was found across the 47 routes reviewed.
- **Evidence:** e.g. [src/app/api/products/[id]/notes/route.ts](../../src/app/api/products/[id]/notes/route.ts) (`findFirst({ where: { id, orgId: session.user.orgId } })` before mutation).
- **Recommendation:** None required. Maintain this pattern for all new routes; consider a lint rule or code-review checklist item enforcing it.
- **Blocks SP-API approval?** No — this is exactly what Amazon's reviewer wants to see for seller-data isolation.

**F-05 — Platform admin access is a hardcoded email allowlist, duplicated three times**
- **Severity:** Medium
- **Description:** "Platform admin" (cross-org access) is determined by a literal email string, not a database role, and the same constant is copy-pasted in three files.
- **Evidence:** `const ADMIN_EMAILS = ['savingdailystore@gmail.com'];` in [src/app/admin/page.tsx:9](../../src/app/admin/page.tsx), [src/app/api/admin/orgs/route.ts:7](../../src/app/api/admin/orgs/route.ts), and [src/app/api/admin/orgs/[id]/route.ts:8](../../src/app/api/admin/orgs/%5Bid%5D/route.ts) — confirmed by direct grep and read.
- **Recommendation:** Move to a single shared constant or, better, a `User.isPlatformAdmin` boolean checked consistently; eliminates drift risk where one of the three copies is updated and the others aren't.
- **Blocks SP-API approval?** No, but flagged in [AccessControlPolicy.md](AccessControlPolicy.md) as a known gap against the "role-based access" principle it describes.

**F-06 — Admin `PATCH` operations are not written to the audit log**
- **Severity:** Low
- **Description:** Platform-admin changes to an organization (plan, scan access, trial dates) are not recorded in `AuditLog`, unlike most other mutating routes in the app.
- **Evidence:** [src/app/api/admin/orgs/[id]/route.ts](../../src/app/api/admin/orgs/%5Bid%5D/route.ts) — `PATCH` handler updates `prisma.organization` with no corresponding `auditLog.create()` call.
- **Recommendation:** Add an audit log entry (admin email, org id, fields changed) to match the pattern used elsewhere (e.g., `AMAZON_CONNECT` in the callback route).
- **Blocks SP-API approval?** No, but undermines the audit-logging commitment in [InformationSecurityPolicy.md](InformationSecurityPolicy.md) Section 9 and the [IncidentResponsePlan.md](IncidentResponsePlan.md) Section 9 evidence-handling process.

### 1.3 Amazon SP-API Integration & OAuth

**F-07 — OAuth CSRF state and token handling are correctly implemented**
- **Severity:** Strength
- **Description:** The Amazon OAuth `state` parameter is generated with `crypto.randomBytes(32)` (256 bits), stored in an `httpOnly`, `sameSite=lax`, 10-minute cookie, and strictly compared on callback before the authorization code is exchanged.
- **Evidence:** [src/app/api/amazon/oauth/start/route.ts:20-36](../../src/app/api/amazon/oauth/start/route.ts); [src/app/api/amazon/callback/route.ts:18-21](../../src/app/api/amazon/callback/route.ts).
- **Recommendation:** None required.
- **Blocks SP-API approval?** No — this meets Amazon's OAuth security expectations.

**F-08 — Token refresh and SP-API request handling are sound**
- **Severity:** Strength
- **Description:** Refresh-token exchange sends the LWA client secret only in the POST body over HTTPS, never logs it, and immediately re-encrypts the refreshed access token before storage. SP-API calls back off exponentially with jitter on 429/503, bounded to 4 retries — no runaway-loop risk.
- **Evidence:** [src/lib/sp-api.ts:24-44](../../src/lib/sp-api.ts), [src/lib/amazon.ts:60-84](../../src/lib/amazon.ts).
- **Recommendation:** None required.
- **Blocks SP-API approval?** No.

**F-09 — `selling_partner_id` from the OAuth callback is stored without format validation**
- **Severity:** Low
- **Description:** The seller ID returned by Amazon is written straight into `AmazonCredential.sellerId` with no format check.
- **Evidence:** [src/app/api/amazon/callback/route.ts:15,63](../../src/app/api/amazon/callback/route.ts).
- **Recommendation:** Add a basic format assertion before storage as defense-in-depth (low priority — the value originates from Amazon's own redirect, not arbitrary user input).
- **Blocks SP-API approval?** No.

### 1.4 Credential Encryption & Secret Management

**F-10 — Encryption implementation is strong and consistently applied**
- **Severity:** Strength
- **Description:** `encryption.ts` uses AES-256-GCM with a 12-byte random IV per call and validates the auth tag on every decrypt (so tampered ciphertext throws rather than silently returning garbage). The `ENCRYPTION_KEY` is validated to be exactly 64 hex chars (32 bytes) with no fallback path if missing or malformed — `getKey()` throws. Every sensitive field (Amazon access/refresh tokens, MFA TOTP secret) is encrypted before it touches the database.
- **Evidence:** [src/lib/encryption.ts](../../src/lib/encryption.ts) (full read); call sites in [src/lib/sp-api.ts](../../src/lib/sp-api.ts), [src/lib/amazon.ts](../../src/lib/amazon.ts), [src/lib/auth.ts:43](../../src/lib/auth.ts), [src/app/api/mfa/setup/route.ts](../../src/app/api/mfa/setup/route.ts), [src/app/api/amazon/callback/route.ts:65-66,73-74](../../src/app/api/amazon/callback/route.ts).
- **Recommendation:** None required for the cryptography itself. Document key-rotation procedure (currently absent — see F-15).
- **Blocks SP-API approval?** No — this is exactly the AES-256-GCM-at-rest story documented in [InformationSecurityPolicy.md](InformationSecurityPolicy.md) Section 8, and it checks out against the actual code.

**F-11 — No hardcoded secrets in the repository; `.env` correctly git-ignored**
- **Severity:** Strength
- **Description:** No live API keys, tokens, or credentials were found committed to source. `.env`/`.env.local` are excluded by `.gitignore`; only `.env.example` (placeholder values) is tracked.
- **Evidence:** Repository grep for common secret patterns (`sk_live`, `sk_test`, `whsec_`, `AKIA`, private-key headers) — no matches in tracked files; `.gitignore` confirmed to exclude `.env*`.
- **Recommendation:** None required. Continue relying on GitHub push protection as the backstop per [SecureDevelopmentPolicy.md](SecureDevelopmentPolicy.md) Section 6.
- **Blocks SP-API approval?** No.

**F-12 — `ENCRYPTION_KEY` has no rotation mechanism or key versioning**
- **Severity:** Medium
- **Description:** There is exactly one active encryption key at any time, stored as a single Vercel environment variable. If it needs to rotate (suspected exposure), every existing encrypted value (all Amazon tokens, all MFA secrets) becomes undecryptable unless re-encrypted in a single coordinated operation — there's no way to support "old key still readable, new key for new writes."
- **Evidence:** [src/lib/encryption.ts](../../src/lib/encryption.ts) — single key, no version prefix stored alongside ciphertext.
- **Recommendation:** Out of scope for immediate fix given team size, but document the manual rotation runbook (decrypt-all-with-old-key, re-encrypt-with-new-key, in one transaction) so it's not improvised during an actual incident. Tracked as a Future Improvement in [InformationSecurityPolicy.md](InformationSecurityPolicy.md).
- **Blocks SP-API approval?** No.

**F-13 — A few optional integration env vars have no startup presence check**
- **Severity:** Low
- **Description:** `KEEPA_API_KEY`, `APIFY_TOKEN` default silently to an empty string/`undefined` if unset, rather than failing loudly. This is graceful for optional features but could mask a misconfiguration in production until a sourcing job silently no-ops.
- **Evidence:** Pattern confirmed via grep of `process.env.KEEPA_API_KEY` and `process.env.APIFY_TOKEN` usage in `src/lib/keepa.ts` / `src/lib/apify.ts`.
- **Recommendation:** Log a warning at startup (or first call) if these are unset, rather than failing silently per-request.
- **Blocks SP-API approval?** No — these aren't part of the SP-API surface.

### 1.5 Database Security

**F-14 — No SQL injection risk found**
- **Severity:** Strength
- **Description:** The only raw SQL in the codebase uses Prisma's tagged-template `$queryRaw`, which parameterizes interpolated values automatically — no string concatenation into SQL anywhere. No `$queryRawUnsafe`/`$executeRawUnsafe` usage exists.
- **Evidence:** `src/app/dashboard/page.tsx` (`$queryRaw` with `${orgId}` interpolated via Prisma's safe tagged-template mechanism, not string concatenation) and `src/app/api/health/route.ts` (`SELECT 1`, no input).
- **Recommendation:** None required. Continue exclusively using Prisma's query builder or tagged-template `$queryRaw`; never introduce `$queryRawUnsafe` with interpolated strings.
- **Blocks SP-API approval?** No.

**F-15 — Database connection enforces TLS**
- **Severity:** Strength
- **Description:** The documented connection string format requires `sslmode=require`, consistent with Neon's enforced-TLS connections.
- **Evidence:** `.env.example` — `DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"`.
- **Recommendation:** None required.
- **Blocks SP-API approval?** No.

### 1.6 Webhook & Billing Security

**F-16 — Stripe webhook signature verification is correctly implemented**
- **Severity:** Strength
- **Description:** The raw request body is read via `req.text()` before any parsing and passed directly to `webhooks.constructEvent()`; an invalid signature returns 400 and the handler stops — it is not just logged.
- **Evidence:** [src/app/api/billing/webhook/route.ts:10-23](../../src/app/api/billing/webhook/route.ts).
- **Recommendation:** None required.
- **Blocks SP-API approval?** No (not SP-API-relevant directly, but demonstrates the same rigor Amazon expects elsewhere).

### 1.7 Input Validation

**F-17 — Input validation is inconsistent: roughly half of routes use Zod, several mutating routes parse `req.json()`/`formData()` with no schema**
- **Severity:** High
- **Description:** 22 of 47 API routes import `zod`. Several routes that accept and persist user-controlled data validate only ad hoc (manual `if (!x)` checks or raw type casts), not a schema. Most concretely:
  - `/api/inventory/add` — destructures `body` from `req.json()` with no schema; numeric fields go through a permissive `toInt()` coercion with no upper bound or type assertion beyond `parseInt(...) || 0`.
  - `/api/inventory/bulk-delete` — `const { ids } = await req.json().catch(() => ({ ids: [] }))`, checked only for `Array.isArray`, not that each element is a well-formed ID (Prisma's `orgId`-scoped `updateMany`/`deleteMany` filter limits the blast radius, but this is incidental containment, not validated input).
  - `/api/billing/checkout` — `const plan = formData.get('plan') as Plan` is a bare TypeScript cast with no runtime enum check before being used as an object-key lookup into `PRICE_IDS`.
- **Evidence:** File paths above, confirmed by direct read of each route handler.
- **Recommendation:** Add a Zod schema to every route that accepts a request body, including these three. For `/api/billing/checkout`, validate `plan` against `z.enum(['STARTER','PRO','ENTERPRISE'])` before the lookup.
- **Blocks SP-API approval?** Maybe — none of these specific gaps touch Amazon Information directly, but inconsistent input validation across the API surface is the kind of thing a thorough reviewer (or a future incident) finds. Worth fixing before scaling regardless of SP-API.

### 1.8 XSS, SSRF, File Uploads

**F-18 — No XSS vector found**
- **Severity:** Strength
- **Description:** No `dangerouslySetInnerHTML` or `innerHTML` usage exists anywhere in `src/`. All rendering goes through standard JSX interpolation, which React escapes by default.
- **Evidence:** Repository-wide grep — zero matches.
- **Recommendation:** None required. If a markdown-rendering or rich-text feature is ever added, revisit this with a sanitizer (e.g., DOMPurify) at that time.
- **Blocks SP-API approval?** No.

**F-19 — No SSRF vector found**
- **Severity:** Strength
- **Description:** Every outbound `fetch()` in `src/lib` targets a hardcoded HTTPS endpoint (Amazon LWA/SP-API, Apify, Keepa) or a URL built from a server-side constant plus a value already validated against an allowlist (e.g., `retailer` checked against `getRetailerNames()` before any request is made). No route accepts an arbitrary URL from the client and fetches it.
- **Evidence:** [src/lib/amazon.ts](../../src/lib/amazon.ts), [src/lib/sp-api.ts](../../src/lib/sp-api.ts), [src/app/api/scanner/route.ts](../../src/app/api/scanner/route.ts) (`retailer` allowlist check before any fetch).
- **Recommendation:** None required. If a future feature lets a user supply an arbitrary URL (e.g., "import from this link"), add an allowlist or block private IP ranges (RFC1918, link-local, `169.254.169.254` cloud metadata) before fetching.
- **Blocks SP-API approval?** No.

**F-20 — CSV import has no file-size or row-count bound**
- **Severity:** Medium
- **Description:** `/api/inventory/import` accepts the CSV content as a plain JSON string field and parses it character-by-character with no maximum length, row count, or field-length check before processing. A very large payload could consume significant memory/CPU in the serverless function (bounded only by Vercel's `maxDuration = 60` timeout, which fails the request but doesn't prevent the resource spike during the attempt).
- **Evidence:** [src/app/api/inventory/import/route.ts](../../src/app/api/inventory/import/route.ts) — custom delimiter-aware parser with no size guard before parsing begins.
- **Recommendation:** Reject the request early (413) if the CSV string exceeds a reasonable size (e.g., 10MB) and cap parsed row count (e.g., 100k) before the main parse loop runs.
- **Blocks SP-API approval?** No — this isn't part of the Amazon-facing surface, but it's a real availability risk worth fixing.

### 1.9 Error Handling

**F-21 — A few routes return raw exception messages to the client**
- **Severity:** Medium
- **Description:** Most routes return a generic error string and log the real exception server-side (correct pattern). A handful instead include the live error message in the JSON response, which can leak internal detail (e.g., a scraper's raw failure string, or an SP-API error body that may reference a token or seller identifier).
- **Evidence:** [src/app/api/amazon/dry-run/route.ts](../../src/app/api/amazon/dry-run/route.ts) — `{ error: \`scrape failed: ${(e as Error).message}\` }`; [src/app/api/amazon/inventory/route.ts](../../src/app/api/amazon/inventory/route.ts) — returns `message: msg` (the raw caught error string) across multiple branches; [src/app/api/scanner/route.ts](../../src/app/api/scanner/route.ts) — `{ error: 'Scan failed', message: String(err) }`.
- **Recommendation:** Replace these three with the generic-message + `console.error(...)` pattern already used correctly elsewhere (e.g., `register/route.ts`, `webhook/route.ts`).
- **Blocks SP-API approval?** Maybe — if any leaked message ever included an SP-API token fragment or seller identifier, that's the kind of incidental data exposure Amazon's Data Protection Policy is meant to prevent. Worth fixing before submission.

### 1.10 HTTP Security Headers, CSP, Cookies

**F-22 — No security headers or CSP configured at the application layer that actually serves production traffic**
- **Severity:** High
- **Description:** `next.config.ts` has no `headers()` function (verified — the file only configures image remote patterns), and `middleware.ts` sets no headers. The `infra/nginx/nginx.conf` file does configure `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and rate-limit zones — **but this is unused, dead infrastructure** (see Section 0); production runs on Vercel directly, with no nginx in front of it. The live site therefore ships with **none** of these headers beyond whatever Vercel applies by default (Vercel does not add CSP, X-Frame-Options, or rate limiting automatically).
- **Evidence:** [next.config.ts](../../next.config.ts) (full file — no `headers()`); [src/middleware.ts](../../src/middleware.ts) (no header-setting logic); `infra/nginx/nginx.conf` confirmed unused per Section 0.
- **Recommendation:** Add a `headers()` function to `next.config.ts` (this is the correct place for a Vercel-deployed app, not nginx) setting at minimum: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (or `frame-ancestors 'self'` via CSP), `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, and a baseline CSP (`default-src 'self'`, with explicit allowances for Stripe.js, Tailwind/Inter font CDN, and the SP-API/Apify/Keepa fetch targets which are server-side only and don't need `connect-src` entries). Delete or clearly mark `infra/` as unused legacy scaffolding to prevent future confusion (see F-25).
- **Blocks SP-API approval?** Maybe — Amazon's security questionnaire (used in your own [docs/security/SecureDevelopmentPolicy.md](SecureDevelopmentPolicy.md) and the in-app SP-API guide) doesn't explicitly require CSP, but a reviewer doing a cursory technical check of the live site will see these headers are absent. Low cost to fix; worth doing before submission.

**F-23 — The one cookie the app sets is configured correctly**
- **Severity:** Strength
- **Description:** The Amazon OAuth `state` cookie (the only custom cookie set anywhere in the app — NextAuth manages its own session cookie internally) is `httpOnly`, `sameSite: 'lax'`, `secure` in production, and short-lived (10 minutes).
- **Evidence:** [src/app/api/amazon/oauth/start/route.ts:30-36](../../src/app/api/amazon/oauth/start/route.ts) — confirmed by direct read.
- **Recommendation:** None required.
- **Blocks SP-API approval?** No.

### 1.11 Rate Limiting

**F-24 — No application-level rate limiting exists anywhere in production**
- **Severity:** High
- **Description:** Confirmed by direct grep of `src/` for any rate-limiting logic: none exists. The only "rate" related code is the SP-API outbound retry/backoff in `src/lib/amazon.ts`, which throttles EALLsource's own calls *to* Amazon — it does nothing to limit *inbound* requests to EALLsource's own login, registration, password-reset, or MFA endpoints. (The `infra/nginx/nginx.conf` rate-limit zones do not apply — see Section 0.)
- **Evidence:** Repository-wide grep for rate-limiting patterns in `src/`; confirmed `ioredis`/`bullmq` are present as dependencies but used only for job queues and caching, not request throttling.
- **Recommendation:** This is the same underlying gap as F-01 (brute force) and F-20 (CSV DoS), but broader — it covers public registration, password reset, and any other unauthenticated endpoint. Implement IP- and/or account-keyed rate limiting using the Redis instance already in the stack (e.g., a sliding-window counter via `ioredis`), or adopt Vercel's edge-level rate limiting if available on the current plan.
- **Blocks SP-API approval?** Maybe — same reasoning as F-01; not a hard SP-API requirement but a real production gap.

### 1.12 Documentation Hygiene

**F-25 — Unused Docker/nginx deployment scaffolding is misleading and was the source of an incorrect finding during this audit**
- **Severity:** Low
- **Description:** `infra/Dockerfile`, `infra/Dockerfile.worker`, `infra/docker-compose.yml`, and `infra/nginx/nginx.conf` describe a self-hosted deployment that is not how EALLsource actually runs (production is Vercel). This is not itself a vulnerability, but it actively caused a wrong conclusion earlier in this very audit (an initial pass credited the app with security headers and rate limiting that don't apply to the live site) and could mislead a future contributor, auditor, or Amazon reviewer who reads the repo and assumes these protections are active.
- **Evidence:** `infra/` directory contents vs. `vercel.json` and the project's actual deployment history (every release shipped via Vercel/git push to `main`).
- **Recommendation:** Either remove `infra/` if it's truly unused, or add a clear `infra/README.md` stating it's an alternative/legacy self-hosting path not used for the production eallsource.com deployment.
- **Blocks SP-API approval?** No, but recommended before any external review of the repository.

---

## 2. Security Strengths

- **Encryption at rest** (F-10) is implemented correctly: AES-256-GCM, random IVs, authenticated-tag verification on decrypt, strict key-format validation with no silent fallback.
- **OAuth/CSRF handling** for the Amazon connection flow (F-07, F-23) is textbook: 256-bit random state, `httpOnly`/`sameSite`/short-lived cookie, strict comparison before code exchange.
- **Multi-tenant isolation** (F-04) is consistently enforced by `orgId` scoping across all 47 API routes reviewed — the most important class of bug for a multi-tenant SaaS handling other people's Amazon accounts, and it was not found broken anywhere.
- **No SQL injection surface** (F-14) — exclusive use of Prisma's parameterized query builder and tagged-template `$queryRaw`.
- **No XSS surface** (F-18) and **no SSRF surface** (F-19) found anywhere in the codebase.
- **Stripe webhook verification** (F-16) correctly rejects bad signatures rather than merely logging them.
- **No secrets committed to source control** (F-11), with correct `.gitignore` coverage and reliance on GitHub push protection as backstop.
- **Password policy and hashing** (12-char minimum with mixed character classes, bcrypt) are above typical SaaS baseline.

---

## 3. Remaining Risks

In order of how much they matter in practice, not just severity label:

1. **No rate limiting anywhere** (F-24) compounds with **no brute-force protection on login/MFA** (F-01) — together these are the single biggest gap relative to a "production-ready" bar, independent of Amazon.
2. **No CSP or security headers on the actual production path** (F-22) — the dead nginx config means this gap is real, not just theoretical.
3. **Inconsistent input validation** (F-17) on a handful of mutating routes — contained by org-scoping, but not validated at the boundary.
4. **Error-message leakage** on three specific routes (F-21).
5. **Hardcoded, triplicated platform-admin check** (F-05) — a maintenance/drift risk more than an active vulnerability today, but exactly the kind of thing that becomes a real vulnerability when one of the three copies gets out of sync.
6. **No CSV size bound** (F-20) — an availability risk, not a confidentiality one.
7. **Single, non-rotatable encryption key** (F-12) — acceptable for current scale, but the rotation runbook needs to exist before it's ever needed under pressure.

None of these are exploitable cross-tenant data leakage, secret exposure in source control, or SQL/XSS/SSRF injection — the categories most likely to cause a severe incident were checked specifically and came back clean.

---

## 4. Amazon SP-API Readiness Assessment

**Verdict: Not yet ready to submit — fixable within roughly a day of focused work, not a redesign.**

What already supports approval:
- Non-PII role scope (per the existing publishing checklist) pairs correctly with the actual data accessed in code — no buyer PII is requested or stored anywhere in the SP-API integration.
- OAuth implementation meets Amazon's expected CSRF/state-handling pattern.
- Tokens and the LWA client secret are encrypted at rest and never logged or returned to the client.
- Multi-tenant isolation means one seller's connected Amazon account cannot be reached by another seller — a core thing Amazon's security review checks for.

What should be fixed before submitting:
- **F-22** (add basic security headers/CSP via `next.config.ts` — the live site currently ships none) — cheap, visible, worth doing first.
- **F-21** (stop returning raw error messages on the three Amazon-adjacent routes) — directly touches "could this leak something about Amazon Information," which is the exact category Amazon's reviewer is trained to look for.
- **F-01 / F-24** (some minimal brute-force/rate-limit protection on login) — not Amazon-specific, but a reasonable reviewer doing technical due diligence may ask about it.
- **F-25** — clean up or label the unused `infra/` directory so a reviewer cloning the repo doesn't draw the same wrong conclusion this audit initially did.

Nothing found in this audit is a **architectural** blocker — i.e., nothing requires rethinking how credentials are stored, how tenants are isolated, or how OAuth works. The gaps are bounded, specific, and addressable without touching the encryption, OAuth, or multi-tenant model that already works correctly.

---

## 5. Recommended Remediation Order

1. **F-22** — Add security headers + baseline CSP in `next.config.ts`. (Hours, no behavior risk.)
2. **F-21** — Replace raw error-message leakage in the three identified routes with the generic-message pattern already used elsewhere. (Hours.)
3. **F-25** — Add `infra/README.md` clarifying the Docker/nginx path is unused, or remove it. (Minutes.)
4. **F-01 / F-24** — Add basic rate limiting on login, MFA verification, registration, and password-reset request using the existing Redis instance. (A day or so.)
5. **F-17** — Add Zod schemas to the three identified under-validated routes (`/api/inventory/add`, `/api/inventory/bulk-delete`, `/api/billing/checkout`). (Hours.)
6. **F-05** — Consolidate the triplicated `ADMIN_EMAILS` check into a single source of truth, or move to a DB-backed flag. (Hours.)
7. **F-20** — Add a size/row-count bound to the CSV import parser. (Hours.)
8. **F-03** — Set an explicit `session.maxAge` in `auth.ts`. (Minutes.)
9. **F-06** — Add audit-log entries to the admin `PATCH` route. (Minutes.)
10. **F-12 / F-13** — Document the key-rotation runbook and add startup warnings for unset optional integration keys. (Lower priority, no urgency.)

Items 1–3 are realistic to complete before the next SP-API submission attempt without delaying it meaningfully; items 4–7 should follow shortly after regardless of the Amazon timeline, since they're general production-hardening rather than Amazon-specific.

---

## 6. Overall Production Readiness Score: **72 / 100**

**Justification:**

The core security architecture is genuinely strong — encryption, OAuth/CSRF, multi-tenant isolation, SQL/XSS/SSRF safety, and secret hygiene all check out under direct code review with no exceptions found. Those are the categories where a mistake would be catastrophic (cross-tenant data leakage, a committed secret, a SQL injection, a broken OAuth flow), and none of them turned up broken. That's the foundation a score in the 70s sits on rather than the 40s.

The score is held below 85 by a cluster of **production-hardening gaps that are real but bounded**: no rate limiting or brute-force protection anywhere in the app, no security headers/CSP on the actual production path (the nginx config that would have provided this is dead code), a few routes that under-validate input or leak raw error text, and a maintenance-risk pattern (triplicated hardcoded admin check) rather than an active exploit. None of these require architectural rework — they're a focused punch list, not a redesign — which is why the score isn't lower. It isn't higher because "no rate limiting on login, in production, on an app handling Amazon seller credentials and payment data" is the kind of gap that matters in practice, not just on paper.

---

## Document Control

| Field | Value |
|---|---|
| Owner | Founder, EALLsource |
| Approval Date | _[to be completed upon approval]_ |
| Version | 1.0 |
| Review Date | 2026-06-27 (this audit) |
| Next Review Date | After remediation items in Section 5 are addressed, or 6 months, whichever is sooner |
