/**
 * consensusValidator.js — Fingerprint consensus validation
 *
 * Compares a submitted fingerprint against baseline peer fingerprints
 * from known-good suppliers. Each peak must be within ±TOLERANCE of
 * the peer mean for the batch to pass consensus.
 *
 * Currently seeded with 2 mock suppliers for the default reagent type.
 * TODO: replace with on-chain or DB-backed peer registry.
 */

// ── Mock baseline peers (2 known-good supplier fingerprints) ────────────────
// Scaled to [0-255] to match parseHplcFile normalization (MAX_PEAK = 255)
const BASELINE_PEERS = {
  default: [
    { supplier: 'Supplier A', peaks: [255, 240, 235, 230, 225, 220, 215, 210, 205, 200] },
    { supplier: 'Supplier B', peaks: [250, 245, 238, 233, 228, 222, 218, 212, 208, 198] },
  ],
}

const TOLERANCE = 50   // ±50 from peer mean

/**
 * Compute the per-peak mean from all baseline peers.
 * @param {string} reagentType  Key into BASELINE_PEERS (default: 'default')
 * @returns {number[]}          Mean value for each peak index
 */
export function getPeerMeans(reagentType = 'default') {
  const peers = BASELINE_PEERS[reagentType] || BASELINE_PEERS.default
  const n = peers[0].peaks.length

  const means = []
  for (let i = 0; i < n; i++) {
    const sum = peers.reduce((acc, p) => acc + p.peaks[i], 0)
    means.push(Math.round(sum / peers.length))
  }
  return means
}

/**
 * Validate a submitted fingerprint against baseline peers.
 *
 * @param {number[]} submittedPeaks  The 10-peak array from the manufacturer
 * @param {string}   reagentType     Reagent type key (default: 'default')
 * @returns {{
 *   passed: boolean,
 *   tolerance: number,
 *   peerMeans: number[],
 *   perPeak: Array<{ index: number, submitted: number, mean: number, delta: number, ok: boolean }>,
 *   failedPeaks: number[],
 *   peerCount: number,
 * }}
 */
export function validateConsensus(submittedPeaks, reagentType = 'default') {
  const peers = BASELINE_PEERS[reagentType] || BASELINE_PEERS.default
  const means = getPeerMeans(reagentType)

  const perPeak = means.map((mean, i) => {
    const submitted = submittedPeaks[i] ?? 0
    const delta = Math.abs(submitted - mean)
    return {
      index: i,
      submitted,
      mean,
      delta,
      ok: delta <= TOLERANCE,
    }
  })

  const failedPeaks = perPeak.filter(p => !p.ok).map(p => p.index)

  return {
    passed: failedPeaks.length === 0,
    tolerance: TOLERANCE,
    peerMeans: means,
    perPeak,
    failedPeaks,
    peerCount: peers.length,
  }
}

/**
 * Get baseline peer info for display in the validator UI.
 * @param {string} reagentType
 * @returns {{ supplier: string, peaks: number[] }[]}
 */
export function getBaselinePeers(reagentType = 'default') {
  return BASELINE_PEERS[reagentType] || BASELINE_PEERS.default
}
