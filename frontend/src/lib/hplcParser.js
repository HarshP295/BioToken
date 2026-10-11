/**
 * hplcParser.js — browser-side HPLC fingerprint parsing.
 *
 * Used by the Mint page (Gold Standard) and the Lab Dashboard (lab scan), so
 * both sides of the ZK comparison are extracted the same way. Kept free of
 * React/wallet imports so it also runs under plain Node (scripts and checks).
 */

export const N_PEAKS  = 10    // FingerprintMatch(n=10)
export const MAX_PEAK = 255   // circuit range-checks peaks to 8 bits

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/

/**
 * Top N_PEAKS local maxima of a chromatogram's intensity column, tallest
 * first, scaled so the tallest is MAX_PEAK.
 */
export function extractPeaksFromIntensities(intensities) {
  const localPeaks = []
  for (let i = 1; i < intensities.length - 1; i++) {
    if (intensities[i] > intensities[i - 1] && intensities[i] > intensities[i + 1]) {
      localPeaks.push(intensities[i])
    }
  }
  if (localPeaks.length < N_PEAKS) {
    throw new Error(`Chromatogram has ${localPeaks.length} peaks; at least ${N_PEAKS} are needed.`)
  }
  localPeaks.sort((a, b) => b - a)
  const topPeaks = localPeaks.slice(0, N_PEAKS)
  const maxVal = topPeaks[0]
  if (!(maxVal > 0)) throw new Error('Chromatogram intensities must be positive.')
  return topPeaks.map(v => Math.round((v / maxVal) * MAX_PEAK))
}

/**
 * Parse an uploaded HPLC fingerprint file into 10 peak values (0–255).
 *
 * Supported formats (auto-detected):
 *   JSON  →  { "peaks": [120,145,...] }                     (10 values)
 *   CSV   →  chromatogram rows "time,intensity" (header optional),
 *            or one row of 10 comma-separated peak values
 *   TXT   →  10 newline-, space- or comma-separated peak values
 *
 * Returns { peaks: string[10] }. Throws a user-friendly Error if the file is
 * malformed; values are never padded or clamped.
 *
 * SECURITY: this runs purely in the browser; the raw data is not uploaded.
 */
export async function parseHplcFile(file) {
  const text = (await file.text()).trimStart()   // trimStart also drops a BOM
  const ext = file.name.split('.').pop().toLowerCase()
  let peaks

  if (ext === 'json') {
    let parsed
    try { parsed = JSON.parse(text) } catch {
      throw new Error('HPLC file is not valid JSON.')
    }
    if (!Array.isArray(parsed.peaks)) throw new Error('JSON must contain a "peaks" array.')
    peaks = parsed.peaks.map(Number)

  } else if (ext === 'csv') {
    const rows = text.split(/\r?\n/).filter(r => r.trim())
      .map(r => r.split(',').map(c => c.trim().replace(/^["']|["']$/g, '')).filter(Boolean))
    // Keep rows whose cells are all numbers (scientific notation included);
    // header rows are skipped.
    const dataRows = rows.filter(cells => cells.length && cells.every(c => NUMBER.test(c)))
    if (!dataRows.length) throw new Error('CSV file contains no numeric rows.')

    if (dataRows[0].length >= 2 && dataRows.length > N_PEAKS) {
      // Chromatogram: columns are (time, intensity, ...)
      peaks = extractPeaksFromIntensities(dataRows.map(cells => parseFloat(cells[1])))
    } else {
      peaks = dataRows[0].map(Number)
    }

  } else {
    peaks = text.trim().split(/[\s,]+/).map(Number)
  }

  if (peaks.length !== N_PEAKS) {
    throw new Error(`Expected exactly ${N_PEAKS} peak values, found ${peaks.length}.`)
  }
  if (peaks.some(p => !Number.isInteger(p) || p < 0 || p > MAX_PEAK)) {
    throw new Error(`Peak values must be whole numbers from 0 to ${MAX_PEAK}.`)
  }
  return { peaks: peaks.map(String) }
}
