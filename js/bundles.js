/**
 * bundles.js — Bundle Browser module for MyLibrary Phase 4/5
 *
 * Handles fetching the active Humble Bundle listing from /api/bundles,
 * building a normalized owned-game name set from connected platform libraries,
 * and computing a per-bundle ownership summary.
 *
 * Phase 4 note: The bundle listing endpoint returns metadata only (name, slug,
 * url, end_date, start_date, category). Per-game detail is a Phase 5 concern.
 * Until then, owned_count and total_count are null in the summary.
 *
 * Phase 5 note: fetchBundleDetail(slug) fetches per-game tier data.
 * computeDetailOwnership(detail, ownedNames) enriches that data with ownership.
 *
 * No UI logic lives here — only data and network concerns.
 */

const BUNDLES_API = '/api/bundles';

/**
 * Edition suffix alternation used by normalizeName — order matters, longer
 * phrases before any that could prefix-match a shorter one.
 */
const EDITION_ALTS = '(?:game of the year|goty|definitive|complete|enhanced|special|ultimate)\\s+edition';

export const bundleManager = {
  async fetchBundles() {
    const response = await fetch(BUNDLES_API);
    if (!response.ok) throw new Error(`Bundles fetch failed: ${response.status}`);
    return await response.json();
  },

  /**
   * Normalize a game name for fuzzy ownership matching.
   *
   * Steps:
   *   1. Lowercase
   *   2. Strip trademark/copyright symbols (™ ® ©)
   *   3. Strip common edition suffixes (with or without ": " / " - " separator)
   *   4. Trim leading/trailing whitespace and punctuation
   *
   * @param {string} name
   * @returns {string} Normalized name
   *
   * @example
   * normalizeName("SOMA™")                         // → "soma"
   * normalizeName("Alan Wake: Definitive Edition") // → "alan wake"
   * normalizeName("Control Ultimate Edition")      // → "control"
   */
  normalizeName(name) {
    return name
      .toLowerCase()
      .replace(/[™®©]/g, '')
      // strip edition suffix with explicit separator (": " or " - ")
      .replace(new RegExp(`\\s*[:\\-]\\s*${EDITION_ALTS}$`), '')
      // strip edition suffix without separator (just trailing whitespace)
      .replace(new RegExp(`\\s+${EDITION_ALTS}$`), '')
      // trim leading/trailing whitespace and punctuation
      .replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, '');
  },

  /**
   * Build a Set of normalized game names from all connected platform libraries.
   *
   * @param {{ steam?: { games: object[] }, epic?: { games: object[] }, itch?: { games: object[] } }} state
   * @returns {Set<string>} Normalized game name set for ownership matching
   */
  buildOwnedSet(state) {
    const names = new Set();
    const addGames = (games) => (games || []).forEach(g => {
      if (g.name) names.add(this.normalizeName(g.name));
    });
    if (state.steam) addGames(state.steam.games);
    if (state.epic) addGames(state.epic.games);
    if (state.itch) addGames(state.itch.games);
    return names;
  },

  computeOwnershipSummary(bundles, ownedNames) {
    return bundles.map(bundle => {
      const countHighlight = (bundle.highlights ?? []).find(h => /\d+\s+games?/i.test(h));
      const totalMatch = countHighlight ? countHighlight.match(/(\d+)/) : null;
      const total_count = totalMatch ? parseInt(totalMatch[1], 10) : null;
      return { ...bundle, owned_count: null, total_count };
    });
  },

  async fetchBundleDetail(slug) {
    const response = await fetch(`/api/bundles/${slug}/detail`);
    if (!response.ok) throw new Error(`Bundle detail fetch failed: ${response.status}`);
    return await response.json();
  },

  computeDetailOwnership(detail, ownedNames) {
    const tiers = (detail.tiers || []).map(tier => ({
      price_label: tier.price_label,
      items: (tier.items || [])
        .filter(item => item.human_name)
        .map(item => ({
          human_name: item.human_name,
          msrp: item.msrp,
          owned: ownedNames.has(this.normalizeName(item.human_name)),
        })),
    }));

    const allGames = tiers.flatMap(t => t.items);
    const totalCount = allGames.length;
    const ownedCount = allGames.filter(g => g.owned).length;
    const unownedGames = allGames.filter(g => !g.owned);
    const valueScore = unownedGames.reduce((sum, g) => sum + (g.msrp || 0), 0);

    return {
      slug: detail.slug,
      tiers,
      total_count: totalCount,
      owned_count: ownedCount,
      unowned_count: totalCount - ownedCount,
      value_score: Math.round(valueScore * 100) / 100,
    };
  },
};

export default bundleManager;
