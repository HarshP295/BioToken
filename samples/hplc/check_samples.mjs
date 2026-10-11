// Checks the sample files exactly as the web app processes them:
//   manufacturer: parseHplcFile → consensus → Poseidon commitment
//   lab:          parseHplcFile → compare with the batch's Gold Standard →
//                 Groth16 proof (must exist only when a match is expected)
//
//   node samples/hplc/check_samples.mjs
//
// The AI verdict for each lab sample is covered by ai/tests/test_samples.py.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as snarkjs from 'snarkjs'
import { parseHplcFile } from '../../frontend/src/lib/hplcParser.js'
import { validateConsensus } from '../../frontend/src/lib/consensusValidator.js'
import {
  buildCircuitInput, compareToGold, computeCommitment, randomSalt,
} from '../../frontend/src/lib/fingerprint.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BUILD = path.join(HERE, '..', '..', 'circuits', 'build')
const WASM = path.join(BUILD, 'fingerprint_js', 'fingerprint.wasm')
const ZKEY = path.join(BUILD, 'fingerprint_final.zkey')
const manifest = JSON.parse(await readFile(path.join(HERE, 'manifest.json'), 'utf8'))
const vkey = JSON.parse(await readFile(path.join(BUILD, 'verification_key.json'), 'utf8'))

async function peaksOf(relPath) {
  const filePath = path.join(HERE, relPath)
  const text = await readFile(filePath, 'utf8')
  return (await parseHplcFile({ name: path.basename(filePath), text: async () => text })).peaks.map(Number)
}

let failures = 0
const report = (ok, file, outcome, expected) => {
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${file}\n     ${outcome}\n     expected: ${expected}`)
}

console.log('── Manufacturer (Mint page) ──')
for (const sample of manifest.manufacturer) {
  const peaks = await peaksOf(sample.file)
  const consensus = validateConsensus(peaks)
  let outcome = `peaks=[${peaks}] consensus=${consensus.passed ? 'PASS' : 'FAIL'}`
  if (consensus.passed) outcome += ` commitment=0x${(await computeCommitment(peaks, randomSalt())).toString(16).slice(0, 12)}…`
  report(consensus.passed === sample.expected.startsWith('consensus PASS'), sample.file, outcome, sample.expected)
}

console.log('\n── Lab (Lab Dashboard) ──')
for (const sample of manifest.lab) {
  const lab = await peaksOf(sample.file)
  const gold = await peaksOf(sample.gold_file)
  const cmp = compareToGold(lab, gold, manifest.tolerance)
  const salt = randomSalt()
  const commitment = await computeCommitment(gold, salt)
  const input = buildCircuitInput({ labPeaks: lab, goldPeaks: gold, salt, commitment, tolerance: manifest.tolerance, tokenId: 0 })

  let proved = false, verifies = false
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY)
    proved = true
    verifies = await snarkjs.groth16.verify(vkey, publicSignals, proof)
  } catch { /* no witness: fingerprint does not match */ }

  const maxDelta = Math.max(...cmp.perPeak.map(p => p.delta))
  const outcome = `lab=[${lab}] max |lab-gold|=${maxDelta} match=${cmp.passed} proof=${proved ? (verifies ? 'verifies' : 'INVALID') : 'impossible'}`
  const ok = cmp.passed === sample.expected_match && proved === sample.expected_match && (!proved || verifies)
  report(ok, sample.file, outcome, `match=${sample.expected_match}, AI ${sample.expected_ai}`)
}

console.log(failures ? `\n${failures} sample(s) did not behave as expected` : '\nAll samples behave as expected')
process.exit(failures ? 1 : 0)
