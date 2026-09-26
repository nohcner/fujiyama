// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/FujiyamaAMM.sol";
import "../src/MockERC20.sol";

interface Vm {
    function envUint(string calldata name) external returns (uint256);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Foundry deployment script without a forge-std dependency.
/// @dev PRIVATE_KEY is read from the local environment and is never stored in this repo.
contract Deploy {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run()
        external
        returns (MockERC20 stock, MockERC20 meme, FujiyamaAMM amm)
    {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        vm.startBroadcast(privateKey);

        stock = new MockERC20("Mock Stock Token", "mSTOCK");
        meme = new MockERC20("Fuji Meme", "FUJI");

        stock.mint(deployer, 1_000_000 ether);
        meme.mint(deployer, 10_000_000 ether);

        amm = new FujiyamaAMM(
            address(stock),
            address(meme),
            2_000, // 20% soft utilization threshold
            5_000, // 50% hard utilization threshold
            9_500, // 95% max routing guard
            30 // 0.30% swap fee
        );

        stock.approve(address(amm), type(uint256).max);
        meme.approve(address(amm), type(uint256).max);

        amm.seedLiquidity(100_000 ether, 1_000_000 ether);
        amm.setMintClosed(true);

        vm.stopBroadcast();
    }
}
