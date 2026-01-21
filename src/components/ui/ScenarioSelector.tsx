'use client';

interface ScenarioSelectorProps {
  months: number;
  onMonthsChange: (months: number) => void;
  showScenarios: boolean;
  onShowScenariosChange: (show: boolean) => void;
}

export function ScenarioSelector({
  months,
  onMonthsChange,
  showScenarios,
  onShowScenariosChange,
}: ScenarioSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-700 bg-gray-800/50 p-4">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Forecast Horizon
        </label>
        <div className="flex gap-2">
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              onClick={() => onMonthsChange(m)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                months === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {m} months
            </button>
          ))}
        </div>
      </div>

      <div className="h-10 w-px bg-gray-700" />

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Scenario Analysis
        </label>
        <button
          onClick={() => onShowScenariosChange(!showScenarios)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showScenarios
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {showScenarios ? 'Hide Scenarios' : 'Show Scenarios'}
        </button>
      </div>
    </div>
  );
}
