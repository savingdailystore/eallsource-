# EALLsource — Soft Launch Runbook

**Version:** 1.0  
**Created:** 2026-07-09  
**Phase:** 13.1  
**Support:** support@eallsource.com

---

## 1. Soft Launch Status

| Item | Status |
|---|---|
| Phase 12.9 Go/No-Go audit | ✅ GO |
| Production health (`/api/health`) | ✅ `{"status":"ok","db":"connected"}` |
| Database connected | ✅ Neon PostgreSQL reachable |
| Critical launch blockers | ✅ None found |
| Production data changed during audit | ✅ None |
| Repricing run | ✅ Did not occur |
| Amazon price push | ✅ Did not occur |
| Report imports | ✅ Did not occur |
| Inventory mutations | ✅ Did not occur |
| PO mutations | ✅ Did not occur |

EALLsource is cleared for soft launch and first real user onboarding.

Amazon-dependent workflows (inventory sync, repricing push, report imports) remain
paused until the user's Amazon SP-API is connected and reports are available.

---

## 2. Soft Launch Readiness Checklist

Run this checklist before inviting any user.

### Infrastructure

- [ ] `GET https://eallsource.com/api/health` returns `{"status":"ok","db":"connected"}`
- [ ] Vercel dashboard shows latest deployment as "Ready" and aliased to `eallsource.com`
- [ ] Vercel environment variables confirmed set: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- [ ] Neon database reachable (confirmed via health check)
- [ ] BullMQ/Redis worker status known — if worker is not running in prod, scanner scans will queue but not process

### Auth & Registration

- [ ] Register at `/register` — new account creates, redirects to `/dashboard`
- [ ] Login at `/login` — signs in, redirects to dashboard
- [ ] Forgot-password at `/forgot-password` — confirm Resend email actually delivers (check spam)
- [ ] MFA setup in Settings works end-to-end (optional but verify it does not break login)

### Support

- [ ] `support@eallsource.com` is monitored and deliverable
- [ ] Test email to `support@eallsource.com` confirmed received
- [ ] Contact page (`/contact`) links work

### Pages & Copy

- [ ] Homepage pricing section matches current plan capabilities
- [ ] `/terms` and `/privacy` pages are readable and complete
- [ ] Help & Support link in sidebar routes to `/contact`

### Billing

- [ ] Billing page renders for owner/admin without error
- [ ] Stripe test mode vs live mode decision made before first paid user
- [ ] "Contact us to upgrade" fallback email is monitored if Stripe live keys are not yet set

### Amazon SP-API

- [ ] Amazon OAuth redirect URI registered in Amazon Developer Console for the production domain
- [ ] OAuth connect button at `/dashboard/amazon` does not return a 500

### Safety Gates

- [ ] All repricing rules confirmed `isActive=false`
- [ ] No PROPOSED rows in RepricingHistory pending approval
- [ ] No scanner jobs stuck in RUNNING or PENDING state

---

## 3. First User Onboarding Flow

### Step 1 — Account creation

User navigates to `https://eallsource.com` → clicks "Get started free" → `/register`.  
Fills org name, email, and password (12+ chars, mixed requirements).  
Auto-signs in after registration, lands on `/dashboard`.

### Step 2 — Getting Started checklist (Dashboard)

Walk the user through the built-in checklist: plan → amazon → inventory → leads → sales → repricing.  
Explain Starter (free, 3 leads/week) vs Pro ($50/mo, 20 leads/week + all advanced features).  
Confirm the user understands what is free vs gated before going further.

### Step 3 — Lead Feed (safe, read-only)

`/dashboard/leads` — show existing leads if any, explain filters (sellable, ROI threshold, status).  
Explain how leads are scored and what the validation engine checks.  
No data mutations involved.

### Step 4 — Products (safe, read-only)

`/dashboard/products` — show product detail, ROI calculation, source price vs Amazon price.  
CSV export available for owner users.

### Step 5 — Inventory (view only — do not sync yet)

`/dashboard/inventory` — explain what the inventory table represents.  
Show the AmazonSyncButton but explain Amazon must be connected first.  
Do not click Sync unless Amazon SP-API is connected and the user understands the write.

### Step 6 — Amazon SP-API connection (if user is ready)

Only proceed if the user is the org OWNER and has an Amazon Seller Central account.  
Walk through `/dashboard/amazon` → Connect with Amazon OAuth.  
Confirm the "Connected" status badge turns green before proceeding.  
After connection: Inventory Sync is safe to run.

### Step 7 — Orders (explanation only for now)

Show `/dashboard/orders` — explain the PO workflow: create → receive → close.  
If the user has no real purchase orders, defer until they have actual inventory costs to track.

### Step 8 — Sales & Profit (defer imports until reports are ready)

Show the page layout and explain what the stats mean.  
Explain the two-step import process: Orders report first, then Settlement report to add fees and calculate realized profit.  
Do **not** import any reports until the user has the correct Amazon files downloaded.  
Set expectation: "You will see profit here after your first import cycle."

### Step 9 — Profit Recovery (explain only)

Show the page, explain FBA reimbursements tracking.  
Defer import until the user has an actual FBA Reimbursements report from Seller Central.

### Step 10 — Repricing (last, and only with care)

Show the page (PRO only).  
Explain: "Rules are generated when you run the engine — no prices are pushed until you review and approve each one in the proposals panel."  
Do **not** run repricing until inventory costs are confirmed and the user is ready.  
Do **not** approve any proposals from legacy or pre-existing rules.

---

## 4. Feature Demo Order

| Order | Feature | Risk Level | Notes |
|---|---|---|---|
| 1 | Homepage & pricing | None | Public page |
| 2 | Register / login | None | Auth only |
| 3 | Dashboard Getting Started checklist | None | Read-only |
| 4 | Lead Feed | None | Read-only, filtered |
| 5 | Products | None | Read-only |
| 6 | Inventory (view only) | None | Read-only |
| 7 | Amazon SP-API connection | Low | OAuth write — only if owner is ready |
| 8 | Orders (create PO) | Medium | Creates a new DB record — only with real orders |
| 9 | Sales & Profit (show, do not import) | Low | Defer imports until reports are ready |
| 10 | Profit Recovery (show, do not import) | Low | Defer imports until reports are ready |
| 11 | Repricing | Medium | Show read-only; do not run or approve |
| 12 | Billing | Low | Read-only; upgrade only when user is ready |
| 13 | Settings / MFA | Low | Safe, non-financial |

---

## 5. Do-Not-Touch List

### Repricing

- Do not run repricing (`Run All Now`) unless the user explicitly requests it and costs are confirmed
- Do not approve any PROPOSED price in the repricing panel
- Do not toggle `isActive=true` on any existing rule without explicit review
- Do not push prices to Amazon under any circumstances without approval

### Protected Data — Existing Records

Do not mutate the following record under any circumstances:

| Field | Value |
|---|---|
| ASIN | B0CGR29R63 |
| SKU | A00-K00-1.75-1000-SPL-US2 |
| availableQuantity | 0 |
| reservedQuantity | 15 |
| inboundQuantity | 0 |
| totalQuantity | 15 |
| unitCost | 16.33 |
| isActive (repricing rule) | false |
| costBasis | 16.33 |
| lastPushedPrice | 25.77 |
| lastPushedAt | 2026-07-03T01:17:33.013Z |

- Do not receive, reopen, or cancel the existing CLOSED purchase order
- Do not change `reservedQuantity` manually

### Report Imports

- Do not import Sales/Orders reports until the user has the correct Amazon flat-file downloaded
- Do not import Settlement reports until an Orders report has been imported first
- Do not import FBA Reimbursements until the user has the correct TSV from Seller Central
- Re-importing is safe (idempotent) but do not import placeholder or test files

### Financial Data

- Do not treat missing fees as $0 — incomplete profit is `GROSS_ONLY`, not finalized
- Do not treat missing cost as $0 — unknown cost means unknown profit
- Do not manually edit `realizedProfit` on any sale record
- Do not fabricate or estimate profit in any communication to users
- Do not apply refund adjustments unless the actual refund is confirmed in Seller Central
- Do not promise profit is finalized before a settlement report has been imported

### Schema / Infrastructure

- Do not run `prisma db push` or `db:migrate` in production without an approved migration plan
- Do not run `db:seed` against production
- Do not delete or manually edit any DB records directly

---

## 6. Support Process

**Support email:** support@eallsource.com

### Information to gather from every user report

| Item | Why |
|---|---|
| Account email | Identify the org and user record |
| Organization name | Find in DB if needed |
| Page URL they were on | Narrows to exact feature |
| What they were trying to do | Distinguish user error from bug |
| Exact error message (screenshot preferred) | Match to Vercel logs |
| Whether any data was changed | Assess severity |
| Amazon SKU/ASIN (if repricing or inventory related) | Check inventory and rule state |
| Browser + OS | For auth or JS issues |
| Whether the issue is repeatable | Reproducibility |

### Severity tiers

| Tier | Example | Response |
|---|---|---|
| P0 — Data corrupted / money at risk | Wrong price pushed, duplicate import, realizedProfit wrong | Stop and investigate immediately |
| P1 — Feature broken | Cannot log in, import fails every time, lead feed empty | Investigate same day |
| P2 — UX confusion | User does not understand a label, cannot find a feature | Log as product gap; answer via email |
| P3 — Feature request | "Can you add X?" | Log for future phases |

### Common first-user questions

**"Why is my profit showing as incomplete?"**  
Settlement report not yet imported. Explain the two-step import: Orders report first, then Settlement report to add fees and unlock realized profit.

**"Why can't I see the Repricing page?"**  
Starter plan. Repricing requires Pro. Direct user to `/dashboard/billing`.

**"Why is Lead Feed empty?"**  
No scanner scans yet. Scanner is owner-only and requires the `scanEnabled` flag to be set on the org. Confirm this is active before troubleshooting further.

**"Forgot password email never arrived."**  
Check Resend deliverability. Check spam folder. Confirm `RESEND_API_KEY` is set in Vercel environment variables.

---

## 7. Production Monitoring Checklist

### Daily checks (during soft launch)

| Check | How |
|---|---|
| Health endpoint | `GET https://eallsource.com/api/health` — expect `{"status":"ok","db":"connected"}` |
| Vercel deployment status | Vercel dashboard → confirm latest deployment is "Ready" |
| Vercel function logs | Look for unhandled errors, 500s, timeouts |
| Neon DB console | Connection count, query latency, storage |
| New user signups | Check User table count (read-only via Prisma Studio or Neon console) |

### After any user activity

| Event | What to check |
|---|---|
| User registers | Auth session works; org + user records created; no DB error in logs |
| User imports a report | Import count matches expected rows; no unexpected record creation |
| User syncs inventory | `availableQuantity` updated correctly; existing records not duplicated |
| User creates a PO | New PO record only; existing CLOSED PO not modified |
| User runs scanner | Scan job status reaches DONE or FAILED; no jobs stuck RUNNING |
| User upgrades plan | Stripe webhook logs; subscription record updated; plan badge in sidebar reflects new plan |
| Amazon OAuth completes | Callback resolves; `AmazonCredential` record created with `isActive=true` |

### Red flags — investigate immediately

- `RepricingHistory` count increases unexpectedly (would mean a push ran without approval)
- `lastPushedPrice` or `lastPushedAt` on B0CGR29R63 rule changes
- `Sale` or `SettlementRecord` count increases when no import was intentionally run
- Vercel logs show repeated 500s on any `/api/` route
- `InventoryItem` record count changes without a known import or sync
- Any sale record shows `realizedProfit` populated where fees were known to be missing

### Monitoring tools

- `GET /api/health` — DB liveness
- Vercel dashboard → Deployments, Functions, Logs tabs
- Neon console → Monitoring tab
- Stripe dashboard → Events feed (when live billing is enabled)
- `npx prisma studio` locally against production `DATABASE_URL` — read-only inspection

---

## 8. Data Safety Baseline

This is the locked production baseline as of Phase 12.9 Go/No-Go audit (2026-07-09).  
Any deviation from these counts requires investigation before proceeding.

### Record counts

| Table | Baseline |
|---|---|
| Sale | 18 |
| SettlementRecord | 43 |
| SaleAdjustment | 0 |
| InventoryItem | 1 |
| PurchaseOrder | 1 |
| PurchaseOrderItem | 1 |
| RepricingRule | 1 |
| RepricingHistory | 16 |

### Protected inventory item

| Field | Value |
|---|---|
| ASIN | B0CGR29R63 |
| SKU | A00-K00-1.75-1000-SPL-US2 |
| availableQuantity | 0 |
| reservedQuantity | 15 |
| inboundQuantity | 0 |
| totalQuantity | 15 |
| unitCost | 16.33 |

### Protected repricing rule

| Field | Value |
|---|---|
| isActive | false |
| costBasis | 16.33 |
| lastPushedPrice | 25.77 |
| lastPushedAt | 2026-07-03T01:17:33.013Z |

**Rule:** Before any new deployment or data operation, re-verify these counts and values.
If counts differ from baseline in a direction not explained by a known approved operation, stop and investigate before continuing.

---

## 9. First 24-Hour Launch Watch

### T+0 — Immediately after first user signup

- [ ] `GET /api/health` still returns `{"status":"ok"}`
- [ ] New `User` and `Organization` records visible in DB (count +1 each)
- [ ] No 500 errors in Vercel logs during registration
- [ ] User landed on `/dashboard` with Getting Started checklist visible

### T+0 to T+1 hour — During onboarding session

- [ ] No unexpected `Sale`, `SettlementRecord`, or `InventoryItem` count changes
- [ ] No `RepricingHistory` rows added (would indicate an unintended push)
- [ ] B0CGR29R63 `lastPushedAt` value unchanged
- [ ] If a scanner scan ran: job reached DONE or FAILED (not stuck RUNNING)
- [ ] Lead Feed shows data or appropriate empty state without JS errors
- [ ] Capture every question or point of confusion the user expresses — log as product gaps

### T+1 to T+24 hours — Post-session watch

- [ ] Check Vercel logs for any overnight function errors
- [ ] Verify no unexpected DB record mutations across any table
- [ ] Confirm no repricing proposals appeared (no new PROPOSED rows in RepricingHistory)
- [ ] Check Resend delivery logs if password reset or any transactional email was triggered
- [ ] If Stripe is live: check for successful or failed checkout events
- [ ] Write a brief post-launch note: what worked, what confused the user, what needs to be fixed

---

## 10. Recommended Next Build Phases

| Phase | Title | Description |
|---|---|---|
| **13.2** | In-App Help / FAQ Page | Add `/dashboard/help` with beginner-facing answers to the most common first-user questions: two-step import, repricing safety, lead limits, Amazon connection. Static — no DB or API changes. |
| **13.3** | Forgot-Password Smoke Test | Verify the forgot-password and reset-password flow end-to-end in production. Confirm Resend deliverability. Currently untested in production — a gap identified in the Phase 12.9 audit. |
| **13.4** | Scanner `scanEnabled` Operator Gate | The scanner requires `scanEnabled=true` on the org record, but there is no UI to set this flag. Build or document a lightweight admin toggle so scanner access can be granted per org without a direct DB edit. |
| **14.0** | First Real Orders Report Import | When Amazon reports are ready: smoke-test the full Orders → Settlement import cycle with a real file in production. Verify `getSaleProfitStatus` reaches `COMPLETE` after settlement import. This is the first time production `Sale` and `SettlementRecord` counts will legitimately increase beyond the Phase 12.9 baseline. |
