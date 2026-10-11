/**
 * useGaslessContract.js
 *
 * Gasless ERC-4337 transactions via Pimlico, and the manufacturer's mint flow.
 *
 * Mint flow (raw HPLC data never leaves the browser):
 *   1. Parse the Gold Standard HPLC file        →  peaks[10]
 *   2. Consensus check against baseline peers
 *   3. commitment = Poseidon(peaks, random salt)  (lib/fingerprint.js)
 *   4. mintToken(batchId, smiles, expiry, commitment, tolerance) as a UserOperation
 *   5. Return the Gold Standard package (peaks + salt + tolerance + token id),
 *      which the manufacturer sends to the receiving lab off-chain. The lab
 *      needs it to prove its scan matches; only the commitment is on-chain.
 */

import { useState } from 'react'
import { useWallets, usePrivy } from '@privy-io/react-auth'
import { createSmartClient, pickTxWallet } from '../lib/pimlico'
import { decodeEventLog, encodeFunctionData } from 'viem'
import { CONTRACT_ADDRESS, CONTRACT_ABI, TARGET_CHAIN_ID } from '../config'
import { validateConsensus } from '../lib/consensusValidator'
import { parseHplcFile } from '../lib/hplcParser'
import { buildGoldPackage, computeCommitment, randomSalt, toBytes32 } from '../lib/fingerprint'

// Re-exported so existing imports from this hook keep working.
export { parseHplcFile }

/** Token id from the TokenMinted event in a UserOperation receipt, or null. */
export function mintedTokenId(receipt) {
  for (const log of receipt?.logs ?? []) {
    if (log.address?.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) continue
    try {
      const event = decodeEventLog({ abi: CONTRACT_ABI, data: log.data, topics: log.topics })
      if (event.eventName === 'TokenMinted') return event.args.tokenId
    } catch { /* not a BioToken event */ }
  }
  return null
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useGaslessContract() {
  const { wallets } = useWallets()
  const { createWallet } = usePrivy()
  const [loading,           setLoading]           = useState(false)
  const [isGeneratingProof, setIsGeneratingProof] = useState(false)
  const [error,             setError]             = useState(null)
  const [consensusResult,   setConsensusResult]   = useState(null)

  // ── Low-level gasless sender ─────────────────────────────────────────────
  const sendGaslessTx = async (functionName, args) => {
    setLoading(true)
    setError(null)
    try {
      let wallet = pickTxWallet(wallets)
      if (!wallet) {
        if (createWallet) {
          await createWallet()
          throw new Error('Wallet created! Please submit again to continue.')
        } else {
          throw new Error('No wallet found. Please log in.')
        }
      }

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
      if (!receipt.success) throw new Error(`${functionName} reverted on-chain (${receipt.receipt.transactionHash})`)

      setLoading(false)
      return receipt
    } catch (err) {
      setError(err.shortMessage || err.message)
      setLoading(false)
      throw err
    }
  }

  // ── Mint ─────────────────────────────────────────────────────────────────
  /**
   * @param {object} params
   * @param {string} params.batchId          Human-readable batch ID
   * @param {string} params.reagentSmiles    Reagent structure (public; the AI checks it)
   * @param {number} params.tolerance        Allowed per-peak deviation for the lab scan (0–255)
   * @param {number} params.daysUntilExpiry  Days from now until the reagent expires
   * @param {File}   params.hplcFile         Gold Standard HPLC fingerprint file
   * @returns {{ receipt, tokenId, goldPackage }}
   *
   * UX states surfaced to the caller:
   *   isGeneratingProof → "Securing Batch Data…" (commitment)
   *   loading           → "Broadcasting Transaction…"
   */
  const mintBatch = async ({ batchId, reagentSmiles, tolerance, daysUntilExpiry, hplcFile }) => {
    setError(null)
    setConsensusResult(null)
    const expiry = BigInt(Math.floor(Date.now() / 1000) + daysUntilExpiry * 86400)

    if (!hplcFile) {
      const msg = 'Upload the Gold Standard HPLC file for this batch.'
      setError(msg)
      throw new Error(msg)
    }
    if (!reagentSmiles?.trim()) {
      const msg = 'Enter the reagent SMILES.'
      setError(msg)
      throw new Error(msg)
    }

    // ── Step 1: Parse the Gold Standard ──────────────────────────────────
    let peaks
    try {
      peaks = (await parseHplcFile(hplcFile)).peaks.map(Number)
    } catch (err) {
      setError(`File parse error: ${err.message}`)
      throw err
    }

    // ── Step 2: Consensus validation against baseline peers ──────────────
    const consensus = validateConsensus(peaks)
    setConsensusResult(consensus)

    if (!consensus.passed) {
      const failedInfo = consensus.perPeak
        .filter(p => !p.ok)
        .map(p => `Peak ${p.index}: ${p.submitted} vs mean ${p.mean} (Δ${p.delta})`)
        .join('; ')
      const msg = `Consensus validation failed — ${consensus.failedPeaks.length} peak(s) outside ±${consensus.tolerance} tolerance. ${failedInfo}`
      setError(msg)
      throw new Error(msg)
    }

    // ── Step 3: Commitment to the Gold Standard ──────────────────────────
    setIsGeneratingProof(true)
    let salt, commitment
    try {
      salt = randomSalt()
      commitment = await computeCommitment(peaks, salt)
    } catch (err) {
      setError(`Commitment error: ${err.message}`)
      throw err
    } finally {
      setIsGeneratingProof(false)
    }

    // ── Step 4: Gasless on-chain transaction ─────────────────────────────
    const marketplaceSig = '0x'   // future: collect co-signature from validators
    const smiles = reagentSmiles.trim()
    const receipt = await sendGaslessTx('mintToken', [
      batchId, smiles, expiry, toBytes32(commitment), Number(tolerance), marketplaceSig,
    ])

    const tokenId = mintedTokenId(receipt)
    const goldPackage = buildGoldPackage({
      tokenId, batchId, reagentSmiles: smiles, peaks, salt, tolerance, commitment,
      contract: CONTRACT_ADDRESS, chainId: TARGET_CHAIN_ID,
    })
    return { receipt, tokenId, goldPackage }
  }

  return {
    sendGaslessTx,
    mintBatch,
    loading,
    isGeneratingProof,
    error,
    consensusResult,
  }
}
