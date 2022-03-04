//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.4 <0.9.0;

interface IETHPool {
  struct UserDeposit {
    address user;
    uint256 deposit;
    uint256 week;
    uint256 date;
  }
  struct PoolReward {
    address team;
    uint256 reward;
    uint256 ethPool;
    uint256 week;
    uint256 date;
  }

  function depositUserETH() external payable;

  function withdrawUserETH(uint256 _value) external;

  function getPoolRewards() external view returns (PoolReward[] memory);

  function getTeamETH() external view returns (uint256);

  function getUserETH(address _user) external view returns (uint256);

  function getUserTotalRewards(address _user) external view returns (uint256);

  function getUserRewards(address _user) external view returns (uint256);
}
