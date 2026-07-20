# EALLsource Soft Launch Feedback Tracker

Internal document. Not committed to public branches. Updated manually after each customer interaction.

Last updated: 2026-07-20

---

## Current Waiting State

- Amazon Appstore listing submitted **2026-07-20** — pending Amazon review
- **Do not remove `version=beta`** from `src/app/api/amazon/oauth/start/route.ts` until Amazon publishes the listing
- NA (chmazanryk91@gmail.com) was contacted first on 2026-07-20
- NA logged in and opened the Lead Feed on 2026-07-20 ~20:52–20:54 UTC — no errors
- **Do not contact True Deal or Desktop Flea Market until NA has had at least one full day (hold until 2026-07-21 at earliest)**

---

## Customer Rollout Order

| # | Org | Email | When to contact |
|---|---|---|---|
| 1 | NA | chmazanryk91@gmail.com | ✅ Contacted 2026-07-20 |
| 2 | True Deal | yupitzoscar09@gmail.com | After NA has had 1+ day — earliest 2026-07-21 |
| 3 | Desktop Flea Market | tlvalko@yahoo.com | After True Deal — earliest 2026-07-22 |
| 4 | tester | villaeric23@gmail.com | Internal only — not a customer outreach target |

---

## Per-Customer Tracking

| Field | NA | True Deal | Desktop Flea Market |
|---|---|---|---|
| **Email** | chmazanryk91@gmail.com | yupitzoscar09@gmail.com | tlvalko@yahoo.com |
| **Plan** | PRO | PRO | PRO |
| **Visible leads** | 19 | 19 | 19 |
| **canManualLead** | ✅ Yes | ❌ No | ❌ No |
| **Outreach sent** | ✅ 2026-07-20 | ⬜ Pending | ⬜ Pending |
| **Logged in** | ✅ 2026-07-20 ~20:52 UTC | ⬜ | ⬜ |
| **Viewed Lead Feed** | ✅ 2026-07-20 ~20:54 UTC | ⬜ | ⬜ |
| **Viewed lead detail** | ⬜ Not confirmed | ⬜ | ⬜ |
| **Export used** | ⬜ Not yet | ⬜ | ⬜ |
| **Amazon connected** | ⬜ Not yet | ⬜ | ⬜ |
| **Feedback received** | ⬜ Not yet | ⬜ | ⬜ |
| **Issues found** | ⬜ None so far | ⬜ | ⬜ |
| **Follow-up needed** | ✅ Send 2026-07-21 | ⬜ | ⬜ |

Update this table after each monitoring run or support email.

---

## NA Current Status (as of 2026-07-20)

- **19 visible leads** (3 REJECTED pre-outreach, 19 NEW)
- **canManualLead:** true
- **Outreach sent:** 2026-07-20
- **Dashboard opened:** ✅ 20:52 UTC
- **Lead Feed opened:** ✅ 20:54 UTC
- **Lead detail viewed:** ⬜ not confirmed in logs
- **Export used:** ❌ no `/api/export` hit
- **Manual lead submitted:** ❌ no CUSTOMER_MANUAL entitlement
- **Amazon OAuth attempted:** ❌ no `/api/amazon/oauth/start` hit (two pre-login attempts at /dashboard/amazon/guide were correctly 307'd by middleware)
- **Errors:** None
- **Follow-up:** Send 2026-07-21 (see template below)

---

## Follow-Up Email Templates

### NA Follow-Up (send 2026-07-21)

**Subject:** Checking in — any questions about your leads?

Hi,

Just checking in — I saw you made it into your account and visited your Lead Feed. Hope the leads are looking good.

A few things worth knowing if you haven't tried them yet:

- **Open any lead** to see the full detail — buy price, estimated Amazon sell price, estimated profit, sales rank, and a direct Amazon product link
- **Accept or reject** leads to keep your feed organized (rejected leads stay hidden by default)
- **Export** — there's a CSV and Excel export button at the top of your Lead Feed

If you want to connect your Amazon seller account, go to **Dashboard → Amazon SP-API** and click "Connect with Amazon." That unlocks FBA inventory sync.

Any questions, just reply here.

— Eric
EALLsource | support@eallsource.com

---

### True Deal First Outreach (send 2026-07-21 at earliest)

**Subject:** Your EALLsource account is ready — 19 leads waiting

Hi,

Your EALLsource account is live and ready to use. You have **19 sourced leads** waiting in your Lead Feed — each one validated against live Amazon pricing, estimated FBA fees, and demand signal before it reached your account.

Here's what you can do right now:

- **Browse your Lead Feed** at eallsource.com/dashboard/leads — filter by ROI, tier, or status
- **Open any lead** to see buy price, estimated sell price, estimated profit, ROI, and Amazon sales rank
- **Accept or reject** leads to keep your feed clean
- **Export** your accepted leads to CSV or Excel
- **Connect your Amazon seller account** (optional) — go to Dashboard → Amazon SP-API to authorize EALLsource through Amazon's official OAuth flow. This unlocks FBA inventory sync and the repricing approval queue

New leads are delivered to your account every Monday, up to 15 per week on the Pro plan.

If anything looks off or you have a question about a specific lead, reply to this email and I'll get back to you the same day.

— Eric
EALLsource | support@eallsource.com

---

### Desktop Flea Market First Outreach (send 2026-07-22 at earliest)

**Subject:** Your EALLsource account is ready — 19 leads waiting

Hi,

Your EALLsource account is live and ready to use. You have **19 sourced leads** waiting in your Lead Feed — each one validated against live Amazon pricing, estimated FBA fees, and demand signal before it reached your account.

Here's what you can do right now:

- **Browse your Lead Feed** at eallsource.com/dashboard/leads — filter by ROI, tier, or status
- **Open any lead** to see buy price, estimated sell price, estimated profit, ROI, and Amazon sales rank
- **Accept or reject** leads to keep your feed clean
- **Export** your accepted leads to CSV or Excel
- **Connect your Amazon seller account** (optional) — go to Dashboard → Amazon SP-API to authorize EALLsource through Amazon's official OAuth flow. This unlocks FBA inventory sync and the repricing approval queue

New leads are delivered to your account every Monday, up to 15 per week on the Pro plan.

If anything looks off or you have a question about a specific lead, reply to this email and I'll get back to you the same day.

— Eric
EALLsource | support@eallsource.com

---

### Bug Report Response

**Subject:** Re: [their subject]

Hi,

Thanks for flagging this — I want to make sure it gets fixed quickly.

Can you send me:
1. The page URL where you saw the issue (or the feature you were trying to use)
2. What you clicked or did
3. What you expected to happen
4. What actually happened (screenshot if possible)

I'll look into it and get back to you as soon as I can.

— Eric
EALLsource | support@eallsource.com

---

### ROI / Profit Question Response

**Subject:** Re: [their subject]

Hi,

Good question — the ROI and profit figures are **estimates** based on:
- The current Amazon buy-box price at the time the lead was sourced
- Amazon's published referral fee for the product category
- An estimated FBA fulfillment fee based on the product's weight and dimensions

These will not match exactly what you see in Amazon's FBA Revenue Calculator because Amazon's fee estimates are based on exact product dimensions they have on file, which can differ slightly from what we calculate. The figures are meant to give you a directional signal, not a guaranteed margin.

If a specific lead looks significantly off, send me the product name or ASIN and I'll take a look at the underlying data.

— Eric
EALLsource | support@eallsource.com

---

### Amazon Connect Trouble Response

**Subject:** Re: [their subject]

Hi,

Let's get that sorted. Here's what to check:

1. Go to **Dashboard → Amazon SP-API** in your EALLsource account
2. Click **"Connect with Amazon"** — this opens Amazon's consent screen
3. Make sure you're logged into the **correct Seller Central account** before clicking Authorize
4. After you authorize, you should be returned to EALLsource with a green "Connected" badge

If you're seeing a "403 Forbidden" error after the redirect, or the badge doesn't appear, please send me:
- Your Amazon Seller ID (found in Seller Central → Account Info)
- The exact error message you're seeing

I'll investigate on my end.

— Eric
EALLsource | support@eallsource.com

---

## What NOT to Change During Amazon Review

Amazon is actively reviewing the Appstore listing submitted on 2026-07-20. The following must not change until Amazon sends approval and the listing goes live:

| Item | Location | Why |
|---|---|---|
| `version=beta` | `src/app/api/amazon/oauth/start/route.ts` line 27 | Required while app is Draft status in Seller Central |
| `LWA_CLIENT_ID` | Vercel env var | Changing invalidates existing connected seller accounts |
| `LWA_CLIENT_SECRET` | Vercel env var | Same |
| `NEXTAUTH_URL` | Vercel env var | Controls OAuth redirect URI derivation — must stay `https://eallsource.com` |
| OAuth callback URL | `https://eallsource.com/api/amazon/callback` | Must match what was submitted to Seller Central |
| `/privacy` | Public URL | Must remain live and accessible |
| `/terms` | Public URL | Must remain live and accessible |
| `/pricing` | Public URL | Must remain live and accessible |
| `/support` | Public URL | Must remain live and accessible |
| SP-API roles | Seller Central app settings | Do not add or remove roles during review |
| Pro plan price | $50/month | Submitted as part of pricing disclosure to Amazon |

**Post-approval action (one step only):** Remove `amazonUrl.searchParams.set('version', 'beta')` from `src/app/api/amazon/oauth/start/route.ts` line 27, commit as Phase 15.4, deploy, verify OAuth flow.

---

## Monitoring Checklist After Each Customer Outreach

Run within 24–48h of each outreach email. All steps are read-only.

### DB checks (Prisma script)
- [ ] Lead status breakdown for org (NEW / REJECTED / EXPIRED counts)
- [ ] Any lead `updatedAt` timestamps after outreach time → indicates engagement
- [ ] `AmazonCredential` row exists for org → OAuth was completed
- [ ] `CUSTOMER_MANUAL` entitlement rows → manual lead was submitted
- [ ] `canManualLead` unchanged on User row
- [ ] Protected baselines unchanged (sale_records=18, settlement_records=43, inventory_items=1, etc.)
- [ ] Repricing rule: `isActive=false`, `costBasis=16.33`, `lastPushedPrice=25.77`
- [ ] Inventory: `B0CGR29R63`, `reservedQuantity=15`, `unitCost=16.33`

### Vercel log checks (`vercel logs --environment production --since 24h --limit 200 --json`)
- [ ] `/login` hit → user visited login page
- [ ] `/dashboard` 200 → authenticated session established
- [ ] `/dashboard/leads` 200 → Lead Feed visited
- [ ] `/dashboard/leads/[id]` 200 → lead detail opened
- [ ] `/api/export` hit → export used
- [ ] `/api/leads/manual` POST → manual lead submitted
- [ ] `/api/amazon/oauth/start` hit → Amazon OAuth attempted
- [ ] `/api/amazon/callback` hit → OAuth callback received
- [ ] Any 4xx or 5xx responses → investigate immediately
- [ ] No `/api/cron/*` hits attributed to user sessions (cron runs on schedule, not user action)

---

## Protected Baselines (must not change)

These were verified on 2026-07-20 and must remain unchanged throughout soft launch.

| Table | Expected count |
|---|---|
| `SaleRecord` | 18 |
| `SettlementRecord` | 43 |
| `SaleAdjustmentRecord` | 0 |
| `InventoryItem` | 1 |
| `PurchaseOrder` | 1 |
| `PurchaseOrderItem` | 1 |
| `RepricingRule` | 1 |
| `RepricingHistory` | 16 |

ASIN `B0CGR29R63`: `availableQuantity=0`, `reservedQuantity=15`, `inboundQuantity=0`, `totalQuantity=15`, `unitCost=16.33`

Repricing rule: `isActive=false`, `costBasis=16.33`, `lastPushedPrice=25.77`, `lastPushedAt=2026-07-03T01:17:33.014Z`
