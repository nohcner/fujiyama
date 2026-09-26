// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/FujiyamaAMM.sol";
import "../src/MockERC20.sol";

contract FujiyamaAMMTest {
    MockERC20 internal stock;
    MockERC20 internal meme;
    FujiyamaAMM internal amm;

    uint256 internal constant STOCK_SUPPLY = 1_000_000 ether;
    uint256 internal constant MEME_SUPPLY = 10_000_000 ether;
    uint256 internal constant INITIAL_STOCK = 100_000 ether;
    uint256 internal constant INITIAL_MEME = 1_000_000 ether;

    function setUp() public {
        stock = new MockERC20("Mock Stock", "mSTOCK");
        meme = new MockERC20("Fuji Meme", "FUJI");

        stock.mint(address(this), STOCK_SUPPLY);
        meme.mint(address(this), MEME_SUPPLY);

        amm = new FujiyamaAMM(
            address(stock),
            address(meme),
            2_000, // soft guard begins at 20% float utilization
            5_000, // hard threshold at 50%
            9_500, // at most 95% of float-draining input is buffered
            30 // 0.30% swap fee
        );

        stock.approve(address(amm), type(uint256).max);
        meme.approve(address(amm), type(uint256).max);

        amm.seedLiquidity(INITIAL_STOCK, INITIAL_MEME);
        amm.setMintClosed(true);
    }

    function testInitialStateIsBelowGuardThreshold() public view {
        require(amm.utilizationBps() == 1_000, "initial utilization should be 10%");
        require(amm.currentGuardBps() == 0, "guard should be zero below soft threshold");
    }

    function testProjectedGuardRisesConvexly() public view {
        uint256 guard = amm.guardBpsForStockIn(200_000 ether);

        // Projected utilization is 30%. With a 20%-50% range and p^2 curve,
        // the guard is about 10.55%.
        require(guard > 1_000, "guard should exceed 10%");
        require(guard < 1_100, "guard should remain below 11%");
    }

    function testLargeFloatDrainingTradeHitsMaxGuard() public view {
        uint256 guard = amm.guardBpsForStockIn(400_000 ether);
        require(guard == 9_500, "trade reaching hard threshold should use max guard");
    }

    function testStockToMemeRoutesInventoryIntoBuffer() public {
        uint256 stockIn = 200_000 ether;

        (
            uint256 quotedMemeOut,
            uint256 guard,
            uint256 buffered,
            uint256 poolInput
        ) = amm.quoteStockForMeme(stockIn);

        require(guard > 0, "guard should activate");
        require(buffered > 0, "some stock should be buffered");
        require(poolInput + buffered == stockIn, "input accounting mismatch");

        uint256 stockReserveBefore = amm.stockReserve();
        uint256 memeReserveBefore = amm.memeReserve();
        uint256 bufferBefore = amm.bufferStock();

        uint256 memeOut = amm.swapStockForMeme(stockIn, quotedMemeOut);

        require(memeOut == quotedMemeOut, "quote and execution should match");
        require(
            amm.stockReserve() == stockReserveBefore + poolInput,
            "only effective input should enter active stock reserve"
        );
        require(
            amm.bufferStock() == bufferBefore + buffered,
            "guarded inventory should enter buffer"
        );
        require(
            amm.memeReserve() == memeReserveBefore - memeOut,
            "meme reserve should pay output"
        );
    }

    function testRestorativeMemeToStockFlowIsUnguarded() public {
        uint256 memeIn = 100_000 ether;
        uint256 bufferBefore = amm.bufferStock();
        uint256 stockReserveBefore = amm.stockReserve();

        uint256 expectedOut = amm.quoteMemeForStock(memeIn);
        uint256 stockOut = amm.swapMemeForStock(memeIn, expectedOut);

        require(stockOut == expectedOut, "quote and execution should match");
        require(amm.bufferStock() == bufferBefore, "restorative trade must not add to buffer");
        require(
            amm.stockReserve() == stockReserveBefore - stockOut,
            "restorative trade should release stock from active reserve"
        );
    }

    function testMintOpenDisablesGuard() public {
        amm.setMintClosed(false);

        require(
            amm.guardBpsForStockIn(700_000 ether) == 0,
            "guard must turn off when issuance is available"
        );
    }

    function testBufferCanReturnToPoolAfterMintReopens() public {
        amm.swapStockForMeme(200_000 ether, 0);

        uint256 buffered = amm.bufferStock();
        require(buffered > 0, "setup should create buffer inventory");

        amm.setMintClosed(false);

        uint256 releaseAmount = buffered / 2;
        uint256 stockReserveBefore = amm.stockReserve();

        amm.releaseBufferToPool(releaseAmount);

        require(
            amm.bufferStock() == buffered - releaseAmount,
            "buffer should decrease after release"
        );
        require(
            amm.stockReserve() == stockReserveBefore + releaseAmount,
            "active stock reserve should increase after release"
        );
    }

    function testCannotReleaseBufferWhileMintClosed() public {
        amm.swapStockForMeme(200_000 ether, 0);

        (bool ok,) = address(amm).call(
            abi.encodeWithSelector(
                FujiyamaAMM.releaseBufferToPool.selector,
                1 ether
            )
        );

        require(!ok, "buffer release must revert while minting is closed");
    }

    function testConstantProductDoesNotDecreaseOnGuardedSwap() public {
        uint256 kBefore = amm.stockReserve() * amm.memeReserve();

        amm.swapStockForMeme(200_000 ether, 0);

        uint256 kAfter = amm.stockReserve() * amm.memeReserve();
        require(kAfter >= kBefore, "constant product should not decrease");
    }
}
