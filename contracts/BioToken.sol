// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title IHplcVerifier
 * @notice Interface to the snarkjs Groth16 verifier for the
 *         FingerprintMatch(10) circuit.
 *         Public signals: [valid, threshold]
 */
interface IHplcVerifier {
    function verifyProof(
        uint[2]    calldata a,
        uint[2][2] calldata b,
        uint[2]    calldata c,
        uint[2]    calldata pubSignals
    ) external view returns (bool);
}

/**
 * @title BioToken
 * @notice ERC-721 NFT representing a biochemical reagent batch.
 *         Tracks chain-of-custody across five lifecycle stages and
 *         supports ZK-based authenticity verification.
 *
 *  Week 4 change: verifyProof() stub replaced with a real call to
 *  HplcVerifier (Groth16 on-chain verifier exported from snarkjs).
 */
contract BioToken is ERC721, AccessControl {
    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant LOGISTICS_ROLE    = keccak256("LOGISTICS_ROLE");
    bytes32 public constant LAB_ROLE          = keccak256("LAB_ROLE");

    // ──────────────────────────────────────────────
    //  Enums
    // ──────────────────────────────────────────────
    enum TokenStatus {
        MINTED,
        IN_TRANSIT,
        RECEIVED,
        VERIFIED,
        CONSUMED
    }

    // ──────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────
    struct TokenData {
        string      batchId;
        uint256     expiry;           // Unix timestamp
        bytes32     verificationKey;  // on-chain vk commitment (bytes32)
        TokenStatus status;
        bytes       marketplaceSig;   // co-signature from marketplace consensus
    }

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────
    uint256 private _nextTokenId;
    mapping(uint256 => TokenData) private _tokenData;

    /// @notice Address of the deployed HplcVerifier contract.
    ///         Set once in constructor; immutable after deployment.
    IHplcVerifier public immutable verifier;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────
    event TokenMinted(uint256 indexed tokenId, string batchId, address indexed manufacturer);
    event CustodyTransferred(uint256 indexed tokenId, address indexed from, address indexed to);
    event TokenReceived(uint256 indexed tokenId, address indexed lab);
    event TokenVerified(uint256 indexed tokenId);
    event TokenConsumed(uint256 indexed tokenId);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────
    error TokenAlreadyConsumed(uint256 tokenId);
    error InvalidStatusTransition(uint256 tokenId, TokenStatus current, TokenStatus expected);
    error ZKProofInvalid(uint256 tokenId);

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────
    /**
     * @param verifierAddress Address of the deployed HplcVerifier contract.
     */
    constructor(address verifierAddress) ERC721("BioToken", "BIO") {
        require(verifierAddress != address(0), "BioToken: zero verifier address");
        verifier = IHplcVerifier(verifierAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANUFACTURER_ROLE, msg.sender);
    }

    // ──────────────────────────────────────────────
    //  Core Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Mint a new reagent token.
     * @param batchId         Human-readable batch identifier
     * @param expiry          Unix timestamp for reagent expiry
     * @param vk              Verification key (bytes32) commitment
     * @param marketplaceSig  Co-signature from marketplace validator
     * @return tokenId        The id of the newly minted token
     */
    function mintToken(
        string calldata batchId,
        uint256 expiry,
        bytes32 vk,
        bytes calldata marketplaceSig
    ) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        _tokenData[tokenId] = TokenData({
            batchId:         batchId,
            expiry:          expiry,
            verificationKey: vk,
            status:          TokenStatus.MINTED,
            marketplaceSig:  marketplaceSig
        });

        emit TokenMinted(tokenId, batchId, msg.sender);
        return tokenId;
    }

    /**
     * @notice Transfer custody of a token to a new holder (e.g. logistics → lab).
     *         Updates status to IN_TRANSIT.
     * @param tokenId   Token to transfer
     * @param newHolder Address of the new custodian
     */
    function transferCustody(
        uint256 tokenId,
        address newHolder
    ) external {
        _requireNotConsumed(tokenId);
        _requireStatus(tokenId, TokenStatus.MINTED);

        address from = ownerOf(tokenId);
        _transfer(from, newHolder, tokenId);
        _tokenData[tokenId].status = TokenStatus.IN_TRANSIT;

        emit CustodyTransferred(tokenId, from, newHolder);
    }

    /**
     * @notice Lab confirms receipt of a reagent shipment.
     * @param tokenId Token to confirm
     */
    function confirmReceipt(uint256 tokenId) external {
        _requireNotConsumed(tokenId);
        _requireStatus(tokenId, TokenStatus.IN_TRANSIT);

        _tokenData[tokenId].status = TokenStatus.RECEIVED;

        emit TokenReceived(tokenId, msg.sender);
    }

    /**
     * @notice Verify reagent authenticity via a ZK proof.
     *
     *  Week 4 — real Groth16 verification replaces the stub.
     *
     *  The caller (lab) submits the proof components and the two
     *  public signals that the circuit exposes:
     *    pubSignals[0] = valid     (must equal 1 for approval)
     *    pubSignals[1] = threshold (the tolerance used during proving)
     *
     *  The call is forwarded to the deployed HplcVerifier contract.
     *  If verification fails the transaction reverts with ZKProofInvalid.
     *
     * @param tokenId     Token to verify (must be in RECEIVED state)
     * @param a           Proof.A  (G1 point)
     * @param b           Proof.B  (G2 point)
     * @param c           Proof.C  (G1 point)
     * @param pubSignals  [valid, threshold]
     * @return            true on success (reverts on failure)
     */
    function verifyProof(
        uint256    tokenId,
        uint[2]    calldata a,
        uint[2][2] calldata b,
        uint[2]    calldata c,
        uint[2]    calldata pubSignals
    ) external returns (bool) {
        _requireNotConsumed(tokenId);
        _requireStatus(tokenId, TokenStatus.RECEIVED);

        // ── REAL ZK VERIFICATION (Week 4) ──────────────────────────
        bool valid = verifier.verifyProof(a, b, c, pubSignals);
        // ── END REAL ZK VERIFICATION ────────────────────────────────

        if (!valid) revert ZKProofInvalid(tokenId);

        _tokenData[tokenId].status = TokenStatus.VERIFIED;
        emit TokenVerified(tokenId);
        return true;
    }

    /**
     * @notice Demo-only: mark token as verified without ZK proof.
     *         Replace with real verifyProof() before production.
     */
    function verifyDemo(uint256 tokenId) external {
        _requireNotConsumed(tokenId);
        _requireStatus(tokenId, TokenStatus.RECEIVED);
        _tokenData[tokenId].status = TokenStatus.VERIFIED;
        emit TokenVerified(tokenId);
    }

    /**
     * @notice Mark a verified reagent as consumed. Terminal state.
     * @param tokenId Token to consume
     */
    function consumeToken(uint256 tokenId) external {
        _requireNotConsumed(tokenId);
        _requireStatus(tokenId, TokenStatus.VERIFIED);

        _tokenData[tokenId].status = TokenStatus.CONSUMED;

        emit TokenConsumed(tokenId);
    }

    /**
     * @notice Return the full on-chain metadata for a token.
     * @param tokenId Token to query
     */
    function getTokenData(uint256 tokenId) external view returns (TokenData memory) {
        ownerOf(tokenId); // reverts for non-existent token
        return _tokenData[tokenId];
    }

    // ──────────────────────────────────────────────
    //  Internal Helpers
    // ──────────────────────────────────────────────

    function _requireNotConsumed(uint256 tokenId) internal view {
        if (_tokenData[tokenId].status == TokenStatus.CONSUMED) {
            revert TokenAlreadyConsumed(tokenId);
        }
    }

    function _requireStatus(uint256 tokenId, TokenStatus expected) internal view {
        TokenStatus current = _tokenData[tokenId].status;
        if (current != expected) {
            revert InvalidStatusTransition(tokenId, current, expected);
        }
    }

    // ──────────────────────────────────────────────
    //  Overrides (ERC-721 × AccessControl)
    // ──────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
