//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.4 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import './IETHPool.sol';

contract ETHPool is IETHPool, ERC20, AccessControl {
  bytes32 public constant TEAM_MEMBER = keccak256('TEAM_MEMBER');
  mapping(address => uint256) public userToUnclaimedRewards;
  mapping(address => uint256) public userToRewardsPerTokenCredited;
  uint256 public rewardsPerToken;
  uint256 public rewardTime;

  event UserETHDeposited(address indexed _user, uint256 _deposit, uint256 _date);
  event UserETHWithdrawn(address indexed _user, uint256 _userETH, uint256 _date);
  event PoolRewardDeposited(address indexed _teamMember, uint256 _reward, uint256 _ethPool, uint256 _date);
  event TeamETHReceived(address indexed _teamMember, uint256 _value);
  event TeamETHWithdrawn(address indexed _teamMember, uint256 _value);

  constructor() ERC20('Pooled ETH', 'pETH') {
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
    _mint(msg.sender, msg.value);
    emit UserETHDeposited(msg.sender, msg.value, block.timestamp);
  }

  function withdrawUserETH() external override {
    uint256 userDeposit = balanceOf(msg.sender);
    uint256 userETH = userDeposit + getUserRewards(msg.sender);
    //solhint-disable-next-line
    require(address(this).balance >= userETH, 'Insufficient ether in contract balance');
    _burn(msg.sender, userDeposit);
    emit UserETHWithdrawn(msg.sender, userETH, block.timestamp);
    //solhint-disable-next-line
    (bool sent, ) = msg.sender.call{value: userETH}('');
    require(sent, 'Failed to send ether');
  }

  function depositPoolReward() external payable onlyRole(TEAM_MEMBER) {
    uint256 ethPool = totalSupply();
    require(ethPool != 0, 'Nothing to reward');
    require(rewardTime <= block.timestamp, 'It has not been a week yet');
    rewardsPerToken += (msg.value * 1 ether) / ethPool;
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
    uint256 userETH = balanceOf(_user) + getUserRewards(_user);
    return userETH;
  }

  function getUserRewards(address _user) public view override returns (uint256) {
    uint256 userRewardsPerToken = (rewardsPerToken - userToRewardsPerTokenCredited[_user]) / 1 ether;
    uint256 userRewards = userRewardsPerToken * balanceOf(_user) + userToUnclaimedRewards[_user];
    return userRewards;
  }

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 //amount
  ) internal override {
    if (from == address(0)) {
      userToUnclaimedRewards[to] = getUserRewards(to);
      userToRewardsPerTokenCredited[to] = rewardsPerToken;
    } else if (to == address(0)) {
      delete userToUnclaimedRewards[from];
      delete userToRewardsPerTokenCredited[from];
    } else {
      userToUnclaimedRewards[from] = getUserRewards(from);
      userToRewardsPerTokenCredited[from] = rewardsPerToken;
      userToUnclaimedRewards[to] = getUserRewards(to);
      userToRewardsPerTokenCredited[to] = rewardsPerToken;
    }
  }
}
