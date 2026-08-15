# Phase 20.3E — Evidence Packet Requirements

Every in-store clearance candidate requires a complete evidence packet before a
SourceCandidate can be created. Missing any required item = do not import.

Store all evidence in a single folder named:
`EVIDENCE-[ASIN]-[YYYY-MM-DD]`
Example: `EVIDENCE-B00P5YE2OA-2026-08-18`

---

## Required Evidence Items (All 6 Required)

---

### 1. Receipt Photo

**Required: Yes**

What the receipt must show:
- Store name (chain name visible — e.g., Target, Dollar General)
- Store address or store number
- Purchase date and time
- Line item showing the product name (or abbreviated name)
- Clearance price paid per unit
- Quantity purchased
- Total paid

Photo requirements:
- Full receipt in frame — do not crop the top or bottom
- No glare, no blur — must be readable
- If the receipt is long, photograph in two overlapping sections
- Do not edit, filter, or annotate the receipt photo

**Reject if:** Receipt is missing, shows a different price than the clearance sticker, or is illegible.

---

### 2. UPC / Barcode Photo

**Required: Yes**

What to photograph:
- The barcode on the back of the product (or bottom, if back is a label)
- Must include the full 12-digit UPC number printed beneath the barcode
- The barcode must be scannable (not blurry)

Photo requirements:
- Close-up shot, product flat on a surface
- Full barcode and full number digits visible
- No flash glare on the barcode

**How to verify UPC matches:**
- Scan with SellerAmp or Amazon Seller App
- Confirm the ASIN returned matches the Amazon listing you verified

**Reject if:** Barcode is damaged, missing digits, or scans to a different ASIN than expected.

---

### 3. Front Label Photo

**Required: Yes**

What to photograph:
- Full front face of the product
- Brand name, product name, size/weight/count, variant/flavor must all be visible in one shot

Photo requirements:
- Product standing upright or held flat — full label in frame
- No blur, no shadow obscuring text
- If there is a clearance sticker on the front, photograph it in a second shot showing the sticker price

**Reject if:** Brand name, count, size, or flavor is obscured or illegible.

---

### 4. Back Label Photo

**Required: Yes**

What to photograph:
- Full back label
- Must include: ingredient list or "Supplement Facts" or product description panel, country of origin if visible, any warning labels
- The UPC barcode on the back (same as item 2 above — can be combined into one photo if both are visible)

Photo requirements:
- Full label in frame, no blur
- Warnings and usage text readable (needed if hazmat review required later)

**Reject if:** Back label is missing, peeling, or obscured.

---

### 5. Amazon Listing Screenshot

**Required: Yes**

What to screenshot:
- Amazon product detail page for the matched ASIN
- Must show in a single screenshot (or two if needed):
  - Product title
  - Buy box price
  - Buy box seller name (confirm "3P FBA" — NOT "Ships from and sold by Amazon.com")
  - "In Stock" status
  - ASIN (visible in the URL or product detail section)
  - Date visible (browser status bar, OS clock, or screenshot metadata)

How to capture:
- Take the screenshot on the same day as the in-store purchase
- If the buy box seller is a 3P seller, scroll to confirm "Fulfilled by Amazon" appears under the seller name
- If Amazon Retail is listed as a competing seller at any price, note it in the evidence packet

**Reject if:** Screenshot shows Amazon.com as the buy box holder, buy box is suppressed, or the product title does not exactly match the item purchased.

---

### 6. EALLsource Fee Preview Screenshot

**Required: Yes**

What to screenshot:
- The `/dashboard/admin/tools/fee-preview` result page after submitting the candidate's ASIN, buy box price, and clearance source cost
- Must show:
  - Status: **SP_API_SUCCESS** (the green/success state — NOT SP_API_FEE_UNAVAILABLE)
  - ASIN
  - Amazon resale price used
  - Source cost used
  - Source tax rate: 8.6%
  - Referral fee (non-zero)
  - FBA fee (non-zero)
  - Taxed source cost
  - **Estimated profit ≥ $2.00**
  - **Estimated ROI ≥ 20%**

**Reject if:** Screenshot shows SP_API_FEE_UNAVAILABLE, profit < $2.00, or ROI < 20%.

---

## Store / Location / Date / Quantity Requirements

These must be recorded explicitly — do not leave them to be inferred from photos.

| Field | Required | Example |
|---|---|---|
| Retailer chain name | Yes | Target |
| Retailer type | Yes | Target Clearance |
| Store address (street + city + state) | Yes | 1234 Main St, Phoenix AZ |
| Store number (if on receipt) | Recommended | Store #1234 |
| Purchase date | Yes | 2026-08-18 |
| Purchase time | Recommended | 10:32 AM |
| Clearance price per unit | Yes | $4.98 |
| Regular shelf price (if visible) | Recommended | $8.99 |
| Quantity purchased | Yes | 3 |
| Total paid (from receipt) | Yes | $14.94 |

---

## Evidence Packet Completeness Check

Before requesting SourceCandidate import, confirm all 6 items are collected:

- [ ] Receipt photo — store, date, price, qty all visible
- [ ] UPC / barcode photo — 12-digit number legible, barcode scannable
- [ ] Front label photo — brand, name, size/count/flavor all visible
- [ ] Back label photo — full label, warnings visible
- [ ] Amazon listing screenshot — ASIN, buy box price, 3P FBA seller confirmed, same-day
- [ ] Fee Preview screenshot — SP_API_SUCCESS, profit ≥ $2.00, ROI ≥ 20%

**Do not submit a SourceCandidate import request without all 6 items.**
