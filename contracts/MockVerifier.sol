// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockVerifier
 * @notice Test-only stand-in for HplcVerifier. Returns a fixed boolean and
 *         records nothing, so BioToken's access control and lifecycle can be
 *         tested without real Groth16 proofs. Never deploy to a real network.
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
        uint[3]    calldata    /* [commitment, tolerance, tokenId] */
    ) external view returns (bool) {
        return _shouldPass;
    }
}
