/**
 * Beacon Chain API Integration
 *
 * Fetches real-time data directly from Ethereum beacon chain nodes
 * Uses the standard Beacon API specification
 */

// Default to a public beacon node (can be configured)
const BEACON_API_BASE = process.env.NEXT_PUBLIC_BEACON_API_URL ||
  'https://beaconcha.in/api/v1';

export interface BeaconChainState {
  slot: number;
  epoch: number;
  finalizedEpoch: number;
  justifiedEpoch: number;
  previousJustifiedEpoch: number;
  validatorCount: number;
  activeValidatorCount: number;
  pendingValidatorCount: number;
  exitingValidatorCount: number;
}

export interface ValidatorStatus {
  publicKey: string;
  index: number;
  balance: number;
  effectiveBalance: number;
  status: 'pending_initialized' | 'pending_queued' | 'active_ongoing' |
    'active_exiting' | 'active_slashed' | 'exited_unslashed' |
    'exited_slashed' | 'withdrawal_possible' | 'withdrawal_done';
  activationEpoch: number;
  exitEpoch: number;
}

export interface EpochStats {
  epoch: number;
  validatorsCount: number;
  averageValidatorBalance: number;
  totalValidatorBalance: number;
  eligibleEther: number;
  globalParticipationRate: number;
  votedEther: number;
}

/**
 * Fetch current beacon chain state
 */
export async function getBeaconState(): Promise<BeaconChainState | null> {
  try {
    const response = await fetch(`${BEACON_API_BASE}/epoch/latest`, {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!response.ok) {
      console.warn('Beacon API unavailable:', response.status);
      return null;
    }

    const data = await response.json();
    const epochData = data.data;

    return {
      slot: epochData.slot || 0,
      epoch: epochData.epoch || 0,
      finalizedEpoch: epochData.finalized_epoch || 0,
      justifiedEpoch: epochData.justified_epoch || 0,
      previousJustifiedEpoch: epochData.previous_justified_epoch || 0,
      validatorCount: epochData.validatorscount || 0,
      activeValidatorCount: epochData.activevalidatorscount || 0,
      pendingValidatorCount: epochData.pendingvalidatorscount || 0,
      exitingValidatorCount: epochData.exitingvalidatorscount || 0,
    };
  } catch (error) {
    console.error('Failed to fetch beacon state:', error);
    return null;
  }
}

/**
 * Fetch epoch statistics
 */
export async function getEpochStats(epoch: number | 'latest'): Promise<EpochStats | null> {
  try {
    const response = await fetch(`${BEACON_API_BASE}/epoch/${epoch}`, {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: epoch === 'latest' ? 60 : 3600 },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const epochData = data.data;

    return {
      epoch: epochData.epoch,
      validatorsCount: epochData.validatorscount,
      averageValidatorBalance: epochData.averagevalidatorbalance,
      totalValidatorBalance: epochData.totalvalidatorbalance,
      eligibleEther: epochData.eligibleether,
      globalParticipationRate: epochData.globalparticipationrate,
      votedEther: epochData.votedether,
    };
  } catch (error) {
    console.error('Failed to fetch epoch stats:', error);
    return null;
  }
}

/**
 * Calculate total staked ETH from beacon state
 */
export function calculateTotalStaked(
  activeValidators: number,
  avgBalance: number = 32
): number {
  return activeValidators * avgBalance;
}

/**
 * Estimate current APR from epoch rewards
 */
export function estimateAPRFromEpochs(
  recentEpochs: EpochStats[],
  periodsPerYear: number = 82125
): number {
  if (recentEpochs.length < 2) return 0;

  // Calculate average reward per epoch
  const rewards: number[] = [];
  for (let i = 1; i < recentEpochs.length; i++) {
    const balanceDiff =
      recentEpochs[i].totalValidatorBalance -
      recentEpochs[i - 1].totalValidatorBalance;
    rewards.push(balanceDiff / recentEpochs[i].validatorsCount);
  }

  const avgRewardPerValidator = rewards.reduce((a, b) => a + b, 0) / rewards.length;
  const annualReward = avgRewardPerValidator * periodsPerYear;
  const avgStake = 32; // ETH per validator

  return (annualReward / avgStake) * 100;
}
