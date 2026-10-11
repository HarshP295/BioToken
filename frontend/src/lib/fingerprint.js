/**
 * fingerprint.js — Gold Standard commitment and ZK circuit inputs.
 *
 * Shared by the Mint page, the Lab Dashboard, scripts/integrate.js, the
 * Hardhat tests and scripts/e2e_amoy.mjs, so all of them build exactly the
 * inputs circuits/fingerprint.circom expects:
 *
 *   private  labPeaks[10], goldPeaks[10], salt
 *   public   commitment = Poseidon(goldPeaks[0..9], salt), tolerance, tokenId
 *
 * No React or wallet imports, so it also runs under plain Node.
 */

export const N_PEAKS = 10
export const MAX_PEAK = 255
export const DEFAULT_TOLERANCE = 10
export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n
export const GOLD_PACKAGE_TYPE = 'biotoken-gold-standard'

let poseidonPromise = null
function getPoseidon() {
  if (!poseidonPromise) {
    poseidonPromise = import('circomlibjs').then(({ buildPoseidon }) => buildPoseidon())
  }
  return poseidonPromise
}

/** 31 random bytes, so the salt is always below the BN254 field size. */
export function randomSalt() {
  const bytes = new Uint8Array(31)
  globalThis.crypto.getRandomValues(bytes)
  return BigInt('0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''))
}

export function toPeakArray(peaks) {
  const values = peaks.map(Number)
  if (values.length !== N_PEAKS || values.some(v => !Number.isInteger(v) || v < 0 || v > MAX_PEAK)) {
    throw new Error(`Expected ${N_PEAKS} integer peaks between 0 and ${MAX_PEAK}`)
  }
  return values
}

/** Poseidon(goldPeaks, salt) as a bigint field element. */
export async function computeCommitment(goldPeaks, salt) {
  const poseidon = await getPoseidon()
  const hash = poseidon([...toPeakArray(goldPeaks).map(BigInt), BigInt(salt)])
  return BigInt(poseidon.F.toString(hash))
}

export function toBytes32(value) {
  return '0x' + BigInt(value).toString(16).padStart(64, '0')
}

/**
 * The file the manufacturer hands to the receiving lab off-chain. It holds
 * the secret Gold Standard; only its commitment goes on-chain.
 */
export function buildGoldPackage({ tokenId, batchId, reagentSmiles, peaks, salt, tolerance, commitment, contract, chainId }) {
  return {
    type: GOLD_PACKAGE_TYPE,
    version: 1,
    tokenId: tokenId == null ? null : String(tokenId),
    batchId,
    reagentSmiles,
    contract,
    chainId,
    peaks: toPeakArray(peaks),
    salt: String(salt),
    tolerance: Number(tolerance),
    commitment: toBytes32(commitment),
  }
}

/** Parse and sanity-check a Gold Standard package (object or JSON text). */
export async function parseGoldPackage(input) {
  const pkg = typeof input === 'string' ? JSON.parse(input) : input
  if (pkg?.type !== GOLD_PACKAGE_TYPE) throw new Error('Not a BioToken Gold Standard package')
  const peaks = toPeakArray(pkg.peaks)
  const recomputed = await computeCommitment(peaks, pkg.salt)
  if (toBytes32(recomputed) !== String(pkg.commitment).toLowerCase()) {
    throw new Error('Gold Standard package is corrupted: peaks and salt do not match its commitment')
  }
  return { ...pkg, peaks, salt: BigInt(pkg.salt), tolerance: Number(pkg.tolerance) }
}

/** Per-peak comparison, mirroring the circuit's WithinTolerance checks. */
export function compareToGold(labPeaks, goldPeaks, tolerance) {
  const lab = toPeakArray(labPeaks)
  const gold = toPeakArray(goldPeaks)
  const perPeak = lab.map((value, index) => {
    const delta = Math.abs(value - gold[index])
    return { index, lab: value, gold: gold[index], delta, ok: delta <= tolerance }
  })
  return { passed: perPeak.every(p => p.ok), perPeak, tolerance }
}

/** Circuit input object for snarkjs.groth16.fullProve. */
export function buildCircuitInput({ labPeaks, goldPeaks, salt, commitment, tolerance, tokenId }) {
  return {
    labPeaks: toPeakArray(labPeaks).map(String),
    goldPeaks: toPeakArray(goldPeaks).map(String),
    salt: BigInt(salt).toString(),
    commitment: BigInt(commitment).toString(),
    tolerance: String(tolerance),
    tokenId: BigInt(tokenId).toString(),
  }
}

/** snarkjs proof → BioToken.verifyProof(a, b, c) arguments (G2 coordinates swapped). */
export function formatProofForContract(proof) {
  const f = x => BigInt(x)
  return {
    a: [f(proof.pi_a[0]), f(proof.pi_a[1])],
    b: [
      [f(proof.pi_b[0][1]), f(proof.pi_b[0][0])],
      [f(proof.pi_b[1][1]), f(proof.pi_b[1][0])],
    ],
    c: [f(proof.pi_c[0]), f(proof.pi_c[1])],
  }
}
