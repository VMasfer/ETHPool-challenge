import { ethers } from 'hardhat';
import { utils } from 'ethers';
import { evm } from '@utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ETHPool, ETHPool__factory } from '@typechained';
import { expect } from 'chai';

const FORK_BLOCK_NUMBER = 11298165;

describe('ETHPool.sol', function () {
  // signers
  let team: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  // factories
  let ethPoolFactory: ETHPool__factory;

  // contracts
  let ethPool: ETHPool;

  // misc
  let snapshotId: string;

  before(async () => {
    // forking mainnet
    await evm.reset({
      jsonRpcUrl: process.env.RPC_ROPSTEN,
      blockNumber: FORK_BLOCK_NUMBER,
    });

    // getting signers with ETH
    [, team, user1, user2] = await ethers.getSigners();

    // deploying ETHPool contract
    ethPoolFactory = (await ethers.getContractFactory('ETHPool')) as ETHPool__factory;
    ethPool = await ethPoolFactory.connect(team).deploy();

    // snapshot
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor()', function () {
    it('should setup the admin role', async () => {
      let adminRole = await ethPool.DEFAULT_ADMIN_ROLE();
      let isAdmin = await ethPool.hasRole(adminRole, team.address);
      expect(isAdmin).to.eq(true);
    });

    it('should setup the team member role', async () => {
      let teamMemberRole = await ethPool.TEAM_MEMBER();
      let isTeamMember = await ethPool.hasRole(teamMemberRole, team.address);
      expect(isTeamMember).to.eq(true);
    });
  });

  describe('receive()', function () {
    it('should revert if sender is not a team member', async () => {
      let teamMemberRole = await ethPool.TEAM_MEMBER();
      let _value = 1000000;
      let tx = user1.sendTransaction({ to: ethPool.address, value: _value });
      await expect(tx).to.be.revertedWith(
        'AccessControl: account ' + utils.hexlify(user1.address) + ' is missing role ' + utils.hexlify(teamMemberRole)
      );
    });

    it('should emit TeamETHReceived', async () => {
      let _value = 1000000;
      let tx = team.sendTransaction({ to: ethPool.address, value: _value });
      await expect(tx).to.emit(ethPool, 'TeamETHReceived').withArgs(team.address, _value);
    });
  });

  describe('fallback()', function () {
    it('should revert if transaction data is sent', async () => {
      let tx = team.sendTransaction({ to: ethPool.address, data: '0x1e51' });
      await expect(tx).to.be.revertedWith('Wrong call to contract');
    });

    it('should revert if transaction data and ether are sent', async () => {
      let _value = 1000000;
      let tx = team.sendTransaction({ to: ethPool.address, value: _value, data: '0x1e51' });
      await expect(tx).to.be.revertedWith('Wrong call to contract');
    });
  });

  describe('depositUserETH()', function () {
    it('should revert if no ether was sent to deposit', async () => {
      let depositValue = 0;
      await expect(ethPool.depositUserETH({ value: depositValue })).to.be.revertedWith('No ether sent to deposit');
    });

    it('should create a new UserDeposit taking into account the current userETH', async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      let userDepositValue = (await ethPool.userToDeposit(user1.address)).deposit;
      let rewardsPerToken = await ethPool.rewardsPerToken();
      let userRewards = await ethPool.getUserRewards(user1.address);
      let newUserDeposit = [userDepositValue, rewardsPerToken, userRewards];
      let userDeposit = await ethPool.userToDeposit(user1.address);
      expect(userDeposit).to.eql(newUserDeposit);
      await ethPool.connect(team).depositPoolReward({ value: rewardValue });
      let rewardTime = await ethPool.rewardTime();
      evm.advanceTimeAndBlock(rewardTime.toNumber());
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      userDepositValue = userDepositValue.add(depositValue);
      rewardsPerToken = await ethPool.rewardsPerToken();
      userRewards = await ethPool.getUserRewards(user1.address);
      newUserDeposit = [userDepositValue, rewardsPerToken, userRewards];
      userDeposit = await ethPool.userToDeposit(user1.address);
      expect(userDeposit).to.eql(newUserDeposit);
    });

    it('should add deposit to ethPool', async () => {
      let depositValue = 1000000;
      for (let i = 1; i <= 3; i++) {
        await ethPool.depositUserETH({ value: depositValue });
        let _ethPool = await ethPool.ethPool();
        expect(_ethPool).to.eq(depositValue * i);
      }
    });

    it('should emit UserETHDeposited', async () => {
      let depositValue = 1000000;
      let timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await expect(ethPool.connect(user1).depositUserETH({ value: depositValue }))
        .to.emit(ethPool, 'UserETHDeposited')
        .withArgs(user1.address, depositValue, timestamp);
    });
  });

  describe('withdrawUserETH(...)', function () {
    it('should revert if ether in contract balance is insufficient', async () => {
      let depositValue = 1000000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      await ethPool.connect(team).withdrawTeamETH(depositValue);
      await expect(ethPool.connect(user1).withdrawUserETH()).to.be.revertedWith('Insufficient ether in contract balance');
    });

    it('should update ethPool', async () => {
      let depositValue = 1000000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      await ethPool.connect(user2).depositUserETH({ value: depositValue });
      let oldETHPool = await ethPool.ethPool();
      await ethPool.connect(user2).withdrawUserETH();
      let _ethPool = await ethPool.ethPool();
      expect(_ethPool).to.eq(oldETHPool.sub(depositValue));
    });

    it('should delete the UserDeposit', async () => {
      let depositValue = 1000000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      await ethPool.connect(user1).withdrawUserETH();
      let deletedUserDeposit = [ethers.BigNumber.from(0), ethers.BigNumber.from(0), ethers.BigNumber.from(0)];
      let userDeposit = await ethPool.userToDeposit(user1.address);
      expect(userDeposit).to.eql(deletedUserDeposit);
    });

    it('should emit UserETHWithdrawn', async () => {
      let depositValue = 1000000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      let userETH = await ethPool.getUserETH(user1.address);
      let timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await expect(ethPool.connect(user1).withdrawUserETH()).to.emit(ethPool, 'UserETHWithdrawn').withArgs(user1.address, userETH, timestamp);
    });

    it('should send ether', async () => {
      let depositValue = 1000000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      let userETH = await ethPool.getUserETH(user1.address);
      await expect(() => ethPool.connect(user1).withdrawUserETH()).to.changeEtherBalances([ethPool, user1], [-userETH, userETH]);
    });
  });

  describe('depositPoolReward()', function () {
    it('should revert if caller is not a team member', async () => {
      let teamMemberRole = await ethPool.TEAM_MEMBER();
      let rewardValue = 1000;
      await expect(ethPool.connect(user1).depositPoolReward({ value: rewardValue })).to.be.revertedWith(
        'AccessControl: account ' + utils.hexlify(user1.address) + ' is missing role ' + utils.hexlify(teamMemberRole)
      );
    });

    it("should revert if there's nothing to reward", async () => {
      let rewardValue = 1000;
      await expect(ethPool.connect(team).depositPoolReward({ value: rewardValue })).to.be.revertedWith('Nothing to reward');
    });

    it("should revert if it hasn't been a week since the last reward", async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      await ethPool.connect(team).depositPoolReward({ value: rewardValue });
      await expect(ethPool.connect(team).depositPoolReward({ value: rewardValue })).to.be.revertedWith('It has not been a week yet');
    });

    it('should update rewardsPerToken', async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      for (let i = 1; i <= 3; i++) {
        let oldRewardsPerToken = await ethPool.rewardsPerToken();
        await ethPool.connect(team).depositPoolReward({ value: rewardValue });
        let rewardTime = await ethPool.rewardTime();
        evm.advanceTimeAndBlock(rewardTime.toNumber());
        let _ethPool = await ethPool.ethPool();
        let newRewardPerToken = ethers.BigNumber.from(rewardValue).div(_ethPool);
        let rewardsPerToken = await ethPool.rewardsPerToken();
        expect(rewardsPerToken).to.eq(oldRewardsPerToken.add(newRewardPerToken));
      }
    });

    it('should set the new rewardTime', async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      await ethPool.connect(team).depositPoolReward({ value: rewardValue });
      let timestamp = (await ethers.provider.getBlock('latest')).timestamp;
      let rewardTime = await ethPool.rewardTime();
      expect(rewardTime).to.eq(timestamp + 604800);
    });

    it('should emit PoolRewardDeposited', async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      let _ethPool = await ethPool.ethPool();
      let timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await expect(ethPool.connect(team).depositPoolReward({ value: rewardValue }))
        .to.emit(ethPool, 'PoolRewardDeposited')
        .withArgs(team.address, rewardValue, _ethPool, timestamp);
    });
  });

  describe('withdrawTeamETH(...)', function () {
    it('should revert if caller is not a team member', async () => {
      let teamMemberRole = await ethPool.TEAM_MEMBER();
      let _value = 1000000;
      await expect(ethPool.connect(user1).withdrawTeamETH(_value)).to.be.revertedWith(
        'AccessControl: account ' + utils.hexlify(user1.address) + ' is missing role ' + utils.hexlify(teamMemberRole)
      );
    });

    it('should revert if ether in contract balance is insufficient', async () => {
      let _value = 1000000;
      await expect(ethPool.connect(team).withdrawTeamETH(_value)).to.be.revertedWith('Insufficient ether in contract balance');
    });

    it('should emit TeamETHWithdrawn', async () => {
      let _value = 1000000;
      await team.sendTransaction({ to: ethPool.address, value: _value });
      await expect(ethPool.connect(team).withdrawTeamETH(_value)).to.emit(ethPool, 'TeamETHWithdrawn').withArgs(team.address, _value);
    });

    it('should send ether', async () => {
      let _value = 1000000;
      await team.sendTransaction({ to: ethPool.address, value: _value });
      await expect(() => ethPool.connect(team).withdrawTeamETH(_value)).to.changeEtherBalances([ethPool, team], [-_value, _value]);
    });
  });

  describe('getTeamETH()', function () {
    it("should return the contract's ether balance", async () => {
      let _value = 1000000;
      await team.sendTransaction({ to: ethPool.address, value: _value });
      let contractETHBalance = await ethers.provider.getBalance(ethPool.address);
      let teamETH = await ethPool.getTeamETH();
      expect(teamETH).to.eq(contractETHBalance);
    });
  });

  describe('getUserETH(...)', function () {
    it('should calculate and return userETH', async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      let userETH = await ethPool.getUserETH(user1.address);
      expect(userETH).to.eq(0);
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      let userDepositValue = (await ethPool.userToDeposit(user1.address)).deposit;
      userETH = await ethPool.getUserETH(user1.address);
      expect(userETH).to.eq(userDepositValue);
      await ethPool.connect(team).depositPoolReward({ value: rewardValue });
      let userRewards = await ethPool.getUserRewards(user1.address);
      userETH = await ethPool.getUserETH(user1.address);
      expect(userETH).to.eq(userDepositValue.add(userRewards));
    });
  });

  describe('getUserRewards(...)', function () {
    it('should calculate and return userRewards', async () => {
      let depositValue = 100;
      let rewardValue = 200;
      let userRewards = await ethPool.getUserRewards(user1.address);
      expect(userRewards).to.eq(0);
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      let userDeposit = await ethPool.userToDeposit(user1.address);
      userRewards = await ethPool.getUserRewards(user1.address);
      expect(userRewards).to.eq(0);
      await ethPool.connect(team).depositPoolReward({ value: rewardValue });
      let rewardTime = await ethPool.rewardTime();
      evm.advanceTimeAndBlock(rewardTime.toNumber());
      let rewardsPerToken = await ethPool.rewardsPerToken();
      let userRewardsPerToken = rewardsPerToken.sub(userDeposit.rewardsPerTokenCredited);
      userRewards = await ethPool.getUserRewards(user1.address);
      expect(userRewards).to.eq(userRewardsPerToken.mul(userDeposit.deposit));
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      userDeposit = await ethPool.userToDeposit(user1.address);
      expect(userRewards).to.eq(userDeposit.unclaimedRewards);
      await ethPool.connect(team).depositPoolReward({ value: rewardValue });
      rewardTime = await ethPool.rewardTime();
      evm.advanceTimeAndBlock(rewardTime.toNumber());
      rewardsPerToken = await ethPool.rewardsPerToken();
      userRewardsPerToken = rewardsPerToken.sub(userDeposit.rewardsPerTokenCredited);
      userRewards = await ethPool.getUserRewards(user1.address);
      expect(userRewards).to.eq(userRewardsPerToken.mul(userDeposit.deposit).add(userDeposit.unclaimedRewards));
      await ethPool.connect(user1).withdrawUserETH();
      userRewards = await ethPool.getUserRewards(user1.address);
      expect(userRewards).to.eq(0);
    });
  });
});
