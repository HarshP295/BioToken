# ai/src/prover.py
# ─────────────────────────────────────────────────────────────────
# BioToken — ZK Proof Generator
#
# Generates real Groth16 proofs via the snarkjs CLI.
# This is the server-side fallback path. The primary proof
# generation happens client-side in the browser via snarkjs.
#
# Requires: Node.js + snarkjs installed globally or in PATH
# ─────────────────────────────────────────────────────────────────

import subprocess
import json
import os
import tempfile
from pathlib import Path

# Path to compiled circuit artifacts
CIRCUIT_DIR = Path(__file__).parent.parent.parent / "circuits" / "build"


def generate_proof(peaks: list[int], threshold: int = 10) -> dict:
    """
    Generate a real Groth16 proof via the snarkjs CLI.

    Parameters
    ----------
    peaks : list[int]
        10 integer peak values (circuit's private witness).
    threshold : int
        Tolerance value (circuit's public input).

    Returns
    -------
    dict
        {
            "proof": { "pi_a": [...], "pi_b": [...], "pi_c": [...], ... },
            "publicSignals": ["1", "10"]  # [valid, threshold]
        }

    Raises
    ------
    RuntimeError
        If snarkjs or Node.js is not available, or if proof
        generation fails (e.g. witness doesn't satisfy constraints).
    """
    wasm_path = CIRCUIT_DIR / "fingerprint.wasm"
    zkey_path = CIRCUIT_DIR / "fingerprint_final.zkey"

    # Validate circuit artifacts exist
    if not wasm_path.exists():
        raise RuntimeError(
            f"Circuit WASM not found at {wasm_path}. "
            "Run the circuit build first."
        )
    if not zkey_path.exists():
        raise RuntimeError(
            f"Circuit zkey not found at {zkey_path}. "
            "Run the trusted setup first."
        )

    with tempfile.TemporaryDirectory() as tmp:
        input_path = os.path.join(tmp, "input.json")
        witness_path = os.path.join(tmp, "witness.wtns")
        proof_path = os.path.join(tmp, "proof.json")
        public_path = os.path.join(tmp, "public.json")

        # ── Write circuit input ──────────────────────────────────
        circuit_input = {
            "peaks": [str(p) for p in peaks],
            "threshold": str(threshold),
        }
        with open(input_path, "w") as f:
            json.dump(circuit_input, f)

        # ── Generate witness ─────────────────────────────────────
        generate_witness_js = CIRCUIT_DIR / "generate_witness.js"
        if generate_witness_js.exists():
            # Use the project's witness generator if available
            result = subprocess.run(
                [
                    "node",
                    str(generate_witness_js),
                    str(wasm_path),
                    input_path,
                    witness_path,
                ],
                capture_output=True,
                text=True,
            )
        else:
            # Fall back to snarkjs wtns calculate
            result = subprocess.run(
                [
                    "snarkjs",
                    "wtns",
                    "calculate",
                    str(wasm_path),
                    input_path,
                    witness_path,
                ],
                capture_output=True,
                text=True,
            )

        if result.returncode != 0:
            raise RuntimeError(
                f"Witness generation failed:\n{result.stderr}"
            )

        # ── Generate Groth16 proof ───────────────────────────────
        result = subprocess.run(
            [
                "snarkjs",
                "groth16",
                "prove",
                str(zkey_path),
                witness_path,
                proof_path,
                public_path,
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"Proof generation failed:\n{result.stderr}"
            )

        # ── Read outputs ─────────────────────────────────────────
        with open(proof_path) as f:
            proof = json.load(f)
        with open(public_path) as f:
            public_signals = json.load(f)

    return {"proof": proof, "publicSignals": public_signals}
