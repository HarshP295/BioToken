/**
 * tokens.js — read-only access to BioToken on Polygon Amoy.
 *
 * Reads go through the public Amoy RPC, never the user's wallet: the wallet
 * may be on another network, and its object changes identity often, which
 * made pages re-read every token over and over. Writes are gasless
 * UserOperations (useGaslessContract / useLabVerification).
 */

import { ethers } from 'ethers'
import { AMOY_RPC_URL, CONTRACT_ADDRESS, CONTRACT_ABI } from '../config'

// Tokens read at once (two calls each); the public RPC rate-limits bursts.
const BATCH_SIZE = 4
const ATTEMPTS = 4

let readContract = null

/** BioToken bound to the public Amoy RPC (one shared instance). */
export function getReadContract() {
  if (!readContract) {
    // staticNetwork: skip ethers' network-detection call on every request.
    // batchMaxCount 1: no JSON-RPC batches. The free public RPC (drpc)
    // rejects batches of more than 3 and fails batched calls more often.
    const provider = new ethers.JsonRpcProvider(AMOY_RPC_URL, 80002, { staticNetwork: true, batchMaxCount: 1 })
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
  }
  return readContract
}

/**
 * Runs a read, retrying transient RPC failures (the public endpoint times out
 * now and then). A real revert, which carries revert data such as
 * ERC721NonexistentToken, is not retried.
 */
export async function withRetry(read) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read()
    } catch (err) {
      const reverted = err?.code === 'CALL_EXCEPTION' && err.data
      if (reverted || attempt >= ATTEMPTS) throw err
      await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }
}

/** ownerOf + getTokenData for one token, each with retries. */
export function readToken(contract, id) {
  return Promise.all([
    withRetry(() => contract.ownerOf(id)),
    withRetry(() => contract.getTokenData(id)),
  ])
}

/** One token's summary: { id, owner, batchId, expiry (unix s), status }. */
export async function loadToken(contract, id) {
  const [owner, data] = await readToken(contract, id)
  return { id, owner, batchId: data.batchId, expiry: Number(data.expiry), status: Number(data.status) }
}

/** Every minted token, newest first. */
export async function loadAllTokens() {
  const contract = getReadContract()
  const total = Number(await withRetry(() => contract.totalMinted()))
  const tokens = []
  for (let start = 0; start < total; start += BATCH_SIZE) {
    const ids = Array.from({ length: Math.min(BATCH_SIZE, total - start) }, (_, k) => start + k)
    tokens.push(...await Promise.all(ids.map(id => loadToken(contract, id))))
  }
  return tokens.reverse()
}

export function sameAddress(a, b) {
  return Boolean(a && b) && a.toLowerCase() === b.toLowerCase()
}
