# Phase 20.3E — In-Store Clearance Scan Checklist

Use this checklist on every in-store sourcing visit.
Screening order: SellerAmp → Amazon Seller App → EALLsource Fee Preview.
Max 3 units per SKU for the first test batch.

---

## 1. Aisles / Categories to Scan

Scan in this priority order. Stop when you have one candidate that passes all gates.

| Priority | Aisle / Department | What to look for |
|---|---|---|
| 1 | Ethnic hair care — clearance endcap or clearance shelf tag (yellow/red sticker) | Pomades, conditioning creams, jars — lightweight |
| 2 | OTC / Health — clearance shelf | Homeopathic tablets, specialty cold/allergy non-liquid |
| 3 | Personal care — clearance | Specialty deodorants, skin treatments in small solid/cream form |
| 4 | General beauty — clearance | Specialty cosmetics, non-liquid treatments |
| 5 | Small pet — clearance | Small animal treats, supplements (non-liquid) |
| 6 | Specialty grocery / ethnic food — clearance | Lightweight seasoning packets, dry spice blends |

**Clearance price threshold to bother scanning: ≤ $10.00 paid price.**
Do not scan items with a shelf/sticker price above $10. Above that, the math almost never works.

---

## 2. Brands to Prioritize (Scan First)

Listed in order of likelihood of producing a viable lead based on Phase 20.3D research.

### Ethnic Hair Care
- Africa's Best Organics (Hair Mayonnaise, Herbal Oil, Avocado Oil jars)
- Queen Helene (Cocoa Butter Cream, Mint Julep Masque, Cholesterol Cream)
- Blue Magic (Bergamot, Coconut Oil, Castor Oil conditioning jars)
- Murray's (pomade tins: Beeswax, Nu Nile, Superior)
- Sulfur8 (Medicated Anti-Dandruff Conditioner jars)
- Luster's Pink (Pink Glosser jar, Pink Oil Moisturizer)
- Taliah Waajid (Protective Mist Bodifier, Curly Curl Cream)
- Aunt Jackie's (Don't Shrink Gel, Quench Leave-In Conditioner)
- Camille Rose (Curl Maker, Moroccan Pear Custard — only if clearance ≤ $10)

### OTC Homeopathic
- Boiron (Arnicare Gel 2.6oz tube, ColdCalm blister packs matching Amazon size exactly, Oscillococcinum 6-dose small box)
- Hyland's (Leg Cramps PM 50ct, Nerve Tonic 50ct, Calms Forté 100ct)

### Personal Care
- Urban Skin Rx (Even Tone Spot Fader 0.5oz, Clear Skin Cleansing Bar 2oz — if clearance ≤ $10)
- Palmer's Skin Success Fade Cream 2.7oz
- Palmer's Cocoa Butter Solid Lotion Bar 2.25oz

### Small Pet Treats (non-liquid, lightweight)
- Oxbow Simple Rewards Baked Treats 3oz
- Kaytee Fiesta Treats (specific flavors)
- Vitakraft small animal treat sticks

### Specialty Grocery (lightweight only)
- Badia Sazon Complete 1.75oz, Culantro & Achiote 1.75oz
- Goya Sazon Con Culantro 1.41oz (20-packet box)
- Goya Adobo All-Purpose 8oz (if under 1lb packaged)

---

## 3. Brands / Categories to Skip Immediately

Do not scan — do not spend time looking up:

- **Nature Made, One A Day, Centrum, Olly, Vitafusion, Zarbee's** — Amazon 1P dominant
- **Cantu (any liquid product)** — MAP enforced; no spread
- **Mielle Organics at full price** — source price too high
- **Any chemical relaxer kit** — hazmat-adjacent (sodium hydroxide)
- **Any aerosol spray** — hazmat (flammable propellant)
- **Any bleach, peroxide, or developer** — hazmat
- **Any toy, board game, art supply, electronics** — excluded categories
- **Any item over 2 lbs in finished packaging** — FBA fee kills margin
- **Any liquid over 16oz** — phase prohibition
- **Any powder over 2 lbs** — phase prohibition
- **Any item labeled "Flammable," "Keep Away from Heat," or with flame symbol** — hazmat
- **Anything with Transparency hologram sticker** — cannot sell without codes
- **Any perishable food expiring within 90 days** — FBA lag risk

---

## 4. SellerAmp Checks (First Screen)

Scan the barcode in SellerAmp SAS (mobile app). Check all of the following before proceeding.

### Immediate REJECT if SellerAmp shows:
- 🔴 **IP Alert / Complaint** — stop immediately
- 🔴 **Hazmat flag** — stop immediately
- 🔴 **Meltable** — stop immediately
- 🔴 **Adult product** — stop immediately
- 🔴 **Transparency enrolled** — stop immediately
- 🔴 **No ASIN match** — product not on Amazon, cannot source
- 🔴 **Buy box suppressed / no buy box** — stop

### Check in SellerAmp:
- [ ] Buy box price is **$12–$25**
- [ ] Buy box seller is **3P FBA** (not "Amazon.com")
- [ ] Amazon Retail is **not present** or is not the lowest offer
- [ ] BSR (Best Sellers Rank) is **< 200,000** in main category (lower = better)
- [ ] SellerAmp estimated profit > $0 (rough screen — EALLsource Fee Preview is authoritative)
- [ ] No restriction flags for your account

---

## 5. Amazon Seller App Checks (Second Screen)

Open Amazon Seller App and scan the same barcode.

### Check:
- [ ] **You are eligible to sell** this ASIN (green checkmark)
- [ ] **Not gated** — no "Apply to sell" button
- [ ] Product condition is appropriate (New)
- [ ] Confirm the product title, size, count, and flavor exactly match the item in your hand
- [ ] Confirm buy box price visible and matches SellerAmp reading

### Immediate REJECT if Seller App shows:
- 🔴 **"You need approval to list"** — stop; do not attempt to ungate during a scan session
- 🔴 **"This product cannot be listed"** — stop
- 🔴 **Hazmat / Dangerous Goods** notice — stop
- 🔴 **Brand Gating** block — stop

---

## 6. EALLsource Fee Preview Checks (Final Economics Screen)

Only run the fee preview if SellerAmp AND Amazon Seller App both passed.

Navigate to: `/dashboard/admin/tools/fee-preview`

**Input values:**
- ASIN: from Amazon Seller App or SellerAmp
- Amazon resale price: current buy box price
- Source cost: clearance sticker price (what you will actually pay)
- Source tax rate: **8.6** (always)
- Category: informational only (enter the category for display)

### Fee Preview must return:
- [ ] **Status: SP_API_SUCCESS** — if SP_API_FEE_UNAVAILABLE, STOP. Do not proceed.
- [ ] **referralFee** is present and non-zero
- [ ] **fbaFee** is present and non-zero
- [ ] **Estimated profit ≥ $2.00**
- [ ] **Estimated ROI ≥ 20%**

### Immediate REJECT if:
- 🔴 Fee Preview returns **SP_API_FEE_UNAVAILABLE**
- 🔴 Profit is **< $2.00**
- 🔴 ROI is **< 20%**

---

## 7. Final Buy / No-Buy Rules

All boxes must be checked to BUY.

- [ ] Clearance price ≤ $10 (paid price, not original shelf price)
- [ ] SellerAmp: no IP / hazmat / meltable / Transparency / gating flags
- [ ] Amazon Seller App: eligible to sell, no approval required
- [ ] Exact match: title, size, count, flavor, pack all identical to Amazon listing
- [ ] UPC on product matches Amazon ASIN's UPC
- [ ] Buy box is 3P FBA, not Amazon Retail
- [ ] Buy box price $12–$25
- [ ] Fee Preview: SP_API_SUCCESS
- [ ] Profit ≥ $2.00
- [ ] ROI ≥ 20%
- [ ] **BUY MAX 3 UNITS** for first test batch — do not exceed

**Any single NO = do not buy. Move on.**

---

## 8. At the Register

- Pay for the item separately from any personal purchases (clean receipt)
- Keep the receipt — it is required evidence for import
- Photograph the item front label, back label/UPC, and clearance sticker before leaving the store
- Do not remove any stickers from the item
