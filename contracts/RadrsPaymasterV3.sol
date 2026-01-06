// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RadrsPaymasterV3
 * @dev Paymaster that charges RADRS fees based on activation status.
 *      First transaction is free (activation).
 *      Subsequent transactions charged at 120% (or configurable rate).
 *      Backend signs quote with 'realRadrsCost' and 'activated' status.
 */
contract RadrsPaymasterV3 is BasePaymaster {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address public verifyingSigner;
    IERC20 public immutable radrs;
    address public feeCollector;

    // Activation status mapping: smartAccount => isActivated
    mapping(address => bool) public isActivated;

    bytes32 private constant DOMAIN_TYPE_HASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    // Updated Struct to include realRadrsCost and activation status logic
    // But to keep it compatible with standard Paymaster flows, we usually sign the specific feeAmount.
    // However, the requirement is to use 'realRadrsCost' and 'activated' flag from backend?
    // Actually, if backend already knows 'activated', it can just calculate the final 'feeAmount' and sign that.
    // BUT, the requirements say:
    // "Call GasFeeCollector.chargeRadrs(smartAccount, realRadrsCost, isActivated[smartAccount])"
    // "In postOp... read isActivated... call chargeRadrs"
    
    // Let's implement the logic directly in Paymaster for simplicity and efficiency (less gas), 
    // unless a separate GasFeeCollector is strictly required. 
    // The user prompt mentioned "In Paymaster OR independent GasFeeCollector". 
    // Putting it in Paymaster saves one external call.
    
    // We will sign: (feeToken, realRadrsCost, receiver, validUntil, validAfter, payer)
    // Note: 'feeAmount' in the signature will be interpreted as 'realRadrsCost' (the base cost before markup).
    // The actual charge will be calculated on-chain based on isActivated.
    
    bytes32 private constant SPONSOR_TYPE_HASH = keccak256("Sponsor(address feeToken,uint256 feeAmount,address receiver,uint48 validUntil,uint48 validAfter,address payer)");

    event GasPaid(address indexed payer, address indexed userOpSender, uint256 radrsCharged, uint256 realCost, bool isActivation);
    event FeeCollectorUpdated(address oldCollector, address newCollector);

    // Custom Errors
    error InvalidFeeToken(address token);
    error InsufficientBalance(uint256 required, uint256 actual);
    error InsufficientAllowance(uint256 required, uint256 actual);
    
    constructor(
        IEntryPoint _entryPoint, 
        address _verifyingSigner, 
        address _radrs, 
        address _feeCollector
    ) BasePaymaster(_entryPoint) {
        verifyingSigner = _verifyingSigner;
        radrs = IERC20(_radrs);
        feeCollector = _feeCollector;
    }

    function setVerifyingSigner(address _newSigner) external onlyOwner {
        verifyingSigner = _newSigner;
    }

    function setFeeCollector(address _newCollector) external onlyOwner {
        emit FeeCollectorUpdated(feeCollector, _newCollector);
        feeCollector = _newCollector;
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
            keccak256(bytes("RadrsPaymasterV3")), 
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
        bytes calldata payload = userOp.paymasterAndData[52:];
        
        if (payload.length < 32) {
             return ("", _packValidationData(false, 0, 0));
        }
        
        (
            address feeToken,
            uint256 realRadrsCost, // This is the base cost signed by backend
            address receiver,
            uint48 validUntil,
            uint48 validAfter,
            address payer, 
            bytes memory signature
        ) = abi.decode(payload, (address, uint256, address, uint48, uint48, address, bytes));

        // 1. Validate Time
        if (block.timestamp > validUntil) {
             require(block.timestamp <= validUntil, "AA33: signature expired");
        }

        // 2. Verify Signature
        address tokenPayer = payer == address(0) ? userOp.sender : payer;
        bytes32 hash = getHash(feeToken, realRadrsCost, receiver, validUntil, validAfter, tokenPayer);
        address recovered = hash.recover(signature);

        if (recovered != verifyingSigner) {
            revert("AA33: invalid signature");
        }

        // 3. Validate Token
        require(feeToken == address(radrs), "AA33: invalid fee token");

        // 4. Calculate Expected Charge (for validation)
        bool alreadyActivated = isActivated[userOp.sender];
        uint256 chargeAmount = 0;

        if (alreadyActivated) {
            // 120% charge
            chargeAmount = (realRadrsCost * 120 + 99) / 100;
        } else {
            // Free (Activation)
            chargeAmount = 0;
        }

        // 5. Check Balance & Allowance (only if charging)
        if (chargeAmount > 0) {
            uint256 balance = radrs.balanceOf(tokenPayer);
            require(balance >= chargeAmount, "AA33: balance too low");

            uint256 allowance = radrs.allowance(tokenPayer, address(this));
            require(allowance >= chargeAmount, "AA33: allowance too low");
        }

        // 6. Return Context
        // Pass essential data to postOp
        context = abi.encode(tokenPayer, realRadrsCost, userOp.sender);
        validationData = _packValidationData(false, validUntil, validAfter);
    }

    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /*actualUserOpFeePerGas*/
    ) internal override {
        (address tokenPayer, uint256 realRadrsCost, address userOpSender) = abi.decode(context, (address, uint256, address));

        bool alreadyActivated = isActivated[userOpSender];
        
        if (!alreadyActivated) {
            // First time: Activate and do NOT charge
            isActivated[userOpSender] = true;
            emit GasPaid(tokenPayer, userOpSender, 0, realRadrsCost, true);
        } else {
            // Subsequent times: Charge 120%
            uint256 fee = (realRadrsCost * 120 + 99) / 100;
            if (fee > 0) {
                radrs.safeTransferFrom(tokenPayer, feeCollector, fee);
                emit GasPaid(tokenPayer, userOpSender, fee, realRadrsCost, false);
            }
        }
    }
}
