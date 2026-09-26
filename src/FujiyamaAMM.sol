// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFujiyamaERC20 {
    function totalSupply() external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title FUJIYAMA AMM
/// @notice Constant-product AMM with a directional stock-float guard.
/// @dev Hackathon prototype: one owner seeds liquidity and controls the mint-window flag.
///      Production deployment would replace that flag with a verifiable market/issuance signal.
contract FujiyamaAMM {
    uint256 public constant BPS = 10_000;

    IFujiyamaERC20 public immutable stockToken;
    IFujiyamaERC20 public immutable memeToken;
    address public immutable owner;

    uint256 public immutable softUtilizationBps;
    uint256 public immutable hardUtilizationBps;
    uint256 public immutable maxGuardBps;
    uint256 public immutable swapFeeBps;

    uint256 public stockReserve;
    uint256 public memeReserve;
    uint256 public bufferStock;

    bool public mintClosed;
    bool public initialized;

    uint256 private _locked = 1;

    error NotOwner();
    error AlreadyInitialized();
    error InvalidConfig();
    error ZeroAmount();
    error InsufficientLiquidity();
    error Slippage();
    error TransferFailed();
    error MintStillClosed();
    error BufferTooSmall();
    error Reentrancy();

    event LiquiditySeeded(uint256 stockAmount, uint256 memeAmount);
    event MintWindowChanged(bool mintClosed);
    event GuardApplied(
        address indexed trader,
        uint256 stockInput,
        uint256 guardBps,
        uint256 bufferedStock
    );
    event SwapStockForMeme(
        address indexed trader,
        uint256 stockInput,
        uint256 effectivePoolInput,
        uint256 memeOutput
    );
    event SwapMemeForStock(address indexed trader, uint256 memeInput, uint256 stockOutput);
    event BufferReleased(uint256 stockAmount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(
        address stockToken_,
        address memeToken_,
        uint256 softUtilizationBps_,
        uint256 hardUtilizationBps_,
        uint256 maxGuardBps_,
        uint256 swapFeeBps_
    ) {
        if (
            stockToken_ == address(0) || memeToken_ == address(0)
                || softUtilizationBps_ >= hardUtilizationBps_
                || hardUtilizationBps_ > BPS
                || maxGuardBps_ > BPS
                || swapFeeBps_ > 1_000
        ) {
            revert InvalidConfig();
        }

        stockToken = IFujiyamaERC20(stockToken_);
        memeToken = IFujiyamaERC20(memeToken_);
        owner = msg.sender;

        softUtilizationBps = softUtilizationBps_;
        hardUtilizationBps = hardUtilizationBps_;
        maxGuardBps = maxGuardBps_;
        swapFeeBps = swapFeeBps_;
    }

    /// @notice Seeds the initial constant-product inventory once.
    function seedLiquidity(uint256 stockAmount, uint256 memeAmount)
        external
        onlyOwner
        nonReentrant
    {
        if (initialized) revert AlreadyInitialized();
        if (stockAmount == 0 || memeAmount == 0) revert ZeroAmount();

        _pull(stockToken, msg.sender, stockAmount);
        _pull(memeToken, msg.sender, memeAmount);

        stockReserve = stockAmount;
        memeReserve = memeAmount;
        initialized = true;

        emit LiquiditySeeded(stockAmount, memeAmount);
    }

    /// @notice Demo control for whether new stock-token issuance is unavailable.
    function setMintClosed(bool closed) external onlyOwner {
        mintClosed = closed;
        emit MintWindowChanged(closed);
    }

    /// @notice Move guarded inventory back into active pool inventory after issuance reopens.
    /// @dev Accounting-only move because both inventories are already held by this contract.
    function releaseBufferToPool(uint256 amount) external onlyOwner {
        if (mintClosed) revert MintStillClosed();
        if (amount == 0) revert ZeroAmount();
        if (amount > bufferStock) revert BufferTooSmall();

        bufferStock -= amount;
        stockReserve += amount;

        emit BufferReleased(amount);
    }

    /// @notice Current share of total stock-token supply held in active meme-pool inventory.
    function utilizationBps() public view returns (uint256) {
        uint256 supply = stockToken.totalSupply();
        if (supply == 0) return 0;

        uint256 utilization = (stockReserve * BPS) / supply;
        return utilization > BPS ? BPS : utilization;
    }

    /// @notice Conservative utilization estimate if the full incoming stock amount entered the pool.
    function projectedUtilizationBps(uint256 stockAmountIn) public view returns (uint256) {
        uint256 supply = stockToken.totalSupply();
        if (supply == 0) return 0;

        uint256 utilization = ((stockReserve + stockAmountIn) * BPS) / supply;
        return utilization > BPS ? BPS : utilization;
    }

    /// @notice Guard at the current pool state, before adding another trade.
    function currentGuardBps() external view returns (uint256) {
        if (!mintClosed) return 0;
        return _guardCurve(utilizationBps());
    }

    /// @notice Guard applied to a proposed stock -> meme trade.
    /// @dev Uses projected utilization so one large trade cannot cross the threshold unguarded.
    function guardBpsForStockIn(uint256 stockAmountIn) public view returns (uint256) {
        if (!mintClosed) return 0;
        return _guardCurve(projectedUtilizationBps(stockAmountIn));
    }

    /// @notice Preview a FUJIYAMA stock -> meme swap.
    function quoteStockForMeme(uint256 stockAmountIn)
        public
        view
        returns (
            uint256 memeAmountOut,
            uint256 guardBpsApplied,
            uint256 bufferedAmount,
            uint256 effectivePoolInput
        )
    {
        if (!initialized || stockReserve == 0 || memeReserve == 0) {
            revert InsufficientLiquidity();
        }
        if (stockAmountIn == 0) revert ZeroAmount();

        guardBpsApplied = guardBpsForStockIn(stockAmountIn);
        bufferedAmount = (stockAmountIn * guardBpsApplied) / BPS;
        effectivePoolInput = stockAmountIn - bufferedAmount;

        memeAmountOut = _amountOut(effectivePoolInput, stockReserve, memeReserve);
    }

    /// @notice Counterfactual quote if the same trade used a standard constant-product path.
    function quoteStandardStockForMeme(uint256 stockAmountIn)
        external
        view
        returns (uint256 memeAmountOut)
    {
        if (!initialized || stockReserve == 0 || memeReserve == 0) {
            revert InsufficientLiquidity();
        }
        if (stockAmountIn == 0) revert ZeroAmount();

        memeAmountOut = _amountOut(stockAmountIn, stockReserve, memeReserve);
    }

    /// @notice Float-draining direction. Part of stock input can be routed to the buffer.
    function swapStockForMeme(uint256 stockAmountIn, uint256 minMemeOut)
        external
        nonReentrant
        returns (uint256 memeAmountOut)
    {
        uint256 guard;
        uint256 buffered;
        uint256 poolInput;

        (memeAmountOut, guard, buffered, poolInput) = quoteStockForMeme(stockAmountIn);
        if (memeAmountOut < minMemeOut) revert Slippage();

        _pull(stockToken, msg.sender, stockAmountIn);

        bufferStock += buffered;
        stockReserve += poolInput;
        memeReserve -= memeAmountOut;

        _push(memeToken, msg.sender, memeAmountOut);

        if (buffered != 0) {
            emit GuardApplied(msg.sender, stockAmountIn, guard, buffered);
        }
        emit SwapStockForMeme(msg.sender, stockAmountIn, poolInput, memeAmountOut);
    }

    /// @notice Restorative direction. Meme -> stock remains unguarded.
    function quoteMemeForStock(uint256 memeAmountIn) public view returns (uint256 stockAmountOut) {
        if (!initialized || stockReserve == 0 || memeReserve == 0) {
            revert InsufficientLiquidity();
        }
        if (memeAmountIn == 0) revert ZeroAmount();

        stockAmountOut = _amountOut(memeAmountIn, memeReserve, stockReserve);
    }

    function swapMemeForStock(uint256 memeAmountIn, uint256 minStockOut)
        external
        nonReentrant
        returns (uint256 stockAmountOut)
    {
        stockAmountOut = quoteMemeForStock(memeAmountIn);
        if (stockAmountOut < minStockOut) revert Slippage();

        _pull(memeToken, msg.sender, memeAmountIn);

        memeReserve += memeAmountIn;
        stockReserve -= stockAmountOut;

        _push(stockToken, msg.sender, stockAmountOut);

        emit SwapMemeForStock(msg.sender, memeAmountIn, stockAmountOut);
    }

    function _guardCurve(uint256 utilization) internal view returns (uint256) {
        if (utilization <= softUtilizationBps) return 0;
        if (utilization >= hardUtilizationBps) return maxGuardBps;

        uint256 progressBps =
            ((utilization - softUtilizationBps) * BPS)
                / (hardUtilizationBps - softUtilizationBps);

        // Convex mountain slope: g = g_max * p^2.
        return (maxGuardBps * progressBps * progressBps) / (BPS * BPS);
    }

    function _amountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal
        view
        returns (uint256)
    {
        if (amountIn == 0) return 0;

        uint256 amountInWithFee = amountIn * (BPS - swapFeeBps);
        uint256 denominator = reserveIn * BPS + amountInWithFee;

        return (reserveOut * amountInWithFee) / denominator;
    }

    function _pull(IFujiyamaERC20 token, address from, uint256 amount) internal {
        if (!token.transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _push(IFujiyamaERC20 token, address to, uint256 amount) internal {
        if (!token.transfer(to, amount)) revert TransferFailed();
    }
}
