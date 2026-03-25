// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.
    Generated with snarkJS, modified for BioToken Week 4:
      - Renamed Groth16Verifier → HplcVerifier
      - verifyProof() additionally enforces pubSignals[0] == 1
        (the circuit must report a fingerprint match, not just a
         mathematically valid proof for a non-matching batch)
*/

pragma solidity >=0.7.0 <0.9.0;

contract HplcVerifier {
    // Scalar field size
    uint256 constant r  = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q  = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 7718298347780731119414810534887644582745442775041540545426893612137898736137;
    uint256 constant alphay  = 5455352362096336570365441970958779455078632471747395273126027530072446860331;
    uint256 constant betax1  = 19836389591440164097270685339717034982768284286134601855488494808238448208276;
    uint256 constant betax2  = 16245171372437968804958016783997359385070065366199435619857452768359898111374;
    uint256 constant betay1  = 17666463534369623336750985414156998848782640234015679191363074642370523209944;
    uint256 constant betay2  = 15573081670622240850554294693873582935692296788062677834227299570823521284640;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 17535807939402369604149251521395312572603921128330347119049947471731729014969;
    uint256 constant deltax2 = 6063820588992644037675131786243623395449671917749040540266825146508457324145;
    uint256 constant deltay1 = 16849793130195061743187062268710484830429001809338836466898308396503155009326;
    uint256 constant deltay2 = 18366451943019056296762244890953983505577199559619557609691149699961857627426;

    uint256 constant IC0x = 17465617957182298040292418783405816019707458908759560473327971881614331169254;
    uint256 constant IC0y = 1417138999760773912341469538439530483486591794042467772655031142079924943112;

    uint256 constant IC1x = 20806296166961250370056549552915728199986764113547727269347454131702346591365;
    uint256 constant IC1y = 18298445341698681575225538168370296797475137225337176052132254467376489012515;

    uint256 constant IC2x = 19086983535939199647880122691455001019157327406931657799661336578214574838716;
    uint256 constant IC2y = 3557454871227744504537754812551700545995090852803086686353410077523543305787;

    // Memory layout
    uint16 constant pVk      = 0;
    uint16 constant pPairing = 128;
    uint16 constant pLastMem = 896;

    /**
     * @notice Verify a Groth16 proof for the FingerprintMatch(10) circuit.
     *
     * @param _pA         Proof.A  (G1 point)
     * @param _pB         Proof.B  (G2 point)
     * @param _pC         Proof.C  (G1 point)
     * @param _pubSignals [valid, threshold]
     *                    valid     — 1 if all adjacent peak deltas <= threshold
     *                    threshold — the tolerance value used during witness gen
     *
     * @return true iff:
     *   (a) the Groth16 pairing check passes (proof is mathematically valid), AND
     *   (b) pubSignals[0] == 1  (the circuit reported a fingerprint match)
     *
     *  Condition (b) is critical: without it, a lab could submit a valid proof
     *  for a NON-matching batch (valid=0) and still get VERIFIED status.
     */
    function verifyProof(
        uint[2]    calldata _pA,
        uint[2][2] calldata _pB,
        uint[2]    calldata _pC,
        uint[2]    calldata _pubSignals
    ) public view returns (bool) {

        // ── Check (b): circuit must have reported a match ──────────
        // pubSignals[0] is `valid` — must equal 1
        if (_pubSignals[0] != 1) return false;

        // ── Check (a): Groth16 pairing (snarkjs-generated assembly) ─
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)
                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)
                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk      := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Linear combination: vk_x = IC0 + IC1*pubSignals[0] + IC2*pubSignals[1]
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64),  calldataload(pB))
                mstore(add(_pPairing, 96),  calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))

                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)

                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)
                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate all public inputs are within the scalar field
            checkField(calldataload(add(_pubSignals, 0)))
            checkField(calldataload(add(_pubSignals, 32)))

            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)
            mstore(0, isValid)
            return(0, 0x20)
        }
    }
}
