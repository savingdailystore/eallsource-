# Phase 20.3E — vaNotes Template

Copy the template below and fill in all fields before creating the SourceCandidate.
Paste the completed string into the `vaNotes` field of the candidate CSV row.

Do not leave any field blank. Use "N/A" only if a field is genuinely not applicable
(e.g., no regular shelf price visible). Never use "N/A" for required fields like
UPC, ASIN, Profit, or ROI.

---

## vaNotes Template (single-line, copy/paste)

```
INSTORE | ONE_TIME | Store: [STORE NAME] | Location: [CITY, STATE] | StoreNum: [#XXXX or N/A] | PurchaseDate: [YYYY-MM-DD] | SourcePrice: $[X.XX] | RegularPrice: $[X.XX or N/A] | Qty: [N] | UPC: [12-digit UPC] | ASIN: [B0XXXXXXXXX] | BuyBox: $[X.XX] | SellerType: 3P FBA | AmazonRetailPresent: [Yes/No] | FeePreview: SP_API_SUCCESS | ReferralFee: $[X.XX] | FBAFee: $[X.XX] | TaxedSourceCost: $[X.XX] | Profit: $[X.XX] | ROI: [X.X]% | Evidence: receipt/front-label/back-label-UPC/amazon-screenshot/fee-preview-screenshot collected | ScannedWith: SellerAmp+AmazonSellerApp | Clearance: Yes
```

---

## Field Definitions

| Field | Description | Example |
|---|---|---|
| `INSTORE` | Lead type prefix — always literal "INSTORE" for in-store clearance | `INSTORE` |
| `ONE_TIME` | Lead category — always "ONE_TIME" for clearance (non-repeatable source) | `ONE_TIME` |
| `Store` | Retailer chain name | `Target` / `Dollar General` / `Big Lots` / `CVS` |
| `Location` | City and state of the store | `Phoenix, AZ` |
| `StoreNum` | Store number from receipt (if printed) | `#1234` or `N/A` |
| `PurchaseDate` | Date of purchase (ISO format) | `2026-08-18` |
| `SourcePrice` | Clearance price paid per unit (what you actually paid) | `$4.98` |
| `RegularPrice` | Regular shelf price before clearance (if visible on sticker or tag) | `$8.99` or `N/A` |
| `Qty` | Units purchased in this batch | `3` |
| `UPC` | 12-digit UPC from product barcode | `012345678901` |
| `ASIN` | Amazon ASIN confirmed via SellerAmp or Amazon Seller App | `B00P5YE2OA` |
| `BuyBox` | Amazon buy box price at time of purchase | `$14.99` |
| `SellerType` | Always "3P FBA" for qualifying candidates | `3P FBA` |
| `AmazonRetailPresent` | Is Amazon.com listed as any competing seller? | `No` |
| `FeePreview` | Always "SP_API_SUCCESS" for qualifying candidates | `SP_API_SUCCESS` |
| `ReferralFee` | Referral fee from EALLsource Fee Preview tool | `$1.20` |
| `FBAFee` | FBA fee from EALLsource Fee Preview tool | `$3.22` |
| `TaxedSourceCost` | Source price × 1.086 (from Fee Preview tool) | `$5.41` |
| `Profit` | Estimated profit from Fee Preview tool | `$5.16` |
| `ROI` | Estimated ROI from Fee Preview tool | `95.4%` |
| `Evidence` | Confirm all 6 evidence items are collected (do not list file paths) | `receipt/front-label/back-label-UPC/amazon-screenshot/fee-preview-screenshot collected` |
| `ScannedWith` | Tools used during in-store screening | `SellerAmp+AmazonSellerApp` |
| `Clearance` | Always "Yes" for in-store clearance leads | `Yes` |

---

## Filled Example

```
INSTORE | ONE_TIME | Store: Target | Location: Phoenix, AZ | StoreNum: #1234 | PurchaseDate: 2026-08-18 | SourcePrice: $4.98 | RegularPrice: $8.99 | Qty: 3 | UPC: 075285100141 | ASIN: B00P5YE2OA | BuyBox: $13.49 | SellerType: 3P FBA | AmazonRetailPresent: No | FeePreview: SP_API_SUCCESS | ReferralFee: $1.08 | FBAFee: $3.22 | TaxedSourceCost: $5.41 | Profit: $3.78 | ROI: 69.9% | Evidence: receipt/front-label/back-label-UPC/amazon-screenshot/fee-preview-screenshot collected | ScannedWith: SellerAmp+AmazonSellerApp | Clearance: Yes
```

---

## Notes

- The vaNotes field has no character limit in the current schema — do not abbreviate.
- If a candidate is promoted from ONE_TIME to RECURRING in a future phase
  (because an online equivalent source is found), update the vaNotes to replace
  `ONE_TIME` with `RECURRING` and add a `PromotedDate` field.
- Do not store file paths, base64 images, or photo data in vaNotes —
  evidence photos are kept separately and referenced only by the word "collected."
