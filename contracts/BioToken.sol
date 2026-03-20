// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title BioToken
 * @notice ERC-721 NFT representing a biochemical reagent batch.
 *         Tracks chain-of-custody across five lifecycle stages and
 *         supports ZK-based authenticity verification.
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
        string   batchId;
        uint256  expiry;            // Unix timestamp
        bytes32  verificationKey;   // placeholder for ZK vk — replaced in Week 3
        TokenStatus status;
        bytes    marketplaceSig;    // co-signature from marketplace consensus validator
    }

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────
    uint256 private _nextTokenId;
    mapping(uint256 => TokenData) private _tokenData;

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

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────
    constructor() ERC721("BioToken", "BIO") {
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
     * @param vk              Verification key (bytes32) — placeholder for ZK vk
     * @param marketplaceSig  Co-signature from marketplace validator
     * @return tokenId        The id of the newly minted token
     */
    function mintToken(
        string calldata batchId,
        uint256 expiry,
        bytes32 vk,
        bytes calldata marketplaceSig
    ) external onlyRole(MANUFACTURER_ROLE) returns (uint256) {
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
    ) external onlyRole(LOGISTICS_ROLE) {
        _requireNotConsumed(tokenId);
        _requireStatus(tokenId, TokenStatus.MINTED);

        address from = ownerOf(tokenId);

        // Transfer the NFT to the new holder
        _transfer(from, newHolder, tokenId);
        _tokenData[tokenId].status = TokenStatus.IN_TRANSIT;

        emit CustodyTransferred(tokenId, from, newHolder);
    }

    /**
     * @notice Lab confirms receipt of a reagent shipment.
     * @param tokenId Token to confirm
     */
    function confirmReceipt(uint256 tokenId) external onlyRole(LAB_ROLE) {
        _requireNotConsumed(tokenId);
        _requireStatus(tokenId, TokenStatus.IN_TRANSIT);

        _tokenData[tokenId].status = TokenStatus.RECEIVED;

        emit TokenReceived(tokenId, msg.sender);
    }

    /**
     * @notice Verify reagent authenticity via a ZK proof.
     *         ── SWAP POINT ──
     *         This is currently a stub that always returns true.
     *         In Week 4, replace the body with a call to the
     *         snarkjs Groth16 on-chain verifier contract, e.g.:
     *
     *             IVerifier(verifierAddress).verifyProof(a, b, c, input);
     *
     * @param tokenId Token to verify
     * @param proof   Placeholder proof bytes (ignored in stub)
     * @return valid  Always true in the stub implementation
     */
    function verifyProof(
        uint256 tokenId,
        bytes calldata proof   // solhint-disable-line no-unused-vars
    ) external onlyRole(LAB_ROLE) returns (bool) {
        _requireNotConsumed(tokenId);
        _requireStatus(tokenId, TokenStatus.RECEIVED);

        // ── SWAP POINT: replace stub with real snarkjs Groth16 verifier ──
        bool valid = true;
        // ── END SWAP POINT ──

        if (valid) {
            _tokenData[tokenId].status = TokenStatus.VERIFIED;
            emit TokenVerified(tokenId);
        }
        return valid;
    }

    /**
     * @notice Mark a verified reagent as consumed. Terminal state.
     * @param tokenId Token to consume
     */
    function consumeToken(uint256 tokenId) external onlyRole(LAB_ROLE) {
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
        // ownerOf will revert for non-existent tokens
        ownerOf(tokenId);
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
