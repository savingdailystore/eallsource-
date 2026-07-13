# EALLsource — Soft Launch Runbook

**Version:** 1.2  
**Created:** 2026-07-09  
**Last updated:** 2026-07-12  
**Phase:** 14.2c  
**Support:** support@eallsource.com

---

## 1. Soft Launch Status

| Item | Status |
|---|---|
| Phase 12.9 Go/No-Go audit | ✅ GO |
| Phase 13.2 In-App Help / FAQ Page | ✅ Deployed — `/dashboard/help` live |
| Phase 13.3 Forgot-Password Smoke Test | ✅ Passed — Resend verified, token reuse blocked |
| Phase 13.4 Scanner Gate Audit | ✅ Complete — no code changes needed |
| Phase 13.5 Scanner Enablement Preflight | ✅ Complete — EALLsource `scanEnabled=true` confirmed |
| Phase 13.6 Admin Scan Job Recovery | ✅ Deployed — `/admin` recovery card live |
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
- [ ] Help & Support link in sidebar routes to `/dashboard/help`

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
| User runs scanner | Scan job status reaches DONE or FAILED; no jobs stuck RUNNING; use admin recovery card if stuck count > 0 |
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

## 10. Build Phase Status

| Phase | Title | Status |
|---|---|---|
| **13.2** | In-App Help / FAQ Page | ✅ Complete — `/dashboard/help` deployed |
| **13.3** | Forgot-Password Smoke Test | ✅ Complete — Resend verified, flow production-tested |
| **13.4** | Scanner `scanEnabled` Operator Gate Audit | ✅ Complete — no code changes needed; admin UI confirmed |
| **13.5** | Scanner Enablement Preflight | ✅ Complete — EALLsource scanner already active |
| **13.6** | Admin Stuck Scan Job Recovery | ✅ Complete — recovery card on `/admin` deployed |
| **13.7** | Soft Launch Runbook Update | ✅ This document |
| **14.0** | First Real Orders Report Import | ⏸ Paused — waiting for Amazon reports to be available |
| **14.1** | `canManualLead` Session Refresh | ✅ Complete — DB re-read on every request; revocation immediate |
| **14.2** | Production Scanner Customer Enablement | ✅ Complete — model audited; corrected in 14.2c (see §11B) |
| **14.2b** | Customer Role / Scanner Access Audit | ✅ Complete — OWNER is operator-only; customers are ADMIN by design |
| **14.2c** | Runbook Correction: Customer Scanner Model | ✅ This update |
| **14.3** | Optional: `canManualLead` validation on tester org | 🔲 Pending — grant Manual Lead to tester, confirm partial scanner view |

---

## 11. Scanner & Admin Operator Guide

### A. Customer Access Model (Corrected — Phase 14.2b)

> **⚠️ Correction from v1.1:** Earlier versions of this runbook said to "confirm the customer is an OWNER" before enabling scanner access. That instruction was wrong. Customers are never OWNER. See the full model below.

#### Role model

| Role | Who has it | Can run scans | Can submit manual leads |
|---|---|---|---|
| `OWNER` | Platform operator (`savingdailystore@gmail.com`) only | ✅ Yes | ✅ Yes |
| `ADMIN` | All self-registered customers (by design) | ❌ No | Only if `canManualLead=true` |
| `ANALYST` | Invited team members | ❌ No | Only if `canManualLead=true` |
| `VIEWER` | Invited team members (read-only) | ❌ No | ❌ No |

Self-registration (`/register`) always creates users with role `ADMIN`. The invite flow (`/api/team`) only accepts `ADMIN`, `ANALYST`, or `VIEWER`. There is no UI, API, or admin panel path that assigns `OWNER` to a customer. **Do not promote customers to `OWNER` via direct database edits** — this would grant unintended access to scanner execution and bypass the access model.

#### What customers receive

| What | How |
|---|---|
| Broadcast leads | Automatically — if `receiveBroadcast=true`, leads discovered by the EALLsource scanner are fanned out to the customer's Lead Feed |
| Manual lead entry | Optionally — if `canManualLead=true` for their user, they can submit product URLs manually via the Scanner page form |
| Full scanner execution | ❌ Not available to customers — scan execution, job history, and scheduled searches are `OWNER`-only |

#### What `scanEnabled` actually does for customers

`scanEnabled` is an org-level flag. For `ADMIN` users, **toggling `scanEnabled` has no visible effect** — the scanner page redirects non-OWNER users before it reads `scanEnabled`. The flag only gates the full scanner UI for `OWNER` sessions.

**Do not enable `scanEnabled` for a customer org expecting this to give the customer scanner access.** It will not. Customer scanner access requires `canManualLead=true` for manual lead entry. Full execution is not available to customers without a separate approved product/security phase to extend the OWNER-only API gates.

#### Scanner access state matrix

| Role | `scanEnabled` | `canManualLead` | What the customer sees |
|---|---|---|---|
| `ADMIN` | `false` | `false` | Redirected to `/dashboard` — no scanner page |
| `ADMIN` | `true` | `false` | Redirected to `/dashboard` — `scanEnabled` has no effect |
| `ADMIN` | `true` or `false` | `true` | ManualLeadEntry form; ScannerPanel + ScheduledSearches visible but locked |
| `OWNER` | `false` | — | "Scan access pending" card |
| `OWNER` | `true` | — | Full scanner: ManualLeadEntry + ScannerPanel + ScheduledSearches |

---

### B. Enabling Scanner for a Customer Org (Corrected — Phase 14.2c)

> **⚠️ The original steps in this section assumed customers would be OWNER. That is incorrect. These steps now reflect the correct model.**

#### Current customer scanner model

- EALLsource runs the scanner. All scan execution is operator-only.
- Customer orgs receive leads via broadcast (`receiveBroadcast=true`).
- Customers do not run their own scans.
- Customers may optionally be granted manual lead entry via `canManualLead`.

#### To grant a customer manual lead entry access

**Before granting, confirm:**
- You have identified the specific user by email in the admin table
- The user understands they are submitting product URLs for qualification, not running a scan
- You are granting access deliberately, not as a general "enable scanner" action

**Operator steps:**

1. Sign in as platform admin (`savingdailystore@gmail.com`)
2. Navigate to `https://eallsource.com/admin`
3. Expand the customer org row (chevron on the right)
4. In the Members section, locate the user by email
5. Click **Manual Lead** to toggle `canManualLead=true` for that user
6. Inform the user: they must **sign out and sign back in** for the Scanner sidebar link to appear (sidebar visibility is JWT-based; manual lead authorization itself is immediate)
7. After sign-in: confirm they see `/dashboard/scanner` with the ManualLeadEntry form
8. Confirm the ScannerPanel and ScheduledSearches sections are **locked** (overlay: "Scanner — owner access only") — this is expected and correct

**Do not:**
- Click the **Enable** button in the Scan Access column expecting this to give the customer scanner access — it will not (see §11A)
- Promote any customer user to `OWNER` via direct database edits
- Extend scanner execution to `ADMIN` users without a separately approved product and security phase
- Grant `canManualLead` without understanding which specific user is receiving access

#### Phase 14.3 — Optional tester org validation

When ready to validate the manual lead entry flow end-to-end:

**Recommended validation org:** `tester` — `villaeric23@gmail.com` (ADMIN, `canManualLead=false`, `scanEnabled=false`)

**Steps:**
1. Grant `canManualLead=true` to `villaeric23@gmail.com` via `/admin`
2. Ask that user to sign out and back in
3. Confirm the Scanner link appears in their sidebar
4. Confirm they see ManualLeadEntry and the locked scanner/scheduled-search panels
5. Do not submit a real manual lead unless separately approved
6. Do not change the tester user's role
7. Do not enable `scanEnabled` for the tester org (it has no effect for ADMIN users and is unnecessary)

---

### C. Scan Job Recovery

The `/admin` page shows a **Scan Job Recovery** card above the org table.

**What it shows:**
- A badge with the current count of stale scan jobs (RUNNING or PENDING, older than 10 minutes)
- Under normal operation this shows "0 stuck"

**What stale means:**
A scan job is stale when it is still in `RUNNING` or `PENDING` state more than 10 minutes after creation. This indicates a serverless function timed out before it could mark the job `DONE` or `FAILED`.

> **Note:** The scanner page also auto-heals stuck jobs for the org of the currently logged-in OWNER on every page load (6-minute cutoff). The admin recovery button handles cross-org recovery and provides an audit trail.

**When to use the recovery button:**
- The stale count on `/admin` is greater than 0, **or**
- A customer reports their scanner is spinning and never finishing

**When NOT to use the recovery button:**
- During routine checks when stale count is 0
- As a precaution before scans have run — it is a no-op but avoid clicking casually
- Do not use it to reset jobs that are actively running (within the last 10 minutes)

**What the button does:**
1. Finds all `ScanJob` rows with `status IN (PENDING, RUNNING)` and `createdAt < now - 10 minutes`
2. Sets `status = FAILED`, `error = "Marked failed by platform admin after becoming stale."`, `completedAt = now`
3. Returns the number of affected rows
4. Writes an `ADMIN_MARK_STALE_SCANS_FAILED` AuditLog entry recording the admin email, affected count, and cutoff

**What it does NOT change:**
- `DONE` jobs
- Already-`FAILED` jobs
- Leads, products, inventory, orders, repricing, sales, or settlements

**After using the recovery button:**
- Confirm the stale count drops to 0 on refresh
- Ask the affected customer to retry their scan
- Check Vercel logs for the original timeout error if the root cause is unclear

---

### D. Manual Lead Access (`canManualLead`)

`canManualLead` is a **per-user** permission separate from org-level `scanEnabled`.

| What it grants | Access to the "Add a lead manually" form on `/dashboard/scanner` |
|---|---|
| What it does NOT grant | Full scanner access (scan panel and scheduled searches remain OWNER-only) |
| Who sees the Scanner link | OWNER always; non-OWNER only if `canManualLead=true` |
| Requires `scanEnabled=true`? | No — manual lead API does not check `scanEnabled` |

**To grant `canManualLead` to a user:**
1. Go to `https://eallsource.com/admin`
2. Expand the user's org row
3. Toggle the **Manual Lead** button for that specific user

**Session staleness — authorization vs. sidebar visibility (Phase 14.1):**  
As of Phase 14.1, `canManualLead` is re-read from the database on every request at both `/dashboard/scanner` and `POST /api/leads/manual`. This means:

- **Revocation** (`true` → `false`): takes effect **immediately** — the user is denied on their next page load or API call, without signing out.
- **Grant** (`false` → `true`): the **API and page gate** take effect immediately, but the **Scanner sidebar link** (Sidebar component) remains hidden until the user signs out and back in, because the sidebar reads from the JWT which is baked at login.

Instruct newly-granted users to sign out and sign back in so the Scanner link appears in their sidebar. The permission itself is live from the moment it is toggled.

**Do not grant `canManualLead` unless intentionally supporting a specific user for manual lead entry.** It is not a general-access flag.

---

### E. Amazon-Dependent Work — Still Paused

The following workflows remain paused until Amazon Seller Central reports are available and the SP-API connection is confirmed for the relevant org:

| Workflow | Status |
|---|---|
| Inventory sync (AmazonSyncButton) | ⏸ Paused — requires active SP-API connection |
| Orders/Settlement report import | ⏸ Paused — requires correct Amazon flat-file downloaded |
| FBA Reimbursements import | ⏸ Paused — requires correct TSV from Seller Central |
| Repricing push to Amazon | ⏸ Paused — do not push prices until costs are confirmed and user approves proposals |
| First Orders Report import (Phase 14.0) | ⏸ Paused — waiting for Amazon reports to be ready |

None of these workflows should proceed without explicit operator approval and the correct Amazon files in hand. All protected inventory and repricing data (Section 8) must be verified unchanged before any Amazon-connected workflow runs.
