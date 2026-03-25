// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockVerifier
 * @notice Test-only contract that stands in for HplcVerifier.
 *         Returns a fixed boolean for every verifyProof() call,
 *         letting us test BioToken's ZK integration without running
 *         real Groth16 math inside Hardhat.
 *
 * @dev    Deploy with shouldPass=true for Test 6 (valid proof),
 *         shouldPass=false for Test 7 (tampered proof).
 *         Never deploy this to a real network.
 */
contract MockVerifier {
    bool private immutable _shouldPass;

    constructor(bool shouldPass) {
        _shouldPass = shouldPass;
    }

    function verifyProof(
        uint[2]    calldata,   /* a */
        uint[2][2] calldata,   /* b */
        uint[2]    calldata,   /* c */
        uint[2]    calldata    /* pubSignals */
    ) external view returns (bool) {
        return _shouldPass;
    }
}
