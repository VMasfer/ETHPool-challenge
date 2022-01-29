//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.4 <0.9.0;

import '@openzeppelin/contracts/access/Ownable.sol';
import './IETHPool.sol';

contract ETHPool is IETHPool, Ownable {
  PoolReward[] public poolRewards;
  mapping(address => UserDeposit) public userToDeposit;
  mapping(address => uint256) public userToTotalETHDeposited;
  mapping(address => uint256) public userToTotalETHWithdrawn;
  mapping(address => uint256) private _userToTotalRewards;
  uint256 public totalUserETHDeposited;
  uint256 public totalUserETHWithdrawn;
  uint256 public totalPoolRewards;
  uint256 public ethPool;
  uint256 public week;
  uint256 public rewardTime;

  event UserETHDeposited(address indexed _user, uint256 _deposit, uint256 indexed _week, uint256 _date);
  event UserETHWithdrawn(address indexed _withdrawer, uint256 _value, uint256 indexed _week, uint256 _date);
  event PoolRewardDeposited(address indexed _team, uint256 _reward, uint256 _ethPool, uint256 _week, uint256 _date);
  event TeamETHReceived(address indexed _sender, uint256 _value);
  event TeamETHWithdrawn(address indexed _withdrawer, uint256 _value);

  receive() external payable onlyOwner {
    emit TeamETHReceived(msg.sender, msg.value);
  }

  fallback() external payable {
    revert('Wrong call to contract');
  }

  function depositUserETH() external payable override {
    require(msg.value != 0, 'No ether sent to deposit');
    uint256 userRewards = getUserRewards(msg.sender);
    uint256 userETH = userToDeposit[msg.sender].deposit + userRewards;
    UserDeposit memory userDeposit;
    userDeposit.user = msg.sender;
    userDeposit.deposit = userETH + msg.value;
    userDeposit.week = week;
    userDeposit.date = block.timestamp;
    userToDeposit[msg.sender] = userDeposit;
    userToTotalETHDeposited[msg.sender] += msg.value;
    totalUserETHDeposited += msg.value;
    ethPool += msg.value;
    _userToTotalRewards[msg.sender] += userRewards;
    emit UserETHDeposited(msg.sender, msg.value, week, block.timestamp);
  }

  function withdrawUserETH(uint256 _value) external override {
    //solhint-disable-next-line
    require(address(this).balance >= _value, 'Insufficient ether in contract balance');
    uint256 userRewards = getUserRewards(msg.sender);
    uint256 userETH = userToDeposit[msg.sender].deposit + userRewards;
    //solhint-disable-next-line
    require(userETH >= _value, 'Insufficient ether in user balance');
    if (userETH == _value) {
      delete userToDeposit[msg.sender];
    } else {
      UserDeposit memory userDeposit;
      userDeposit.user = msg.sender;
      userDeposit.deposit = userETH - _value;
      userDeposit.week = week;
      userDeposit.date = block.timestamp;
      userToDeposit[msg.sender] = userDeposit;
    }
    userToTotalETHWithdrawn[msg.sender] += _value;
    totalUserETHWithdrawn += _value;
    ethPool -= _value;
    _userToTotalRewards[msg.sender] += userRewards;
    emit UserETHWithdrawn(msg.sender, _value, week, block.timestamp);
    //solhint-disable-next-line
    (bool sent, ) = msg.sender.call{value: _value}('');
    require(sent, 'Failed to send ether');
  }

  function depositPoolReward() external payable onlyOwner {
    require(ethPool != 0, 'Nothing to reward');
    require(rewardTime <= block.timestamp, 'It has not been a week yet');
    PoolReward memory poolReward;
    poolReward.team = msg.sender;
    poolReward.reward = msg.value;
    poolReward.ethPool = ethPool;
    poolReward.week = week;
    poolReward.date = block.timestamp;
    poolRewards.push(poolReward);
    emit PoolRewardDeposited(msg.sender, msg.value, ethPool, week, block.timestamp);
    totalPoolRewards += msg.value;
    ethPool += msg.value;
    week++;
    rewardTime = block.timestamp + 1 weeks;
  }

  function withdrawTeamETH(uint256 _value) external onlyOwner {
    //solhint-disable-next-line
    require(address(this).balance >= _value, 'Insufficient ether in contract balance');
    emit TeamETHWithdrawn(msg.sender, _value);
    //solhint-disable-next-line
    (bool sent, ) = msg.sender.call{value: _value}('');
    require(sent, 'Failed to send ether');
  }

  function getPoolRewards() external view override returns (PoolReward[] memory) {
    return poolRewards;
  }

  function getTeamETH() external view override returns (uint256) {
    uint256 teamETH = address(this).balance;
    return teamETH;
  }

  function getUserETH(address _user) external view override returns (uint256) {
    uint256 userETH = userToDeposit[_user].deposit + getUserRewards(_user);
    return userETH;
  }

  function getUserTotalRewards(address _user) external view override returns (uint256) {
    uint256 userTotalRewards = _userToTotalRewards[_user] + getUserRewards(_user);
    return userTotalRewards;
  }

  function getUserRewards(address _user) public view override returns (uint256) {
    uint256 userRewards;
    if (userToDeposit[_user].deposit != 0) {
      for (uint256 i = userToDeposit[_user].week; i < poolRewards.length; i++) {
        uint256 poolPercentage = ((userToDeposit[_user].deposit + userRewards) * 100) / poolRewards[i].ethPool;
        uint256 userReward = (poolRewards[i].reward * poolPercentage) / 100;
        userRewards += userReward;
      }
    }
    return userRewards;
  }
}
