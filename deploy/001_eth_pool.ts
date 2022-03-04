import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { shouldVerifyContract } from 'utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const ethPool = await hre.deployments.deploy('ETHPool', {
    contract: 'contracts/ETHPool.sol:ETHPool',
    from: deployer,
    log: true,
  });

  if (hre.network.name !== 'hardhat' && (await shouldVerifyContract(ethPool))) {
    await hre.run('verify:verify', {
      address: ethPool.address,
    });
  }
};

deployFunction.tags = ['ETHPool', 'testnet'];

export default deployFunction;
