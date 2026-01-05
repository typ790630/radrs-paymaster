// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title RadrsPaymaster
 * @dev Paymaster that accepts off-chain signed quotes for RADRS fees.
 *      Backend signs: (feeToken, feeAmount, receiver, validUntil, validAfter, sender)
 */
contract RadrsPaymaster is BasePaymaster {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address public verifyingSigner;
    address public constant RADRS_TOKEN_ADDRESS = 0xe2188A2E0a41A50F09359E5FE714D5e643036f2A;

    bytes32 private constant DOMAIN_TYPE_HASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant SPONSOR_TYPE_HASH = keccak256("Sponsor(address feeToken,uint256 feeAmount,address receiver,uint48 validUntil,uint48 validAfter,address sender)");

    event GasPaid(address indexed user, uint256 radrsFee, uint256 gasCost);

    // Custom Errors for Better Debugging
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
        address sender
    ) public view returns (bytes32) {
        bytes32 domainSeparator = keccak256(abi.encode(
            DOMAIN_TYPE_HASH,
            keccak256(bytes("RadrsPaymaster")),
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
            sender
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
        // [20..35]  VerificationGasLimit (16 bytes)
        // [36..51]  PostOpGasLimit (16 bytes)
        // [52..end] PaymasterData (Dynamic bytes)
        
        // We need to skip the first 52 bytes to get to our custom encoded data.
        bytes calldata payload = userOp.paymasterAndData[52:];
        
        (
            address feeToken,
            uint256 feeAmount,
            address receiver,
            uint48 validUntil,
            uint48 validAfter,
            bytes memory signature
        ) = abi.decode(payload, (address, uint256, address, uint48, uint48, bytes));

        // 2. Validate Time
        if (block.timestamp > validUntil) {
             // Return signature error (SIG_DEADLINE_EXPIRED)
             // But user asked for explicit revert message?
             // Paymaster standard says: return validationData.
             // If we revert here, it's also AA33.
             // Let's revert for clarity as requested.
             require(block.timestamp <= validUntil, "AA33: signature expired");
        }

        // 3. Verify Signature
        bytes32 hash = getHash(feeToken, feeAmount, receiver, validUntil, validAfter, userOp.sender);
        address recovered = hash.recover(signature);

        if (recovered != verifyingSigner) {
            // Signature failure
            revert("AA33: invalid signature");
        }

        // 4. Validate Token
        require(feeToken == RADRS_TOKEN_ADDRESS, "AA33: invalid fee token");

        // 5. Check Balance
        // We do this here to fail early if user has no funds
        uint256 balance = IERC20(feeToken).balanceOf(userOp.sender);
        require(balance >= feeAmount, "AA33: balance too low");

        uint256 allowance = IERC20(feeToken).allowance(userOp.sender, address(this));
        require(allowance >= feeAmount, "AA33: allowance too low");

        // 6. Return Context
        context = abi.encode(userOp.sender, feeToken, feeAmount, receiver);
        validationData = _packValidationData(false, validUntil, validAfter);
    }

    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /*actualUserOpFeePerGas*/
    ) internal override {
        // We only charge if the op succeeded or reverted (PostOpMode.opSucceeded or PostOpMode.opReverted)
        // If mode == postOpReverted, it means the userOp failed but we still pay gas, so we should still charge the user?
        // Usually yes, otherwise user can drain paymaster by reverting txs.
        
        (address sender, address feeToken, uint256 feeAmount, address receiver) = abi.decode(context, (address, address, uint256, address));

        if (feeAmount > 0) {
            IERC20(feeToken).safeTransferFrom(sender, receiver, feeAmount);
            emit GasPaid(sender, feeAmount, actualGasCost);
        }
    }
}
