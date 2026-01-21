/**
 * Rated.network API Integration
 *
 * Fetches historical and real-time Ethereum staking data
 * API Docs: https://api.rated.network/docs
 */

const RATED_API_BASE = 'https://api.rated.network/v0';

export interface NetworkStats {
  avgValidatorEffectiveness: number;
  networkPenetration: number;
  avgCorrectSourceTarget: number;
  avgCorrectHead: number;
  participation: number;
}

export interface ValidatorQueueStats {
  beaconchainEntering: number;
  beaconchainExiting: number;
  activatedPerEpoch: number;
  exitedPerEpoch: number;
  churnLimit: number;
  avgActivationWaitDays: number;
  avgExitWaitDays: number;
}

export interface NetworkOverview {
  activeValidators: number;
  totalStakedEth: number;
  networkStakingRate: number; // % of total ETH staked
  avgNetworkApr: number;
  consensusLayerApr: number;
  executionLayerApr: number;
  avgValidatorAge: number;
}

export interface HistoricalNetworkStats {
  date: string;
  avgNetworkApr: number;
  totalStakedEth: number;
  activeValidators: number;
  networkPenetration: number;
  entryQueue: number;
  exitQueue: number;
}

/**
 * Fetch current network overview
 */
export async function getNetworkOverview(): Promise<NetworkOverview> {
  const response = await fetch(`${RATED_API_BASE}/eth/network/overview`, {
    headers: {
      Accept: 'application/json',
    },
    next: { revalidate: 300 }, // Cache for 5 minutes
  });

  if (!response.ok) {
    throw new Error(`Rated API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    activeValidators: data.activeValidators || 0,
    totalStakedEth: data.totalStakedEth || 0,
    networkStakingRate: (data.networkPenetration || 0) * 100,
    avgNetworkApr: (data.avgNetworkApr || 0) * 100,
    consensusLayerApr: (data.consensusLayerApr || 0) * 100,
    executionLayerApr: (data.executionLayerApr || 0) * 100,
    avgValidatorAge: data.avgValidatorAge || 0,
  };
}

/**
 * Fetch validator queue statistics
 */
export async function getValidatorQueues(): Promise<ValidatorQueueStats> {
  const response = await fetch(`${RATED_API_BASE}/eth/network/activationQueue`, {
    headers: {
      Accept: 'application/json',
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`Rated API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    beaconchainEntering: data.beaconchainEntering || 0,
    beaconchainExiting: data.beaconchainExiting || 0,
    activatedPerEpoch: data.activatedPerEpoch || 0,
    exitedPerEpoch: data.exitedPerEpoch || 0,
    churnLimit: data.churnLimit || 8,
    avgActivationWaitDays: data.avgActivationWaitDays || 0,
    avgExitWaitDays: data.avgExitWaitDays || 0,
  };
}

/**
 * Fetch historical network statistics
 */
export async function getHistoricalStats(
  days: number = 90
): Promise<HistoricalNetworkStats[]> {
  // Note: Rated API may require authentication for historical data
  // This is a simplified implementation
  const response = await fetch(
    `${RATED_API_BASE}/eth/network/stats?timeWindow=${days}d&granularity=day`,
    {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    }
  );

  if (!response.ok) {
    // Return mock data if API is unavailable
    return generateMockHistoricalData(days);
  }

  const data = await response.json();

  return (data.items || []).map((item: any) => ({
    date: item.date,
    avgNetworkApr: (item.avgNetworkApr || 0) * 100,
    totalStakedEth: item.totalStakedEth || 0,
    activeValidators: item.activeValidators || 0,
    networkPenetration: (item.networkPenetration || 0) * 100,
    entryQueue: item.entryQueue || 0,
    exitQueue: item.exitQueue || 0,
  }));
}

/**
 * Generate mock historical data for development/fallback
 */
function generateMockHistoricalData(days: number): HistoricalNetworkStats[] {
  const data: HistoricalNetworkStats[] = [];
  const now = new Date();

  // Base values (approximate current state)
  let totalStaked = 34_500_000; // ~34.5M ETH staked
  let activeValidators = Math.floor(totalStaked / 32);

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Simulate historical growth (~1-2k validators per day average)
    const dailyGrowth = 1000 + Math.random() * 1000;
    totalStaked = totalStaked - dailyGrowth * 32 * (days - i) / days;
    activeValidators = Math.floor(totalStaked / 32);

    // APR decreases as stake increases (inverse sqrt relationship)
    const baseAPR = 64 * 4 * 82125 / Math.sqrt(totalStaked * 1e9) / 32 * 100;

    data.push({
      date: date.toISOString().split('T')[0],
      avgNetworkApr: baseAPR * (0.95 + Math.random() * 0.1), // Add some noise
      totalStakedEth: totalStaked,
      activeValidators,
      networkPenetration: (totalStaked / 120_000_000) * 100,
      entryQueue: Math.floor(5000 + Math.random() * 10000),
      exitQueue: Math.floor(500 + Math.random() * 2000),
    });
  }

  return data;
}

/**
 * Convert Rated API data to forecast model format
 */
export function toHistoricalDataPoints(
  stats: HistoricalNetworkStats[]
): import('../model/forecast').HistoricalDataPoint[] {
  return stats.map((stat) => ({
    timestamp: new Date(stat.date),
    totalStakedETH: stat.totalStakedEth,
    activeValidators: stat.activeValidators,
    entryQueueLength: stat.entryQueue,
    exitQueueLength: stat.exitQueue,
    observedAPR: stat.avgNetworkApr,
  }));
}
