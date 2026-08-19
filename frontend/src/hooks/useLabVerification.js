/**
 * useLabVerification.js — Lab verification pipeline hook
 *
 * Completely isolated from useGaslessContract (manufacturer flow).
 * Manages the full 4-step lab verification lifecycle:
 *   Step 1: Fetch NFT + vk from chain
 *   Step 2: AI pre-screen (POST /verify)
 *   Step 3: ZK proof generation (client-side snarkjs)
 *   Step 4: On-chain verifyProof() via Pimlico gasless tx
 *
 * The Gold Standard peaks data never leaves the browser.
 */

import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import { useWallets, usePrivy } from '@privy-io/react-auth'
import { createSmartClient } from '../lib/pimlico'
import { encodeFunctionData } from 'viem'
import { AMOY_RPC_URL, CONTRACT_ADDRESS, CONTRACT_ABI } from '../config'

// ─── Circuit config (matches fingerprint.circom) ─────────────────────────────
const N_PEAKS    = 10
const WASM_URL   = '/fingerprint.wasm'
const ZKEY_URL   = '/fingerprint_final.zkey'

// ─── Pipeline steps ──────────────────────────────────────────────────────────
export const LAB_STEPS = {
  IDLE:       0,
  FETCHING:   1,
  AI_CHECK:   2,
  ZK_PROVING: 3,
  SUBMITTING: 4,
  DONE:       5,
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

  // ── Helper: get a contract instance ────────────────────────────────────────
  const getContract = useCallback(async () => {
    const wallet = wallets[0]
    if (wallet) {
      const provider = await wallet.getEthereumProvider()
      const bp = new ethers.BrowserProvider(provider)
      const signer = await bp.getSigner()
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
    }
    // Read-only fallback
    const fp = new ethers.JsonRpcProvider(AMOY_RPC_URL)
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, fp)
  }, [wallets])

  // ── Step 1: Fetch NFT + vk from chain ──────────────────────────────────────
  const fetchToken = useCallback(async (tokenId) => {
    setStep(LAB_STEPS.FETCHING)
    setError(null)
    setAiResult(null)
    setZkProof(null)
    setTxReceipt(null)
    setLoading(true)

    try {
      const contract = await getContract()
      const owner = await contract.ownerOf(tokenId)
      const data  = await contract.getTokenData(tokenId)

      const token = {
        id:       tokenId,
        owner,
        batchId:  data.batchId,
        expiry:   new Date(Number(data.expiry) * 1000).toLocaleString(),
        rawExpiry: Number(data.expiry),
        status:   Number(data.status),
        vkHash:   data.verificationKey,
      }

      setTokenData(token)
      setStep(LAB_STEPS.AI_CHECK)
      return token
    } catch (err) {
      setError(`Token fetch failed: ${err.message}`)
      setStep(LAB_STEPS.IDLE)
      throw err
    } finally {
      setLoading(false)
    }
  }, [getContract])

  // ── Step 2: AI pre-screen ──────────────────────────────────────────────────
  const runAiCheck = useCallback(async (peaks) => {
    setStep(LAB_STEPS.AI_CHECK)
    setError(null)
    setLoading(true)

    try {
      const AI_URL = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000'

      // Step 2A: Convert 10 peaks → 137 features + observed_rt
      const featRes = await fetch(`${AI_URL}/compute-features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peaks: peaks.map(Number) }),
      })
      if (!featRes.ok) throw new Error('Feature computation failed')
      const { observed_features, observed_rt } = await featRes.json()

      // Step 2B: AI classifier
      const verifyRes = await fetch(`${AI_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observed_features,
          observed_rt,
          token_id: Number(tokenData?.id || 0),
        }),
      })
      if (!verifyRes.ok) throw new Error('AI verification failed')
      const result = await verifyRes.json()

      setAiResult(result)

      if (result.genuine) {
        setStep(LAB_STEPS.ZK_PROVING)
      } else {
        setStep(LAB_STEPS.IDLE)
      }

      return result
    } catch (err) {
      setError(`AI check failed: ${err.message}`)
      setStep(LAB_STEPS.IDLE)
      throw err
    } finally {
      setLoading(false)
    }
  }, [tokenData])

  // ── Step 3: Generate ZK proof (client-side, primary path) ──────────────────
  const generateProof = useCallback(async (peaks, threshold = 10) => {
    setStep(LAB_STEPS.ZK_PROVING)
    setError(null)
    setLoading(true)

    try {
      // Lazy-load snarkjs to avoid SES lockdown breaking Privy at page load
      const snarkjs = await import('snarkjs')

      // Prepare circuit inputs (snarkjs expects string-encoded field elements)
      const circuitInputs = {
        peaks:     peaks.map(String),
        threshold: String(threshold),
      }

      // Fetch circuit artifacts
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

      // Run fullProve: witness generation + Groth16 proving
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        new Uint8Array(wasmBuf),
        new Uint8Array(zkeyBuf),
      )

      // publicSignals = [valid, threshold]
      if (publicSignals[0] !== '1') {
        throw new Error(
          'ZK proof generated but fingerprint is OUT of tolerance — batch fails.'
        )
      }

      const proofData = { proof, publicSignals }
      setZkProof(proofData)
      setStep(LAB_STEPS.SUBMITTING)
      return proofData
    } catch (err) {
      setError(`Proof generation failed: ${err.message}`)
      setStep(LAB_STEPS.IDLE)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Step 4: Submit to chain via Pimlico gasless tx ─────────────────────────
  const submitVerification = useCallback(async (tokenId, proof, publicSignals) => {
    setStep(LAB_STEPS.SUBMITTING)
    setError(null)
    setLoading(true)

    try {
      let wallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0]
      if (!wallet) {
        if (createWallet) {
          await createWallet()
          throw new Error('Wallet created! Please click Verify again to continue.')
        } else {
          throw new Error('No wallet found. Please log in.')
        }
      }

      const { smartClient } = await createSmartClient(wallet)

      // Format proof for Solidity: swap G2 coordinates
      const f = x => BigInt(x)
      const a = [f(proof.pi_a[0]), f(proof.pi_a[1])]
      const b = [
        [f(proof.pi_b[0][1]), f(proof.pi_b[0][0])],
        [f(proof.pi_b[1][1]), f(proof.pi_b[1][0])],
      ]
      const c = [f(proof.pi_c[0]), f(proof.pi_c[1])]
      const pubSignals = publicSignals.slice(0, 2).map(f) // [valid, threshold]

      const calldata = encodeFunctionData({
        abi: CONTRACT_ABI,
        functionName: 'verifyProof',
        args: [BigInt(tokenId), a, b, c, pubSignals],
      })

      const txHash = await smartClient.sendUserOperation({
        calls: [{
          to:    CONTRACT_ADDRESS,
          data:  calldata,
          value: 0n,
        }],
      })

      const receipt = await smartClient.waitForUserOperationReceipt({ hash: txHash })

      setTxReceipt(receipt)
      setStep(LAB_STEPS.DONE)
      return receipt
    } catch (err) {
      setError(`On-chain verification failed: ${err.message}`)
      setStep(LAB_STEPS.SUBMITTING)
      throw err
    } finally {
      setLoading(false)
    }
  }, [wallets])

  // ── Full pipeline orchestrator ─────────────────────────────────────────────
  const runFullPipeline = useCallback(async (tokenId, peaks, threshold = 10) => {
    try {
      // Step 1
      await fetchToken(tokenId)
      // Step 2
      const aiRes = await runAiCheck(peaks)
      if (!aiRes.genuine) return aiRes // stops here if anomaly
      // Step 3
      const proofData = await generateProof(peaks, threshold)
      // Step 4
      await submitVerification(tokenId, proofData.proof, proofData.publicSignals)
    } catch (err) {
      console.error('Lab pipeline error:', err)
    }
  }, [fetchToken, runAiCheck, generateProof, submitVerification])

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
    runFullPipeline,
    reset,
  }
}
