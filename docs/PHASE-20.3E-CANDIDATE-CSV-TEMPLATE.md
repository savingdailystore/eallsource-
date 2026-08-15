# Phase 20.3E — SourceCandidate CSV Import Template

Use this template to import exactly one in-store clearance SourceCandidate
after all preflight gates have passed and the evidence packet is complete.

Do not import more than one clearance candidate per CSV file for the first test batch.
Do not exceed 3 units in quantity (tracked manually — quantity is not a CSV field).

---

## CSV Header Row

```
retailerUrl,retailer,sourcePrice,title,asin,upc,retailerItemId,vaNotes
```

---

## Retailer Values by Store

Use exactly one of these strings in the `retailer` column:

| Store | retailer value |
|---|---|
| Target (clearance) | `Target Clearance` |
| Dollar General (clearance) | `Dollar General Clearance` |
| Big Lots (clearance) | `Big Lots Clearance` |
| CVS (clearance) | `CVS Clearance` |
| Walgreens (clearance) | `Walgreens Clearance` |

---

## Column Definitions

| Column | Required | Description | Example |
|---|---|---|---|
| `retailerUrl` | Yes | Target.com product URL if the item exists online, otherwise use the store's search URL for the product; must be a valid URL | `https://www.target.com/p/africa-s-best-organics-hair-mayonnaise/-/A-12345678` or `https://www.target.com/s?searchTerm=africa+best+hair+mayonnaise` |
| `retailer` | Yes | Retailer name with clearance tag — see table above | `Target Clearance` |
| `sourcePrice` | Yes | Clearance price paid per unit (numeric, no $ sign) | `4.98` |
| `title` | Yes | Exact product title from the front label (not the Amazon title — the label title) | `Africa's Best Organics Hair Mayonnaise 15oz` |
| `asin` | Yes | Amazon ASIN confirmed via SellerAmp and Amazon Seller App | `B00P5YE2OA` |
| `upc` | Yes | 12-digit UPC from barcode — used to verify ASIN match | `075285100141` |
| `retailerItemId` | Recommended | TCIN if Target; store SKU or item number if visible on receipt or shelf tag | `12345678` |
| `vaNotes` | Yes | Complete vaNotes string from PHASE-20.3E-VANOTES-TEMPLATE.md | See template |

---

## CSV Example Row

```csv
retailerUrl,retailer,sourcePrice,title,asin,upc,retailerItemId,vaNotes
https://www.target.com/s?searchTerm=africa+best+hair+mayonnaise,Target Clearance,4.98,Africa's Best Organics Hair Mayonnaise 15oz,B00P5YE2OA,075285100141,12345678,"INSTORE | ONE_TIME | Store: Target | Location: Phoenix, AZ | StoreNum: #1234 | PurchaseDate: 2026-08-18 | SourcePrice: $4.98 | RegularPrice: $8.99 | Qty: 3 | UPC: 075285100141 | ASIN: B00P5YE2OA | BuyBox: $13.49 | SellerType: 3P FBA | AmazonRetailPresent: No | FeePreview: SP_API_SUCCESS | ReferralFee: $1.08 | FBAFee: $3.22 | TaxedSourceCost: $5.41 | Profit: $3.78 | ROI: 69.9% | Evidence: receipt/front-label/back-label-UPC/amazon-screenshot/fee-preview-screenshot collected | ScannedWith: SellerAmp+AmazonSellerApp | Clearance: Yes"
```

---

## Import Process (After Approval)

1. Complete all preflight checks (see PHASE-20.3E-PASS-FAIL-RULES.md)
2. Complete all evidence packet items (see PHASE-20.3E-EVIDENCE-PACKET.md)
3. Fill out the vaNotes string (see PHASE-20.3E-VANOTES-TEMPLATE.md)
4. Save this CSV as `clearance-candidate-[ASIN]-[YYYY-MM-DD].csv`
5. Request import approval in the next phase prompt with full evidence summary
6. Admin imports via `/dashboard/admin/candidates` → Import CSV
7. Evaluate the candidate in the queue
8. Max 3 units in the test batch — do not order more before sell-through confirmed

---

## What This CSV Does NOT Control

- Quantity purchased (tracked manually — buy max 3 units in-store)
- Evidence photo storage (kept in local folder, referenced in vaNotes as "collected")
- Lead entitlement (created downstream after candidate evaluation)
- ONE_TIME enforcement (enforced by vaNotes tag and manual process — no schema field yet)

---

## Future Schema Enhancement (Not Yet Built)

In a future phase, the following fields may be added to SourceCandidate schema
to formalize in-store clearance tracking:

- `leadType`: enum ONE_TIME / RECURRING
- `evidencePacketUrl`: link to stored evidence folder
- `unitCap`: max units per batch
- `purchaseDate`: date of in-store purchase

Until those fields exist, all of this information lives in `vaNotes`.
