pragma circom 2.0.0;

/*
 * ReagentFingerprint Circuit
 *
 * Proves knowledge of an 8-element fingerprint array whose
 * Poseidon hash equals the public vkCommitment.
 *
 * Private inputs: fingerprint[8]  (HPLC peak values as field elements)
 * Public  inputs: vkCommitment    (Poseidon hash of the fingerprint)
 *
 * This proves "I know the fingerprint that hashes to this commitment"
 * without revealing the raw fingerprint data.
 */

include "node_modules/circomlib/circuits/poseidon.circom";

template ReagentFingerprint() {
    signal private input fingerprint[8];
    signal input vkCommitment;

    component hasher = Poseidon(8);
    for (var i = 0; i < 8; i++) {
        hasher.inputs[i] <== fingerprint[i];
    }
    hasher.out === vkCommitment;
}

component main = ReagentFingerprint();
