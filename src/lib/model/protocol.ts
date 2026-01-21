/**
 * Ethereum Staking Protocol Model
 *
 * Models the protocol's reward mechanics and validator queue constraints.
 * This forms the "base layer" of our hybrid forecasting model.
 */

import {
  BASE_REWARD_FACTOR,
  BASE_REWARDS_PER_EPOCH,
  EPOCHS_PER_YEAR,
  MAX_EFFECTIVE_BALANCE,
  EFFECTIVE_BALANCE_INCREMENT,
  MIN_PER_EPOCH_CHURN_LIMIT,
  CHURN_LIMIT_QUOTIENT,
  SECONDS_PER_EPOCH,
  TOTAL_ETH_SUPPLY,
} from './constants';

/**
 * Calculate the base reward per validator per epoch
 * Formula: effective_balance * BASE_REWARD_FACTOR / sqrt(total_effective_balance)
 */
export function getBaseRewardPerEpoch(
  effectiveBalance: number,
  totalEffectiveBalance: number
): number {
  const effectiveBalanceGwei = effectiveBalance * 1e9;
  const totalEffectiveBalanceGwei = totalEffectiveBalance * 1e9;

  // Base reward formula from spec
  const baseReward = (effectiveBalanceGwei * BASE_REWARD_FACTOR) /
    Math.floor(Math.sqrt(totalEffectiveBalanceGwei));

  return baseReward / 1e9; // Convert back to ETH
}

/**
 * Calculate theoretical maximum APR for a validator
 * Assumes perfect attestation and participation
 */
export function getTheoreticalAPR(totalStakedETH: number): number {
  if (totalStakedETH <= 0) return 0;

  // Base reward for 32 ETH validator per epoch
  const baseRewardPerEpoch = getBaseRewardPerEpoch(32, totalStakedETH);

  // Total rewards per epoch (attestation rewards are ~4x base reward)
  const rewardsPerEpoch = baseRewardPerEpoch * BASE_REWARDS_PER_EPOCH;

  // Annual rewards
  const annualRewards = rewardsPerEpoch * EPOCHS_PER_YEAR;

  // APR as percentage
  return (annualRewards / 32) * 100;
}

/**
 * Calculate realistic APR accounting for network participation
 * and MEV rewards
 */
export function getRealisticAPR(
  totalStakedETH: number,
  networkParticipation: number = 0.995, // 99.5% typical
  mevBoostAdoption: number = 0.90,
  averageMEVRewardPerBlock: number = 0.05 // ETH
): number {
  // Base protocol APR
  const baseAPR = getTheoreticalAPR(totalStakedETH);

  // Adjust for network participation (attestation effectiveness)
  const adjustedAPR = baseAPR * networkParticipation;

  // Add MEV rewards estimate
  // Average blocks per year per validator = (365.25 * 24 * 60 * 60) / (12 * numValidators)
  const numValidators = Math.floor(totalStakedETH / 32);
  const slotsPerYear = EPOCHS_PER_YEAR * 32;
  const blocksPerValidatorPerYear = slotsPerYear / numValidators;
  const mevAPR = (blocksPerValidatorPerYear * averageMEVRewardPerBlock * mevBoostAdoption / 32) * 100;

  return adjustedAPR + mevAPR;
}

/**
 * Calculate validator churn limit per epoch
 * This determines how fast validators can enter or exit the network
 */
export function getChurnLimit(activeValidatorCount: number): number {
  return Math.max(
    MIN_PER_EPOCH_CHURN_LIMIT,
    Math.floor(activeValidatorCount / CHURN_LIMIT_QUOTIENT)
  );
}

/**
 * Calculate the activation queue wait time in epochs
 */
export function getActivationQueueWaitTime(
  queueLength: number,
  activeValidatorCount: number
): number {
  const churnLimit = getChurnLimit(activeValidatorCount);
  return Math.ceil(queueLength / churnLimit);
}

/**
 * Calculate the exit queue wait time in epochs
 */
export function getExitQueueWaitTime(
  queueLength: number,
  activeValidatorCount: number
): number {
  const churnLimit = getChurnLimit(activeValidatorCount);
  return Math.ceil(queueLength / churnLimit);
}

/**
 * Convert epochs to days
 */
export function epochsToDays(epochs: number): number {
  return (epochs * SECONDS_PER_EPOCH) / (24 * 60 * 60);
}

/**
 * Calculate stake ratio (% of total ETH staked)
 */
export function getStakeRatio(totalStakedETH: number): number {
  return (totalStakedETH / TOTAL_ETH_SUPPLY) * 100;
}

/**
 * Calculate equilibrium stake ratio for a given target APR
 * Uses the inverse of the APR formula
 */
export function getEquilibriumStakeForAPR(targetAPR: number): number {
  if (targetAPR <= 0) return TOTAL_ETH_SUPPLY;

  // Derive from APR formula:
  // APR = (32 * BASE_REWARD_FACTOR * 4 * EPOCHS_PER_YEAR) / (32 * sqrt(totalStake * 1e9)) * 100
  // Solving for totalStake:
  // sqrt(totalStake * 1e9) = (32 * BASE_REWARD_FACTOR * 4 * EPOCHS_PER_YEAR * 100) / (32 * APR)
  // totalStake = ((BASE_REWARD_FACTOR * 4 * EPOCHS_PER_YEAR * 100) / APR)^2 / 1e9

  const numerator = BASE_REWARD_FACTOR * BASE_REWARDS_PER_EPOCH * EPOCHS_PER_YEAR * 100;
  const sqrtTotalStakeGwei = numerator / targetAPR;
  const totalStakeGwei = sqrtTotalStakeGwei * sqrtTotalStakeGwei;

  return totalStakeGwei / 1e9; // Convert from Gwei to ETH
}

/**
 * Model state for a point in time
 */
export interface ProtocolState {
  totalStakedETH: number;
  activeValidators: number;
  entryQueueLength: number;
  exitQueueLength: number;
  networkParticipation: number;
}

/**
 * Calculate all derived metrics from protocol state
 */
export function deriveMetrics(state: ProtocolState) {
  const stakeRatio = getStakeRatio(state.totalStakedETH);
  const theoreticalAPR = getTheoreticalAPR(state.totalStakedETH);
  const realisticAPR = getRealisticAPR(state.totalStakedETH, state.networkParticipation);
  const churnLimit = getChurnLimit(state.activeValidators);
  const entryQueueDays = epochsToDays(
    getActivationQueueWaitTime(state.entryQueueLength, state.activeValidators)
  );
  const exitQueueDays = epochsToDays(
    getExitQueueWaitTime(state.exitQueueLength, state.activeValidators)
  );

  return {
    stakeRatio,
    theoreticalAPR,
    realisticAPR,
    churnLimit,
    entryQueueDays,
    exitQueueDays,
    validatorsPerDay: churnLimit * (24 * 60 * 60 / SECONDS_PER_EPOCH),
  };
}
