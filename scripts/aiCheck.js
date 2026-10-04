// scripts/aiCheck.js
// ─────────────────────────────────────────────────────────────────
//  BioToken circuit pre-check (NOT the AI model)
//
//  The AI anomaly detection lives in ai/src/verifier.py (XGBoost RT
//  predictor + classifier) and is called over HTTP by integrate.js.
//  This file only checks that every adjacent peak delta is within
//  the threshold — the same constraint fingerprint.circom enforces —
//  so a failing peak profile is caught before snarkjs runs.
//
//  Usage:
//    const { aiPreScreen } = require("./aiCheck");
//    const result = aiPreScreen(peaks, threshold);
// ─────────────────────────────────────────────────────────────────

/**
 * Simulate the AI anomaly detection pre-screen.
 *
 * @param {number[]} peaks      - Array of HPLC peak intensity values
 * @param {number}   threshold  - Maximum allowable adjacent-peak delta
 * @returns {{ genuine: boolean, details: object }}
 */
function aiPreScreen(peaks, threshold) {
    if (!Array.isArray(peaks) || peaks.length < 2) {
        return {
            genuine: false,
            details: {
                reason: "Invalid input: peaks must be an array of at least 2 values",
                deltas: [],
                maxDelta: null,
            },
        };
    }

    // Compute all adjacent deltas
    const deltas = [];
    let maxDelta = 0;
    let failIndex = -1;

    for (let i = 0; i < peaks.length - 1; i++) {
        const delta = Math.abs(peaks[i] - peaks[i + 1]);
        deltas.push(delta);
        if (delta > maxDelta) maxDelta = delta;
        if (delta > threshold && failIndex === -1) failIndex = i;
    }

    const genuine = maxDelta <= threshold;

    return {
        genuine,
        details: {
            reason: genuine
                ? `All ${deltas.length} adjacent deltas are within threshold (${threshold}). Max delta = ${maxDelta}.`
                : `Delta between peaks[${failIndex}] and peaks[${failIndex + 1}] is ${deltas[failIndex]}, exceeds threshold ${threshold}.`,
            deltas,
            maxDelta,
            threshold,
            peakCount: peaks.length,
            deltaCount: deltas.length,
        },
    };
}

module.exports = { aiPreScreen };
