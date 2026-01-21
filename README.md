# ESR Forecast

Ethereum Staking Rate prediction model that forecasts stake ratio and APR using a hybrid approach combining protocol mechanics with statistical trend analysis.

## Features

- **Stake Ratio Forecast**: Predict the percentage of ETH staked over 1-12 months
- **APR Forecast**: Project staking returns accounting for protocol mechanics
- **Scenario Analysis**: Compare bullish, baseline, and bearish scenarios
- **Protocol-Aware**: Respects Ethereum's feedback loops and queue constraints

## The Model

### Hybrid Approach

The model combines two layers:

1. **Protocol Base Layer**: Uses Ethereum's actual reward curve formula (`APR ∝ 1/√total_stake`) and validator churn limits to constrain forecasts to protocol-feasible outcomes.

2. **Statistical Layer**: Analyzes historical trends and applies market behavior adjustments on top of the protocol base.

### Key Protocol Mechanics

- **Reward Curve**: APR decreases as more ETH is staked (inverse square root relationship)
- **Queue Constraints**: Validator entry/exit rates are limited by churn limits (~8-16 validators per epoch)
- **Feedback Loops**: Higher APR attracts stakers, which lowers APR, creating equilibrium pressure

### Scenarios

| Scenario | Description |
|----------|-------------|
| **Baseline** | Current trend continues with protocol feedback |
| **Bullish** | Increased staking demand, higher MEV rewards, longer entry queues |
| **Bearish** | Reduced demand, lower MEV, more exits than entries |

## Data Sources

- **Rated.network API**: Historical network stats, queue data, APR metrics
- **Beacon Chain**: Real-time validator counts and network state

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Project Structure

```
src/
├── app/                    # Next.js app router
│   └── page.tsx           # Main dashboard
├── components/
│   ├── charts/            # Recharts visualizations
│   └── ui/                # UI components
└── lib/
    ├── api/               # Data fetching (Rated, Beacon)
    └── model/             # Forecasting logic
        ├── constants.ts   # Protocol constants
        ├── protocol.ts    # Reward/queue mechanics
        └── forecast.ts    # Hybrid forecasting
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Charts**: Recharts
- **Styling**: Tailwind CSS
- **Statistics**: simple-statistics

## License

MIT
