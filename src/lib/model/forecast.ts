/**
 * Hybrid Forecasting Model
 *
 * Combines protocol mechanics with statistical trend analysis
 * to forecast stake ratio and APR over 1-12 month horizons.
 */

import { mean, standardDeviation, linearRegression, sampleCorrelation } from 'simple-statistics';
import {
  getTheoreticalAPR,
  getRealisticAPR,
  getStakeRatio,
  getChurnLimit,
  getEquilibriumStakeForAPR,
  epochsToDays,
} from './protocol';
import { TOTAL_ETH_SUPPLY, SECONDS_PER_EPOCH, EPOCHS_PER_DAY } from './constants';
import {
  type FeeRegime,
  type ExecutionDataPoint,
  detectRegime,
  forecastExecutionYield,
  generateMockExecutionHistory,
} from './execution';

/**
 * Historical data point for training
 */
export interface HistoricalDataPoint {
  timestamp: Date;
  totalStakedETH: number;
  activeValidators: number;
  entryQueueLength: number;
  exitQueueLength: number;
  observedAPR?: number; // Actual observed APR if available
}

/**
 * Driver attribution breakdown
 */
export interface DriverAttribution {
  consensusAPR: number; // Base protocol rewards (inverse sqrt of stake)
  executionAPR: number; // Priority fees + MEV
  totalAPR: number;
  // Percentage contribution
  consensusPct: number;
  executionPct: number;
  // Execution breakdown
  priorityFeesPct: number;
  mevPct: number;
  // Regime info
  feeRegime: 'calm' | 'elevated' | 'hot';
}

/**
 * Forecast point
 */
export interface ForecastPoint {
  date: Date;
  totalStakedETH: number;
  stakeRatio: number;
  forecastAPR: number;
  confidence: {
    lower: number;
    upper: number;
  };
  // Breakdown of forecast components
  components: {
    protocolBase: number;
    trendAdjustment: number;
    queueConstraint: number;
  };
  // Driver attribution
  drivers: DriverAttribution;
}

/**
 * Forecast scenario parameters
 */
export interface ScenarioParams {
  netFlowBias: number; // -1 (bearish) to +1 (bullish) bias on staking demand
  mevMultiplier: number; // 0.5 to 2.0 multiplier on MEV rewards
  queuePressure: number; // Multiplier on queue lengths
  feeRegimeBias: 'calm' | 'elevated' | 'hot' | 'current'; // Force a fee regime or use current
}

const DEFAULT_SCENARIO: ScenarioParams = {
  netFlowBias: 0,
  mevMultiplier: 1.0,
  queuePressure: 1.0,
  feeRegimeBias: 'current',
};

/**
 * Calculate the trend in staking growth from historical data
 * Returns daily growth rate
 */
export function calculateStakingTrend(history: HistoricalDataPoint[]): {
  dailyGrowthRate: number;
  volatility: number;
  r2: number;
} {
  if (history.length < 2) {
    return { dailyGrowthRate: 0, volatility: 0, r2: 0 };
  }

  // Calculate daily changes
  const dailyChanges: number[] = [];
  const sortedHistory = [...history].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  for (let i = 1; i < sortedHistory.length; i++) {
    const daysDiff =
      (sortedHistory[i].timestamp.getTime() - sortedHistory[i - 1].timestamp.getTime()) /
      (24 * 60 * 60 * 1000);
    const stakeDiff = sortedHistory[i].totalStakedETH - sortedHistory[i - 1].totalStakedETH;
    if (daysDiff > 0) {
      dailyChanges.push(stakeDiff / daysDiff);
    }
  }

  if (dailyChanges.length === 0) {
    return { dailyGrowthRate: 0, volatility: 0, r2: 0 };
  }

  // Linear regression on stake vs time
  const regressionData: [number, number][] = sortedHistory.map((point, i) => [
    i,
    point.totalStakedETH,
  ]);

  const regression = linearRegression(regressionData);
  const avgDailyGrowth = mean(dailyChanges);
  const volatility = dailyChanges.length > 1 ? standardDeviation(dailyChanges) : 0;

  // Calculate R² for trend fit
  const predictions = regressionData.map(([x]) => regression.m * x + regression.b);
  const actuals = regressionData.map(([, y]) => y);
  const correlation = sampleCorrelation(predictions, actuals);
  const r2 = correlation * correlation;

  return {
    dailyGrowthRate: avgDailyGrowth,
    volatility,
    r2,
  };
}

/**
 * Calculate net queue pressure (entry demand vs exit demand)
 */
export function calculateQueuePressure(
  entryQueueLength: number,
  exitQueueLength: number,
  activeValidators: number
): number {
  // Net validators per day based on queues
  const churnLimit = getChurnLimit(activeValidators);
  const validatorsPerDay = churnLimit * EPOCHS_PER_DAY;

  // Days to clear each queue
  const entryDays = entryQueueLength / validatorsPerDay;
  const exitDays = exitQueueLength / validatorsPerDay;

  // Net pressure: positive = growth, negative = contraction
  return entryQueueLength - exitQueueLength;
}

/**
 * Calculate maximum daily stake change based on queue constraints
 */
export function getMaxDailyStakeChange(activeValidators: number): number {
  const churnLimit = getChurnLimit(activeValidators);
  const validatorsPerDay = churnLimit * EPOCHS_PER_DAY;
  return validatorsPerDay * 32; // 32 ETH per validator
}

/**
 * Apply APR-based feedback to growth rate
 * Higher APR attracts more stakers, lower APR discourages
 */
export function applyAPRFeedback(
  baseGrowthRate: number,
  currentAPR: number,
  targetAPR: number = 4.0 // Market equilibrium assumption
): number {
  // If APR > target, expect more staking (positive adjustment)
  // If APR < target, expect less staking (negative adjustment)
  const aprDiff = currentAPR - targetAPR;
  const feedbackFactor = aprDiff * 0.1; // 10% adjustment per 1% APR difference

  return baseGrowthRate * (1 + feedbackFactor);
}

/**
 * Generate forecast for stake ratio and APR
 */
export function generateForecast(
  history: HistoricalDataPoint[],
  monthsAhead: number,
  scenario: ScenarioParams = DEFAULT_SCENARIO,
  executionHistory?: ExecutionDataPoint[]
): ForecastPoint[] {
  if (history.length === 0) {
    throw new Error('No historical data provided');
  }

  // Get latest state
  const sortedHistory = [...history].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
  const latestState = sortedHistory[0];

  // Calculate trend from history
  const trend = calculateStakingTrend(history);

  // Get current queue pressure
  const queuePressure =
    calculateQueuePressure(
      latestState.entryQueueLength * scenario.queuePressure,
      latestState.exitQueueLength * scenario.queuePressure,
      latestState.activeValidators
    );

  // Calculate max daily change constraint
  const maxDailyChange = getMaxDailyStakeChange(latestState.activeValidators);

  // Generate mock execution history if not provided
  const execHistory = executionHistory || generateMockExecutionHistory(90, latestState.activeValidators);

  // Detect current fee regime
  const regimeDetection = detectRegime(execHistory, latestState.activeValidators);
  const baseRegime = scenario.feeRegimeBias === 'current'
    ? regimeDetection.currentRegime
    : scenario.feeRegimeBias;

  // Get current execution yield for regime model
  const recentExec = execHistory.slice(0, 7);
  const currentExecYield = recentExec.length > 0
    ? mean(recentExec.map(d => (d.priorityFeesETH + d.mevRewardsETH) / latestState.activeValidators))
    : 0.001;

  // Generate daily forecasts
  const daysToForecast = monthsAhead * 30;
  const forecasts: ForecastPoint[] = [];

  let currentStake = latestState.totalStakedETH;
  let currentValidators = latestState.activeValidators;
  let currentEntryQueue = latestState.entryQueueLength;
  let currentExitQueue = latestState.exitQueueLength;

  for (let day = 1; day <= daysToForecast; day++) {
    const forecastDate = new Date(latestState.timestamp);
    forecastDate.setDate(forecastDate.getDate() + day);

    // Calculate consensus APR (base protocol rewards)
    const consensusAPR = getTheoreticalAPR(currentStake);

    // Forecast execution yield with regime model
    const execForecast = forecastExecutionYield(
      currentExecYield,
      baseRegime,
      day,
      currentValidators
    );

    // Apply scenario multiplier to execution yield
    const adjustedExecAPR = execForecast.annualizedAPR * scenario.mevMultiplier;

    // Total APR = consensus + execution
    const totalAPR = consensusAPR + adjustedExecAPR;

    // Calculate driver attribution
    const drivers: DriverAttribution = {
      consensusAPR,
      executionAPR: adjustedExecAPR,
      totalAPR,
      consensusPct: (consensusAPR / totalAPR) * 100,
      executionPct: (adjustedExecAPR / totalAPR) * 100,
      priorityFeesPct: (execForecast.components.priorityFees / adjustedExecAPR) * (adjustedExecAPR / totalAPR) * 100,
      mevPct: (execForecast.components.mevRewards / adjustedExecAPR) * (adjustedExecAPR / totalAPR) * 100,
      feeRegime: execForecast.regime,
    };

    // Calculate expected daily growth with feedback
    let expectedGrowth = applyAPRFeedback(
      trend.dailyGrowthRate + scenario.netFlowBias * maxDailyChange * 0.1,
      totalAPR
    );

    // Apply queue constraints
    const netQueueFlow = (currentEntryQueue - currentExitQueue) * 32;
    if (expectedGrowth > 0) {
      // Growth is limited by entry queue processing
      expectedGrowth = Math.min(expectedGrowth, maxDailyChange);
    } else {
      // Contraction is limited by exit queue processing
      expectedGrowth = Math.max(expectedGrowth, -maxDailyChange);
    }

    // Update state
    currentStake = Math.max(0, currentStake + expectedGrowth);
    currentValidators = Math.floor(currentStake / 32);

    // Decay queues based on churn
    const dailyChurn = getChurnLimit(currentValidators) * EPOCHS_PER_DAY;
    currentEntryQueue = Math.max(0, currentEntryQueue - dailyChurn);
    currentExitQueue = Math.max(0, currentExitQueue - dailyChurn);

    // Calculate confidence interval based on volatility
    const daysFromStart = day;
    const uncertaintyGrowth = Math.sqrt(daysFromStart) * trend.volatility * 32;
    const confidenceMultiplier = 1.96; // 95% confidence

    const stakeRatio = getStakeRatio(currentStake);

    forecasts.push({
      date: forecastDate,
      totalStakedETH: currentStake,
      stakeRatio,
      forecastAPR: totalAPR,
      confidence: {
        lower: Math.max(0, currentStake - confidenceMultiplier * uncertaintyGrowth),
        upper: currentStake + confidenceMultiplier * uncertaintyGrowth,
      },
      components: {
        protocolBase: consensusAPR,
        trendAdjustment: expectedGrowth,
        queueConstraint: maxDailyChange,
      },
      drivers,
    });
  }

  // Return monthly snapshots instead of daily
  return forecasts.filter((_, i) => (i + 1) % 30 === 0 || i === forecasts.length - 1);
}

/**
 * Generate scenario comparison
 */
export function compareScenarios(
  history: HistoricalDataPoint[],
  monthsAhead: number,
  executionHistory?: ExecutionDataPoint[]
): {
  baseline: ForecastPoint[];
  bullish: ForecastPoint[];
  bearish: ForecastPoint[];
} {
  const baseline = generateForecast(history, monthsAhead, DEFAULT_SCENARIO, executionHistory);

  const bullish = generateForecast(history, monthsAhead, {
    netFlowBias: 0.5,
    mevMultiplier: 1.3,
    queuePressure: 1.5,
    feeRegimeBias: 'elevated', // Bullish assumes elevated fee environment
  }, executionHistory);

  const bearish = generateForecast(history, monthsAhead, {
    netFlowBias: -0.5,
    mevMultiplier: 0.7,
    queuePressure: 0.5,
    feeRegimeBias: 'calm', // Bearish assumes calm fee environment
  }, executionHistory);

  return { baseline, bullish, bearish };
}

// Re-export execution types for convenience
export type { FeeRegime, ExecutionDataPoint } from './execution';
export { detectRegime, generateMockExecutionHistory } from './execution';
