import { describe, it, expect } from 'bun:test';
import { bundleManager } from '../js/bundles.js';

describe('bundleManager.normalizeName', () => {
  describe('trademark / copyright symbol stripping', () => {
    it('T-BUN-NORM-01: strips ™ suffix', () => {
      expect(bundleManager.normalizeName('SOMA™')).toBe('soma');
    });

    it('T-BUN-NORM-02: strips ® suffix', () => {
      expect(bundleManager.normalizeName('Portal®')).toBe('portal');
    });

    it('T-BUN-NORM-03: strips © suffix', () => {
      expect(bundleManager.normalizeName('Portal©')).toBe('portal');
    });

    it('T-BUN-NORM-04: strips multiple trademark symbols', () => {
      expect(bundleManager.normalizeName('Halo™®')).toBe('halo');
    });

    it('T-BUN-NORM-05: strips ™ before edition suffix (combined)', () => {
      expect(bundleManager.normalizeName('Halo™ Ultimate Edition')).toBe('halo');
    });
  });

  describe('edition suffix stripping', () => {
    it('T-BUN-NORM-06: strips "Definitive Edition" with colon separator', () => {
      expect(bundleManager.normalizeName('Alan Wake: Definitive Edition')).toBe('alan wake');
    });

    it('T-BUN-NORM-07: strips "Complete Edition" with dash separator', () => {
      expect(bundleManager.normalizeName('The Witcher 3: Wild Hunt - Complete Edition')).toBe('the witcher 3: wild hunt');
    });

    it('T-BUN-NORM-08: strips "Ultimate Edition" with no separator', () => {
      expect(bundleManager.normalizeName('Control Ultimate Edition')).toBe('control');
    });

    it('T-BUN-NORM-09: strips "Game of the Year Edition" with colon separator', () => {
      expect(bundleManager.normalizeName('Skyrim: Game of the Year Edition')).toBe('skyrim');
    });

    it('T-BUN-NORM-10: strips "GOTY Edition" with colon separator', () => {
      expect(bundleManager.normalizeName('Fallout 3: GOTY Edition')).toBe('fallout 3');
    });

    it('T-BUN-NORM-11: strips "Enhanced Edition" with no separator', () => {
      expect(bundleManager.normalizeName('Pillars of Eternity Enhanced Edition')).toBe('pillars of eternity');
    });

    it('T-BUN-NORM-12: strips "Special Edition" with no separator', () => {
      expect(bundleManager.normalizeName('Skyrim Special Edition')).toBe('skyrim');
    });

    it('T-BUN-NORM-13: does NOT strip when edition phrase is the entire name', () => {
      // Oracle: no game name precedes the suffix, so nothing to strip to.
      // Result is the lowercased phrase itself, not an empty string.
      expect(bundleManager.normalizeName('Definitive Edition')).toBe('definitive edition');
    });

    it('T-BUN-NORM-14: does NOT strip "GOTY" alone (not followed by "Edition")', () => {
      expect(bundleManager.normalizeName('GOTY')).toBe('goty');
    });

    it('T-BUN-NORM-15: colon NOT followed by edition suffix is preserved', () => {
      expect(bundleManager.normalizeName('Mass Effect: Andromeda')).toBe('mass effect: andromeda');
    });
  });

  describe('whitespace and punctuation handling', () => {
    it('T-BUN-NORM-16: lowercases the entire name', () => {
      expect(bundleManager.normalizeName('Half-Life 2')).toBe('half-life 2');
    });

    it('T-BUN-NORM-17: trims leading and trailing whitespace', () => {
      expect(bundleManager.normalizeName('  Celeste  ')).toBe('celeste');
    });

    it('T-BUN-NORM-18: empty string returns empty string', () => {
      expect(bundleManager.normalizeName('')).toBe('');
    });

    it('T-BUN-NORM-19: whitespace-only string returns empty string', () => {
      expect(bundleManager.normalizeName('   ')).toBe('');
    });

    it('T-BUN-NORM-20: idempotent — already-normalized input unchanged', () => {
      expect(bundleManager.normalizeName('soma')).toBe('soma');
    });
  });
});

describe('bundleManager.buildOwnedSet', () => {
  it('T-BUN-OWNED-01: empty state {} returns empty Set', () => {
    const result = bundleManager.buildOwnedSet({});
    expect(result.size).toBe(0);
  });

  it('T-BUN-OWNED-02: null platform value is skipped without throwing', () => {
    const result = bundleManager.buildOwnedSet({ steam: null, epic: { games: [{ name: 'Fortnite' }] } });
    expect(result.size).toBe(1);
    expect(result.has('fortnite')).toBe(true);
  });

  it('T-BUN-OWNED-03: game entry with null name is skipped', () => {
    const result = bundleManager.buildOwnedSet({ steam: { games: [{ name: null }, { name: 'Portal' }] } });
    expect(result.size).toBe(1);
    expect(result.has('portal')).toBe(true);
  });

  it('T-BUN-OWNED-04: game entry with no name key is skipped', () => {
    const result = bundleManager.buildOwnedSet({ steam: { games: [{ appid: 1 }] } });
    expect(result.size).toBe(0);
  });

  it('T-BUN-OWNED-05: all three platforms are aggregated', () => {
    const result = bundleManager.buildOwnedSet({
      steam: { games: [{ name: 'Portal' }, { name: 'SOMA™' }] },
      epic:  { games: [{ name: 'Fortnite' }] },
      itch:  { games: [{ name: 'Celeste' }] },
    });
    expect(result.size).toBe(4);
    expect(result.has('portal')).toBe(true);
    expect(result.has('soma')).toBe(true);
    expect(result.has('fortnite')).toBe(true);
    expect(result.has('celeste')).toBe(true);
  });

  it('T-BUN-OWNED-06: same game on two platforms deduplicates via normalization', () => {
    // Oracle: "SOMA" and "SOMA™" both normalize to "soma" — Set deduplicates to 1 entry.
    const result = bundleManager.buildOwnedSet({
      steam: { games: [{ name: 'SOMA' }] },
      itch:  { games: [{ name: 'SOMA™' }] },
    });
    expect(result.size).toBe(1);
    expect(result.has('soma')).toBe(true);
  });

  it('T-BUN-OWNED-07: edition variants across platforms deduplicate to one entry', () => {
    // Oracle: "Control" and "Control Ultimate Edition" both normalize to "control".
    const result = bundleManager.buildOwnedSet({
      steam: { games: [{ name: 'Control' }] },
      epic:  { games: [{ name: 'Control Ultimate Edition' }] },
    });
    expect(result.size).toBe(1);
    expect(result.has('control')).toBe(true);
  });

  it('T-BUN-OWNED-08: returns a Set (not an Array)', () => {
    const result = bundleManager.buildOwnedSet({ steam: { games: [{ name: 'Portal' }] } });
    expect(result).toBeInstanceOf(Set);
  });
});

describe('bundleManager.computeOwnershipSummary', () => {
  function makeBundle(highlights) {
    const b = { name: 'Test Bundle', slug: 'test_slug', url: 'https://www.humblebundle.com/games/test', end_date: '2099-01-01T00:00:00', start_date: '2026-01-01T00:00:00', category: 'bundle' };
    if (highlights !== undefined) b.highlights = highlights;
    return b;
  }

  it('T-BUN-SUMMARY-01: standard "N games" phrase extracts total_count', () => {
    const result = bundleManager.computeOwnershipSummary([makeBundle(['10 games included'])], new Set());
    expect(result[0].total_count).toBe(10);
  });

  it('T-BUN-SUMMARY-02: singular "1 game" phrase extracts total_count of 1', () => {
    const result = bundleManager.computeOwnershipSummary([makeBundle(['1 game'])], new Set());
    expect(result[0].total_count).toBe(1);
  });

  it('T-BUN-SUMMARY-03: highlight with no adjacent number before "games" returns null', () => {
    const result = bundleManager.computeOwnershipSummary([makeBundle(['Win a bundle worth $10'])], new Set());
    expect(result[0].total_count).toBeNull();
  });

  it('T-BUN-SUMMARY-04: empty highlights array returns null total_count', () => {
    const result = bundleManager.computeOwnershipSummary([makeBundle([])], new Set());
    expect(result[0].total_count).toBeNull();
  });

  it('T-BUN-SUMMARY-05: missing highlights key returns null total_count', () => {
    const result = bundleManager.computeOwnershipSummary([makeBundle(undefined)], new Set());
    expect(result[0].total_count).toBeNull();
  });

  it('T-BUN-SUMMARY-06: first matching highlight wins when multiple highlights present', () => {
    // Oracle: ["5 bonus items", "12 games total"] — first highlight has no digit-games match,
    // second matches "12 games" → total_count = 12.
    const result = bundleManager.computeOwnershipSummary([makeBundle(['5 bonus items', '12 games total'])], new Set());
    expect(result[0].total_count).toBe(12);
  });

  it('T-BUN-SUMMARY-07: matching is case-insensitive ("GAMES" and "Games" both match)', () => {
    const upper = bundleManager.computeOwnershipSummary([makeBundle(['10 GAMES'])], new Set());
    const mixed = bundleManager.computeOwnershipSummary([makeBundle(['10 Games'])], new Set());
    expect(upper[0].total_count).toBe(10);
    expect(mixed[0].total_count).toBe(10);
  });

  it('T-BUN-SUMMARY-08: owned_count is always null (detail not yet loaded)', () => {
    const result = bundleManager.computeOwnershipSummary([makeBundle(['10 games'])], new Set(['portal']));
    expect(result[0].owned_count).toBeNull();
  });

  it('T-BUN-SUMMARY-09: all original bundle properties are preserved in output', () => {
    const bundle = makeBundle(['5 games']);
    const result = bundleManager.computeOwnershipSummary([bundle], new Set());
    expect(result[0].name).toBe(bundle.name);
    expect(result[0].slug).toBe(bundle.slug);
    expect(result[0].url).toBe(bundle.url);
    expect(result[0].end_date).toBe(bundle.end_date);
    expect(result[0].category).toBe(bundle.category);
  });

  it('T-BUN-SUMMARY-10: empty bundles array returns empty array', () => {
    const result = bundleManager.computeOwnershipSummary([], new Set());
    expect(result).toEqual([]);
  });
});
