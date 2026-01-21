/**
 * Ethereum Protocol Constants
 * Based on Ethereum 2.0 consensus spec
 */

// Time constants
export const SECONDS_PER_SLOT = 12;
export const SLOTS_PER_EPOCH = 32;
export const SECONDS_PER_EPOCH = SECONDS_PER_SLOT * SLOTS_PER_EPOCH; // 384 seconds
export const EPOCHS_PER_DAY = (24 * 60 * 60) / SECONDS_PER_EPOCH; // ~225
export const EPOCHS_PER_YEAR = EPOCHS_PER_DAY * 365.25; // ~82,125

// Validator constants
export const EFFECTIVE_BALANCE_INCREMENT = 1_000_000_000; // 1 Gwei
export const MAX_EFFECTIVE_BALANCE = 32_000_000_000; // 32 ETH in Gwei
export const MIN_PER_EPOCH_CHURN_LIMIT = 4;
export const CHURN_LIMIT_QUOTIENT = 65536;

// Reward constants
export const BASE_REWARD_FACTOR = 64;
export const BASE_REWARDS_PER_EPOCH = 4;
export const PROPOSER_REWARD_QUOTIENT = 8;
export const SYNC_COMMITTEE_SIZE = 512;
export const SYNC_REWARD_WEIGHT = 2;
export const WEIGHT_DENOMINATOR = 64;

// Network state (approximate current values - to be updated from chain)
export const TOTAL_ETH_SUPPLY = 120_000_000; // ~120M ETH total supply

// Electra upgrade constants (if applicable)
export const MAX_EFFECTIVE_BALANCE_ELECTRA = 2048_000_000_000; // 2048 ETH post-Electra
