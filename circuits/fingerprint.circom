pragma circom 2.1.6;

/*
 * BioToken Fingerprint Circuit (n = 10 peaks)
 *
 * Proves that the lab's measured HPLC peaks match the manufacturer's
 * Gold Standard peaks, peak by peak, within `tolerance`, where the Gold
 * Standard is the one committed on-chain at mint. Neither peak set is
 * revealed.
 *
 * Private inputs: labPeaks[10], goldPeaks[10], salt
 * Public inputs : commitment = Poseidon(goldPeaks[0..9], salt)  (stored at mint)
 *                 tolerance                                     (stored at mint)
 *                 tokenId                                       (binds the proof to one token)
 *
 * There is no `valid` output: a non-matching batch has no satisfying
 * witness, so no proof can be produced for it. BioToken supplies all three
 * public inputs from its own storage, so the prover cannot choose them.
 *
 * Built only from circomlib templates (Poseidon, Num2Bits, LessEqThan).
 */

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

// |a - b| <= tol, for a, b, tol already range-checked to 8 bits.
// Written as a <= b + tol and b <= a + tol; every operand is below 2^10,
// which is what LessEqThan(10) requires.
template WithinTolerance() {
    signal input a;
    signal input b;
    signal input tol;

    component upper = LessEqThan(10);
    upper.in[0] <== a;
    upper.in[1] <== b + tol;
    upper.out === 1;

    component lower = LessEqThan(10);
    lower.in[0] <== b;
    lower.in[1] <== a + tol;
    lower.out === 1;
}

template FingerprintMatch(n) {
    signal input labPeaks[n];
    signal input goldPeaks[n];
    signal input salt;

    signal input commitment;
    signal input tolerance;
    signal input tokenId;

    // Range checks: every peak and the tolerance are 8-bit integers (0-255).
    component labRange[n];
    component goldRange[n];
    for (var i = 0; i < n; i++) {
        labRange[i] = Num2Bits(8);
        labRange[i].in <== labPeaks[i];
        goldRange[i] = Num2Bits(8);
        goldRange[i].in <== goldPeaks[i];
    }
    component tolRange = Num2Bits(8);
    tolRange.in <== tolerance;

    // The Gold Standard must be the one committed on-chain.
    component hash = Poseidon(n + 1);
    for (var i = 0; i < n; i++) {
        hash.inputs[i] <== goldPeaks[i];
    }
    hash.inputs[n] <== salt;
    hash.out === commitment;

    // Every lab peak within tolerance of the matching Gold Standard peak.
    component match[n];
    for (var i = 0; i < n; i++) {
        match[i] = WithinTolerance();
        match[i].a <== labPeaks[i];
        match[i].b <== goldPeaks[i];
        match[i].tol <== tolerance;
    }

    // tokenId takes part in no other constraint; this keeps it in the R1CS
    // so the proof cannot be re-used with a different token id.
    signal tokenIdSquared;
    tokenIdSquared <== tokenId * tokenId;
}

component main {public [commitment, tolerance, tokenId]} = FingerprintMatch(10);
