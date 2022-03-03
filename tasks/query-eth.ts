import { task, types } from 'hardhat/config';
import { BigNumber } from 'ethers';

task('query-eth', 'Queries the total amount of ETH held in the contract')
  .addOptionalParam('ethPool', 'The ETHPool contract address', '0xaBc891A704260D5B3395A6295d8466276E78c306', types.string)
  .setAction(async (taskArgs, hre) => {
    // getting deployed contract
    let ethPool = await hre.ethers.getContractAt('ETHPool', taskArgs.ethPool);

    // querying ETH
    let teamETH: BigNumber = await ethPool.getTeamETH();
    console.log('The ETHPool contract holds', hre.ethers.constants.EtherSymbol + hre.ethers.utils.formatEther(teamETH));
  });
