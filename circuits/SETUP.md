# FingerprintMatch circuit: build and trusted setup

Built on 2026-10-11 from [fingerprint.circom](fingerprint.circom). Deployed verifier: Polygon Amoy `0xA44699310aE4599cF43C1dBe68B227f3cb4E16DA`.

## What the circuit proves

Private: `labPeaks[10]`, `goldPeaks[10]`, `salt`. Public, in this order: `commitment`, `tolerance`, `tokenId`.

- every peak and the tolerance are 8-bit integers (`Num2Bits(8)`),
- `Poseidon(goldPeaks[0..9], salt) == commitment`,
- `|labPeaks[i] − goldPeaks[i]| ≤ tolerance` for every i (two `LessEqThan(10)` checks per peak),
- `tokenId` is bound into the R1CS.

There is no output signal. A non-matching scan has no witness, so no proof exists. BioToken passes the commitment, tolerance and token id from its own storage.

Size: 1,939 constraints (857 non-linear), 1,902 wires, 21 private inputs, 3 public inputs.

## Steps (as run)

```bash
# compiler: circom 2.2.3 (github.com/iden3/circom/releases/tag/v2.2.3)
#   circom-windows-amd64.exe sha256 e43f132ee6f0aa79b705beceb59c2a7e6a54d7bdeab917ca34e9fc1951d185e1
circuits/circom.exe circuits/fingerprint.circom --r1cs --wasm --sym -o circuits/build -l node_modules

# phase 1: PSE Perpetual Powers of Tau, contribution 80, 2^12
curl -L -o circuits/build/ppot_0080_12.ptau \
  https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_12.ptau

# phase 2 (circuit-specific)
cd circuits/build
npx snarkjs groth16 setup fingerprint.r1cs ppot_0080_12.ptau fp_0000.zkey
npx snarkjs zkey contribute fp_0000.zkey fp_0001.zkey --name="BioToken phase2 #1" -e="<64 random bytes>"
npx snarkjs zkey beacon fp_0001.zkey fingerprint_final.zkey \
  4fc7d818da4600ddb57946f68b954af12943fb62427153d4f3fb3db88dc4ba6b 10 -n="BioToken final beacon"
npx snarkjs zkey verify fingerprint.r1cs ppot_0080_12.ptau fingerprint_final.zkey   # ZKey Ok!
npx snarkjs zkey export verificationkey fingerprint_final.zkey verification_key.json
npx snarkjs zkey export solidityverifier fingerprint_final.zkey ../../contracts/HplcVerifier.sol
# then rename `contract Groth16Verifier` to `contract HplcVerifier`
# and copy fingerprint.wasm, fingerprint_final.zkey, verification_key.json to frontend/public/
```

## Hashes (sha256)

| File | sha256 |
|---|---|
| `ppot_0080_12.ptau` | `35e163120e724a60853d0dd76ec54037f7c7b00584392255f71a4341d5a05c50` |
| `fingerprint.r1cs` | `7d01c68b73a173b0389a59678375c5c18d3a197f27e46a748c6a7c055b72b615` |
| `fingerprint_js/fingerprint.wasm` | `af36a77669a3c486880777cdfe7b88a91b967b37c21051de5dfb03306aba5bd0` |
| `fingerprint_final.zkey` | `88fa3d1e0facad1a2716d512582e07535dc20dadb32ca5518a1d33b95d52c2fa` |
| `verification_key.json` | `3288fa1762cf8bfeced474a0616ee65957038a36462be70b530987848da01f41` |

`deployments/amoy.json` records the same hashes for the artifacts the deployed verifier matches.

## Trust note

Phase 1 comes from a public ceremony with many contributors. Phase 2 has one random contribution plus a beacon, made on a single machine. That is fine for a testnet. For production, run a multi-party phase 2 (several independent `zkey contribute` rounds) and publish the transcript, because a single phase-2 contributor who kept their randomness could forge proofs.
