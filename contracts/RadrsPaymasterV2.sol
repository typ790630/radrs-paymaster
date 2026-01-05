// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title RadrsPaymasterV2
 * @dev Paymaster that accepts off-chain signed quotes for RADRS fees.
 *      Supports paying from a separate address (payer) instead of just the sender.
 *      Backend signs: (feeToken, feeAmount, receiver, validUntil, validAfter, payer)
 */
contract RadrsPaymasterV2 is BasePaymaster {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address public verifyingSigner;
    address public constant RADRS_TOKEN_ADDRESS = 0xe2188A2E0a41A50F09359E5FE714D5e643036f2A;

    bytes32 private constant DOMAIN_TYPE_HASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    // Updated Type Hash with 'payer' instead of 'sender' (or we can keep 'sender' meaning the paying address)
    // To be explicit, let's use 'payer'.
    bytes32 private constant SPONSOR_TYPE_HASH = keccak256("Sponsor(address feeToken,uint256 feeAmount,address receiver,uint48 validUntil,uint48 validAfter,address payer)");

    event GasPaid(address indexed payer, address indexed userOpSender, uint256 radrsFee, uint256 gasCost);

    // Custom Errors
    error InvalidFeeToken(address token);
    error InsufficientBalance(uint256 required, uint256 actual);
    error InsufficientAllowance(uint256 required, uint256 actual);
    error InvalidPaymasterDataLength(uint256 length);

    constructor(IEntryPoint _entryPoint, address _verifyingSigner) BasePaymaster(_entryPoint) {
        verifyingSigner = _verifyingSigner;
    }

    function setVerifyingSigner(address _newSigner) external onlyOwner {
        verifyingSigner = _newSigner;
    }

    function _validateEntryPointInterface(IEntryPoint _entryPoint) internal override view {
        // Skip check for BSC
    }

    function getHash(
        address feeToken,
        uint256 feeAmount,
        address receiver,
        uint48 validUntil,
        uint48 validAfter,
        address payer
    ) public view returns (bytes32) {
        bytes32 domainSeparator = keccak256(abi.encode(
            DOMAIN_TYPE_HASH,
            keccak256(bytes("RadrsPaymasterV2")), // Updated Name
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));

        bytes32 structHash = keccak256(abi.encode(
            SPONSOR_TYPE_HASH,
            feeToken,
            feeAmount,
            receiver,
            validUntil,
            validAfter,
            payer
        ));

        return MessageHashUtils.toTypedDataHash(domainSeparator, structHash);
    }

    function _packValidationData(bool sigFailed, uint48 validUntil, uint48 validAfter) internal pure returns (uint256) {
        return (sigFailed ? 1 : 0) | (uint256(validUntil) << 160) | (uint256(validAfter) << (160 + 48));
    }

    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 maxCost
    ) internal override returns (bytes memory context, uint256 validationData) {
        // 1. Decode paymasterAndData
        // PackedUserOperation paymasterAndData format:
        // [0..19]   Paymaster Address (20 bytes)
        // [20..51]  Gas Limits (32 bytes)
        // [52..end] PaymasterData (Dynamic bytes)
        
        bytes calldata payload = userOp.paymasterAndData[52:];
        
        (
            address feeToken,
            uint256 feeAmount,
            address receiver,
            uint48 validUntil,
            uint48 validAfter,
            address payer, // New Field
            bytes memory signature
        ) = abi.decode(payload, (address, uint256, address, uint48, uint48, address, bytes));

        // 2. Validate Time
        if (block.timestamp > validUntil) {
             require(block.timestamp <= validUntil, "AA33: signature expired");
        }

        // 3. Verify Signature
        // The signature must sign the 'payer' address.
        // If payer is address(0), we default to userOp.sender.
        address tokenPayer = payer == address(0) ? userOp.sender : payer;

        bytes32 hash = getHash(feeToken, feeAmount, receiver, validUntil, validAfter, tokenPayer);
        address recovered = hash.recover(signature);

        if (recovered != verifyingSigner) {
            revert("AA33: invalid signature");
        }

        // 4. Validate Token
        require(feeToken == RADRS_TOKEN_ADDRESS, "AA33: invalid fee token");

        // 5. Check Balance of TokenPayer
        uint256 balance = IERC20(feeToken).balanceOf(tokenPayer);
        require(balance >= feeAmount, "AA33: balance too low");

        uint256 allowance = IERC20(feeToken).allowance(tokenPayer, address(this));
        require(allowance >= feeAmount, "AA33: allowance too low");

        // 6. Return Context
        // We need to pass tokenPayer to _postOp
        context = abi.encode(tokenPayer, feeToken, feeAmount, receiver, userOp.sender);
        validationData = _packValidationData(false, validUntil, validAfter);
    }

    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /*actualUserOpFeePerGas*/
    ) internal override {
        (address tokenPayer, address feeToken, uint256 feeAmount, address receiver, address userOpSender) = abi.decode(context, (address, address, uint256, address, address));

        if (feeAmount > 0) {
            IERC20(feeToken).safeTransferFrom(tokenPayer, receiver, feeAmount);
            emit GasPaid(tokenPayer, userOpSender, feeAmount, actualGasCost);
        }
    }
}
