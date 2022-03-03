//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.4 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/IAccessControl.sol';

interface IETHPool is IERC20, IAccessControl {
  function depositUserETH() external payable;

  function withdrawUserETH() external;

  function getTeamETH() external view returns (uint256);

  function getUserETH(address _user) external view returns (uint256);

  function getUserRewards(address _user) external view returns (uint256);
}
