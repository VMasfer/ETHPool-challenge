//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.4 <0.9.0;

import '@openzeppelin/contracts/access/IAccessControl.sol';

interface IETHPool is IAccessControl {
  struct UserDeposit {
    uint256 deposit;
    uint256 rewardsPerTokenCredited;
    uint256 unclaimedRewards;
  }

  function depositUserETH() external payable;

  function withdrawUserETH() external;

  function getTeamETH() external view returns (uint256);

  function getUserETH(address _user) external view returns (uint256);

  function getUserRewards(address _user) external view returns (uint256);
}
