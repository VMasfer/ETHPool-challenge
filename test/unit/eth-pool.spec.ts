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
    it('should execute Ownable constructor', async () => {
      let owner = await ethPool.owner();
      expect(owner).to.equal(team.address);
    });
  });

  describe('receive()', function () {
    it('should revert if sender is not the owner', async () => {
      let _value = 1000000;
      let tx = user1.sendTransaction({ to: ethPool.address, value: _value });
      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
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
      let depositValue = ethers.BigNumber.from(1000000);
      let week = await ethPool.week();
      for (let i = 1; i <= 3; i++) {
        let userETH = await ethPool.getUserETH(user1.address);
        await ethPool.connect(user1).depositUserETH({ value: depositValue });
        let timestamp = ethers.BigNumber.from((await ethers.provider.getBlock('latest')).timestamp);
        let newUserDeposit = [user1.address, userETH.add(depositValue), week, timestamp];
        let userDeposit = await ethPool.userToDeposit(user1.address);
        expect(userDeposit).to.eql(newUserDeposit);
      }
    });

    it('should add deposit to userToTotalETHDeposited', async () => {
      let depositValue = 1000000;
      for (let i = 1; i <= 3; i++) {
        await ethPool.connect(user1).depositUserETH({ value: depositValue });
        let userTotalETHDeposited = await ethPool.userToTotalETHDeposited(user1.address);
        expect(userTotalETHDeposited).to.eq(depositValue * i);
      }
    });

    it('should add deposit to totalUserETHDeposited', async () => {
      let depositValue = 1000000;
      for (let i = 1; i <= 3; i++) {
        await ethPool.depositUserETH({ value: depositValue });
        let totalUserETHDeposited = await ethPool.totalUserETHDeposited();
        expect(totalUserETHDeposited).to.eq(depositValue * i);
      }
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
      let week = await ethPool.week();
      let timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await expect(ethPool.connect(user1).depositUserETH({ value: depositValue }))
        .to.emit(ethPool, 'UserETHDeposited')
        .withArgs(user1.address, depositValue, week, timestamp);
    });
  });

  describe('withdrawUserETH(...)', function () {
    it('should revert if ether in contract balance is insufficient', async () => {
      let withdrawalValue = 1000;
      await expect(ethPool.connect(user1).withdrawUserETH(withdrawalValue)).to.be.revertedWith('Insufficient ether in contract balance');
    });

    it('should revert if ether in user balance is insufficient', async () => {
      let depositValue = 1000;
      let withdrawalValue = 1000000;
      await team.sendTransaction({ to: ethPool.address, value: withdrawalValue });
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      await expect(ethPool.connect(user1).withdrawUserETH(withdrawalValue)).to.be.revertedWith('Insufficient ether in user balance');
    });

    it('should delete the UserDeposit upon withdrawing all userETH', async () => {
      let depositValue = ethers.BigNumber.from(1000000);
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      let userETH = await ethPool.getUserETH(user1.address);
      await ethPool.connect(user1).withdrawUserETH(depositValue);
      let newUserDeposit = [ethers.constants.AddressZero, userETH.sub(depositValue), ethers.BigNumber.from(0), ethers.BigNumber.from(0)];
      let userDeposit = await ethPool.userToDeposit(user1.address);
      expect(userDeposit).to.eql(newUserDeposit);
    });

    it('should create a new UserDeposit with the remaining userETH, if any', async () => {
      let depositValue = ethers.BigNumber.from(1000000);
      let withdrawalValue = 1000;
      let week = await ethPool.week();
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      for (let i = 1; i <= 3; i++) {
        let userETH = await ethPool.getUserETH(user1.address);
        await ethPool.connect(user1).withdrawUserETH(withdrawalValue);
        let timestamp = ethers.BigNumber.from((await ethers.provider.getBlock('latest')).timestamp);
        let newUserDeposit = [user1.address, userETH.sub(withdrawalValue), week, timestamp];
        let userDeposit = await ethPool.userToDeposit(user1.address);
        expect(userDeposit).to.eql(newUserDeposit);
      }
    });

    it('should update userToTotalETHWithdrawn', async () => {
      let depositValue = 1000000;
      let withdrawalValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      for (let i = 1; i <= 3; i++) {
        await ethPool.connect(user1).withdrawUserETH(withdrawalValue);
        let userToTotalETHWithdrawn = await ethPool.userToTotalETHWithdrawn(user1.address);
        expect(userToTotalETHWithdrawn).to.eq(withdrawalValue * i);
      }
    });

    it('should update totalUserETHWithdrawn', async () => {
      let depositValue = 1000000;
      let withdrawalValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      for (let i = 1; i <= 3; i++) {
        await ethPool.connect(user1).withdrawUserETH(withdrawalValue);
        let totalUserETHWithdrawn = await ethPool.totalUserETHWithdrawn();
        expect(totalUserETHWithdrawn).to.eq(withdrawalValue * i);
      }
    });

    it('should update ethPool', async () => {
      let depositValue = 1000000;
      let withdrawalValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      for (let i = 1; i <= 3; i++) {
        await ethPool.connect(user1).withdrawUserETH(withdrawalValue);
        let _ethPool = await ethPool.ethPool();
        expect(_ethPool).to.eq(depositValue - withdrawalValue * i);
      }
    });

    it('should emit UserETHWithdrawn', async () => {
      let depositValue = 1000000;
      let withdrawalValue = 1000;
      let week = await ethPool.week();
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      let timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await expect(ethPool.connect(user1).withdrawUserETH(withdrawalValue))
        .to.emit(ethPool, 'UserETHWithdrawn')
        .withArgs(user1.address, withdrawalValue, week, timestamp);
    });

    it('should send ether', async () => {
      let depositValue = 1000000;
      let withdrawalValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      await expect(() => ethPool.connect(user1).withdrawUserETH(withdrawalValue)).to.changeEtherBalances(
        [ethPool, user1],
        [-withdrawalValue, withdrawalValue]
      );
    });
  });

  describe('depositPoolReward()', function () {
    it('should revert if caller is not the owner', async () => {
      let rewardValue = 1000;
      await expect(ethPool.connect(user1).depositPoolReward({ value: rewardValue })).to.be.revertedWith('Ownable: caller is not the owner');
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

    it('should create a PoolReward', async () => {
      let depositValue = 1000000;
      let rewardValue = ethers.BigNumber.from(1000);
      let week = await ethPool.week();
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      let _ethPool = await ethPool.ethPool();
      await ethPool.connect(team).depositPoolReward({ value: rewardValue });
      let timestamp = ethers.BigNumber.from((await ethers.provider.getBlock('latest')).timestamp);
      let poolReward = [team.address, rewardValue, _ethPool, week, timestamp];
      let poolRewards = await ethPool.getPoolRewards();
      expect(poolRewards).to.eql([poolReward]);
    });

    it('should emit PoolRewardDeposited', async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      let week = await ethPool.week();
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      let _ethPool = await ethPool.ethPool();
      let timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      await expect(ethPool.connect(team).depositPoolReward({ value: rewardValue }))
        .to.emit(ethPool, 'PoolRewardDeposited')
        .withArgs(team.address, rewardValue, _ethPool, week, timestamp);
    });

    it('should add reward to totalPoolRewards', async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      for (let i = 1; i <= 3; i++) {
        await ethPool.connect(team).depositPoolReward({ value: rewardValue });
        let rewardTime = await ethPool.rewardTime();
        evm.advanceTimeAndBlock(rewardTime.toNumber());
        let totalPoolRewards = await ethPool.totalPoolRewards();
        expect(totalPoolRewards).to.eq(rewardValue * i);
      }
    });

    it('should add reward to ethPool', async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      for (let i = 1; i <= 3; i++) {
        await ethPool.connect(team).depositPoolReward({ value: rewardValue });
        let rewardTime = await ethPool.rewardTime();
        evm.advanceTimeAndBlock(rewardTime.toNumber());
        let _ethPool = await ethPool.ethPool();
        expect(_ethPool).to.eq(depositValue + rewardValue * i);
      }
    });

    it('should increment week', async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      for (let i = 1; i <= 3; i++) {
        await ethPool.connect(team).depositPoolReward({ value: rewardValue });
        let rewardTime = await ethPool.rewardTime();
        evm.advanceTimeAndBlock(rewardTime.toNumber());
        let week = await ethPool.week();
        expect(week).to.eq(i);
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
  });

  describe('withdrawTeamETH(...)', function () {
    it('should revert if caller is not the owner', async () => {
      let _value = 1000000;
      await expect(ethPool.connect(user1).withdrawTeamETH(_value)).to.be.revertedWith('Ownable: caller is not the owner');
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

  describe('getPoolRewards()', function () {
    it('should return poolRewards', async () => {
      let depositValue = 1000000;
      let rewardValue = ethers.BigNumber.from(1000);
      let week = await ethPool.week();
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      let _ethPool = await ethPool.ethPool();
      await ethPool.connect(team).depositPoolReward({ value: rewardValue });
      let timestamp = ethers.BigNumber.from((await ethers.provider.getBlock('latest')).timestamp);
      let poolReward = [team.address, rewardValue, _ethPool, week, timestamp];
      let poolRewards = await ethPool.getPoolRewards();
      expect(poolRewards).to.eql([poolReward]);
    });
  });

  describe('getTeamETH()', function () {
    it("should return the contract's ether balance", async () => {
      let _value = 1000000;
      await team.sendTransaction({ to: ethPool.address, value: _value });
      let teamETH = await ethPool.getTeamETH();
      expect(teamETH).to.equal(await ethers.provider.getBalance(ethPool.address));
    });
  });

  describe('getUserETH(...)', function () {
    it('should calculate and return userETH', async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      let userETH = await ethPool.getUserETH(user1.address);
      expect(userETH).to.eq(0);
      await ethPool.connect(user1).depositUserETH({ value: depositValue });
      userETH = await ethPool.getUserETH(user1.address);
      expect(userETH).to.eq(depositValue);
      await ethPool.connect(team).depositPoolReward({ value: rewardValue });
      userETH = await ethPool.getUserETH(user1.address);
      expect(userETH).to.eq(depositValue + rewardValue);
    });
  });

  describe('getUserTotalRewards(...)', function () {
    it('should calculate and return userTotalRewards', async () => {
      let depositValue = 1000000;
      let rewardValue = 1000;
      let userTotalRewards = await ethPool.getUserTotalRewards(user1.address);
      expect(userTotalRewards).to.eq(0);
      for (let i = 1; i <= 3; i++) {
        await ethPool.connect(user1).depositUserETH({ value: depositValue });
        await ethPool.connect(team).depositPoolReward({ value: rewardValue });
        let rewardTime = await ethPool.rewardTime();
        evm.advanceTimeAndBlock(rewardTime.toNumber());
        userTotalRewards = await ethPool.getUserTotalRewards(user1.address);
        expect(userTotalRewards).to.eq(rewardValue * i);
      }
    });
  });

  describe('getUserRewards(...)', function () {
    it('should calculate and return userRewards', async () => {
      let user1DepositValue = 100;
      let user2DepositValue = 300;
      let rewardValue = 200;
      let user1Rewards = await ethPool.getUserRewards(user1.address);
      expect(user1Rewards).to.eq(0);
      await ethPool.connect(user1).depositUserETH({ value: user1DepositValue });
      user1Rewards = await ethPool.getUserRewards(user1.address);
      expect(user1Rewards).to.eq(0);
      for (let i = 1; i <= 3; i++) {
        await ethPool.connect(team).depositPoolReward({ value: rewardValue });
        let rewardTime = await ethPool.rewardTime();
        evm.advanceTimeAndBlock(rewardTime.toNumber());
        user1Rewards = await ethPool.getUserRewards(user1.address);
        expect(user1Rewards).to.eq(rewardValue * i);
      }
      let user1Reward1 = await ethPool.getUserRewards(user1.address);
      await ethPool.connect(user2).depositUserETH({ value: user2DepositValue });
      let _ethPool = await ethPool.ethPool();
      await ethPool.connect(team).depositPoolReward({ value: rewardValue });
      let user1PoolPercentage = ethers.BigNumber.from(user1DepositValue).add(user1Reward1).mul(100).div(_ethPool);
      let user2PoolPercentage = ethers.BigNumber.from(user2DepositValue).mul(100).div(_ethPool);
      let user1Reward2 = ethers.BigNumber.from(rewardValue).mul(user1PoolPercentage).div(100);
      let user2Reward = ethers.BigNumber.from(rewardValue).mul(user2PoolPercentage).div(100);
      user1Rewards = await ethPool.getUserRewards(user1.address);
      let user2Rewards = await ethPool.getUserRewards(user2.address);
      expect(user1Rewards).to.eq(user1Reward1.add(user1Reward2));
      expect(user2Rewards).to.eq(user2Reward);
      await ethPool.connect(user1).depositUserETH({ value: user1DepositValue });
      await ethPool.connect(user2).depositUserETH({ value: user2DepositValue });
    });
  });
});
