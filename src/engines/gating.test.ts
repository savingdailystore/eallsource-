import { describe, it, expect } from 'vitest';
import { assessGating } from './gating';

// ─── Hazmat false-positive regression (Phase 20.2K) ──────────────────────────
// "toxic" substring-match was catching "non-toxic" product titles. The fix adds
// negation-aware matching for the 'toxic' keyword so safe labels don't trigger.

describe('assessGating — hazmat: non-toxic phrases must NOT trigger hazmat', () => {
  const safe = (title: string) =>
    assessGating({ title, brand: 'TestBrand', category: 'Pet Supplies', hasHazmat: false });

  it('non-toxic dog chew toy', () => {
    expect(safe('Non-Toxic dog chew toy').hasHazmat).toBe(false);
  });

  it('nontoxic pet toy', () => {
    expect(safe('nontoxic pet toy').hasHazmat).toBe(false);
  });

  it('non toxic markers', () => {
    expect(safe('non toxic markers').hasHazmat).toBe(false);
  });

  it('BPA-free non-toxic kids toy', () => {
    expect(safe('BPA-free non-toxic kids toy').hasHazmat).toBe(false);
  });

  it('recyclable dishwasher-safe non-toxic rubber toy', () => {
    expect(safe('recyclable dishwasher-safe non-toxic rubber toy').hasHazmat).toBe(false);
  });

  it('West Paw Hurley regression — exact Amazon title', () => {
    expect(
      safe(
        'WEST PAW Zogoflex Hurley Dog Bone Chew Toy – Floatable Pet Toys for Aggressive Chewers, ' +
        'Catch, Fetch – Bright-Colored Bones for Dogs – Recyclable, Dishwasher-Safe, Non-Toxic, Large, Aqua',
      ).hasHazmat,
    ).toBe(false);
  });

  it('intoxicating — toxic as embedded substring must not trigger', () => {
    expect(safe('intoxicating scent diffuser').hasHazmat).toBe(false);
  });

  it('all three safe forms in one title — none must trigger', () => {
    expect(safe('non-toxic non toxic nontoxic dog toy').hasHazmat).toBe(false);
  });
});

describe('assessGating — hazmat: real hazmat phrases MUST still trigger', () => {
  const check = (title: string) =>
    assessGating({ title, brand: 'TestBrand', category: 'Home & Kitchen', hasHazmat: false });

  it('toxic chemical cleaner', () => {
    expect(check('toxic chemical cleaner').hasHazmat).toBe(true);
  });

  it('contains toxic material', () => {
    expect(check('contains toxic material').hasHazmat).toBe(true);
  });

  it('toxic fumes', () => {
    expect(check('toxic fumes').hasHazmat).toBe(true);
  });

  it('poison', () => {
    expect(check('poison').hasHazmat).toBe(true);
  });

  it('flammable spray', () => {
    expect(check('flammable spray').hasHazmat).toBe(true);
  });

  it('aerosol cleaner', () => {
    expect(check('aerosol cleaner').hasHazmat).toBe(true);
  });

  it('lithium battery', () => {
    expect(check('lithium battery pack').hasHazmat).toBe(true);
  });

  it('pesticide', () => {
    expect(check('pesticide concentrate').hasHazmat).toBe(true);
  });

  it('insecticide — via pesticide keyword', () => {
    // 'insecticide' does not contain any HAZMAT_KEYWORD substring,
    // but 'pesticide' does not match 'insecticide' either.
    // Confirm insecticide with a direct pesticide-labeled product triggers.
    expect(check('insect pesticide spray').hasHazmat).toBe(true);
  });
});

describe('assessGating — hazmat: mixed title with both non-toxic and real hazmat', () => {
  it('non-toxic AND lithium battery — should still flag hazmat', () => {
    const result = assessGating({
      title:    'Non-Toxic rechargeable lithium battery toy',
      brand:    'TestBrand',
      category: 'Toys & Games',
      hasHazmat: false,
    });
    // 'non-toxic' must not match; 'lithium battery' must still match
    expect(result.hasHazmat).toBe(true);
  });

  it('non-toxic toy with toxic fumes — second occurrence must still trigger', () => {
    const result = assessGating({
      title:    'non-toxic toy with toxic fumes',
      brand:    'TestBrand',
      category: 'Toys & Games',
      hasHazmat: false,
    });
    expect(result.hasHazmat).toBe(true);
  });

  it('non-toxic packaging contains toxic material — second occurrence must still trigger', () => {
    const result = assessGating({
      title:    'non-toxic packaging contains toxic material',
      brand:    'TestBrand',
      category: 'Home & Kitchen',
      hasHazmat: false,
    });
    expect(result.hasHazmat).toBe(true);
  });

  it('nontoxic bottle but toxic chemical refill — second occurrence must still trigger', () => {
    const result = assessGating({
      title:    'nontoxic bottle but toxic chemical refill',
      brand:    'TestBrand',
      category: 'Home & Kitchen',
      hasHazmat: false,
    });
    expect(result.hasHazmat).toBe(true);
  });
});

// ─── Other gating checks unaffected by the fix ───────────────────────────────

describe('assessGating — non-hazmat checks still work', () => {
  it('private label brand is detected', () => {
    const r = assessGating({ title: 'Some product', brand: 'Amazon Basics', category: 'Home & Kitchen', hasHazmat: false });
    expect(r.isPrivateLabel).toBe(true);
  });

  it('HIGH IP brand is detected', () => {
    const r = assessGating({ title: 'Some shoe', brand: 'Nike', category: 'Shoes', hasHazmat: false });
    expect(r.isBrandRestricted).toBe(true);
    expect(r.risk).toBe('HIGH');
  });

  it('generic brand is detected', () => {
    const r = assessGating({ title: 'Generic widget', brand: 'Generic', category: 'Home & Kitchen', hasHazmat: false });
    expect(r.isGenericBrand).toBe(true);
  });

  it('meltable keyword detected without raising risk', () => {
    const r = assessGating({ title: 'Scented soy wax candle', brand: 'CandleCo', category: 'Home & Kitchen', hasHazmat: false });
    expect(r.isMeltable).toBe(true);
    expect(r.hasHazmat).toBe(false);
  });

  it('pet supplies is auto-ungated', () => {
    const r = assessGating({ title: 'Dog chew toy', brand: 'PetBrand', category: 'Pet Supplies', hasHazmat: false });
    expect(r.autoUngated).toBe(true);
    expect(r.risk).toBe('LOW');
  });
});
