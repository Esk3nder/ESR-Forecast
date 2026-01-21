'use client';

import { useState, useEffect, useMemo } from 'react';
import { ForecastChart } from '@/components/charts/ForecastChart';
import { MetricCard } from '@/components/ui/MetricCard';
import { ScenarioSelector } from '@/components/ui/ScenarioSelector';
import {
  generateForecast,
  compareScenarios,
  detectRegime,
  generateMockExecutionHistory,
  type HistoricalDataPoint,
  type ExecutionDataPoint,
} from '@/lib/model/forecast';
import {
  DriverAttributionChart,
  DriverSummary,
  RegimeBadge,
} from '@/components/charts/DriverAttribution';
import {
  getNetworkOverview,
  getValidatorQueues,
  getHistoricalStats,
  toHistoricalDataPoints,
} from '@/lib/api/rated';
import { deriveMetrics, type ProtocolState } from '@/lib/model/protocol';

export default function Home() {
  const [months, setMonths] = useState(6);
  const [showScenarios, setShowScenarios] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);

  // Data state
  const [networkOverview, setNetworkOverview] = useState<{
    activeValidators: number;
    totalStakedEth: number;
    networkStakingRate: number;
    avgNetworkApr: number;
    consensusLayerApr: number;
    executionLayerApr: number;
  } | null>(null);

  const [queueStats, setQueueStats] = useState<{
    beaconchainEntering: number;
    beaconchainExiting: number;
    churnLimit: number;
    avgActivationWaitDays: number;
    avgExitWaitDays: number;
  } | null>(null);

  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [executionHistory, setExecutionHistory] = useState<ExecutionDataPoint[]>([]);

  // Fetch data on mount
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch in parallel
        const [overview, queues, history] = await Promise.all([
          getNetworkOverview().catch(() => null),
          getValidatorQueues().catch(() => null),
          getHistoricalStats(90).catch(() => []),
        ]);

        if (overview) setNetworkOverview(overview);
        if (queues) setQueueStats(queues);
        if (history.length > 0) {
          setHistoricalData(toHistoricalDataPoints(history));
        }

        // If API fails, use mock data with realistic values
        if (!overview && !queues) {
          setUsingMockData(true);
          // Generate mock current state (calibrated to Jan 2026 estimates)
          setNetworkOverview({
            activeValidators: 1_078_125,
            totalStakedEth: 34_500_000,
            networkStakingRate: 28.75,
            avgNetworkApr: 3.23, // Matches our model: 2.89% consensus + 0.34% execution
            consensusLayerApr: 2.89,
            executionLayerApr: 0.34,
          });
          setQueueStats({
            beaconchainEntering: 2500, // Lower queue in 2026
            beaconchainExiting: 800,
            churnLimit: 16,
            avgActivationWaitDays: 1.5,
            avgExitWaitDays: 0.5,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Generate mock historical data if needed
  useEffect(() => {
    if (historicalData.length === 0 && networkOverview) {
      const mockHistory: HistoricalDataPoint[] = [];
      const now = new Date();
      let currentStake = networkOverview.totalStakedEth;

      for (let i = 90; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        // Simulate gradual growth backwards
        const dailyChange = (Math.random() - 0.3) * 50000;
        currentStake = currentStake - dailyChange;

        mockHistory.push({
          timestamp: date,
          totalStakedETH: currentStake,
          activeValidators: Math.floor(currentStake / 32),
          entryQueueLength: 5000 + Math.floor(Math.random() * 10000),
          exitQueueLength: 500 + Math.floor(Math.random() * 2000),
        });
      }

      setHistoricalData(mockHistory);

      // Generate mock execution history
      const mockExecHistory = generateMockExecutionHistory(90, networkOverview.activeValidators);
      setExecutionHistory(mockExecHistory);
    }
  }, [networkOverview, historicalData.length]);

  // Generate forecasts
  const forecasts = useMemo(() => {
    if (historicalData.length === 0) return null;

    try {
      return compareScenarios(historicalData, months, executionHistory.length > 0 ? executionHistory : undefined);
    } catch (err) {
      console.error('Forecast error:', err);
      return null;
    }
  }, [historicalData, months, executionHistory]);

  // Current fee regime
  const currentRegime = useMemo(() => {
    if (executionHistory.length === 0 || !networkOverview) return null;
    return detectRegime(executionHistory, networkOverview.activeValidators);
  }, [executionHistory, networkOverview]);

  // Derive current metrics
  const currentMetrics = useMemo(() => {
    if (!networkOverview || !queueStats) return null;

    const state: ProtocolState = {
      totalStakedETH: networkOverview.totalStakedEth,
      activeValidators: networkOverview.activeValidators,
      entryQueueLength: queueStats.beaconchainEntering,
      exitQueueLength: queueStats.beaconchainExiting,
      networkParticipation: 0.995,
    };

    return deriveMetrics(state);
  }, [networkOverview, queueStats]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto" />
          <p className="mt-4 text-gray-400">Loading network data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">ESR Forecast</h1>
              <p className="text-sm text-gray-400">
                Ethereum Staking Rate Prediction Model
              </p>
            </div>
            <div className="text-right text-sm">
              {usingMockData ? (
                <>
                  <p className="text-yellow-500 font-medium">Using simulated data</p>
                  <p className="text-gray-500">API unavailable - showing model estimates</p>
                </>
              ) : (
                <>
                  <p className="text-green-500">Live data from Rated.network</p>
                  <p className="text-gray-500">Updated: {new Date().toLocaleString()}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 rounded-lg bg-red-900/50 border border-red-700 p-4 text-red-200">
            {error}
          </div>
        )}

        {/* Current Metrics */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">
            Current Network State
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Stake Ratio"
              value={`${(networkOverview?.networkStakingRate ?? 0).toFixed(2)}%`}
              subtitle={`${((networkOverview?.totalStakedEth ?? 0) / 1_000_000).toFixed(2)}M ETH staked`}
              trend={
                currentMetrics
                  ? { value: 0.15, direction: 'up' }
                  : undefined
              }
            />
            <MetricCard
              title="Network APR"
              value={`${(networkOverview?.avgNetworkApr ?? 0).toFixed(2)}%`}
              subtitle={`CL: ${(networkOverview?.consensusLayerApr ?? 0).toFixed(1)}% + EL: ${(networkOverview?.executionLayerApr ?? 0).toFixed(1)}%`}
            />
            <MetricCard
              title="Entry Queue"
              value={(queueStats?.beaconchainEntering ?? 0).toLocaleString()}
              subtitle={`~${(queueStats?.avgActivationWaitDays ?? 0).toFixed(1)} days wait`}
            />
            <MetricCard
              title="Active Validators"
              value={(networkOverview?.activeValidators ?? 0).toLocaleString()}
              subtitle={`Churn: ${queueStats?.churnLimit ?? 0}/epoch`}
            />
          </div>
        </section>

        {/* Scenario Controls */}
        <section className="mb-8">
          <ScenarioSelector
            months={months}
            onMonthsChange={setMonths}
            showScenarios={showScenarios}
            onShowScenariosChange={setShowScenarios}
          />
        </section>

        {/* Forecast Charts */}
        {forecasts && (
          <>
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-300 mb-4">
                Stake Ratio Forecast
              </h2>
              <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6">
                <ForecastChart
                  baseline={forecasts.baseline}
                  bullish={showScenarios ? forecasts.bullish : undefined}
                  bearish={showScenarios ? forecasts.bearish : undefined}
                  metric="stakeRatio"
                  showConfidence={true}
                />
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-300 mb-4">
                APR Forecast
              </h2>
              <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6">
                <ForecastChart
                  baseline={forecasts.baseline}
                  bullish={showScenarios ? forecasts.bullish : undefined}
                  bearish={showScenarios ? forecasts.bearish : undefined}
                  metric="forecastAPR"
                  showConfidence={false}
                />
              </div>
            </section>

            {/* Driver Attribution */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-300 mb-4">
                APR Driver Attribution
                {currentRegime && (
                  <span className="ml-3">
                    <RegimeBadge regime={currentRegime.currentRegime} />
                  </span>
                )}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Current Breakdown */}
                <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6">
                  <h3 className="text-sm font-medium text-gray-400 mb-4">
                    Current APR Breakdown
                  </h3>
                  {forecasts.baseline[0]?.drivers && (
                    <DriverSummary drivers={forecasts.baseline[0].drivers} />
                  )}
                </div>

                {/* Forecast End Breakdown */}
                <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6">
                  <h3 className="text-sm font-medium text-gray-400 mb-4">
                    {months}-Month Forecast Breakdown
                  </h3>
                  {forecasts.baseline[forecasts.baseline.length - 1]?.drivers && (
                    <DriverSummary drivers={forecasts.baseline[forecasts.baseline.length - 1].drivers} />
                  )}
                </div>
              </div>

              {/* Attribution Chart */}
              <div className="mt-6 rounded-xl border border-gray-700 bg-gray-800/50 p-6">
                <h3 className="text-sm font-medium text-gray-400 mb-4">
                  Driver Contribution (End of Forecast)
                </h3>
                {forecasts.baseline[forecasts.baseline.length - 1]?.drivers && (
                  <DriverAttributionChart
                    drivers={forecasts.baseline[forecasts.baseline.length - 1].drivers}
                  />
                )}
              </div>
            </section>
          </>
        )}

        {/* Model Explanation */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">
            About the Model
          </h2>
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6 text-gray-400 space-y-4">
            <div>
              <h3 className="font-medium text-white mb-2">Hybrid Approach</h3>
              <p>
                This model combines Ethereum&apos;s deterministic protocol mechanics with
                statistical trend analysis. The protocol base layer uses the actual
                reward curve formula (APR ∝ 1/√total_stake) and queue churn limits.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-white mb-2">Feedback Loops</h3>
              <p>
                The model respects the protocol&apos;s built-in feedback: higher APR
                attracts more stakers, which lowers APR, creating equilibrium pressure.
                Queue constraints limit how fast stake can change (~{currentMetrics?.validatorsPerDay.toFixed(0) ?? '~900'} validators/day max).
              </p>
            </div>
            <div>
              <h3 className="font-medium text-white mb-2">Scenarios</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <span className="text-blue-400">Baseline</span>: Current trend
                  continues with protocol feedback
                </li>
                <li>
                  <span className="text-green-400">Bullish</span>: Increased staking
                  demand, higher MEV rewards, longer entry queues
                </li>
                <li>
                  <span className="text-red-400">Bearish</span>: Reduced demand,
                  lower MEV, more exits than entries
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          <p>
            ESR Forecast • Ethereum Staking Rate Prediction •{' '}
            <a
              href="https://github.com/Esk3nder/ESR-Forecast"
              className="text-blue-400 hover:underline"
            >
              GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
