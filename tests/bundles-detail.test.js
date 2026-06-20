import { describe, it, expect } from 'bun:test';
import { bundleManager } from '../js/bundles.js';

describe('bundleManager.computeDetailOwnership', () => {
  it('T-BUN-DETAIL-01: empty tiers returns zero counts and zero value_score', () => {
    const detail = { slug: 'test', tiers: [] };
    const result = bundleManager.computeDetailOwnership(detail, new Set());
    expect(result.tiers).toEqual([]);
    expect(result.total_count).toBe(0);
    expect(result.owned_count).toBe(0);
    expect(result.unowned_count).toBe(0);
    expect(result.value_score).toBe(0);
  });

  it('T-BUN-DETAIL-02: game in ownedNames is marked owned: true', () => {
    const detail = {
      slug: 'test',
      tiers: [{ price_label: '$8', items: [{ human_name: 'Portal', msrp: 9.99 }] }],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set(['portal']));
    expect(result.tiers[0].items[0].owned).toBe(true);
  });

  it('T-BUN-DETAIL-03: game NOT in ownedNames is marked owned: false', () => {
    const detail = {
      slug: 'test',
      tiers: [{ price_label: '$8', items: [{ human_name: 'Portal', msrp: 9.99 }] }],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set());
    expect(result.tiers[0].items[0].owned).toBe(false);
  });

  it('T-BUN-DETAIL-04: total_count equals sum of all items across all tiers', () => {
    const detail = {
      slug: 'test',
      tiers: [
        { price_label: '$8', items: [{ human_name: 'Portal', msrp: 9.99 }, { human_name: 'Celeste', msrp: 19.99 }] },
        { price_label: '$15', items: [{ human_name: 'SOMA', msrp: 29.99 }] },
      ],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set());
    expect(result.total_count).toBe(3);
  });

  it('T-BUN-DETAIL-05: owned_count equals count of items present in ownedNames', () => {
    const detail = {
      slug: 'test',
      tiers: [{
        price_label: '$8',
        items: [
          { human_name: 'Portal', msrp: 9.99 },
          { human_name: 'Celeste', msrp: 19.99 },
          { human_name: 'SOMA', msrp: 29.99 },
        ],
      }],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set(['portal', 'celeste']));
    expect(result.owned_count).toBe(2);
  });

  it('T-BUN-DETAIL-06: unowned_count equals total_count minus owned_count', () => {
    const detail = {
      slug: 'test',
      tiers: [{
        price_label: '$8',
        items: [
          { human_name: 'Portal', msrp: 9.99 },
          { human_name: 'Celeste', msrp: 19.99 },
          { human_name: 'SOMA', msrp: 29.99 },
        ],
      }],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set(['portal']));
    expect(result.unowned_count).toBe(result.total_count - result.owned_count);
    expect(result.unowned_count).toBe(2);
  });

  it('T-BUN-DETAIL-07: value_score sums msrp only for unowned games (owned excluded)', () => {
    const detail = {
      slug: 'test',
      tiers: [{
        price_label: '$8',
        items: [
          { human_name: 'Portal', msrp: 9.99 },   // owned — excluded
          { human_name: 'Celeste', msrp: 19.99 },  // unowned — included
        ],
      }],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set(['portal']));
    expect(result.value_score).toBe(19.99);
  });

  it('T-BUN-DETAIL-08: value_score is rounded to 2 decimal places (floating-point safe)', () => {
    // Oracle: 0.1 + 0.2 = 0.30000000000000004 in IEEE 754
    // Math.round(0.30000000000000004 * 100) / 100 = 0.3
    const detail = {
      slug: 'test',
      tiers: [{
        price_label: '$8',
        items: [
          { human_name: 'Game A', msrp: 0.1 },
          { human_name: 'Game B', msrp: 0.2 },
        ],
      }],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set());
    expect(result.value_score).toBe(0.3);
  });

  it('T-BUN-DETAIL-09: game with msrp 0 contributes zero to value_score', () => {
    const detail = {
      slug: 'test',
      tiers: [{
        price_label: '$8',
        items: [
          { human_name: 'Free Game', msrp: 0 },
          { human_name: 'Celeste', msrp: 19.99 },
        ],
      }],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set());
    expect(result.value_score).toBe(19.99);
  });

  it('T-BUN-DETAIL-10: ownership matching is case-insensitive via normalization', () => {
    // Oracle: "Control Ultimate Edition" → normalizeName → "control"
    // ownedNames Set contains "control" (already normalized)
    const detail = {
      slug: 'test',
      tiers: [{
        price_label: '$8',
        items: [{ human_name: 'Control Ultimate Edition', msrp: 29.99 }],
      }],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set(['control']));
    expect(result.tiers[0].items[0].owned).toBe(true);
    expect(result.owned_count).toBe(1);
    expect(result.value_score).toBe(0);
  });

  it('T-BUN-DETAIL-11: slug is preserved verbatim from input detail', () => {
    const detail = { slug: 'my-test-slug-2026_bundle', tiers: [] };
    const result = bundleManager.computeDetailOwnership(detail, new Set());
    expect(result.slug).toBe('my-test-slug-2026_bundle');
  });

  it('T-BUN-DETAIL-12: each output tier preserves price_label and has an items array', () => {
    const detail = {
      slug: 'test',
      tiers: [
        { price_label: 'Pay $8 to unlock!', items: [{ human_name: 'Portal', msrp: 9.99 }] },
        { price_label: 'Pay $15 or more to also unlock!', items: [{ human_name: 'SOMA', msrp: 29.99 }] },
      ],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set());
    expect(result.tiers).toHaveLength(2);
    expect(result.tiers[0].price_label).toBe('Pay $8 to unlock!');
    expect(Array.isArray(result.tiers[0].items)).toBe(true);
    expect(result.tiers[1].price_label).toBe('Pay $15 or more to also unlock!');
    expect(Array.isArray(result.tiers[1].items)).toBe(true);
  });

  it('T-BUN-DETAIL-13: games across multiple tiers are all counted in total_count and value_score', () => {
    const detail = {
      slug: 'test',
      tiers: [
        { price_label: '$8', items: [{ human_name: 'Portal', msrp: 9.99 }, { human_name: 'Celeste', msrp: 19.99 }] },
        { price_label: '$15', items: [{ human_name: 'SOMA', msrp: 29.99 }] },
      ],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set());
    expect(result.total_count).toBe(3);
    // All unowned: 9.99 + 19.99 + 29.99 = 59.97 after rounding
    expect(result.value_score).toBe(59.97);
  });

  it('T-BUN-DETAIL-14: empty Set ownedNames marks all games unowned without throwing', () => {
    const detail = {
      slug: 'test',
      tiers: [{ price_label: '$8', items: [{ human_name: 'Portal', msrp: 9.99 }] }],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set());
    expect(result.tiers[0].items[0].owned).toBe(false);
    expect(result.owned_count).toBe(0);
    expect(result.unowned_count).toBe(1);
  });

  it('T-BUN-DETAIL-15: owned game msrp is excluded from value_score even when msrp > 0', () => {
    const detail = {
      slug: 'test',
      tiers: [{
        price_label: '$8',
        items: [
          { human_name: 'Portal', msrp: 9.99 },   // owned — must NOT add to value_score
          { human_name: 'Celeste', msrp: 19.99 },  // unowned — adds to value_score
          { human_name: 'SOMA', msrp: 29.99 },     // owned — must NOT add to value_score
        ],
      }],
    };
    const result = bundleManager.computeDetailOwnership(detail, new Set(['portal', 'soma']));
    // Only Celeste ($19.99) is unowned
    expect(result.value_score).toBe(19.99);
    expect(result.owned_count).toBe(2);
    expect(result.unowned_count).toBe(1);
  });

  it(
    'T-BUN-DETAIL-16: item missing human_name is skipped gracefully — does not throw [KNOWN FAILING — bug, not test]',
    () => {
      // Bug: computeDetailOwnership calls this.normalizeName(item.human_name) with no null-guard.
      // When human_name is undefined, normalizeName calls .toLowerCase() on undefined and throws
      // TypeError. The correct behavior is to skip the malformed item or treat it as unowned
      // with an empty name — not crash the entire detail render.
      //
      // Oracle (correct behavior): a tier item with no human_name must not throw. The result
      // should complete and return valid counts for the well-formed items in the same tier.
      const detail = {
        slug: 'test',
        tiers: [{
          price_label: '$8',
          items: [
            { msrp: 9.99 },                          // no human_name — should be skipped or handled
            { human_name: 'Celeste', msrp: 19.99 },  // well-formed — must still be counted
          ],
        }],
      };
      expect(() => {
        bundleManager.computeDetailOwnership(detail, new Set());
      }).not.toThrow();
    }
  );
});
