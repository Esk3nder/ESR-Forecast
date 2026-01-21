'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import type { DriverAttribution as DriverAttributionType } from '@/lib/model/forecast';

interface DriverAttributionProps {
  drivers: DriverAttributionType;
  showPie?: boolean;
}

const COLORS = {
  consensus: '#3B82F6', // Blue
  priorityFees: '#10B981', // Green
  mev: '#8B5CF6', // Purple
};

const REGIME_COLORS = {
  calm: '#10B981',
  elevated: '#F59E0B',
  hot: '#EF4444',
};

export function DriverAttributionChart({ drivers, showPie = false }: DriverAttributionProps) {
  const barData = useMemo(() => [
    {
      name: 'Consensus',
      value: drivers.consensusAPR,
      pct: drivers.consensusPct,
      color: COLORS.consensus,
    },
    {
      name: 'Priority Fees',
      value: (drivers.priorityFeesPct / 100) * drivers.totalAPR,
      pct: drivers.priorityFeesPct,
      color: COLORS.priorityFees,
    },
    {
      name: 'MEV',
      value: (drivers.mevPct / 100) * drivers.totalAPR,
      pct: drivers.mevPct,
      color: COLORS.mev,
    },
  ], [drivers]);

  const pieData = useMemo(() => [
    { name: 'Consensus', value: drivers.consensusPct, color: COLORS.consensus },
    { name: 'Priority Fees', value: drivers.priorityFeesPct, color: COLORS.priorityFees },
    { name: 'MEV', value: drivers.mevPct, color: COLORS.mev },
  ], [drivers]);

  if (showPie) {
    return (
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
              labelLine={false}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => `${(value as number)?.toFixed(1) ?? 0}%`}
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={barData} layout="vertical" margin={{ left: 80, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
          <XAxis
            type="number"
            stroke="#9CA3AF"
            fontSize={12}
            tickFormatter={(value) => `${value.toFixed(1)}%`}
            domain={[0, 'auto']}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#9CA3AF"
            fontSize={12}
            width={75}
          />
          <Tooltip
            formatter={(value, name, props) => [
              `${(value as number)?.toFixed(2) ?? 0}% APR (${props?.payload?.pct?.toFixed(1) ?? 0}% of total)`,
              props?.payload?.name ?? '',
            ]}
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
            labelStyle={{ color: '#F9FAFB' }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {barData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface RegimeBadgeProps {
  regime: 'calm' | 'elevated' | 'hot';
}

export function RegimeBadge({ regime }: RegimeBadgeProps) {
  const color = REGIME_COLORS[regime];
  const label = regime.charAt(0).toUpperCase() + regime.slice(1);

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      <span
        className="w-2 h-2 rounded-full mr-1.5"
        style={{ backgroundColor: color }}
      />
      {label} Fee Regime
    </span>
  );
}

interface DriverSummaryProps {
  drivers: DriverAttributionType;
}

export function DriverSummary({ drivers }: DriverSummaryProps) {
  return (
    <div className="space-y-4">
      {/* Total APR */}
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-gray-400">Total APR</span>
        <span className="text-2xl font-bold text-white">
          {drivers.totalAPR.toFixed(2)}%
        </span>
      </div>

      {/* Regime Badge */}
      <div className="flex justify-end">
        <RegimeBadge regime={drivers.feeRegime} />
      </div>

      {/* Breakdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.consensus }} />
            <span className="text-gray-400">Consensus Layer</span>
          </div>
          <span className="text-white">
            {drivers.consensusAPR.toFixed(2)}% ({drivers.consensusPct.toFixed(0)}%)
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.priorityFees }} />
            <span className="text-gray-400">Priority Fees</span>
          </div>
          <span className="text-white">
            {((drivers.priorityFeesPct / 100) * drivers.totalAPR).toFixed(2)}% ({drivers.priorityFeesPct.toFixed(0)}%)
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.mev }} />
            <span className="text-gray-400">MEV Rewards</span>
          </div>
          <span className="text-white">
            {((drivers.mevPct / 100) * drivers.totalAPR).toFixed(2)}% ({drivers.mevPct.toFixed(0)}%)
          </span>
        </div>
      </div>
    </div>
  );
}
