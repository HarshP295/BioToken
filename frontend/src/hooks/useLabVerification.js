/**
 * useLabVerification.js — Lab verification pipeline hook
 *
 * Completely isolated from useGaslessContract (manufacturer flow).
 *   Step 1: Fetch the token (reagent, commitment, tolerance) from chain
 *   Step 2: AI pre-screen (POST /verify) → GENUINE verdict + oracle signature
 *   Step 3: ZK proof in the browser: lab peaks within tolerance of the
 *           Gold Standard committed on-chain, bound to this token id
 *   Step 4: verifyProof(tokenId, proof, aiAttestation) via Pimlico gasless tx
 *
 * The lab scan and the Gold Standard package never leave the browser.
 */

import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import { useWallets, usePrivy } from '@privy-io/react-auth'
import { createSmartClient, pickTxWallet } from '../lib/pimlico'
import { encodeFunctionData } from 'viem'
import { AI_API_URL, AMOY_RPC_URL, CONTRACT_ADDRESS, CONTRACT_ABI, TARGET_CHAIN_ID } from '../config'
import { buildCircuitInput, compareToGold, formatProofForContract } from '../lib/fingerprint'

// ─── Circuit artifacts (served from /public) ─────────────────────────────────
const WASM_URL   = '/fingerprint.wasm'
const ZKEY_URL   = '/fingerprint_final.zkey'
const AI_URL     = AI_API_URL

// ─── Pipeline steps ──────────────────────────────────────────────────────────
export const LAB_STEPS = {
  IDLE:       0,
  FETCHING:   1,
  AI_CHECK:   2,
  ZK_PROVING: 3,
  SUBMITTING: 4,
  DONE:       5,
}

/**
 * Checks a Gold Standard package against the token's on-chain record, then
 * compares the lab peaks with it. Throws with a readable reason on mismatch.
 */
export function checkAgainstToken(token, goldPackage, labPeaks) {
  if (goldPackage.tokenId != null && String(goldPackage.tokenId) !== String(token.id)) {
    throw new Error(`This Gold Standard package is for token #${goldPackage.tokenId}, not #${token.id}.`)
  }
  if (goldPackage.commitment.toLowerCase() !== token.commitment.toLowerCase()) {
    throw new Error('This Gold Standard package does not match the fingerprint committed on-chain for this token.')
  }
  if (Number(goldPackage.tolerance) !== token.tolerance) {
    throw new Error(`Package tolerance ${goldPackage.tolerance} differs from the on-chain tolerance ${token.tolerance}.`)
  }
  return compareToGold(labPeaks, goldPackage.peaks, token.tolerance)
}

export function useLabVerification() {
  const { wallets } = useWallets()
  const { createWallet } = usePrivy()

  const [step,      setStep]      = useState(LAB_STEPS.IDLE)
  const [tokenData, setTokenData] = useState(null)
  const [aiResult,  setAiResult]  = useState(null)
  const [zkProof,   setZkProof]   = useState(null)
  const [txReceipt, setTxReceipt] = useState(null)
  const [error,     setError]     = useState(null)
  const [loading,   setLoading]   = useState(false)

  // ── Helper: read-only contract instance ────────────────────────────────────
  const getContract = useCallback(() => {
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, new ethers.JsonRpcProvider(AMOY_RPC_URL))
  }, [])

  // ── Step 1: Fetch token from chain ─────────────────────────────────────────
  const fetchToken = useCallback(async (tokenId) => {
    setStep(LAB_STEPS.FETCHING)
    setError(null)
    setAiResult(null)
    setZkProof(null)
    setTxReceipt(null)
    setLoading(true)

    try {
      const contract = getContract()
      const owner = await contract.ownerOf(tokenId)
      const data  = await contract.getTokenData(tokenId)

      const token = {
        id:            String(tokenId),
        owner,
        batchId:       data.batchId,
        reagentSmiles: data.reagentSmiles,
        expiry:        new Date(Number(data.expiry) * 1000).toLocaleString(),
        rawExpiry:     Number(data.expiry),
        status:        Number(data.status),
        commitment:    data.fingerprintCommitment,
        tolerance:     Number(data.tolerance),
      }

      setTokenData(token)
      setStep(LAB_STEPS.AI_CHECK)
      return token
    } catch (err) {
      setError(`Token fetch failed: ${err.shortMessage || err.message}`)
      setStep(LAB_STEPS.IDLE)
      throw err
    } finally {
      setLoading(false)
    }
  }, [getContract])

  // ── Step 2: AI pre-screen ──────────────────────────────────────────────────
  // The reagent comes from the token itself; the lab supplies only the RT it
  // measured. A GENUINE result carries the AI oracle's signature, which
  // BioToken.verifyProof checks.
  const runAiCheck = useCallback(async ({ observedRt }) => {
    setStep(LAB_STEPS.AI_CHECK)
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${AI_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smiles:           tokenData.reagentSmiles,
          observed_rt:      Number(observedRt),
          token_id:         Number(tokenData.id),
          chain_id:         TARGET_CHAIN_ID,
          contract_address: CONTRACT_ADDRESS,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail.detail || 'AI verification failed')
      }
      const result = await res.json()
      if (result.genuine && !result.attestation) {
        throw new Error('AI service returned GENUINE without an oracle signature (AI_ORACLE_PRIVATE_KEY not set on the server).')
      }

      setAiResult(result)
      setStep(result.genuine ? LAB_STEPS.ZK_PROVING : LAB_STEPS.IDLE)
      return result
    } catch (err) {
      setError(`AI check failed: ${err.message}`)
      setStep(LAB_STEPS.IDLE)
      throw err
    } finally {
      setLoading(false)
    }
  }, [tokenData])

  // ── Step 3: ZK proof (client-side) ─────────────────────────────────────────
  const generateProof = useCallback(async ({ labPeaks, goldPackage }) => {
    setStep(LAB_STEPS.ZK_PROVING)
    setError(null)
    setLoading(true)

    try {
      const comparison = checkAgainstToken(tokenData, goldPackage, labPeaks)
      if (!comparison.passed) {
        const off = comparison.perPeak.filter(p => !p.ok).map(p => `P${p.index + 1} Δ${p.delta}`).join(', ')
        throw new Error(`Lab scan does not match the Gold Standard within ±${tokenData.tolerance} (${off}). No proof can be made for this batch.`)
      }

      // Lazy-load snarkjs to avoid SES lockdown breaking Privy at page load
      const snarkjs = await import('snarkjs')
      const [wasmBuf, zkeyBuf] = await Promise.all([
        fetch(WASM_URL).then(r => {
          if (!r.ok) throw new Error('Failed to load fingerprint.wasm')
          return r.arrayBuffer()
        }),
        fetch(ZKEY_URL).then(r => {
          if (!r.ok) throw new Error('Failed to load fingerprint_final.zkey')
          return r.arrayBuffer()
        }),
      ])

      const input = buildCircuitInput({
        labPeaks,
        goldPeaks:  goldPackage.peaks,
        salt:       goldPackage.salt,
        commitment: tokenData.commitment,
        tolerance:  tokenData.tolerance,
        tokenId:    tokenData.id,
      })
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input, new Uint8Array(wasmBuf), new Uint8Array(zkeyBuf),
      )

      const proofData = { proof, publicSignals }
      setZkProof(proofData)
      setStep(LAB_STEPS.SUBMITTING)
      return proofData
    } catch (err) {
      setError(`Proof generation failed: ${err.message}`)
      setStep(LAB_STEPS.ZK_PROVING)
      throw err
    } finally {
      setLoading(false)
    }
  }, [tokenData])

  // ── Step 4: Submit to chain via Pimlico gasless tx ─────────────────────────
  const submitVerification = useCallback(async (tokenId, proof, aiAttestation) => {
    setStep(LAB_STEPS.SUBMITTING)
    setError(null)
    setLoading(true)

    try {
      let wallet = pickTxWallet(wallets)
      if (!wallet) {
        if (createWallet) {
          await createWallet()
          throw new Error('Wallet created! Please click Verify again to continue.')
        } else {
          throw new Error('No wallet found. Please log in.')
        }
      }

      const { smartClient } = await createSmartClient(wallet)
      const { a, b, c } = formatProofForContract(proof)

      const calldata = encodeFunctionData({
        abi: CONTRACT_ABI,
        functionName: 'verifyProof',
        args: [BigInt(tokenId), a, b, c, aiAttestation],
      })

      const txHash = await smartClient.sendUserOperation({
        calls: [{
          to:    CONTRACT_ADDRESS,
          data:  calldata,
          value: 0n,
        }],
      })

      const receipt = await smartClient.waitForUserOperationReceipt({ hash: txHash })
      if (!receipt.success) throw new Error(`verifyProof reverted (${receipt.receipt.transactionHash})`)

      setTxReceipt(receipt)
      setStep(LAB_STEPS.DONE)
      return receipt
    } catch (err) {
      setError(`On-chain verification failed: ${err.shortMessage || err.message}`)
      setStep(LAB_STEPS.SUBMITTING)
      throw err
    } finally {
      setLoading(false)
    }
  }, [wallets, createWallet])

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep(LAB_STEPS.IDLE)
    setTokenData(null)
    setAiResult(null)
    setZkProof(null)
    setTxReceipt(null)
    setError(null)
    setLoading(false)
  }, [])

  return {
    // State
    step,
    tokenData,
    aiResult,
    zkProof,
    txReceipt,
    error,
    loading,
    // Actions
    fetchToken,
    runAiCheck,
    generateProof,
    submitVerification,
    reset,
  }
}
