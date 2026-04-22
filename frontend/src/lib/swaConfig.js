// Mirrors the two load-bearing rules from the repo-root
// staticwebapp.config.json so they can be asserted in tests alongside
// the JSON itself. When the JSON changes, this helper and its tests
// must change with it.
/**
 * @typedef {Object} SwaRoute
 * @property {string} route
 * @property {string} [rewrite]
 */
/**
 * @typedef {Object} SwaConfig
 * @property {SwaRoute[]} routes
 * @property {{ rewrite: string }} navigationFallback
 */

/** @returns {SwaConfig} */
export function readSwaConfig() {
  return {
    routes: [{ route: "/api/*" }],
    navigationFallback: { rewrite: "/index.html" },
  };
}
