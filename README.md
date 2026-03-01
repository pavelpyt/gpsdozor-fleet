# GPS Dozor Fleet Manager

Real-time fleet management dashboard built on the GPS Dozor JSON API. Monitor vehicle positions, analyze trips and driver behavior, forecast costs, and remotely control engines — all from a single interface.

![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?logo=leaflet&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)

## Who Is This For?

Built for **fleet managers, dispatchers, and logistics operators** who need to keep tabs on their vehicles without jumping between tools.

- **Fleet managers** — see where every car is right now, spot vehicles that have been offline or idling too long, compare driver performance across the fleet, and forecast operational costs
- **Dispatchers** — quickly find the nearest available vehicle, check trip histories, and remotely stop/release engines in emergencies
- **Operations leads** — use the analytics (efficiency grades, risk scores, eco-driving reports) to make data-driven decisions about driver training, route planning, and cost reduction
- **Small business owners** — a single dashboard to monitor a handful of company cars without enterprise software overhead

The app is deliberately monochrome with a luminescent aesthetic — high contrast on OLED-black backgrounds makes it readable in control rooms, vehicles, and low-light environments where fleet operations often happen.

## Features

### Dashboard
- **Live fleet map** — real-time vehicle positions on a Leaflet map with status-colored markers (moving/parked/offline)
- **Fleet statistics** — online count, moving count, alert count at a glance
- **Top vehicles** — fastest, most distance, latest update
- **Anomaly detection** — speed alerts, offline vehicles, low battery, excessive speed, long trips, night activity
- **Parking hotspots** — geohash-clustered parking locations from GPS history
- **Period selector** — switch analytics between 24h, 7d, and 30d windows

### Fleet Table
- **Searchable** — filter by vehicle name, license plate, or code
- **Status filter** — all / moving / parked / offline
- **Sortable columns** — name, speed, odometer, last seen, utilization, efficiency
- **Anomalies toggle** — show only vehicles with issues
- **Quick stats** — total vehicles, online count, avg speed, fleet km, active alerts

### Vehicle Detail (6 tabs)

**Trips**
- Trip list with sortable columns (time, distance, duration, max speed)
- Route visualization on the map with start/end markers
- Speed-colored dots along the path (red >120, yellow >80, white <80)
- Trip speed profile chart with segment coloring by speed zone

**Analytics**
- Utilization score (% of time spent driving)
- Efficiency index (A-F grade) — composite of activity, consistency, speed safety, anomaly rate
- Daily km chart with 7-day linear regression forecast
- Trend indicator (up/down/stable) with confidence level
- Risk index (low/medium/high) — overspeeding, harsh events, night driving, anomalies
- Data quality metrics (integrity %)

**Eco-Driving**
- Behavior score (0-100) from eco-driving events
- Event severity breakdown (high/medium/low)
- Per-100km and per-trip event rates
- Problem behaviors ranked by impact
- Speed profile distribution (slow/normal/fast)
- AI-generated insights and recommendations

**Sensors**
- Health strip with top 8 sensor values and status badges
- Grouped sensor explorer: Power, Engine & Drive, Fuel, Environment, I/O
- Sensor alerts (stale, out-of-range, fluctuating values)
- Environment zones (4 temperature + humidity pairs)
- Raw sensor feed table with CSV export
- Sensor quality metrics

**Cost Forecast**
- Cost/km, monthly projection, yearly projection
- Breakdown: fuel (base + behavior penalty + idle waste), maintenance, depreciation
- Idle time analysis from inter-trip gaps
- Savings levers: idle reduction, behavior improvement, speed compliance, route optimization
- Configurable assumptions (fuel price, consumption, maintenance/depreciation rates)
- Multiple currency and unit support

**Engine Control**
- Current relay state display
- Stop / Release / Reset with confirmation dialogs and detailed warnings
- Last event timestamp

### Vehicle Comparison
- Side-by-side comparison of any two vehicles
- 11+ metrics: status, speed, odometer, battery, trips, km/day, utilization, efficiency, anomalies
- Better/worse indicators

### Design
- **Luminescent B&W theme** — high contrast on OLED-black, optimized for control rooms
- **Dark / Light mode** — toggle with `localStorage` persistence
- **Glass morphism** — frosted glass panels, glow shadows, grain overlay
- **Custom fonts** — Syne (headings), Satoshi (body), JetBrains Mono (numbers)
- **60s auto-refresh** for live vehicle positions
- **Smart caching** — 30s default, configurable TTL per endpoint (5s for relay, 120s for history)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Vue 3 (Composition API + `<script setup>`) |
| Build | Vite 6 |
| State | Pinia |
| Routing | Vue Router 4 |
| Maps | Leaflet (CartoDB tiles, no API key) |
| Charts | Chart.js + vue-chartjs |
| Styling | Tailwind CSS 3 |
| Dates | date-fns |
| Deployment | Docker (multi-stage: Node build + Nginx) |

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd gpsdozor-fleet

# Copy environment file and add your API credentials
cp .env.example .env
# Edit .env with your GPS Dozor API credentials

# Install dependencies
npm install

# Start dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Docker

```bash
docker build -t gpsdozor-fleet .
docker run -p 8080:80 gpsdozor-fleet
```

Or with Docker Compose:

```bash
docker-compose up --build
```

Available at `http://localhost:8080`.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_CREDENTIALS` | Yes | — | API credentials as `username:password` |
| `VITE_API_ORIGIN` | No | `https://a1.gpsguard.eu` | API server origin |
| `VITE_API_BASE` | No | `/api/v1` | API base path |
| `VITE_CORS_PROXY` | No | `https://corsproxy.io/?` | CORS proxy for production |

## Project Structure

```
src/
├── lib/
│   ├── api.js              # API client with auth, caching, CORS proxy fallback
│   └── utils.js            # Formatting, status helpers, analytics functions
├── stores/
│   └── fleet.js            # Pinia store — groups, vehicles, analytics, auto-refresh
├── components/
│   ├── FleetMap.vue        # Leaflet map with markers, routes, hotspots
│   ├── SensorChart.vue     # Line chart for sensor time series
│   ├── TripSpeedChart.vue  # Speed timeline with zone coloring
│   ├── EcoDrivingChart.vue # Eco event bar chart with severity
│   ├── DailyKmChart.vue    # Daily km bars + forecast line
│   ├── ForecastSparkline.vue # Inline canvas sparkline (past + forecast)
│   ├── CostForecast.vue    # Cost analysis with breakdown & savings
│   └── EngineControl.vue   # Engine relay control panel
├── pages/
│   ├── DashboardPage.vue   # Fleet overview, map, hotspots, anomalies
│   ├── FleetPage.vue       # Searchable/sortable vehicle table
│   ├── VehicleDetailPage.vue # Trips, sensors, eco, cost, engine control
│   └── ComparePage.vue     # Side-by-side vehicle comparison
├── App.vue                 # Layout, header, theme toggle, auto-refresh
├── main.js                 # Vue + Pinia + Router setup
└── index.css               # Tailwind + luminescent design system
```

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/groups` | Fetch vehicle groups |
| GET | `/vehicles/group/{code}` | Get vehicles in a group |
| GET | `/vehicle/{code}` | Single vehicle info |
| GET | `/vehicle/{code}/trips` | Trip history |
| GET | `/vehicles/history/{codes}` | GPS position history |
| GET | `/vehicle/{code}/sensors/{types}` | Sensor data (30+ types) |
| GET | `/vehicle/{code}/eco-driving-events` | Eco-driving events |
| GET | `/vehicle/{code}/getEngineRelayState` | Engine relay state |
| POST | `/vehicle/{code}/setEngineRelayState/{action}` | Stop/release engine |
| POST | `/vehicle/{code}/resetEngineRelayState` | Reset relay |
| GET | `/groups/{group}/branches` | Branch list |
| PUT | `/vehicle/change-branch` | Assign branch |
| PUT | `/vehicle/change-branch-by-name` | Assign branch by name |
| POST | `/trip-purposes` | Set trip purpose |
| PUT | `/vehicle/{code}/update-vehicle-refueling-cards` | Update refueling cards |

## Analytics Algorithms

- **Utilization Score** — percentage of time spent driving vs. idle over the selected period
- **Efficiency Index (A-F)** — weighted composite: activity (30%), consistency (25%), speed safety (25%), anomaly-free rate (20%)
- **Risk Index** — weighted composite: overspeeding (35%), harsh events (25%), night driving (20%), anomalies (20%)
- **Forecast** — linear regression on daily km with R²-based confidence levels
- **Cost Model** — fuel (base + behavior penalty + idle waste) + maintenance + depreciation, with configurable parameters
- **Anomaly Detection** — speed alerts, offline detection, low battery, excessive speed, long trips, short trip clusters, data quality issues, night activity
- **Parking Hotspots** — geohash aggregation at ~100m resolution, minimum 3 observations

## Roadmap / Nice to Have

Features that would make the dashboard even more useful:

- **Geofence alerts** — define zones on the map and get notified when a vehicle enters or leaves (e.g. warehouse, customer site, city limits)
- **WebSocket real-time updates** — currently polls every 60s; true push updates would show vehicle movement live
- **Driver profiles** — assign drivers to vehicles, track individual driving scores over time, compare driver performance
- **Trip reports export** — generate PDF/CSV reports per vehicle or fleet-wide for management reviews, insurance, or compliance
- **Fuel card integration** — match refueling card transactions with trip data to detect fuel theft or misuse
- **Maintenance scheduling** — set km-based or time-based service reminders per vehicle, track service history
- **Route replay** — play back a trip on the map with a timeline slider to review exactly what happened
- **Multi-fleet / multi-tenant** — support multiple companies or branches with separate dashboards and access control
- **Mobile-optimized views** — dedicated mobile layout for dispatchers on the go
- **Notification system** — email/SMS/push alerts for anomalies, geofence breaches, engine events, and maintenance due dates
- **Historical fleet analytics** — month-over-month and year-over-year trends for fleet KPIs (cost, utilization, efficiency)
- **Backend proxy with Redis cache** — move API auth server-side and add proper caching layer for production deployments

## License

MIT
