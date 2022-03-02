import { task, types } from 'hardhat/config';
import { BigNumber } from 'ethers';

task('query-eth', 'Queries the total amount of ETH held in the contract')
  .addOptionalParam('ethPool', 'The ETHPool contract address', '0xb94075688599A5E1Bfa24c3a885500431AA904e4', types.string)
  .setAction(async (taskArgs, hre) => {
    // getting deployed contract
    let ethPool = await hre.ethers.getContractAt('ETHPool', taskArgs.ethPool);

    // querying ETH
    let teamETH: BigNumber = await ethPool.getTeamETH();
    console.log('The ETHPool contract holds', hre.ethers.constants.EtherSymbol + hre.ethers.utils.formatEther(teamETH));
  });
