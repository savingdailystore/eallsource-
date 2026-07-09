import { describe, it, expect } from 'vitest';
import {
  summarizeLeads,
  summarizeWorkflowFunnel,
  summarizeInventory,
  summarizePurchaseOrders,
  summarizeRepricing,
  summarizeRecovery,
  buildActionItems,
  type LeadForBI,
  type InventoryItemForBI,
  type POForBI,
  type RepricingRuleForBI,
  type RepricingHistoryForBI,
} from './businessIntelligence';
import type { ReimbursementRecoveryAnalysis } from './reimbursementRecovery';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLead(status: string, daysAgo = 5): LeadForBI {
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return { status, createdAt };
}

function makeInventoryItem(overrides: Partial<InventoryItemForBI> = {}): InventoryItemForBI {
  return {
    availableQuantity: 5,
    reservedQuantity:  0,
    inboundQuantity:   0,
    totalQuantity:     5,
    createdAt:         new Date('2025-01-01'),
    unitCost:          null,
    product:           null,
    repricing:         null,
    ...overrides,
  };
}

function makePO(status: string, totalCost: number, items: POForBI['items'] = []): POForBI {
  return { status, totalCost, items };
}

function makeRule(isActive: boolean, costBasis: number | null = null, lastRepricedAt: Date | null = null): RepricingRuleForBI {
  return { isActive, costBasis, lastRepricedAt };
}

function makeHistory(status: string, pushedAt: Date | null = null): RepricingHistoryForBI {
  return { status, pushedAt };
}

function makeAnalysis(overrides: Partial<ReimbursementRecoveryAnalysis>): ReimbursementRecoveryAnalysis {
  return {
    reimbursementId:        'reimb_1',
    asin:                   'B000000001',
    sku:                    null,
    productName:            'Test Product',
    reason:                 'LOST_INBOUND',
    amountPerUnit:          10,
    amountTotal:            10,
    currencyUnit:           'USD',
    quantityTotal:          1,
    unitCost:               null,
    unitCostSource:         null,
    underpaymentStatus:     'UNKNOWN',
    possibleUnderpayment:   null,
    totalPossibleShortfall: null,
    recommendation:         'MISSING_COST_DATA',
    recommendationLabel:    'Missing cost data',
    recommendationNote:     '',
    ...overrides,
  };
}

// ─── summarizeLeads ───────────────────────────────────────────────────────────

describe('summarizeLeads', () => {
  it('returns hasData: false for empty input', () => {
    const result = summarizeLeads([]);
    expect(result.hasData).toBe(false);
    expect(result.total).toBe(0);
  });

  it('counts by status correctly', () => {
    const leads = [
      makeLead('NEW'),
      makeLead('NEW'),
      makeLead('SAVED'),
      makeLead('PURCHASED'),
      makeLead('REJECTED'),
    ];
    const result = summarizeLeads(leads);
    expect(result.total).toBe(5);
    expect(result.newCount).toBe(2);
    expect(result.saved).toBe(1);
    expect(result.purchased).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.hasData).toBe(true);
  });

  it('counts newToday only for leads within the last 24 hours', () => {
    const leads = [
      makeLead('NEW', 0),   // just now
      makeLead('NEW', 0.5), // 12 hours ago
      makeLead('NEW', 2),   // 2 days ago — NOT today
    ];
    const result = summarizeLeads(leads);
    expect(result.newToday).toBe(2);
  });

  it('does not fabricate newToday when all leads are old', () => {
    const leads = [makeLead('NEW', 5), makeLead('SAVED', 10)];
    expect(summarizeLeads(leads).newToday).toBe(0);
  });
});

// ─── summarizeWorkflowFunnel ──────────────────────────────────────────────────

describe('summarizeWorkflowFunnel', () => {
  it('returns hasData: false when all inputs are empty', () => {
    const result = summarizeWorkflowFunnel([], [], 0);
    expect(result.hasData).toBe(false);
  });

  it('counts funnel stages correctly', () => {
    const leads = [makeLead('NEW'), makeLead('SAVED'), makeLead('PURCHASED'), makeLead('PURCHASED')];
    const pos   = [
      makePO('ORDERED', 100, [{ quantityOrdered: 3, quantityReceived: 0, status: 'ORDERED' }]),
      makePO('PARTIALLY_RECEIVED', 200, [{ quantityOrdered: 5, quantityReceived: 2, status: 'PARTIALLY_RECEIVED' }]),
      makePO('RECEIVED', 150, []),
    ];
    const result = summarizeWorkflowFunnel(leads, pos, 7);

    expect(result.totalLeads).toBe(4);
    expect(result.savedLeads).toBe(1);
    expect(result.purchasedLeads).toBe(2);
    expect(result.openPOs).toBe(2);
    expect(result.partialPOs).toBe(1);
    expect(result.receivedPOs).toBe(1);
    expect(result.inventoryItems).toBe(7);
    expect(result.pendingUnits).toBe(6); // 3 + (5-2)
    expect(result.hasData).toBe(true);
  });

  it('does not count RECEIVED or CANCELLED items in pendingUnits', () => {
    const pos = [makePO('ORDERED', 100, [
      { quantityOrdered: 5, quantityReceived: 5, status: 'RECEIVED' },   // skip
      { quantityOrdered: 3, quantityReceived: 0, status: 'CANCELLED' },  // skip
      { quantityOrdered: 4, quantityReceived: 1, status: 'PARTIALLY_RECEIVED' }, // 3 pending
    ])];
    const result = summarizeWorkflowFunnel([], pos, 0);
    expect(result.pendingUnits).toBe(3);
  });
});

// ─── summarizeInventory ───────────────────────────────────────────────────────

describe('summarizeInventory', () => {
  it('returns hasData: false for empty input', () => {
    const result = summarizeInventory([]);
    expect(result.hasData).toBe(false);
    expect(result.totalItems).toBe(0);
  });

  it('sums totalUnits and availableUnits correctly', () => {
    const items = [
      makeInventoryItem({ totalQuantity: 10, availableQuantity: 8 }),
      makeInventoryItem({ totalQuantity: 5,  availableQuantity: 3 }),
    ];
    const result = summarizeInventory(items);
    expect(result.totalUnits).toBe(15);
    expect(result.availableUnits).toBe(11);
  });

  it('counts itemsMissingProduct when no product linked', () => {
    const items = [
      makeInventoryItem({ product: null }),
      makeInventoryItem({ product: null }),
      makeInventoryItem({
        product: {
          roi: 30, profit: 5, price: 25, demandLevel: 'MEDIUM', monthlySales: null,
          fbaSellers: 2, totalSellers: 3, amazonIsSeller: false, amazonOwnsBuyBox: false,
          buyBoxSuppressed: false, gatingRisk: 'LOW', hasIpComplaintHistory: false,
          isBrandRestricted: false, score: 70,
        },
      }),
    ];
    const result = summarizeInventory(items);
    expect(result.itemsMissingProduct).toBe(2);
    expect(result.healthCounts.UNKNOWN).toBe(2);
  });

  it('counts itemsMissingCost when no unitCost and no repricing.costBasis', () => {
    const items = [
      makeInventoryItem({ unitCost: null, repricing: null }),
      makeInventoryItem({ unitCost: 10 }),
      makeInventoryItem({ unitCost: null, repricing: { isActive: true, costBasis: 12 } }),
    ];
    const result = summarizeInventory(items);
    expect(result.itemsMissingCost).toBe(1);
    expect(result.itemsWithKnownCost).toBe(2);
  });

  it('does not fabricate inventory value for items without cost', () => {
    const items = [
      makeInventoryItem({ availableQuantity: 5, unitCost: null }),
    ];
    const result = summarizeInventory(items);
    expect(result.knownInventoryValue).toBe(0);
    expect(result.itemsWithKnownCost).toBe(0);
  });

  it('computes inventory value only from items with known cost', () => {
    const items = [
      makeInventoryItem({ availableQuantity: 5, unitCost: 10 }),  // 50
      makeInventoryItem({ availableQuantity: 3, unitCost: null }), // 0 — no cost
    ];
    const result = summarizeInventory(items);
    expect(result.knownInventoryValue).toBe(50);
  });

  it('uses repricing.costBasis as fallback when unitCost is null', () => {
    const items = [
      makeInventoryItem({
        availableQuantity: 4,
        unitCost: null,
        repricing: { isActive: true, costBasis: 8 },
      }),
    ];
    const result = summarizeInventory(items);
    expect(result.knownInventoryValue).toBe(32); // 4 × 8
    expect(result.itemsWithKnownCost).toBe(1);
  });
});

// ─── summarizePurchaseOrders ──────────────────────────────────────────────────

describe('summarizePurchaseOrders', () => {
  it('returns hasData: false for empty input', () => {
    const result = summarizePurchaseOrders([]);
    expect(result.hasData).toBe(false);
    expect(result.total).toBe(0);
  });

  it('counts PO statuses correctly', () => {
    const pos = [
      makePO('ORDERED', 100),
      makePO('ORDERED', 200),
      makePO('PARTIALLY_RECEIVED', 150),
      makePO('RECEIVED', 300),
      makePO('CANCELLED', 50),
      makePO('DRAFT', 0),
    ];
    const result = summarizePurchaseOrders(pos);
    expect(result.total).toBe(6);
    expect(result.ordered).toBe(2);
    expect(result.partiallyReceived).toBe(1);
    expect(result.received).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.draft).toBe(1);
  });

  it('sums openCost only for ORDERED and PARTIALLY_RECEIVED', () => {
    const pos = [
      makePO('ORDERED', 100),
      makePO('PARTIALLY_RECEIVED', 200),
      makePO('RECEIVED', 999),   // must NOT count
      makePO('CANCELLED', 999),  // must NOT count
    ];
    const result = summarizePurchaseOrders(pos);
    expect(result.openCost).toBe(300);
  });

  it('does not fabricate openCost for received or cancelled POs', () => {
    const pos = [makePO('RECEIVED', 500), makePO('CANCELLED', 300)];
    const result = summarizePurchaseOrders(pos);
    expect(result.openCost).toBe(0);
  });

  it('counts CLOSED POs in total but not in openCost or pendingUnits', () => {
    const pos = [
      makePO('CLOSED', 244.94, [{ quantityOrdered: 15, quantityReceived: 0, status: 'ORDERED' }]),
    ];
    const result = summarizePurchaseOrders(pos);
    expect(result.total).toBe(1);
    expect(result.closed).toBe(1);
    expect(result.openCost).toBe(0);
    expect(result.pendingUnits).toBe(0);
    expect(result.ordered).toBe(0);
  });

  it('returns closed: 0 for empty input', () => {
    const result = summarizePurchaseOrders([]);
    expect(result.closed).toBe(0);
  });

  it('computes pendingUnits correctly', () => {
    const pos = [
      makePO('ORDERED', 100, [
        { quantityOrdered: 5, quantityReceived: 0, status: 'ORDERED' },
      ]),
      makePO('PARTIALLY_RECEIVED', 200, [
        { quantityOrdered: 10, quantityReceived: 4, status: 'PARTIALLY_RECEIVED' },
        { quantityOrdered: 2, quantityReceived: 2, status: 'RECEIVED' }, // skip
      ]),
    ];
    const result = summarizePurchaseOrders(pos);
    expect(result.pendingUnits).toBe(11); // 5 + 6
  });
});

// ─── summarizeRepricing ───────────────────────────────────────────────────────

describe('summarizeRepricing', () => {
  it('returns hasData: false when both rules and history are empty', () => {
    const result = summarizeRepricing([], []);
    expect(result.hasData).toBe(false);
  });

  it('counts active and paused rules', () => {
    const rules = [makeRule(true), makeRule(true), makeRule(false)];
    const result = summarizeRepricing(rules, []);
    expect(result.activeRules).toBe(2);
    expect(result.pausedRules).toBe(1);
    expect(result.totalRules).toBe(3);
  });

  it('counts rules missing cost basis', () => {
    const rules = [makeRule(true, null), makeRule(true, 10), makeRule(false, null)];
    const result = summarizeRepricing(rules, []);
    expect(result.rulesMissingCost).toBe(2);
  });

  it('counts pending proposals and failed pushes', () => {
    const history = [
      makeHistory('PROPOSED'),
      makeHistory('PROPOSED'),
      makeHistory('FAILED'),
      makeHistory('PUSHED', new Date()),
    ];
    const result = summarizeRepricing([], history);
    expect(result.pendingProposals).toBe(2);
    expect(result.failedPushes).toBe(1);
  });

  it('counts recentPushCount only for PUSHED within 7 days', () => {
    const recentDate  = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const oldDate     = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const history = [
      makeHistory('PUSHED', recentDate),  // counts
      makeHistory('PUSHED', oldDate),     // too old
      makeHistory('PROPOSED', null),      // not pushed
    ];
    const result = summarizeRepricing([], history);
    expect(result.recentPushCount).toBe(1);
  });

  it('does not fabricate pending proposals when there are none', () => {
    const rules = [makeRule(true, 10)];
    const history = [makeHistory('PUSHED', new Date()), makeHistory('HOLD', null)];
    const result = summarizeRepricing(rules, history);
    expect(result.pendingProposals).toBe(0);
  });

  it('counts staleActiveRules: active rule with null lastRepricedAt is stale', () => {
    const rules = [makeRule(true, 10, null)]; // never run
    const result = summarizeRepricing(rules, []);
    expect(result.staleActiveRules).toBe(1);
  });

  it('counts staleActiveRules: active rule last run > 14 days ago is stale', () => {
    const oldDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const rules = [makeRule(true, 10, oldDate)];
    const result = summarizeRepricing(rules, []);
    expect(result.staleActiveRules).toBe(1);
  });

  it('does not count as stale: active rule run within 14 days', () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const rules = [makeRule(true, 10, recentDate)];
    const result = summarizeRepricing(rules, []);
    expect(result.staleActiveRules).toBe(0);
  });

  it('does not count paused rules as stale even if never run', () => {
    const rules = [makeRule(false, 10, null)]; // paused, never run
    const result = summarizeRepricing(rules, []);
    expect(result.staleActiveRules).toBe(0);
  });

  it('staleActiveRules is 0 on empty input', () => {
    const result = summarizeRepricing([], []);
    expect(result.staleActiveRules).toBe(0);
  });
});

// ─── summarizeRecovery ────────────────────────────────────────────────────────

describe('summarizeRecovery', () => {
  it('returns hasData: false for empty analyses and no sync', () => {
    const result = summarizeRecovery([], null);
    expect(result.hasData).toBe(false);
    expect(result.totalEntries).toBe(0);
    expect(result.totalReimbursed).toBe(0);
  });

  it('sums totalReimbursed from analyses', () => {
    const analyses = [
      makeAnalysis({ amountTotal: 15.00 }),
      makeAnalysis({ amountTotal: 25.50 }),
    ];
    const result = summarizeRecovery(analyses);
    expect(result.totalReimbursed).toBeCloseTo(40.50);
    expect(result.hasData).toBe(true);
  });

  it('counts possibleUnderpayments from POSSIBLE status only', () => {
    const analyses = [
      makeAnalysis({ underpaymentStatus: 'POSSIBLE', totalPossibleShortfall: 5 }),
      makeAnalysis({ underpaymentStatus: 'OK' }),
      makeAnalysis({ underpaymentStatus: 'UNKNOWN' }),
    ];
    const result = summarizeRecovery(analyses);
    expect(result.possibleUnderpaymentCount).toBe(1);
    expect(result.missingCostCount).toBe(1); // UNKNOWN
  });

  it('does not fabricate underpayments when all cost data is missing', () => {
    const analyses = [
      makeAnalysis({ underpaymentStatus: 'UNKNOWN', possibleUnderpayment: null }),
      makeAnalysis({ underpaymentStatus: 'UNKNOWN', possibleUnderpayment: null }),
    ];
    const result = summarizeRecovery(analyses);
    expect(result.possibleUnderpaymentCount).toBe(0);
    expect(result.totalPossibleShortfall).toBe(0);
  });

  it('includes lastSync metadata when provided', () => {
    const sync = { status: 'DONE', startedAt: new Date('2026-06-15'), source: 'SP_API' };
    const result = summarizeRecovery([], sync);
    expect(result.lastSyncStatus).toBe('DONE');
    expect(result.lastSyncSource).toBe('SP_API');
    expect(result.hasData).toBe(true);
  });
});

// ─── buildActionItems ─────────────────────────────────────────────────────────

describe('buildActionItems', () => {
  const noActions = {
    pendingProposals: 0, failedPushes: 0, pendingPOUnits: 0, openPOCount: 0, totalPOs: 1,
    rulesMissingCost: 0, staleRepricingRules: 0, inventoryMissingCost: 0, inventoryMissingProduct: 0,
    possibleUnderpayments: 0, inventoryAtRisk: 0, inventoryAging: 0,
    salesMissingCost: 0, salesSyncOverdue: false,
    salesMissingFees: 0, settlementUnmatched: 0,
    refundRowsStored: 0, unsupportedSettlementRowsStored: 0,
  };

  it('returns empty array when there is nothing to do', () => {
    expect(buildActionItems(noActions)).toHaveLength(0);
  });

  it('returns an action for each non-zero input', () => {
    const result = buildActionItems({
      ...noActions,
      pendingProposals:      3,
      pendingPOUnits:        7,
      openPOCount:           2,
      inventoryMissingCost:  5,
    });
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.some((a) => a.href === '/dashboard/repricing')).toBe(true);
    expect(result.some((a) => a.href === '/dashboard/orders')).toBe(true);
    expect(result.some((a) => a.href === '/dashboard/inventory')).toBe(true);
  });

  it('sorts high priority before medium and low', () => {
    const result = buildActionItems({
      ...noActions,
      pendingProposals:     2,  // high
      inventoryMissingCost: 4,  // low
      pendingPOUnits:       3,  // medium
      openPOCount:          1,
    });
    const priorities = result.map((a) => a.priority);
    const highIdx  = priorities.indexOf('high');
    const medIdx   = priorities.indexOf('medium');
    const lowIdx   = priorities.indexOf('low');
    if (highIdx !== -1 && medIdx !== -1) expect(highIdx).toBeLessThan(medIdx);
    if (medIdx  !== -1 && lowIdx  !== -1) expect(medIdx).toBeLessThan(lowIdx);
  });

  it('does not generate an action for pending PO units when openPOCount is 0', () => {
    // pendingPOUnits without openPOCount should not produce an action
    const result = buildActionItems({ ...noActions, pendingPOUnits: 5, openPOCount: 0 });
    expect(result.every((a) => a.href !== '/dashboard/orders')).toBe(true);
  });

  it('marks failed pushes as high priority', () => {
    const result = buildActionItems({ ...noActions, failedPushes: 2 });
    const failedAction = result.find((a) => a.label.includes('failed'));
    expect(failedAction).toBeDefined();
    expect(failedAction!.priority).toBe('high');
  });

  it('marks at-risk inventory as high priority', () => {
    const result = buildActionItems({ ...noActions, inventoryAtRisk: 1 });
    const riskAction = result.find((a) => a.label.includes('at risk'));
    expect(riskAction?.priority).toBe('high');
  });

  it('does not fabricate actions for zero inputs', () => {
    const result = buildActionItems({
      ...noActions,
      pendingProposals: 0,
      failedPushes: 0,
    });
    expect(result.filter((a) => a.href === '/dashboard/repricing')).toHaveLength(0);
  });

  // ── Beginner-friendly description content ──────────────────────────────────

  it('pending proposals description explains approval is required before Amazon push', () => {
    const result = buildActionItems({ ...noActions, pendingProposals: 2 });
    const action = result.find((a) => a.href === '/dashboard/repricing' && a.label.includes('proposal'));
    expect(action).toBeDefined();
    expect(action!.description).toMatch(/approve|review/i);
    expect(action!.description).toMatch(/Amazon/i);
  });

  it('failed pushes description explains price has not changed', () => {
    const result = buildActionItems({ ...noActions, failedPushes: 1 });
    const action = result.find((a) => a.label.includes('failed'));
    expect(action).toBeDefined();
    expect(action!.description).toMatch(/price|listing/i);
  });

  it('inventory at risk description mentions what the risk means', () => {
    const result = buildActionItems({ ...noActions, inventoryAtRisk: 3 });
    const action = result.find((a) => a.label.includes('at risk'));
    expect(action).toBeDefined();
    expect(action!.description).toMatch(/IP|brand|Buy Box/i);
  });

  it('pending PO units description explains inventory impact', () => {
    const result = buildActionItems({ ...noActions, pendingPOUnits: 5, openPOCount: 2 });
    const action = result.find((a) => a.href === '/dashboard/orders');
    expect(action).toBeDefined();
    expect(action!.description).toMatch(/inventory|accurate/i);
  });

  it('missing unit cost description explains consequence to margin floor', () => {
    const result = buildActionItems({ ...noActions, rulesMissingCost: 2 });
    const action = result.find((a) => a.href === '/dashboard/repricing' && a.label.includes('unit cost'));
    expect(action).toBeDefined();
    expect(action!.description).toMatch(/floor|margin/i);
  });

  it('aging inventory description mentions storage fees or sell-through', () => {
    const result = buildActionItems({ ...noActions, inventoryAging: 4 });
    const action = result.find((a) => a.label.includes('aging'));
    expect(action).toBeDefined();
    expect(action!.description).toMatch(/storage|sell-through|price/i);
  });

  it('possible underpayment description warns to review before disputing', () => {
    const result = buildActionItems({ ...noActions, possibleUnderpayments: 1 });
    const action = result.find((a) => a.href === '/dashboard/recovery');
    expect(action).toBeDefined();
    expect(action!.description).toMatch(/review|dispute/i);
  });

  it('missing scan data description points to scanner', () => {
    const result = buildActionItems({ ...noActions, inventoryMissingProduct: 3 });
    const action = result.find((a) => a.href === '/dashboard/scanner');
    expect(action).toBeDefined();
    expect(action!.description).toMatch(/scanner|ASIN/i);
  });

  it('pending proposals label uses user-friendly wording instead of technical terms', () => {
    const result = buildActionItems({ ...noActions, pendingProposals: 1 });
    const action = result.find((a) => a.href === '/dashboard/repricing' && a.label.includes('proposal'));
    expect(action).toBeDefined();
    // Should say "waiting for review" or similar — not raw "PROPOSED" status
    expect(action!.label).not.toMatch(/PROPOSED/);
  });

  it('salesSyncOverdue generates a medium-priority action pointing to /dashboard/sales', () => {
    const result = buildActionItems({ ...noActions, salesSyncOverdue: true });
    const action = result.find((a) => a.href === '/dashboard/sales');
    expect(action).toBeDefined();
    expect(action!.priority).toBe('medium');
    expect(action!.description).toMatch(/import|orders report|Seller Central/i);
  });

  it('does not generate salesSyncOverdue action when salesSyncOverdue is false', () => {
    const result = buildActionItems({ ...noActions, salesSyncOverdue: false });
    expect(result.find((a) => a.href === '/dashboard/sales')).toBeUndefined();
  });

  it('salesMissingCost generates a low-priority action pointing to /dashboard/sales?status=missing-cost', () => {
    const result = buildActionItems({ ...noActions, salesMissingCost: 5 });
    const action = result.find((a) => a.label.includes('sale') && a.label.includes('unit cost'));
    expect(action).toBeDefined();
    expect(action!.priority).toBe('low');
    expect(action!.count).toBe(5);
    expect(action!.href).toBe('/dashboard/sales?status=missing-cost');
    expect(action!.description).toMatch(/cost|profit/i);
  });

  it('does not generate salesMissingCost action when count is 0', () => {
    const result = buildActionItems({ ...noActions, salesMissingCost: 0 });
    expect(result.find((a) => a.label.includes('sale') && a.label.includes('unit cost'))).toBeUndefined();
  });

  it('salesMissingFees generates a medium-priority action pointing to /dashboard/sales?status=missing-fees', () => {
    const result = buildActionItems({ ...noActions, salesMissingFees: 7 });
    const action = result.find((a) => a.label.includes('missing') && a.label.includes('fee'));
    expect(action).toBeDefined();
    expect(action!.priority).toBe('medium');
    expect(action!.count).toBe(7);
    expect(action!.href).toBe('/dashboard/sales?status=missing-fees');
    expect(action!.description).toMatch(/settlement/i);
  });

  it('does not generate salesMissingFees action when count is 0', () => {
    const result = buildActionItems({ ...noActions, salesMissingFees: 0 });
    expect(result.find((a) => a.label.includes('missing fee'))).toBeUndefined();
  });

  it('settlementUnmatched generates a low-priority action pointing to /dashboard/sales', () => {
    const result = buildActionItems({ ...noActions, settlementUnmatched: 3 });
    const action = result.find((a) => a.label.includes('unmatched'));
    expect(action).toBeDefined();
    expect(action!.priority).toBe('low');
    expect(action!.count).toBe(3);
    expect(action!.href).toBe('/dashboard/sales');
  });

  it('does not generate settlementUnmatched action when count is 0', () => {
    const result = buildActionItems({ ...noActions, settlementUnmatched: 0 });
    expect(result.find((a) => a.label.includes('unmatched'))).toBeUndefined();
  });

  // ─── Phase 6.11 — Refund / adjustment visibility ─────────────────────────

  it('refundRowsStored > 0 generates a medium-priority action pointing to /dashboard/sales', () => {
    const result = buildActionItems({ ...noActions, refundRowsStored: 4 });
    const action = result.find((a) => a.label === 'Refunds/adjustments detected');
    expect(action).toBeDefined();
    expect(action!.priority).toBe('medium');
    expect(action!.href).toBe('/dashboard/sales');
  });

  it('unsupportedSettlementRowsStored > 0 (refundRowsStored = 0) generates a low-priority action', () => {
    const result = buildActionItems({ ...noActions, unsupportedSettlementRowsStored: 6 });
    const action = result.find((a) => a.label === 'Refunds/adjustments detected');
    expect(action).toBeDefined();
    expect(action!.priority).toBe('low');
    expect(action!.href).toBe('/dashboard/sales');
  });

  it('does not generate refund/adjustment action when both counts are 0', () => {
    const result = buildActionItems({ ...noActions });
    expect(result.find((a) => a.label === 'Refunds/adjustments detected')).toBeUndefined();
  });

  it('refund/adjustment action description says stored and not yet applied to realized profit', () => {
    const result = buildActionItems({ ...noActions, refundRowsStored: 2, unsupportedSettlementRowsStored: 3 });
    const action = result.find((a) => a.label === 'Refunds/adjustments detected');
    expect(action!.description).toMatch(/stored for review/i);
    expect(action!.description).toMatch(/not yet applied to realized profit/i);
  });

  it('refund/adjustment action count equals sum of both row types', () => {
    const result = buildActionItems({ ...noActions, refundRowsStored: 3, unsupportedSettlementRowsStored: 5 });
    const action = result.find((a) => a.label === 'Refunds/adjustments detected');
    expect(action!.count).toBe(8);
  });

  // Zero-PO action item
  it('emits "Create your first purchase order" low-priority action when totalPOs is 0', () => {
    const result = buildActionItems({ ...noActions, totalPOs: 0 });
    const action = result.find((a) => a.label === 'Create your first purchase order');
    expect(action).toBeDefined();
    expect(action!.priority).toBe('low');
    expect(action!.href).toBe('/dashboard/orders');
    expect(action!.description).toMatch(/record inventory purchases/i);
  });

  it('does not emit zero-PO action when purchase orders exist', () => {
    // noActions has totalPOs: 1 — action must not appear
    const result = buildActionItems({ ...noActions });
    const action = result.find((a) => a.label === 'Create your first purchase order');
    expect(action).toBeUndefined();
  });

  it('existing pending-PO action is still emitted when totalPOs > 0 and pendingPOUnits > 0', () => {
    const result = buildActionItems({ ...noActions, totalPOs: 2, openPOCount: 2, pendingPOUnits: 10 });
    const pending = result.find((a) => a.label.includes('not yet received'));
    expect(pending).toBeDefined();
    const zeroPO = result.find((a) => a.label === 'Create your first purchase order');
    expect(zeroPO).toBeUndefined();
  });

  it('does not emit zero-PO action when only a CLOSED PO exists (totalPOs = 1)', () => {
    // A CLOSED PO still counts toward totalPOs — the user has created a PO before
    const result = buildActionItems({ ...noActions, totalPOs: 1 });
    const action = result.find((a) => a.label === 'Create your first purchase order');
    expect(action).toBeUndefined();
  });

  // ─── Phase 8.1 — Stale repricing rules action item ───────────────────────

  it('staleRepricingRules > 0 emits a low-priority action pointing to /dashboard/repricing', () => {
    const result = buildActionItems({ ...noActions, staleRepricingRules: 3 });
    const action = result.find((a) => a.label.includes('not run recently'));
    expect(action).toBeDefined();
    expect(action!.priority).toBe('low');
    expect(action!.count).toBe(3);
    expect(action!.href).toBe('/dashboard/repricing');
  });

  it('stale repricing action description mentions running the engine', () => {
    const result = buildActionItems({ ...noActions, staleRepricingRules: 2 });
    const action = result.find((a) => a.label.includes('not run recently'));
    expect(action!.description).toMatch(/run|market|14 days/i);
  });

  it('stale repricing singular label for count = 1', () => {
    const result = buildActionItems({ ...noActions, staleRepricingRules: 1 });
    const action = result.find((a) => a.label.includes('not run recently'));
    expect(action!.label).toMatch(/1 repricing rule/);
    expect(action!.label).not.toMatch(/rules/);
  });

  it('does not emit stale repricing action when staleRepricingRules is 0', () => {
    const result = buildActionItems({ ...noActions, staleRepricingRules: 0 });
    expect(result.find((a) => a.label.includes('not run recently'))).toBeUndefined();
  });

  it('does not emit stale repricing action when staleRepricingRules is absent (noActions default)', () => {
    // noActions has staleRepricingRules: 0 — no action emitted
    const result = buildActionItems(noActions);
    expect(result.find((a) => a.label.includes('not run recently'))).toBeUndefined();
  });
});
