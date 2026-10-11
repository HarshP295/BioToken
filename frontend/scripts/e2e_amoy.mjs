// frontend/scripts/e2e_amoy.mjs
// ─────────────────────────────────────────────────────────────────
//  End-to-end run on Polygon Amoy through the web app's code path:
//  Pimlico SimpleSmartAccounts + sponsored UserOperations (as in
//  src/lib/pimlico.js), the browser's HPLC parser / fingerprint modules,
//  the circuit files served from public/, signed role registration with
//  admin approval, and the AI oracle. The only substitution: fresh local
//  keys play the Privy wallets of one manufacturer and one lab.
//
//  Needs: the AI service running (cd ai && uvicorn api:app --port 8000)
//  with the deployed contract in .env, MongoDB reachable, ADMIN_API_TOKEN.
//
//    cd frontend && node scripts/e2e_amoy.mjs
//
//  Batch A (genuine scan) goes MINTED → … → CONSUMED.
//  Batch B (tampered scan) is shipped and received, passes the AI check,
//  and then cannot be verified: no proof exists, a replayed proof and a
//  forged AI signature are rejected by the contract.
//  Writes ../docs/evidence/amoy-e2e-<timestamp>.json.
// ─────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as snarkjs from 'snarkjs'
import {
  createPublicClient, decodeEventLog, encodeFunctionData, http, BaseError, ContractFunctionRevertedError,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { polygonAmoy } from 'viem/chains'
import { entryPoint07Address } from 'viem/account-abstraction'
import { createSmartAccountClient } from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { parseHplcFile } from '../src/lib/hplcParser.js'
import { validateConsensus } from '../src/lib/consensusValidator.js'
import {
  buildCircuitInput, buildGoldPackage, compareToGold, computeCommitment, formatProofForContract,
  parseGoldPackage, randomSalt, toBytes32, DEFAULT_TOLERANCE,
} from '../src/lib/fingerprint.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.join(HERE, '..')
const ROOT = path.join(FRONTEND, '..')

function readEnv(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
}
const env = { ...readEnv(path.join(ROOT, '.env')), ...readEnv(path.join(FRONTEND, '.env')), ...process.env }

const deployment = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployments', 'amoy.json'), 'utf8'))
const CONTRACT = deployment.BioToken.address
const ABI = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', 'contracts', 'BioToken.sol', 'BioToken.json'), 'utf8')).abi
const AI_URL = env.AI_API_URL || 'http://127.0.0.1:8000'
const RPC = env.VITE_AMOY_RPC_URL || 'https://polygon-amoy.drpc.org'
const PIMLICO_RPC = `https://api.pimlico.io/v2/80002/rpc?apikey=${env.VITE_PIMLICO_API_KEY}`
const WASM = path.join(FRONTEND, 'public', 'fingerprint.wasm')
const ZKEY = path.join(FRONTEND, 'public', 'fingerprint_final.zkey')
const STATUS = ['MINTED', 'IN_TRANSIT', 'RECEIVED', 'VERIFIED', 'CONSUMED']
const EXPLORER = 'https://amoy.polygonscan.com/tx/'

const SAMPLES = path.join(ROOT, 'samples', 'hplc')
const BATCH_A = {
  batchId: `E2E-SMRT-53193463-${Date.now()}`, smiles: 'c1ccc(-c2oncc2CN2CCN(c3ccccn3)CC2)cc1',
  gold: 'manufacturer/BATCH-SMRT-53193463_gold_standard.csv', lab: 'lab/BATCH-SMRT-53193463_lab_scan_genuine.csv', rt: 603.4,
}
const BATCH_B = {
  batchId: `E2E-CAF-TAMPERED-${Date.now()}`, smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C',
  gold: 'manufacturer/BATCH-CAF-001_gold_standard.csv', lab: 'lab/BATCH-CAF-001_lab_scan_tampered.csv', rt: 636.2,
}

const report = { network: 'amoy', contract: CONTRACT, verifier: deployment.HplcVerifier.address, startedAt: new Date().toISOString(), steps: [] }
const log = (step, detail = {}) => {
  report.steps.push({ step, ...detail })
  const tx = detail.tx ? `  ${EXPLORER}${detail.tx}` : ''
  console.log(`✓ ${step}${detail.info ? ` — ${detail.info}` : ''}${tx}`)
}

const publicClient = createPublicClient({ chain: polygonAmoy, transport: http(RPC) })
const pimlico = createPimlicoClient({ transport: http(PIMLICO_RPC), entryPoint: { address: entryPoint07Address, version: '0.7' } })

async function makeActor(name) {
  const owner = privateKeyToAccount(generatePrivateKey())
  const account = await toSimpleSmartAccount({ client: publicClient, owner, entryPoint: { address: entryPoint07Address, version: '0.7' } })
  const client = createSmartAccountClient({
    account, chain: polygonAmoy, bundlerTransport: http(PIMLICO_RPC), paymaster: pimlico,
    paymasterContext: { sponsorshipPolicyId: env.VITE_PIMLICO_POLICY_ID },
    userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast },
  })
  console.log(`  ${name}: owner ${owner.address}, smart account ${account.address}`)
  return { name, owner, account, client }
}

async function send(actor, functionName, args) {
  const hash = await actor.client.sendUserOperation({
    calls: [{ to: CONTRACT, data: encodeFunctionData({ abi: ABI, functionName, args }), value: 0n }],
  })
  const receipt = await actor.client.waitForUserOperationReceipt({ hash, timeout: 180_000 })
  if (!receipt.success) throw new Error(`${functionName} reverted: ${receipt.receipt.transactionHash}`)
  return receipt
}

async function expectRevert(label, from, functionName, args, errorName) {
  try {
    await publicClient.simulateContract({ address: CONTRACT, abi: ABI, functionName, args, account: from })
  } catch (err) {
    const revert = err instanceof BaseError && err.walk(e => e instanceof ContractFunctionRevertedError)
    const got = revert?.data?.errorName ?? revert?.reason ?? err.shortMessage
    if (got === errorName) return log(label, { info: `reverts with ${got}` })
    throw new Error(`${label}: expected ${errorName}, got ${got}`)
  }
  throw new Error(`${label}: expected a revert, call succeeded`)
}

const read = (functionName, args) => publicClient.readContract({ address: CONTRACT, abi: ABI, functionName, args })

async function peaksOf(rel) {
  const file = path.join(SAMPLES, rel)
  const text = fs.readFileSync(file, 'utf8')
  return (await parseHplcFile({ name: path.basename(file), text: async () => text })).peaks.map(Number)
}

async function api(route, { method = 'POST', body, headers = {} } = {}) {
  const res = await fetch(`${AI_URL}${route}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${route} → HTTP ${res.status}: ${json.detail ?? JSON.stringify(json)}`)
  return { status: res.status, ...json }
}

// Same message the web app asks the wallet to sign (src/hooks/useRole.js).
function registrationMessage(role, wallet, holder, issuedAt) {
  return ['BioToken role registration', `Role: ${role}`, `Wallet: ${wallet}`, `Role holder: ${holder}`, `Issued at: ${issuedAt}`].join('\n')
}

async function registerAndApprove(actor, role) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const message = registrationMessage(role, actor.owner.address, actor.account.address, issuedAt)
  const signature = await actor.owner.signMessage({ message })
  const reg = await api('/register-role', { body: {
    wallet_address: actor.owner.address, role, smart_account_address: actor.account.address, issued_at: issuedAt, signature,
  } })
  if (reg.status !== 202 || !reg.pending) throw new Error(`expected a pending registration, got ${JSON.stringify(reg)}`)
  const approved = await api(`/admin/approve-role/${actor.owner.address}`, { headers: { 'X-Admin-Token': env.ADMIN_API_TOKEN } })
  const roleHash = await read(`${role.toUpperCase()}_ROLE`, [])
  if (!(await read('hasRole', [roleHash, actor.account.address]))) throw new Error(`${role} role not on-chain`)
  log(`${actor.name}: signed registration → admin approval → ${role.toUpperCase()}_ROLE on smart account`, { tx: approved.tx_hash })
}

async function mint(manufacturer, batch) {
  const gold = await peaksOf(batch.gold)
  const consensus = validateConsensus(gold)
  if (!consensus.passed) throw new Error('consensus failed')
  const salt = randomSalt()
  const commitment = await computeCommitment(gold, salt)
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 86400)
  const receipt = await send(manufacturer, 'mintToken', [batch.batchId, batch.smiles, expiry, toBytes32(commitment), DEFAULT_TOLERANCE, '0x'])
  const minted = receipt.logs
    .filter(l => l.address.toLowerCase() === CONTRACT.toLowerCase())
    .map(l => { try { return decodeEventLog({ abi: ABI, data: l.data, topics: l.topics }) } catch { return null } })
    .find(e => e?.eventName === 'TokenMinted')
  const tokenId = minted.args.tokenId
  const goldPackage = buildGoldPackage({
    tokenId, batchId: batch.batchId, reagentSmiles: batch.smiles, peaks: gold, salt,
    tolerance: DEFAULT_TOLERANCE, commitment, contract: CONTRACT, chainId: 80002,
  })
  log(`Mint ${batch.batchId} (consensus PASS) → token #${tokenId}`, { tx: receipt.receipt.transactionHash, info: `commitment ${goldPackage.commitment.slice(0, 14)}…` })
  // The package travels to the lab as a JSON file; round-trip it the same way.
  return { tokenId, goldPackage: await parseGoldPackage(JSON.stringify(goldPackage)) }
}

async function shipAndReceive(manufacturer, lab, tokenId) {
  let r = await send(manufacturer, 'transferCustody', [tokenId, lab.account.address])
  log(`Ship token #${tokenId} to lab smart account`, { tx: r.receipt.transactionHash })
  r = await send(lab, 'confirmReceipt', [tokenId])
  log(`Lab confirms receipt of token #${tokenId}`, { tx: r.receipt.transactionHash })
}

async function aiCheck(tokenId, rt) {
  const data = await read('getTokenData', [tokenId])
  const ai = await api('/verify', { body: {
    smiles: data.reagentSmiles, observed_rt: rt, token_id: Number(tokenId), chain_id: 80002, contract_address: CONTRACT,
  } })
  log(`AI pre-screen token #${tokenId}: ${ai.result}`, {
    info: `RT ${rt} s vs predicted ${ai.predicted_rt.toFixed(1)} s, p(anomaly)=${ai.anomaly_prob.toFixed(4)}, signed=${!!ai.attestation}`,
  })
  return { ai, data }
}

async function prove(tokenId, data, goldPackage, labPeaks) {
  const input = buildCircuitInput({
    labPeaks, goldPeaks: goldPackage.peaks, salt: goldPackage.salt,
    commitment: data.fingerprintCommitment, tolerance: data.tolerance, tokenId,
  })
  const t0 = Date.now()
  const { proof } = await snarkjs.groth16.fullProve(input, new Uint8Array(fs.readFileSync(WASM)), new Uint8Array(fs.readFileSync(ZKEY)))
  return { ...formatProofForContract(proof), ms: Date.now() - t0 }
}

async function main() {
  for (const key of ['VITE_PIMLICO_API_KEY', 'VITE_PIMLICO_POLICY_ID', 'ADMIN_API_TOKEN']) {
    if (!env[key]) throw new Error(`${key} is not set`)
  }
  const health = await api('/health', { method: 'GET' })
  if (health.contract?.toLowerCase() !== CONTRACT.toLowerCase()) throw new Error(`AI service points at ${health.contract}, deployment is ${CONTRACT}; restart it`)
  console.log(`BioToken ${CONTRACT} on Amoy, AI oracle ${health.ai_oracle}\n`)

  console.log('── Actors (fresh keys standing in for Privy wallets) ──')
  const manufacturer = await makeActor('Manufacturer')
  const lab = await makeActor('Lab')
  report.actors = Object.fromEntries([manufacturer, lab].map(a => [a.name, { owner: a.owner.address, smartAccount: a.account.address }]))

  console.log('\n── Role registration ──')
  await registerAndApprove(manufacturer, 'manufacturer')
  await registerAndApprove(lab, 'lab')

  console.log('\n── Batch A: genuine scan ──')
  const A = await mint(manufacturer, BATCH_A)
  await shipAndReceive(manufacturer, lab, A.tokenId)
  const { ai: aiA, data: dataA } = await aiCheck(A.tokenId, BATCH_A.rt)
  if (!aiA.genuine) throw new Error('batch A should be GENUINE')
  const labA = await peaksOf(BATCH_A.lab)
  const cmpA = compareToGold(labA, A.goldPackage.peaks, dataA.tolerance)
  const proofA = await prove(A.tokenId, dataA, A.goldPackage, labA)
  log(`ZK proof for token #${A.tokenId}`, { info: `max |lab−gold| ${Math.max(...cmpA.perPeak.map(p => p.delta))} ≤ ${dataA.tolerance}, ${proofA.ms} ms` })
  let r = await send(lab, 'verifyProof', [A.tokenId, proofA.a, proofA.b, proofA.c, aiA.attestation])
  log(`verifyProof token #${A.tokenId} → ${STATUS[(await read('getTokenData', [A.tokenId])).status]}`, { tx: r.receipt.transactionHash })
  r = await send(lab, 'consumeToken', [A.tokenId])
  log(`consumeToken token #${A.tokenId} → ${STATUS[(await read('getTokenData', [A.tokenId])).status]}`, { tx: r.receipt.transactionHash })

  console.log('\n── Batch B: tampered scan ──')
  const B = await mint(manufacturer, BATCH_B)
  await shipAndReceive(manufacturer, lab, B.tokenId)
  const { ai: aiB, data: dataB } = await aiCheck(B.tokenId, BATCH_B.rt)
  const labB = await peaksOf(BATCH_B.lab)
  const cmpB = compareToGold(labB, B.goldPackage.peaks, dataB.tolerance)
  let proved = true
  try { await prove(B.tokenId, dataB, B.goldPackage, labB) } catch { proved = false }
  if (proved || cmpB.passed) throw new Error('tampered scan must not be provable')
  log(`No ZK proof exists for token #${B.tokenId}`, { info: `max |lab−gold| ${Math.max(...cmpB.perPeak.map(p => p.delta))} > ${dataB.tolerance}` })
  await expectRevert(`Replaying token #${A.tokenId}'s proof on token #${B.tokenId}`, lab.account.address,
    'verifyProof', [B.tokenId, proofA.a, proofA.b, proofA.c, aiB.attestation], 'ZKProofInvalid')
  const forged = await lab.owner.signMessage({ message: { raw: await read('aiVerdictDigest', [B.tokenId]) } })
  await expectRevert(`AI verdict signed by the lab instead of the oracle (token #${B.tokenId})`, lab.account.address,
    'verifyProof', [B.tokenId, proofA.a, proofA.b, proofA.c, forged], 'AiAttestationInvalid')
  await expectRevert('Manufacturer tries to confirm the lab\'s receipt', manufacturer.account.address,
    'confirmReceipt', [B.tokenId], 'AccessControlUnauthorizedAccount')
  await expectRevert('Lab tries a plain ERC-721 transfer', lab.account.address,
    'transferFrom', [lab.account.address, manufacturer.account.address, B.tokenId], 'TransferNotAllowed')
  await expectRevert('Lab tries to consume the unverified batch', lab.account.address, 'consumeToken', [B.tokenId], 'InvalidStatusTransition')
  log(`Token #${B.tokenId} stays ${STATUS[(await read('getTokenData', [B.tokenId])).status]}`)

  report.finishedAt = new Date().toISOString()
  report.result = 'PASS'
  const out = path.join(ROOT, 'docs', 'evidence', `amoy-e2e-${report.startedAt.replace(/[:.]/g, '-')}.json`)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(report, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n')
  console.log(`\nAll steps passed. Report: ${path.relative(ROOT, out)}`)
}

main().then(() => process.exit(0)).catch(err => {
  console.error('\n✗ E2E failed:', err.shortMessage || err.message)
  process.exit(1)
})
