// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title IHplcVerifier
 * @notice snarkjs Groth16 verifier for the FingerprintMatch(10) circuit.
 *         Public signals: [commitment, tolerance, tokenId]
 */
interface IHplcVerifier {
    function verifyProof(
        uint[2]    calldata a,
        uint[2][2] calldata b,
        uint[2]    calldata c,
        uint[3]    calldata pubSignals
    ) external view returns (bool);
}

/**
 * @title BioToken
 * @notice ERC-721 NFT representing a biochemical reagent batch, tracked
 *         MINTED → IN_TRANSIT → RECEIVED → VERIFIED → CONSUMED.
 *
 *  At mint the manufacturer stores a Poseidon commitment to the batch's
 *  Gold Standard HPLC fingerprint and the per-peak tolerance. To verify,
 *  the lab that holds the token submits
 *    - a Groth16 proof that its measured peaks are within that tolerance of
 *      the committed fingerprint, for this token id (the contract supplies
 *      all public signals from storage), and
 *    - a GENUINE verdict signed by the AI oracle for this token's reagent.
 *
 *  Tokens move only through the lifecycle functions; plain ERC-721
 *  transfers are disabled.
 */
contract BioToken is ERC721, AccessControl {
    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant LAB_ROLE          = keccak256("LAB_ROLE");
    bytes32 public constant AI_ORACLE_ROLE    = keccak256("AI_ORACLE_ROLE");

    /// @dev BN254 scalar field; the commitment is a field element.
    uint256 private constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // ──────────────────────────────────────────────
    //  Types and state
    // ──────────────────────────────────────────────
    enum TokenStatus {
        MINTED,
        IN_TRANSIT,
        RECEIVED,
        VERIFIED,
        CONSUMED
    }

    struct TokenData {
        string      batchId;
        string      reagentSmiles;          // public reagent identity, checked by the AI oracle
        uint256     expiry;                 // Unix timestamp
        bytes32     fingerprintCommitment;  // Poseidon(goldPeaks[10], salt)
        uint8       tolerance;              // max |lab peak − gold peak|, 0–255 scale
        TokenStatus status;
        bytes       marketplaceSig;         // co-signature from marketplace consensus
    }

    IHplcVerifier public immutable verifier;

    uint256 private _nextTokenId;
    mapping(uint256 => TokenData) private _tokenData;
    bool private _custodyTransfer;

    // ──────────────────────────────────────────────
    //  Events and errors
    // ──────────────────────────────────────────────
    event TokenMinted(uint256 indexed tokenId, string batchId, address indexed manufacturer);
    event CustodyTransferred(uint256 indexed tokenId, address indexed from, address indexed to);
    event TokenReceived(uint256 indexed tokenId, address indexed lab);
    event TokenVerified(uint256 indexed tokenId, address indexed lab);
    event TokenConsumed(uint256 indexed tokenId);

    error InvalidStatusTransition(uint256 tokenId, TokenStatus current, TokenStatus expected);
    error NotTokenHolder(uint256 tokenId, address caller);
    error RecipientNotLab(address recipient);
    error InvalidCommitment();
    error InvalidExpiry();
    error EmptyReagent();
    error ReagentExpired(uint256 tokenId);
    error AiAttestationInvalid(uint256 tokenId, address signer);
    error ZKProofInvalid(uint256 tokenId);
    error TransferNotAllowed();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────
    /**
     * @param verifierAddress Deployed HplcVerifier.
     * @param aiOracle        Address whose signatures count as AI verdicts.
     */
    constructor(address verifierAddress, address aiOracle) ERC721("BioToken", "BIO") {
        require(verifierAddress != address(0), "BioToken: zero verifier address");
        require(aiOracle != address(0), "BioToken: zero AI oracle address");
        verifier = IHplcVerifier(verifierAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANUFACTURER_ROLE, msg.sender);
        _grantRole(AI_ORACLE_ROLE, aiOracle);
    }

    // ──────────────────────────────────────────────
    //  Lifecycle
    // ──────────────────────────────────────────────

    /**
     * @notice Mint a reagent batch to the caller.
     * @param batchId                Human-readable batch identifier
     * @param reagentSmiles          SMILES of the reagent (public identity)
     * @param expiry                 Unix timestamp, must be in the future
     * @param fingerprintCommitment  Poseidon(goldPeaks[10], salt), a BN254 field element
     * @param tolerance              Allowed per-peak deviation for the lab's scan
     * @param marketplaceSig         Co-signature from marketplace validator
     */
    function mintToken(
        string calldata batchId,
        string calldata reagentSmiles,
        uint256 expiry,
        bytes32 fingerprintCommitment,
        uint8 tolerance,
        bytes calldata marketplaceSig
    ) external onlyRole(MANUFACTURER_ROLE) returns (uint256) {
        if (fingerprintCommitment == bytes32(0) || uint256(fingerprintCommitment) >= SNARK_SCALAR_FIELD) {
            revert InvalidCommitment();
        }
        if (expiry <= block.timestamp) revert InvalidExpiry();
        if (bytes(reagentSmiles).length == 0) revert EmptyReagent();

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        _tokenData[tokenId] = TokenData({
            batchId:               batchId,
            reagentSmiles:         reagentSmiles,
            expiry:                expiry,
            fingerprintCommitment: fingerprintCommitment,
            tolerance:             tolerance,
            status:                TokenStatus.MINTED,
            marketplaceSig:        marketplaceSig
        });

        emit TokenMinted(tokenId, batchId, msg.sender);
        return tokenId;
    }

    /**
     * @notice Ship the batch to a lab. Holder (or an approved operator) only;
     *         the recipient must hold LAB_ROLE.
     */
    function transferCustody(uint256 tokenId, address lab) external {
        _requireStatus(tokenId, TokenStatus.MINTED);
        address holder = ownerOf(tokenId);
        if (!_isAuthorized(holder, msg.sender, tokenId)) revert NotTokenHolder(tokenId, msg.sender);
        if (!hasRole(LAB_ROLE, lab)) revert RecipientNotLab(lab);

        _tokenData[tokenId].status = TokenStatus.IN_TRANSIT;
        _custodyTransfer = true;
        _transfer(holder, lab, tokenId);
        _custodyTransfer = false;

        emit CustodyTransferred(tokenId, holder, lab);
    }

    /// @notice The receiving lab confirms the shipment arrived.
    function confirmReceipt(uint256 tokenId) external onlyRole(LAB_ROLE) {
        _requireHolder(tokenId);
        _requireStatus(tokenId, TokenStatus.IN_TRANSIT);

        _tokenData[tokenId].status = TokenStatus.RECEIVED;
        emit TokenReceived(tokenId, msg.sender);
    }

    /**
     * @notice Verify the batch: AI oracle verdict + ZK fingerprint match.
     * @param aiAttestation  AI oracle's EIP-191 signature over aiVerdictDigest(tokenId)
     */
    function verifyProof(
        uint256    tokenId,
        uint[2]    calldata a,
        uint[2][2] calldata b,
        uint[2]    calldata c,
        bytes      calldata aiAttestation
    ) external onlyRole(LAB_ROLE) returns (bool) {
        _requireHolder(tokenId);
        _requireStatus(tokenId, TokenStatus.RECEIVED);
        TokenData storage data = _tokenData[tokenId];
        if (block.timestamp > data.expiry) revert ReagentExpired(tokenId);

        address signer = ECDSA.recover(
            MessageHashUtils.toEthSignedMessageHash(aiVerdictDigest(tokenId)), aiAttestation
        );
        if (!hasRole(AI_ORACLE_ROLE, signer)) revert AiAttestationInvalid(tokenId, signer);

        uint[3] memory pubSignals = [uint256(data.fingerprintCommitment), uint256(data.tolerance), tokenId];
        if (!verifier.verifyProof(a, b, c, pubSignals)) revert ZKProofInvalid(tokenId);

        data.status = TokenStatus.VERIFIED;
        emit TokenVerified(tokenId, msg.sender);
        return true;
    }

    /// @notice The lab holding a verified batch marks it used. Terminal state.
    function consumeToken(uint256 tokenId) external {
        _requireHolder(tokenId);
        _requireStatus(tokenId, TokenStatus.VERIFIED);

        _tokenData[tokenId].status = TokenStatus.CONSUMED;
        emit TokenConsumed(tokenId);
    }

    // ──────────────────────────────────────────────
    //  Views
    // ──────────────────────────────────────────────

    /**
     * @notice The digest the AI oracle signs (EIP-191) for a GENUINE verdict.
     *         Binds the verdict to this chain, this contract, the token and
     *         the reagent recorded at mint.
     */
    function aiVerdictDigest(uint256 tokenId) public view returns (bytes32) {
        return keccak256(abi.encode(
            "BioToken AI verdict: GENUINE",
            block.chainid,
            address(this),
            tokenId,
            keccak256(bytes(_tokenData[tokenId].reagentSmiles))
        ));
    }

    function getTokenData(uint256 tokenId) external view returns (TokenData memory) {
        ownerOf(tokenId); // reverts for non-existent token
        return _tokenData[tokenId];
    }

    /// @notice Number of tokens minted; ids run from 0 to totalMinted() - 1.
    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    // ──────────────────────────────────────────────
    //  Internal helpers and overrides
    // ──────────────────────────────────────────────

    function _requireHolder(uint256 tokenId) internal view {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenHolder(tokenId, msg.sender);
    }

    function _requireStatus(uint256 tokenId, TokenStatus expected) internal view {
        TokenStatus current = _tokenData[tokenId].status;
        if (current != expected) revert InvalidStatusTransition(tokenId, current, expected);
    }

    /// @dev Only minting and transferCustody may move tokens.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0) && !_custodyTransfer) revert TransferNotAllowed();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
