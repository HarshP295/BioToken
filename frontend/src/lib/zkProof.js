/**
 * zkProof.js — shared ZK proof utilities
 *
 * Exports pure helper functions that can be used by both
 * useGaslessContract (mint) and VerifyToken (lab verification).
 *
 * All logic runs client-side. Raw HPLC data never leaves the browser.
 */

import { ethers }   from 'ethers'

export const WASM_URL = '/fingerprint.wasm'
export const ZKEY_URL = '/fingerprint_final.zkey'
export const N_PEAKS  = 10

/**
 * Parse an HPLC fingerprint file into snarkjs circuit inputs.
 * Supports JSON, CSV, or plain text (whitespace-separated).
 *
 * @param {File} file
 * @returns {{ peaks: string[], threshold: string }}
 */
export async function parseHplcFile(file) {
  const text = await file.text()
  const ext  = file.name.split('.').pop().toLowerCase()

  let peaks = [], threshold = 10

  if (ext === 'json') {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed.peaks) || parsed.peaks.length !== N_PEAKS)
      throw new Error(`JSON must have a "peaks" array of exactly ${N_PEAKS} values.`)
    peaks = parsed.peaks.map(Number)
    if (parsed.threshold !== undefined) threshold = Number(parsed.threshold)
  } else if (ext === 'csv') {
    const rows = text.split(/\r?\n/).filter(r => r.trim() && !/[a-zA-Z]/.test(r))
    if (!rows.length) throw new Error('CSV has no numeric rows.')
    peaks = rows[0].split(',').map(v => Number(v.trim()))
    if (rows[1]) threshold = Number(rows[1].split(',')[0]) || 10
  } else {
    const nums = text.trim().split(/[\s,]+/).map(Number)
    peaks = nums.length === N_PEAKS + 1 ? (threshold = nums.pop(), nums) : nums
  }

  if (peaks.length !== N_PEAKS)
    throw new Error(`Expected ${N_PEAKS} peaks, got ${peaks.length}.`)
  if (peaks.some(p => !Number.isInteger(p) || p < 0 || p > 255))
    throw new Error('Peak values must be integers 0–255.')

  return { peaks: peaks.map(String), threshold: String(threshold) }
}

/**
 * Generate a Groth16 proof client-side using snarkjs.
 *
 * @param {{ peaks: string[], threshold: string }} inputs
 * @returns {{ proof, publicSignals, vkCommitment: string }}
 */
export async function generateZkProof(inputs) {
  // Lazy-load snarkjs to avoid SES lockdown breaking Privy at page load
  const snarkjs = await import('snarkjs')

  const [wasmBuf, zkeyBuf] = await Promise.all([
    fetch(WASM_URL).then(r => { if (!r.ok) throw new Error('Failed to load fingerprint.wasm'); return r.arrayBuffer() }),
    fetch(ZKEY_URL).then(r => { if (!r.ok) throw new Error('Failed to load fingerprint_final.zkey'); return r.arrayBuffer() }),
  ])

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    new Uint8Array(wasmBuf),
    new Uint8Array(zkeyBuf),
  )

  // publicSignals = [valid, threshold]
  if (publicSignals[0] !== '1') {
    throw new Error('Fingerprint is OUT of tolerance — batch fails ZK authenticity check.')
  }

  // Deterministic bytes32 commitment: keccak256(valid || threshold)
  const vkCommitment = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256'],
      [BigInt(publicSignals[0]), BigInt(publicSignals[1])]
    )
  )

  return { proof, publicSignals, vkCommitment }
}

/**
 * Format snarkjs proof into the Solidity verifier's expected ABI layout.
 * G2 coordinates are swapped (Solidity convention vs. snarkjs convention).
 *
 * @param {object} proof
 * @param {string[]} publicSignals
 * @returns {{ a, b, c, pubSignals }}  — all values are BigInt
 */
export function formatProofForContract(proof, publicSignals) {
  const f = x => BigInt(x)
  return {
    a:          [f(proof.pi_a[0]),  f(proof.pi_a[1])],
    b:          [
      [f(proof.pi_b[0][1]), f(proof.pi_b[0][0])],
      [f(proof.pi_b[1][1]), f(proof.pi_b[1][0])],
    ],
    c:          [f(proof.pi_c[0]),  f(proof.pi_c[1])],
    pubSignals: publicSignals.slice(0, 2).map(f),  // [valid, threshold]
  }
}
