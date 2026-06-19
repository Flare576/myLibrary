/**
 * bundles.js — Bundle Browser module for MyLibrary Phase 4
 *
 * Handles fetching the active Humble Bundle listing from /api/bundles,
 * building a normalized owned-game name set from connected platform libraries,
 * and computing a per-bundle ownership summary.
 *
 * Phase 4 note: The bundle listing endpoint returns metadata only (name, slug,
 * url, end_date, start_date, category). Per-game detail is a Phase 5 concern.
 * Until then, owned_count and total_count are null in the summary.
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

  /**
   * Compute an ownership summary for each bundle.
   *
   * Phase 4 limitation: /api/bundles returns bundle-level metadata only (name,
   * slug, url, dates, category). Individual game titles within each bundle are
   * not available until Phase 5 adds game-level detail fetching. Until then,
   * owned_count and total_count are null — the UI renders "—" for unknown counts.
   *
   * Phase 5 will populate game-level detail needed for real counts.
   *
   * @param {object[]} bundles     - Array of bundle objects from fetchBundles()
   * @param {Set<string>} ownedNames - Normalized owned game names from buildOwnedSet()
   * @returns {Array<object & { owned_count: null, total_count: null }>}
   */
  computeOwnershipSummary(bundles, ownedNames) {
    return bundles.map(bundle => ({ ...bundle, owned_count: null, total_count: null }));
  },
};

export default bundleManager;
