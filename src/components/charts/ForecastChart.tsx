'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts';
import type { ForecastPoint } from '@/lib/model/forecast';

interface ForecastChartProps {
  baseline: ForecastPoint[];
  bullish?: ForecastPoint[];
  bearish?: ForecastPoint[];
  metric: 'stakeRatio' | 'forecastAPR';
  showConfidence?: boolean;
}

export function ForecastChart({
  baseline,
  bullish,
  bearish,
  metric,
  showConfidence = true,
}: ForecastChartProps) {
  const chartData = useMemo(() => {
    return baseline.map((point, i) => {
      const date = new Date(point.date);
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        baseline: metric === 'stakeRatio' ? point.stakeRatio : point.forecastAPR,
        bullish: bullish?.[i]
          ? metric === 'stakeRatio'
            ? bullish[i].stakeRatio
            : bullish[i].forecastAPR
          : undefined,
        bearish: bearish?.[i]
          ? metric === 'stakeRatio'
            ? bearish[i].stakeRatio
            : bearish[i].forecastAPR
          : undefined,
        confidenceLower:
          showConfidence && metric === 'stakeRatio'
            ? (point.confidence.lower / 120_000_000) * 100
            : undefined,
        confidenceUpper:
          showConfidence && metric === 'stakeRatio'
            ? (point.confidence.upper / 120_000_000) * 100
            : undefined,
      };
    });
  }, [baseline, bullish, bearish, metric, showConfidence]);

  const yAxisLabel = metric === 'stakeRatio' ? 'Stake Ratio (%)' : 'APR (%)';
  const domain = metric === 'stakeRatio' ? [20, 40] : [2, 6];

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
          <YAxis
            stroke="#9CA3AF"
            fontSize={12}
            domain={domain}
            tickFormatter={(value) => `${value.toFixed(1)}%`}
            label={{
              value: yAxisLabel,
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle', fill: '#9CA3AF' },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
            labelStyle={{ color: '#F9FAFB' }}
            formatter={(value) => [`${(value as number)?.toFixed(2) ?? 0}%`, '']}
          />
          <Legend />

          {showConfidence && metric === 'stakeRatio' && (
            <Area
              type="monotone"
              dataKey="confidenceUpper"
              stroke="none"
              fill="#3B82F6"
              fillOpacity={0.1}
              name="95% Confidence"
            />
          )}

          {bearish && (
            <Line
              type="monotone"
              dataKey="bearish"
              stroke="#EF4444"
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={false}
              name="Bearish"
            />
          )}

          <Line
            type="monotone"
            dataKey="baseline"
            stroke="#3B82F6"
            strokeWidth={3}
            dot={{ fill: '#3B82F6', strokeWidth: 2 }}
            name="Baseline"
          />

          {bullish && (
            <Line
              type="monotone"
              dataKey="bullish"
              stroke="#10B981"
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={false}
              name="Bullish"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
