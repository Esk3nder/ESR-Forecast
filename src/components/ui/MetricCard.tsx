'use client';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  icon?: React.ReactNode;
}

export function MetricCard({ title, value, subtitle, trend, icon }: MetricCardProps) {
  const trendColor =
    trend?.direction === 'up'
      ? 'text-green-400'
      : trend?.direction === 'down'
        ? 'text-red-400'
        : 'text-gray-400';

  const trendArrow =
    trend?.direction === 'up' ? '↑' : trend?.direction === 'down' ? '↓' : '→';

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6 backdrop-blur">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          {trend && (
            <p className={`mt-2 text-sm font-medium ${trendColor}`}>
              {trendArrow} {Math.abs(trend.value).toFixed(2)}%{' '}
              <span className="text-gray-500">vs last month</span>
            </p>
          )}
        </div>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
    </div>
  );
}
