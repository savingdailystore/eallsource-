# Phase 20.3E — Pass / Fail Decision Tree

Every in-store clearance item must pass ALL gates in order.
One FAIL at any gate = do not buy, do not import.
Gates are ordered from fastest-to-check to slowest.

---

## Gate 0 — Price Threshold (Before Scanning)

```
Is the clearance sticker price ≤ $10.00?
│
├─ NO  →  REJECT. Do not scan. Move on.
│
└─ YES →  Proceed to Gate 1.
```

---

## Gate 1 — Category / Product Type (Before Scanning)

```
Is the item in an excluded category or product type?
  - Toy / game / art supply / electronics
  - Chemical relaxer kit
  - Aerosol spray (any brand)
  - Bleach / peroxide / developer
  - Any liquid over 16oz
  - Any powder over 2lb
  - Any item with flame / flammable symbol
  - Any item with Transparency hologram sticker
  - Perishable food expiring within 90 days
  - Item packaged weight over 2lb
│
├─ YES →  REJECT immediately. Do not scan.
│
└─ NO  →  Proceed to Gate 2.
```

---

## Gate 2 — SellerAmp Scan (Amazon ASIN + Risk Flags)

```
Scan barcode in SellerAmp.

Does SellerAmp show ANY of the following?
  - IP Alert or IP Complaint flag
  - Hazmat flag
  - Meltable flag
  - Adult product flag
  - Transparency enrolled flag
  - No ASIN match (product not found on Amazon)
  - Buy box suppressed / no active buy box
│
├─ YES (any flag) →  REJECT. Do not proceed.
│
└─ NO flags      →  Continue Gate 2 checks:

  Is the buy box price in range $12–$25?
  │
  ├─ NO  →  REJECT (outside STARTER_SALES resale range)
  │
  └─ YES →  Continue:

  Is BSR < 200,000 in the main category?
  │
  ├─ NO  →  REJECT (too slow-moving; FBA storage risk)
  │
  └─ YES →  Proceed to Gate 3.
```

---

## Gate 3 — Amazon Retail Dominance Check

```
In SellerAmp or on Amazon.com, is Amazon Retail (Ships from
and sold by Amazon.com) the current buy box holder?
│
├─ YES →  REJECT. Amazon 1P dominant — no margin available.
│
└─ NO  →  Is Amazon Retail listed as ANY seller on this ASIN
          at a price ≤ buy box price?
          │
          ├─ YES →  REJECT. Amazon can reclaim buy box at any time.
          │
          └─ NO  →  Proceed to Gate 4.
```

---

## Gate 4 — Amazon Seller App Eligibility

```
Scan barcode in Amazon Seller App.

Are you eligible to sell this ASIN as New condition?
│
├─ NO  ("Apply to sell" / "You need approval" / "Cannot be listed")
│       →  REJECT. Do not attempt ungating during scan session.
│
└─ YES (green eligible checkmark)
        →  Continue:

Does the product title in Amazon Seller App exactly match
the item in your hand? (title, size, count, flavor, pack)
│
├─ NO  →  REJECT. Count/size/flavor mismatch — cannot verify exact match.
│
└─ YES →  Proceed to Gate 5.
```

---

## Gate 5 — UPC / ASIN Exact Match Verification

```
Does the UPC barcode on the product scan to the ASIN you verified?
│
├─ NO  (scans to different ASIN, or no match)
│       →  REJECT. Cannot confirm exact product match.
│
└─ YES →  Is the Amazon listing count, size, and variant identical
          to the product in your hand?
          │
          ├─ NO  →  REJECT. Count/SKU mismatch.
          │
          └─ YES →  Proceed to Gate 6.
```

---

## Gate 6 — EALLsource Fee Preview

```
Run fee preview at /dashboard/admin/tools/fee-preview.
Input: ASIN, current buy box price as resale, clearance price as source cost,
       tax rate 8.6%.

Does Fee Preview return SP_API_SUCCESS?
│
├─ NO  (SP_API_FEE_UNAVAILABLE or error)
│       →  REJECT. No confirmed fee data — cannot verify economics.
│           Do not proceed based on estimates.
│
└─ YES →  Read the results:

  Is estimated profit ≥ $2.00?
  │
  ├─ NO  →  REJECT. Below in-store clearance profit threshold.
  │
  └─ YES →  Is estimated ROI ≥ 20%?
            │
            ├─ NO  →  REJECT. Below minimum ROI threshold.
            │
            └─ YES →  Proceed to Gate 7.
```

---

## Gate 7 — Unit Cap

```
How many units are you planning to purchase?
│
├─ MORE THAN 3  →  REJECT quantity. Cap at 3 for first test batch.
│                   Do not exceed 3 units before sell-through is confirmed.
│
└─ 1, 2, or 3   →  PASS.
```

---

## Final Decision

```
All 7 gates passed?
│
├─ NO (any gate failed)  →  DO NOT BUY. Move on to next item.
│
└─ YES (all gates passed) →
        ✅ BUY up to 3 units.
        ✅ Collect complete evidence packet.
        ✅ Fill out vaNotes template.
        ✅ Request import approval before creating SourceCandidate.
```

---

## Summary Table

| Gate | Check | Reject Condition |
|---|---|---|
| 0 | Clearance sticker price | > $10.00 |
| 1 | Category / product type | Any excluded type |
| 2 | SellerAmp flags | IP / Hazmat / Meltable / Transparency / No ASIN / Suppressed BB |
| 2 | Buy box price range | Outside $12–$25 |
| 2 | BSR | ≥ 200,000 |
| 3 | Amazon Retail | Amazon.com is buy box holder or competing seller |
| 4 | Amazon Seller App eligibility | Not eligible / gated |
| 4 | Product title/size/count match | Any mismatch vs item in hand |
| 5 | UPC → ASIN match | UPC scans to different or no ASIN |
| 5 | Count/SKU exact match | Any count/size/flavor/pack difference |
| 6 | Fee Preview status | SP_API_FEE_UNAVAILABLE |
| 6 | Estimated profit | < $2.00 |
| 6 | Estimated ROI | < 20% |
| 7 | Unit quantity | > 3 units |

---

## One-Line Decision Rule

> **Buy only if: clearance ≤ $10, no flags, eligible to sell, exact UPC match,
> 3P FBA buy box $12–$25, SP_API_SUCCESS, profit ≥ $2, ROI ≥ 20%, qty ≤ 3.**
