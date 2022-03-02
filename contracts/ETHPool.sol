//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.4 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import './IETHPool.sol';

contract ETHPool is IETHPool, AccessControl {
  bytes32 public constant TEAM_MEMBER = keccak256('TEAM_MEMBER');
  mapping(address => UserDeposit) public userToDeposit;
  uint256 public rewardsPerToken;
  uint256 public rewardTime;
  uint256 public ethPool;

  event UserETHDeposited(address indexed _user, uint256 _deposit, uint256 _date);
  event UserETHWithdrawn(address indexed _user, uint256 _userETH, uint256 _date);
  event PoolRewardDeposited(address indexed _team, uint256 _reward, uint256 _ethPool, uint256 _date);
  event TeamETHReceived(address indexed _sender, uint256 _value);
  event TeamETHWithdrawn(address indexed _withdrawer, uint256 _value);

  constructor() {
    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _setupRole(TEAM_MEMBER, msg.sender);
  }

  receive() external payable onlyRole(TEAM_MEMBER) {
    emit TeamETHReceived(msg.sender, msg.value);
  }

  fallback() external payable {
    revert('Wrong call to contract');
  }

  function depositUserETH() external payable override {
    require(msg.value != 0, 'No ether sent to deposit');
    UserDeposit memory userDeposit = userToDeposit[msg.sender];
    userDeposit.deposit += msg.value;
    userDeposit.rewardsPerTokenCredited = rewardsPerToken;
    userDeposit.unclaimedRewards = getUserRewards(msg.sender);
    userToDeposit[msg.sender] = userDeposit;
    ethPool += msg.value;
    emit UserETHDeposited(msg.sender, msg.value, block.timestamp);
  }

  function withdrawUserETH() external override {
    uint256 userDepositValue = userToDeposit[msg.sender].deposit;
    uint256 userETH = userDepositValue + getUserRewards(msg.sender);
    //solhint-disable-next-line
    require(address(this).balance >= userETH, 'Insufficient ether in contract balance');
    ethPool -= userDepositValue;
    delete userToDeposit[msg.sender];
    emit UserETHWithdrawn(msg.sender, userETH, block.timestamp);
    //solhint-disable-next-line
    (bool sent, ) = msg.sender.call{value: userETH}('');
    require(sent, 'Failed to send ether');
  }

  function depositPoolReward() external payable onlyRole(TEAM_MEMBER) {
    require(ethPool != 0, 'Nothing to reward');
    require(rewardTime <= block.timestamp, 'It has not been a week yet');
    rewardsPerToken += msg.value / ethPool;
    rewardTime = block.timestamp + 1 weeks;
    emit PoolRewardDeposited(msg.sender, msg.value, ethPool, block.timestamp);
  }

  function withdrawTeamETH(uint256 _value) external onlyRole(TEAM_MEMBER) {
    //solhint-disable-next-line
    require(address(this).balance >= _value, 'Insufficient ether in contract balance');
    emit TeamETHWithdrawn(msg.sender, _value);
    //solhint-disable-next-line
    (bool sent, ) = msg.sender.call{value: _value}('');
    require(sent, 'Failed to send ether');
  }

  function getTeamETH() external view override returns (uint256) {
    uint256 teamETH = address(this).balance;
    return teamETH;
  }

  function getUserETH(address _user) external view override returns (uint256) {
    uint256 userETH = userToDeposit[_user].deposit + getUserRewards(_user);
    return userETH;
  }

  function getUserRewards(address _user) public view override returns (uint256) {
    UserDeposit memory userDeposit = userToDeposit[_user];
    uint256 userRewardsPerToken = rewardsPerToken - userDeposit.rewardsPerTokenCredited;
    uint256 userRewards = userRewardsPerToken * userDeposit.deposit + userDeposit.unclaimedRewards;
    return userRewards;
  }
}
