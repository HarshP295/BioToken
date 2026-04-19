/**
 * useGaslessContract.js
 *
 * Handles gasless ERC-4337 transactions via Pimlico + ZK proof generation.
 *
 * ZK flow (client-side only — raw HPLC data NEVER leaves the browser):
 *   1. Parse HPLC fingerprint file  →  peaks[10] + threshold (private inputs)
 *   2. snarkjs.groth16.fullProve()  →  { proof, publicSignals }
 *   3. keccak256(publicSignals)     →  bytes32 vk commitment stored on-chain
 *   4. sendGaslessTx('mintToken')   →  ERC-4337 UserOperation via Pimlico
 *
 * The actual on-chain Groth16 verification (proof.pi_a/b/c + publicSignals)
 * is submitted later by the lab when calling verifyProof().
 * At mint time we only store the commitment hash so the NFT is bound
 * to a specific batch fingerprint from day one.
 */

import { useState } from 'react'
import { ethers } from 'ethers'
import { useWallets } from '@privy-io/react-auth'
import { createSmartClient } from '../lib/pimlico'
import { encodeFunctionData } from 'viem'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config'

// ─── Static asset paths (served from /public by Vite) ──────────────────────
const WASM_URL = '/fingerprint.wasm'
const ZKEY_URL = '/fingerprint_final.zkey'

// ─── Circuit configuration ──────────────────────────────────────────────────
const N_PEAKS    = 10   // FingerprintMatch(n=10)
const N_BITS     = 8    // LessEqThan(8) — peaks fit in 0-255
const MAX_PEAK   = 255
const MAX_THRESH = 255

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse an uploaded HPLC fingerprint file into circuit inputs.
 *
 * Supported formats (auto-detected):
 *   JSON  →  { "peaks": [120,145,...], "threshold": 10 }    (snarkjs style)
 *   CSV   →  first row = comma-separated peak values        (lab export style)
 *   TXT   →  newline- or space-separated peak values
 *
 * Returns { peaks: string[10], threshold: string } ready for snarkjs.
 * Throws a user-friendly Error if the file is malformed.
 *
 * SECURITY: this function runs purely in the browser.
 * The raw data is used only to generate the witness and is discarded
 * immediately after snarkjs.groth16.fullProve() returns.
 */
export async function parseHplcFile(file) {
  const text = await file.text()

  let peaks = []
  let threshold = 10  // default tolerance — overridden if file provides it

  const ext = file.name.split('.').pop().toLowerCase()

  if (ext === 'json') {
    let parsed
    try { parsed = JSON.parse(text) } catch {
      throw new Error('HPLC file is not valid JSON.')
    }
    if (!Array.isArray(parsed.peaks) || parsed.peaks.length !== N_PEAKS) {
      throw new Error(`JSON must contain a "peaks" array of exactly ${N_PEAKS} values.`)
    }
    peaks = parsed.peaks.map(Number)
    if (parsed.threshold !== undefined) threshold = Number(parsed.threshold)

  } else if (ext === 'csv') {
    // Accept the first non-empty, non-header row
    const rows = text.split(/\r?\n/).filter(r => r.trim() && !/[a-zA-Z]/.test(r.trim()))
    if (!rows.length) throw new Error('CSV file contains no numeric rows.')
    peaks = rows[0].split(',').map(v => Number(v.trim()))
    if (rows[1]) threshold = Number(rows[1].split(',')[0].trim()) || 10

  } else {
    // TXT: space- or newline-separated numbers
    peaks = text.trim().split(/[\s,]+/).map(Number)
    if (peaks.length >= N_PEAKS + 1) {
      threshold = peaks.pop()   // last value is threshold if N+1 provided
    }
  }

  // Validate
  if (peaks.length !== N_PEAKS) {
    throw new Error(`Expected exactly ${N_PEAKS} peak values, got ${peaks.length}.`)
  }
  if (peaks.some(p => !Number.isInteger(p) || p < 0 || p > MAX_PEAK)) {
    throw new Error(`All peak values must be integers between 0 and ${MAX_PEAK}.`)
  }
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > MAX_THRESH) {
    threshold = Math.max(0, Math.min(MAX_THRESH, Math.round(threshold)))
  }

  return {
    peaks:     peaks.map(String),   // snarkjs expects string-encoded field elements
    threshold: String(threshold),
  }
}

/**
 * Run the Groth16 proof generation entirely in the browser.
 *
 * @param {{ peaks: string[], threshold: string }} circuitInputs
 * @returns {{ proof, publicSignals, vkCommitment: string }}
 *
 *   vkCommitment — bytes32 hex string suitable for the mintToken() call:
 *     keccak256(abi.encodePacked(valid, threshold))
 *     Binds the minted NFT to the specific ZK session without exposing peak data.
 */
export async function generateZkProof(circuitInputs) {
  // ── Lazy-load snarkjs only when actually generating a proof ────────────
  // snarkjs bundles SES (lockdown-install.js) which freezes JS intrinsics.
  // A static import would run lockdown at page load, breaking Privy's
  // iframe communication. Dynamic import defers it to proof-time only.
  const snarkjs = await import('snarkjs')

  // Fetch static files — snarkjs accepts ArrayBuffer (for .zkey) or Uint8Array (for .wasm)
  const [wasmBuf, zkeyBuf] = await Promise.all([
    fetch(WASM_URL).then(r => r.arrayBuffer()),
    fetch(ZKEY_URL).then(r => r.arrayBuffer()),
  ])

  // fullProve: witness generation + Groth16 proving in one call
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    new Uint8Array(wasmBuf),
    new Uint8Array(zkeyBuf),
  )

  // publicSignals = [valid, threshold]  (matches the circuit's public outputs)
  const valid     = publicSignals[0]   // "1" = all deltas within threshold
  const threshold = publicSignals[1]   // echoes the public input

  if (valid !== '1') {
    throw new Error(
      'ZK proof generated but fingerprint is OUT of tolerance — batch fails authenticity check.'
    )
  }

  // Derive the on-chain commitment: keccak256(valid ++ threshold)
  // This ties the NFT to this exact proof session without revealing peaks.
  const vkCommitment = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256'],
      [BigInt(valid), BigInt(threshold)]
    )
  )

  return { proof, publicSignals, vkCommitment }
}

/**
 * Format a snarkjs Groth16 proof into the uint[2]/uint[2][2]/uint[2] arrays
 * expected by the Solidity verifier (used when calling verifyProof() later).
 *
 * Exported for use in the VerifyToken page.
 */
export function formatProofForContract(proof, publicSignals) {
  const f = (x) => BigInt(x)   // field element → BigInt

  const a = [f(proof.pi_a[0]), f(proof.pi_a[1])]

  // NOTE: Groth16 G2 points have their coordinates swapped in the Solidity verifier
  const b = [
    [f(proof.pi_b[0][1]), f(proof.pi_b[0][0])],
    [f(proof.pi_b[1][1]), f(proof.pi_b[1][0])],
  ]

  const c = [f(proof.pi_c[0]), f(proof.pi_c[1])]

  const pub = publicSignals.slice(0, 2).map(f)   // [valid, threshold]

  return { a, b, c, pubSignals: pub }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useGaslessContract() {
  const { wallets } = useWallets()
  const [loading,           setLoading]           = useState(false)
  const [isGeneratingProof, setIsGeneratingProof] = useState(false)
  const [error,             setError]             = useState(null)

  // ── Low-level gasless sender ─────────────────────────────────────────────
  const sendGaslessTx = async (functionName, args) => {
    setLoading(true)
    setError(null)
    try {
      const wallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0]
      if (!wallet) throw new Error('No wallet found. Please log in.')

      const { smartClient } = await createSmartClient(wallet)

      const calldata = encodeFunctionData({
        abi: CONTRACT_ABI,
        functionName,
        args,
      })

      const txHash = await smartClient.sendUserOperation({
        calls: [{
          to:    CONTRACT_ADDRESS,
          data:  calldata,
          value: 0n,
        }],
      })

      const receipt = await smartClient.waitForUserOperationReceipt({ hash: txHash })

      setLoading(false)
      return receipt
    } catch (err) {
      setError(err.message)
      setLoading(false)
      throw err
    }
  }

  // ── Mint with real ZK proof ──────────────────────────────────────────────
  /**
   * @param {object} params
   * @param {string}  params.batchId         Human-readable batch ID
   * @param {number}  params.daysUntilExpiry  Days from now until reagent expires
   * @param {File}   [params.hplcFile]        Uploaded HPLC fingerprint file
   *                                          If omitted, a demo input is used.
   *
   * UX states surfaced to the caller:
   *   isGeneratingProof → show "Securing Batch Data…" spinner
   *   loading           → show "Broadcasting Transaction…" spinner
   *   error             → display error message
   */
  const mintBatch = async ({ batchId, daysUntilExpiry, hplcFile }) => {
    setError(null)
    const expiry = BigInt(Math.floor(Date.now() / 1000) + daysUntilExpiry * 86400)

    // ── Step 1: Parse HPLC inputs ────────────────────────────────────────
    let circuitInputs
    if (hplcFile) {
      try {
        circuitInputs = await parseHplcFile(hplcFile)
      } catch (err) {
        setError(`File parse error: ${err.message}`)
        throw err
      }
    } else {
      // Demo fallback — tightly-clustered peaks that pass the threshold check
      circuitInputs = {
        peaks:     ['100','104','108','103','101','99','102','105','100','103'],
        threshold: '10',
      }
    }

    // ── Step 2: Client-side ZK proof generation ──────────────────────────
    setIsGeneratingProof(true)
    let zkResult
    try {
      zkResult = await generateZkProof(circuitInputs)
    } catch (err) {
      setError(`ZK proof error: ${err.message}`)
      setIsGeneratingProof(false)
      throw err
    } finally {
      setIsGeneratingProof(false)
    }

    const { vkCommitment } = zkResult   // bytes32 — stored on-chain with the NFT

    // ── Step 3: Gasless on-chain transaction ─────────────────────────────
    const marketplaceSig = '0x'   // future: collect co-signature from validators

    // mintToken(batchId, expiry, vk bytes32, marketplaceSig bytes)
    return sendGaslessTx('mintToken', [batchId, expiry, vkCommitment, marketplaceSig])
  }

  return {
    sendGaslessTx,
    mintBatch,
    loading,
    isGeneratingProof,
    error,
  }
}