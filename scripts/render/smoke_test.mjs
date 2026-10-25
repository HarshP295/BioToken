// scripts/render/smoke_test.mjs
// Post-deploy checks for the Render services (or any deployment of them).
//
//   node scripts/render/smoke_test.mjs --api https://biotoken-api.onrender.com --web https://biotoken-web.onrender.com
//   (or set API_URL / WEB_URL; `npm run smoke -- --api … --web …` from the repo root)
//
// Read-only: no transactions, no database writes. Exits 1 if any check fails.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ethers } from 'ethers'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const deployment = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployments', 'amoy.json'), 'utf8'))

function arg(name, envName) {
  const i = process.argv.indexOf(`--${name}`)
  const value = (i > 0 ? process.argv[i + 1] : process.env[envName]) || ''
  return value.replace(/\/+$/, '')
}
const API = arg('api', 'API_URL')
const WEB = arg('web', 'WEB_URL')
if (!API || !WEB) {
  console.error('Usage: node scripts/render/smoke_test.mjs --api <AI service URL> --web <web app URL>')
  process.exit(2)
}

// A molecule from the RT predictor's held-out split at its measured SMRT RT (samples/hplc).
const SMILES = 'c1ccc(-c2oncc2CN2CCN(c3ccccn3)CC2)cc1'
const OBSERVED_RT = 603.4

let failed = 0
async function check(name, fn) {
  try {
    const detail = await fn()
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (err) {
    failed++
    console.log(`✗ ${name} — ${err.message}`)
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }

async function get(url, init) {
  const res = await fetch(url, { redirect: 'follow', ...init })
  return res
}

console.log(`AI service: ${API}\nWeb app:    ${WEB}\nContract:   ${deployment.BioToken.address} (deployments/amoy.json)\n`)

let health
await check('API /health', async () => {
  const res = await get(`${API}/health`)
  assert(res.ok, `HTTP ${res.status}`)
  health = await res.json()
  assert(health.models_loaded, 'models not loaded')
  assert(health.ai_oracle, 'AI_ORACLE_PRIVATE_KEY not set')
  assert(health.contract?.toLowerCase() === deployment.BioToken.address.toLowerCase(),
    `API uses ${health.contract}, deployment file says ${deployment.BioToken.address}`)
  return `models loaded, oracle ${health.ai_oracle}`
})

await check('API /health/ready (chain, roles, MongoDB)', async () => {
  const res = await get(`${API}/health/ready`)
  const body = await res.json()
  const bad = Object.entries(body.checks).filter(([, c]) => !c.ok)
  assert(body.ready, bad.map(([k, c]) => `${k}: ${c.detail}`).join('; '))
  return Object.keys(body.checks).join(', ')
})

await check('CORS allows the web app', async () => {
  const origin = new URL(WEB).origin
  const res = await get(`${API}/verify`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  })
  const allowed = res.headers.get('access-control-allow-origin')
  assert(allowed === origin || allowed === '*', `allow-origin is ${allowed ?? 'missing'} for ${origin}`)
  return `allow-origin ${allowed}`
})

await check('AI verdict is GENUINE and signed by the on-chain oracle', async () => {
  const res = await get(`${API}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      smiles: SMILES, observed_rt: OBSERVED_RT, token_id: 0,
      chain_id: deployment.chainId, contract_address: deployment.BioToken.address,
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const v = await res.json()
  assert(v.genuine && v.attestation, `verdict ${v.result}, attestation ${v.attestation}`)
  const digest = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ['string', 'uint256', 'address', 'uint256', 'bytes32'],
    ['BioToken AI verdict: GENUINE', deployment.chainId, deployment.BioToken.address, 0, ethers.id(SMILES)],
  ))
  const signer = ethers.verifyMessage(ethers.getBytes(digest), v.attestation)
  assert(signer === deployment.aiOracle, `signed by ${signer}, contract trusts ${deployment.aiOracle}`)
  return `p(anomaly) ${v.anomaly_prob.toFixed(4)}, signer ${signer}`
})

let indexHtml = ''
await check('Web app index.html', async () => {
  const res = await get(`${WEB}/`)
  assert(res.ok, `HTTP ${res.status}`)
  indexHtml = await res.text()
  assert(indexHtml.includes('id="root"'), 'no #root element')
})

await check('Single-page routes are served (/lab, /details)', async () => {
  for (const route of ['/lab', '/details?id=0', '/mint']) {
    const res = await get(`${WEB}${route}`)
    assert(res.ok, `${route}: HTTP ${res.status}`)
    assert((await res.text()).includes('id="root"'), `${route}: not the app`)
  }
})

await check('Bundle points at the deployed contract and this AI service', async () => {
  // Entry scripts and <link rel="modulepreload"> chunks from index.html.
  const entries = [...indexHtml.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(m => new URL(m[1], `${WEB}/`).href)
  assert(entries.length, 'no script tags in index.html')

  // Config can sit in a lazily loaded chunk, so crawl the chunk graph. Vite writes
  // imports as "./chunk.js" (relative to the importing chunk) and its preload
  // lists as "assets/chunk.js" (relative to the site root).
  const address = deployment.BioToken.address.toLowerCase()
  const apiHost = new URL(API).host
  const queue = [...new Set(entries)]
  const seen = new Set(queue)
  let foundAddress = false
  let foundApi = false
  let bytes = 0
  while (queue.length && !(foundAddress && foundApi) && seen.size <= 500 && bytes < 60_000_000) {
    const url = queue.shift()
    const res = await get(url)
    if (!res.ok) continue
    const code = await res.text()
    bytes += code.length
    foundAddress ||= code.toLowerCase().includes(address)
    foundApi ||= code.includes(apiHost)
    for (const m of code.matchAll(/["'`]((?:\.{1,2}\/|\/?assets\/)[^"'`\s]+?\.js)["'`]/g)) {
      const next = m[1].startsWith('.') ? new URL(m[1], url).href : new URL(m[1].replace(/^\//, ''), `${WEB}/`).href
      if (!seen.has(next)) { seen.add(next); queue.push(next) }
    }
  }
  assert(foundAddress, `contract address not found in bundle (${seen.size} chunks checked)`)
  assert(foundApi, `AI service host ${apiHost} not found in bundle (VITE_AI_API_HOST / VITE_AI_API_URL)`)
  return `contract and ${apiHost} present`
})

for (const [file, key] of [['fingerprint.wasm', 'fingerprint.wasm'], ['fingerprint_final.zkey', 'fingerprint_final.zkey']]) {
  await check(`Circuit file /${file} matches the deployed verifier`, async () => {
    const res = await get(`${WEB}/${file}`)
    assert(res.ok, `HTTP ${res.status}`)
    const sha = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex')
    assert(sha === deployment.circuit[key], `sha256 ${sha.slice(0, 12)}… ≠ ${deployment.circuit[key].slice(0, 12)}…`)
    return `sha256 ${sha.slice(0, 12)}…`
  })
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
