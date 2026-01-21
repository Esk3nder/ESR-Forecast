/**
 * Execution Layer Yield Model
 *
 * Models priority fees + MEV using regime detection (calm/hot)
 * with mean reversion. This is the "execution yield" component
 * that adds to consensus layer APR.
 */

import { mean, standardDeviation } from 'simple-statistics';

/**
 * Fee regime states
 */
export type FeeRegime = 'calm' | 'elevated' | 'hot';

/**
 * Historical execution data point
 */
export interface ExecutionDataPoint {
  timestamp: Date;
  priorityFeesETH: number; // Total priority fees in ETH for the day
  mevRewardsETH: number; // MEV rewards in ETH for the day
  avgGasPrice: number; // Average gas price in Gwei
  blockCount: number; // Blocks produced that day
}

/**
 * Regime detection result
 */
export interface RegimeDetection {
  currentRegime: FeeRegime;
  regimeConfidence: number; // 0-1 confidence in regime classification
  daysInRegime: number;
  transitionProbability: {
    toCalm: number;
    toElevated: number;
    toHot: number;
  };
}

/**
 * Execution yield forecast
 */
export interface ExecutionYieldForecast {
  dailyYieldETH: number; // Expected daily yield per validator
  annualizedAPR: number; // As percentage
  regime: FeeRegime;
  confidence: {
    lower: number;
    upper: number;
  };
  components: {
    priorityFees: number;
    mevRewards: number;
  };
}

// Regime thresholds (calibrated from historical data)
const REGIME_THRESHOLDS = {
  // Daily execution yield per validator in ETH
  calm: { max: 0.001 }, // < 0.001 ETH/day
  elevated: { min: 0.001, max: 0.003 }, // 0.001-0.003 ETH/day
  hot: { min: 0.003 }, // > 0.003 ETH/day
};

// Regime transition probabilities (daily)
const TRANSITION_MATRIX: Record<FeeRegime, { toCalm: number; toElevated: number; toHot: number }> = {
  calm: { toCalm: 0.85, toElevated: 0.12, toHot: 0.03 },
  elevated: { toCalm: 0.25, toElevated: 0.55, toHot: 0.20 },
  hot: { toCalm: 0.10, toElevated: 0.40, toHot: 0.50 },
};

// Mean reversion parameters
const MEAN_REVERSION = {
  calm: { target: 0.0005, halfLife: 7 }, // 7-day half-life to target
  elevated: { target: 0.002, halfLife: 5 },
  hot: { target: 0.004, halfLife: 3 }, // Hot regimes revert faster
};

/**
 * Detect current fee regime from historical data
 */
export function detectRegime(
  history: ExecutionDataPoint[],
  activeValidators: number
): RegimeDetection {
  if (history.length === 0) {
    return {
      currentRegime: 'calm',
      regimeConfidence: 0.5,
      daysInRegime: 0,
      transitionProbability: TRANSITION_MATRIX.calm,
    };
  }

  // Sort by date descending
  const sorted = [...history].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  // Calculate recent daily yield per validator
  const recentDays = sorted.slice(0, 7);
  const dailyYields = recentDays.map((d) => {
    const totalYield = d.priorityFeesETH + d.mevRewardsETH;
    return totalYield / activeValidators;
  });

  const avgYield = mean(dailyYields);
  const yieldStd = dailyYields.length > 1 ? standardDeviation(dailyYields) : avgYield * 0.3;

  // Classify regime
  let currentRegime: FeeRegime;
  let confidence: number;

  if (avgYield < REGIME_THRESHOLDS.calm.max) {
    currentRegime = 'calm';
    confidence = 1 - avgYield / REGIME_THRESHOLDS.calm.max;
  } else if (avgYield < REGIME_THRESHOLDS.elevated.max!) {
    currentRegime = 'elevated';
    const range = REGIME_THRESHOLDS.elevated.max! - REGIME_THRESHOLDS.elevated.min!;
    const position = (avgYield - REGIME_THRESHOLDS.elevated.min!) / range;
    confidence = 1 - Math.abs(position - 0.5) * 2; // Highest confidence in middle
  } else {
    currentRegime = 'hot';
    confidence = Math.min(1, (avgYield - REGIME_THRESHOLDS.hot.min!) / 0.002);
  }

  // Count consecutive days in current regime
  let daysInRegime = 0;
  for (const point of sorted) {
    const yield_ = (point.priorityFeesETH + point.mevRewardsETH) / activeValidators;
    const pointRegime = classifyYield(yield_);
    if (pointRegime === currentRegime) {
      daysInRegime++;
    } else {
      break;
    }
  }

  return {
    currentRegime,
    regimeConfidence: Math.max(0.3, Math.min(1, confidence)),
    daysInRegime,
    transitionProbability: TRANSITION_MATRIX[currentRegime],
  };
}

/**
 * Classify a single yield value into a regime
 */
function classifyYield(yieldPerValidator: number): FeeRegime {
  if (yieldPerValidator < REGIME_THRESHOLDS.calm.max) return 'calm';
  if (yieldPerValidator < REGIME_THRESHOLDS.elevated.max!) return 'elevated';
  return 'hot';
}

/**
 * Forecast execution yield for a given day ahead
 */
export function forecastExecutionYield(
  currentYield: number,
  currentRegime: FeeRegime,
  daysAhead: number,
  activeValidators: number
): ExecutionYieldForecast {
  const reversion = MEAN_REVERSION[currentRegime];
  const transitions = TRANSITION_MATRIX[currentRegime];

  // Apply mean reversion
  const decayFactor = Math.pow(0.5, daysAhead / reversion.halfLife);
  const revertedYield =
    currentYield * decayFactor + reversion.target * (1 - decayFactor);

  // Estimate regime at forecast horizon
  // Simplified: use transition probabilities
  let expectedRegime: FeeRegime = currentRegime;
  let calmProb = currentRegime === 'calm' ? 1 : 0;
  let elevatedProb = currentRegime === 'elevated' ? 1 : 0;
  let hotProb = currentRegime === 'hot' ? 1 : 0;

  for (let d = 0; d < daysAhead; d++) {
    const newCalm =
      calmProb * TRANSITION_MATRIX.calm.toCalm +
      elevatedProb * TRANSITION_MATRIX.elevated.toCalm +
      hotProb * TRANSITION_MATRIX.hot.toCalm;
    const newElevated =
      calmProb * TRANSITION_MATRIX.calm.toElevated +
      elevatedProb * TRANSITION_MATRIX.elevated.toElevated +
      hotProb * TRANSITION_MATRIX.hot.toElevated;
    const newHot =
      calmProb * TRANSITION_MATRIX.calm.toHot +
      elevatedProb * TRANSITION_MATRIX.elevated.toHot +
      hotProb * TRANSITION_MATRIX.hot.toHot;

    calmProb = newCalm;
    elevatedProb = newElevated;
    hotProb = newHot;
  }

  // Most likely regime
  if (calmProb >= elevatedProb && calmProb >= hotProb) {
    expectedRegime = 'calm';
  } else if (elevatedProb >= hotProb) {
    expectedRegime = 'elevated';
  } else {
    expectedRegime = 'hot';
  }

  // Adjust yield for expected regime
  const regimeTarget = MEAN_REVERSION[expectedRegime].target;
  const finalYield = revertedYield * 0.7 + regimeTarget * 0.3;

  // Annualize: daily yield * 365 / 32 ETH stake
  const annualizedAPR = (finalYield * 365 / 32) * 100;

  // Confidence interval widens with forecast horizon
  const uncertaintyFactor = 1 + Math.sqrt(daysAhead) * 0.1;

  // Split between fees and MEV (typical ratio)
  const feeRatio = 0.4; // 40% priority fees, 60% MEV
  const priorityFees = finalYield * feeRatio;
  const mevRewards = finalYield * (1 - feeRatio);

  return {
    dailyYieldETH: finalYield,
    annualizedAPR,
    regime: expectedRegime,
    confidence: {
      lower: annualizedAPR / uncertaintyFactor,
      upper: annualizedAPR * uncertaintyFactor,
    },
    components: {
      priorityFees: (priorityFees * 365 / 32) * 100,
      mevRewards: (mevRewards * 365 / 32) * 100,
    },
  };
}

/**
 * Generate mock execution history for development
 */
export function generateMockExecutionHistory(
  days: number,
  activeValidators: number
): ExecutionDataPoint[] {
  const data: ExecutionDataPoint[] = [];
  const now = new Date();

  // Start in a random regime
  let currentRegime: FeeRegime = 'calm';
  let daysInCurrentRegime = 0;

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Maybe transition regime
    const trans = TRANSITION_MATRIX[currentRegime];
    const roll = Math.random();
    if (roll < trans.toCalm) {
      if (currentRegime !== 'calm') daysInCurrentRegime = 0;
      currentRegime = 'calm';
    } else if (roll < trans.toCalm + trans.toElevated) {
      if (currentRegime !== 'elevated') daysInCurrentRegime = 0;
      currentRegime = 'elevated';
    } else {
      if (currentRegime !== 'hot') daysInCurrentRegime = 0;
      currentRegime = 'hot';
    }
    daysInCurrentRegime++;

    // Generate yield based on regime
    const baseYield = MEAN_REVERSION[currentRegime].target * activeValidators;
    const noise = (Math.random() - 0.5) * baseYield * 0.4;
    const totalYield = Math.max(0, baseYield + noise);

    // Split between priority fees and MEV
    const feeRatio = 0.35 + Math.random() * 0.1;
    const priorityFeesETH = totalYield * feeRatio;
    const mevRewardsETH = totalYield * (1 - feeRatio);

    // Gas price correlates with regime
    const baseGas = currentRegime === 'hot' ? 50 : currentRegime === 'elevated' ? 25 : 10;
    const avgGasPrice = baseGas + Math.random() * 10;

    data.push({
      timestamp: date,
      priorityFeesETH,
      mevRewardsETH,
      avgGasPrice,
      blockCount: 7200, // ~7200 blocks per day
    });
  }

  return data;
}
