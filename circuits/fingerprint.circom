pragma circom 2.0.0;

/*
 * BioToken Fingerprint Circuit  (n = 10 peaks)
 *
 * Proves that adjacent ridge-peak deltas are all within `threshold`
 * without revealing the actual peak values on-chain.
 *
 * Public inputs : threshold
 * Private inputs: peaks[10]
 * Public output : valid  (1 = match, 0 = no match)
 */

// ---------------------------------------------------------------------------
// Decomposes `in` into `n` bits (little-endian).
// ---------------------------------------------------------------------------
template Num2Bits(n) {
    signal input in;
    signal output out[n];
    var lc = 0;
    for (var i = 0; i < n; i++) {
        out[i] <-- (in >> i) & 1;
        out[i] * (1 - out[i]) === 0;
        lc += out[i] * (1 << i);
    }
    lc === in;
}

// ---------------------------------------------------------------------------
// Outputs 1 iff a <= b  (both non-negative, fitting in `bits` bits).
// Strategy: (b - a + 2^bits) has its bit-`bits` set iff b >= a.
// ---------------------------------------------------------------------------
template LessEqThan(bits) {
    signal input a;
    signal input b;
    signal output out;

    component n2b = Num2Bits(bits + 1);
    n2b.in <== b - a + (1 << bits);
    out <== n2b.out[bits];
}

// ---------------------------------------------------------------------------
// AbsoluteDifference: diff = |a - b|
//
// Witness hint provides s ∈ {0,1} where s=1 means b > a.
// Then:
//   pos = a - b       (positive when a >= b)
//   neg = b - a       (positive when b > a)
//   diff = s * neg + (1 - s) * pos
//        = s*(neg - pos) + pos
//
// All multiplications are degree-2 (one quadratic gate).
// ---------------------------------------------------------------------------
template AbsoluteDifference() {
    signal input a;
    signal input b;
    signal output diff;

    // hint: s = 1 if b > a, else 0
    signal s;
    s <-- (b > a) ? 1 : 0;
    s * (1 - s) === 0;       // boolean check

    signal pos;   // a - b  (meaningful when a >= b)
    signal neg;   // b - a  (meaningful when b > a)
    pos <== a - b;
    neg <== b - a;

    // diff = s*(neg - pos) + pos
    //      = s*neg - s*pos + pos
    // We need two multiplications; introduce intermediate signals.
    signal s_neg;
    signal s_pos;
    s_neg <== s * neg;
    s_pos <== s * pos;

    diff <== s_neg - s_pos + pos;
}

// ---------------------------------------------------------------------------
// Main circuit
// ---------------------------------------------------------------------------
template FingerprintMatch(n) {
    signal input peaks[n];      // private — raw sensor peak values
    signal input threshold;     // public  — allowable deviation per step

    signal output valid;        // public  — 1 if all deltas <= threshold

    var nDeltas = n - 1;

    component absDiff[nDeltas];
    component leq[nDeltas];
    signal acc[nDeltas];

    for (var i = 0; i < nDeltas; i++) {
        absDiff[i] = AbsoluteDifference();
        absDiff[i].a <== peaks[i];
        absDiff[i].b <== peaks[i + 1];

        leq[i] = LessEqThan(8);   // peak values fit in 8 bits (0–255)
        leq[i].a <== absDiff[i].diff;
        leq[i].b <== threshold;

        if (i == 0) {
            acc[0] <== leq[0].out;
        } else {
            acc[i] <== acc[i - 1] * leq[i].out;
        }
    }

    valid <== acc[nDeltas - 1];
}

// Expose `threshold` as a public input; `peaks` remains private.
component main {public [threshold]} = FingerprintMatch(10);
