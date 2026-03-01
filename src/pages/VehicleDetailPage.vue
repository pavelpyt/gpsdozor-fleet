<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFleetStore } from '../stores/fleet'
import { vehicleStatus, fmtKm, fmtDist, fmtDate, dateRange, ECO_TYPES, cleanTrips, computeRiskIndex, computeDataQuality, sanitizeValue, ECO_METHODOLOGY, RISK_METHODOLOGY, FORECAST_METHODOLOGY } from '../lib/utils'
import { api } from '../lib/api'
import FleetMap from '../components/FleetMap.vue'
import SensorChart from '../components/SensorChart.vue'
import TripSpeedChart from '../components/TripSpeedChart.vue'
import EngineControl from '../components/EngineControl.vue'
import DailyKmChart from '../components/DailyKmChart.vue'
import CostForecast from '../components/CostForecast.vue'

const props = defineProps({ code: String })
const router = useRouter()
const fleet = useFleetStore()

const vehicle = computed(() => fleet.getVehicle(props.code))
const status = computed(() => vehicle.value ? vehicleStatus(vehicle.value) : null)

const period = ref('7d')
const tab = ref('trips')
const trips = ref([])
const tripPositions = ref(null)
const selectedTrip = ref(null)
const relayState = ref(null)
const sensorData = ref(null)
const ecoEvents = ref(null)
const loading = ref(true)
const loadingRoute = ref(false)
const routeError = ref(null)
const showingAllRoutes = ref(false)
const loadingAllRoutes = ref(false)
const tripMapRef = ref(null)
let routeRequestId = 0

// Branch management
const branches = ref([])
const selectedBranch = ref(null)
const branchLoading = ref(false)
const branchSaved = ref(false)

// Trip purpose editing
const editingPurpose = ref(null) // index of trip being edited
const purposeText = ref('')
const purposeLoading = ref(false)

// Sensor monitoring - extended sensor list
const allSensorData = ref(null)
const sensorLoading = ref(false)

const ALL_SENSORS = [
  'Speed', 'Rpm', 'ThrottlePercentage',
  'FuelConsumptionActual', 'FuelActualVolume', 'FuelConsumedTotal', 'FuelActualVolumeFromPercentage',
  'ExternalBatteryVoltage', 'ExternalBatteryPercentage',
  'InternalBatteryVoltage', 'InternalBatteryPercentage',
  'Temperature1', 'Temperature2', 'Temperature3', 'Temperature4',
  'CoolingLiquidTemperature', 'EngineTemperature',
  'Altitude', 'Odometer',
  'Humidity1', 'Humidity2', 'Humidity3', 'Humidity4',
  'LightSensor',
  'BinaryInput1', 'BinaryInput2', 'BinaryInput3', 'BinaryInput4',
  'AnalogInput1', 'AnalogInput2', 'AnalogInput3',
]

const SENSOR_META = {
  // Engine & Drive
  Speed:                    { label: 'Speed',         unit: 'km/h', color: 'rgba(200,255,200,0.8)', icon: '◎', group: 'engine' },
  Rpm:                      { label: 'RPM',           unit: 'rpm',  color: 'rgba(255,200,140,0.8)', icon: '⟳', group: 'engine' },
  ThrottlePercentage:       { label: 'Throttle',      unit: '%',    color: 'rgba(255,230,180,0.7)', icon: '▲', group: 'engine' },
  CoolingLiquidTemperature: { label: 'Coolant Temp',  unit: '°C',   color: 'rgba(180,200,255,0.7)', icon: '◉', group: 'engine' },
  EngineTemperature:        { label: 'Engine Temp',   unit: '°C',   color: 'rgba(255,140,140,0.8)', icon: '◉', group: 'engine' },
  // Fuel
  FuelConsumptionActual:          { label: 'Fuel Rate',        unit: 'L/h', color: 'rgba(180,255,180,0.7)', icon: '◆', group: 'fuel' },
  FuelActualVolume:               { label: 'Fuel Level',       unit: 'L',   color: 'rgba(160,240,160,0.7)', icon: '◇', group: 'fuel' },
  FuelConsumedTotal:              { label: 'Total Consumed',   unit: 'L',   color: 'rgba(140,220,140,0.7)', icon: '◈', group: 'fuel' },
  FuelActualVolumeFromPercentage: { label: 'Fuel Level (%)',   unit: 'L',   color: 'rgba(150,230,150,0.7)', icon: '◇', group: 'fuel' },
  // Power / Battery
  ExternalBatteryVoltage:    { label: 'Ext. Battery V',  unit: 'V', color: 'rgba(255,240,180,0.8)', icon: '⚡', group: 'power' },
  ExternalBatteryPercentage: { label: 'Ext. Battery',    unit: '%', color: 'rgba(255,230,160,0.7)', icon: '⚡', group: 'power' },
  InternalBatteryVoltage:    { label: 'Int. Battery V',  unit: 'V', color: 'rgba(200,200,255,0.7)', icon: '⚡', group: 'power' },
  InternalBatteryPercentage: { label: 'Int. Battery',    unit: '%', color: 'rgba(180,180,255,0.7)', icon: '⚡', group: 'power' },
  // Environment
  Temperature1:  { label: 'Temperature 1',  unit: '°C', color: 'rgba(255,180,180,0.7)', icon: '◉', group: 'environment' },
  Temperature2:  { label: 'Temperature 2',  unit: '°C', color: 'rgba(255,160,160,0.7)', icon: '◉', group: 'environment' },
  Temperature3:  { label: 'Temperature 3',  unit: '°C', color: 'rgba(255,140,140,0.6)', icon: '◉', group: 'environment' },
  Temperature4:  { label: 'Temperature 4',  unit: '°C', color: 'rgba(255,120,120,0.6)', icon: '◉', group: 'environment' },
  Humidity1:     { label: 'Humidity 1',      unit: '%',  color: 'rgba(180,220,255,0.7)', icon: '◎', group: 'environment' },
  Humidity2:     { label: 'Humidity 2',      unit: '%',  color: 'rgba(160,200,255,0.7)', icon: '◎', group: 'environment' },
  Humidity3:     { label: 'Humidity 3',      unit: '%',  color: 'rgba(140,180,255,0.6)', icon: '◎', group: 'environment' },
  Humidity4:     { label: 'Humidity 4',      unit: '%',  color: 'rgba(120,160,255,0.6)', icon: '◎', group: 'environment' },
  LightSensor:   { label: 'Light',           unit: 'lux', color: 'rgba(255,255,200,0.7)', icon: '☀', group: 'environment' },
  // I/O
  BinaryInput1:  { label: 'Binary Input 1', unit: 'bool', color: 'rgba(200,220,255,0.7)', icon: '⬤', group: 'io' },
  BinaryInput2:  { label: 'Binary Input 2', unit: 'bool', color: 'rgba(200,220,255,0.6)', icon: '⬤', group: 'io' },
  BinaryInput3:  { label: 'Binary Input 3', unit: 'bool', color: 'rgba(200,220,255,0.5)', icon: '⬤', group: 'io' },
  BinaryInput4:  { label: 'Binary Input 4', unit: 'bool', color: 'rgba(200,220,255,0.4)', icon: '⬤', group: 'io' },
  AnalogInput1:  { label: 'Analog Input 1', unit: '',     color: 'rgba(220,200,255,0.7)', icon: '~',  group: 'io' },
  AnalogInput2:  { label: 'Analog Input 2', unit: '',     color: 'rgba(220,200,255,0.6)', icon: '~',  group: 'io' },
  AnalogInput3:  { label: 'Analog Input 3', unit: '',     color: 'rgba(220,200,255,0.5)', icon: '~',  group: 'io' },
  // Other
  Altitude: { label: 'Altitude', unit: 'm',  color: 'rgba(200,220,255,0.7)', icon: '△', group: 'other' },
  Odometer: { label: 'Odometer', unit: 'km', color: 'var(--text-dim)',        icon: '○', group: 'other' },
}

const SENSOR_GROUPS = [
  { key: 'power',       label: 'Power',             icon: '⚡' },
  { key: 'engine',      label: 'Engine & Drive',    icon: '⟳' },
  { key: 'fuel',        label: 'Fuel',              icon: '◆' },
  { key: 'environment', label: 'Environment',       icon: '◉' },
  { key: 'io',          label: 'I/O',               icon: '⬤' },
  { key: 'other',       label: 'Other',             icon: '○' },
]

// Health thresholds for status badges
const SENSOR_THRESHOLDS = {
  ExternalBatteryVoltage:    { warn: v => v < 12.0, critical: v => v < 11.6, warnMsg: '< 12.0V', critMsg: '< 11.6V' },
  ExternalBatteryPercentage: { warn: v => v < 20,   critical: v => v < 10,   warnMsg: '< 20%',   critMsg: '< 10%' },
  InternalBatteryVoltage:    { warn: v => v < 3.7,  critical: v => v < 3.5,  warnMsg: '< 3.7V',  critMsg: '< 3.5V' },
  InternalBatteryPercentage: { warn: v => v < 20,   critical: v => v < 10,   warnMsg: '< 20%',   critMsg: '< 10%' },
  EngineTemperature:         { warn: v => v > 105,  critical: v => v > 115,  warnMsg: '> 105°C', critMsg: '> 115°C' },
  CoolingLiquidTemperature:  { warn: v => v > 100,  critical: v => v > 110,  warnMsg: '> 100°C', critMsg: '> 110°C' },
  Speed:                     { warn: v => v > 130,  critical: v => v > 160,  warnMsg: '> 130',    critMsg: '> 160' },
  Rpm:                       { warn: v => v > 5000, critical: v => v > 6000, warnMsg: '> 5000',   critMsg: '> 6000' },
}

// Health strip: top sensors to always show
const HEALTH_STRIP_SENSORS = ['Speed', 'Rpm', 'ThrottlePercentage', 'FuelActualVolume', 'EngineTemperature', 'ExternalBatteryVoltage', 'ExternalBatteryPercentage', 'InternalBatteryVoltage']

const validTrips = computed(() => trips.value.filter(t => (t.TotalDistance || 0) >= 1))

const tripStats = computed(() => {
  if (!validTrips.value.length) return { count: 0, dist: '0', avg: '0', max: 0, avgDist: '0' }
  const dist = validTrips.value.reduce((s, t) => s + (t.TotalDistance || 0), 0)
  const avg = validTrips.value.reduce((s, t) => s + (t.AverageSpeed || 0), 0) / validTrips.value.length
  const max = Math.max(...validTrips.value.map(t => t.MaxSpeed || 0))
  return { count: validTrips.value.length, dist: dist.toFixed(1), avg: avg.toFixed(0), max, avgDist: (dist / validTrips.value.length).toFixed(1) }
})

// Per-vehicle analytics from fleet store
const vehicleEfficiency = computed(() => fleet.vehicleEfficiency[props.code] || null)
const vehicleUtilization = computed(() => fleet.vehicleUtilization[props.code] || null)
const vehicleForecast = computed(() => fleet.vehicleForecasts[props.code] || null)
const vehicleAnoms = computed(() => fleet.vehicleAnomalies[props.code] || [])

// Detect if this vehicle has a device-level speed cap (e.g. tracker limited to 99 km/h)
const speedCap = computed(() => {
  if (!validTrips.value.length || validTrips.value.length < 3) return null
  const maxSpeeds = validTrips.value.map(t => t.MaxSpeed || 0).filter(s => s > 0)
  if (maxSpeeds.length < 3) return null
  const capValue = Math.max(...maxSpeeds)
  // If ALL trips have the exact same MaxSpeed, it's likely a device cap
  const allSame = maxSpeeds.every(s => s === capValue)
  // Or if >80% of trips hit the same ceiling
  const atCap = maxSpeeds.filter(s => s === capValue).length
  if (allSame || atCap / maxSpeeds.length > 0.8) return capValue
  return null
})

// Speed profile from trip data
const speedProfile = computed(() => {
  if (!validTrips.value.length) return null
  const speeds = validTrips.value.map(t => t.AverageSpeed || 0).filter(s => s > 0)
  const maxSpeeds = validTrips.value.map(t => t.MaxSpeed || 0).filter(s => s > 0)
  if (!speeds.length) return null

  const avgSpeed = Math.round(speeds.reduce((s, v) => s + v, 0) / speeds.length)
  const maxSpeed = Math.max(...maxSpeeds, 0)
  const overSpeed = maxSpeeds.filter(s => s > 130).length

  // Speed distribution buckets
  const buckets = { slow: 0, normal: 0, fast: 0, veryFast: 0 }
  speeds.forEach(s => {
    if (s < 30) buckets.slow++
    else if (s < 70) buckets.normal++
    else if (s < 100) buckets.fast++
    else buckets.veryFast++
  })

  return { avgSpeed, maxSpeed, overSpeed, buckets, totalTrips: speeds.length }
})

// Daily km trend for forecast chart
const dailyKmTrend = computed(() => {
  if (!validTrips.value.length) return []
  const daily = {}
  validTrips.value.forEach(t => {
    if (!t.StartTime) return
    const day = t.StartTime.slice(0, 10)
    daily[day] = (daily[day] || 0) + (t.TotalDistance || 0)
  })
  return Object.entries(daily)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, km]) => ({ date, km: Math.round(km * 10) / 10 }))
})

// Eco driving analysis (Driving Behavior Score)
// Penalty normalized per trip so vehicles with more trips aren't unfairly penalized.
const ecoAnalysis = computed(() => {
  if (!ecoEvents.value?.length) return null
  const events = ecoEvents.value
  const total = events.length
  const highSeverity = events.filter(e => e.EventSeverity === 3).length
  const medSeverity = events.filter(e => e.EventSeverity === 2).length
  const lowSeverity = events.filter(e => e.EventSeverity === 1).length

  // Normalize by trip count to prevent harsh scoring on active vehicles
  const tripCount = Math.max(validTrips.value.length, 1)
  const totalKm = validTrips.value.reduce((s, t) => s + (t.TotalDistance || 0), 0)
  const highPerTrip = highSeverity / tripCount
  const medPerTrip = medSeverity / tripCount
  const lowPerTrip = lowSeverity / tripCount

  // Score: 100 minus per-trip weighted penalties
  const score = Math.max(0, Math.min(100, Math.round(100 - (highPerTrip * 25) - (medPerTrip * 10) - (lowPerTrip * 2))))
  const grade = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor'

  // Rate per 100 km and per trip
  const per100km = totalKm > 0 ? Math.round(total / totalKm * 100 * 10) / 10 : 0
  const perTrip = Math.round(total / tripCount * 10) / 10

  // Severity percentages
  const highPct = Math.round(highSeverity / total * 100)
  const medPct = Math.round(medSeverity / total * 100)
  const lowPct = total > 0 ? 100 - highPct - medPct : 0

  // By type with enriched analytics
  const byType = {}
  events.forEach(ev => {
    const type = ECO_TYPES[ev.EventType] || 'Unknown'
    if (!byType[type]) byType[type] = { name: type, total: 0, high: 0, med: 0, low: 0, speeds: [] }
    byType[type].total++
    if (ev.EventSeverity === 3) byType[type].high++
    else if (ev.EventSeverity === 2) byType[type].med++
    else if (ev.EventSeverity === 1) byType[type].low++
    if (ev.Speed) byType[type].speeds.push(ev.Speed)
  })

  const typeList = Object.values(byType).sort((a, b) => b.total - a.total)
  typeList.forEach(t => {
    t.avgSpeed = t.speeds.length ? Math.round(t.speeds.reduce((s, v) => s + v, 0) / t.speeds.length) : 0
    t.per100km = totalKm > 0 ? Math.round(t.total / totalKm * 100 * 10) / 10 : 0
    t.perTrip = Math.round(t.total / tripCount * 10) / 10
    t.scoreImpact = Math.round((t.high / tripCount * 25) + (t.med / tripCount * 10) + (t.low / tripCount * 2))
    t.riskWeight = t.high > 0 ? 'High' : t.med > 0 ? 'Medium' : 'Low'
    // Cost estimate: high events +2 CZK/event, med +0.5, low +0.1 (rough wear/fuel penalty)
    t.costImpact = Math.round(t.high * 2 + t.med * 0.5 + t.low * 0.1)
  })

  // Top 3 problem behaviors sorted by score impact
  const problemBehaviors = [...typeList]
    .filter(t => t.scoreImpact > 0)
    .sort((a, b) => b.scoreImpact - a.scoreImpact)
    .slice(0, 3)

  // Worst areas (types with most high-severity events)
  const worstAreas = typeList.filter(t => t.high > 0).sort((a, b) => b.high - a.high)

  // Speeding stats
  const speedingTrips = validTrips.value.filter(t => (t.MaxSpeed || 0) > 130).length
  const speedingPct = tripCount > 0 ? Math.round(speedingTrips / tripCount * 100) : 0

  // AI insights / recommendations
  const insights = []
  if (problemBehaviors[0]) {
    const top = problemBehaviors[0]
    insights.push({ text: `Reduce ${top.name.toLowerCase()} events — causes ${top.scoreImpact} point penalty`, priority: 'high', detail: `${top.total} events (${top.per100km}/100km), ${top.high} high severity` })
  }
  if (speedingPct > 10) {
    insights.push({ text: `Avoid speeds >130 km/h — detected in ${speedingPct}% of trips`, priority: 'high', detail: `${speedingTrips} of ${tripCount} trips exceeded 130 km/h` })
  } else if (speedingPct > 0) {
    insights.push({ text: `Monitor speed — ${speedingTrips} trips exceeded 130 km/h`, priority: 'medium', detail: `${speedingPct}% of trips` })
  }
  if (problemBehaviors[1]) {
    const sec = problemBehaviors[1]
    insights.push({ text: `Improve ${sec.name.toLowerCase()} behavior — ${sec.scoreImpact} point impact`, priority: sec.scoreImpact > 5 ? 'high' : 'medium', detail: `${sec.per100km} events per 100 km` })
  }
  if (highSeverity > 0 && highPct > 30) {
    insights.push({ text: `High severity ratio is ${highPct}% — target below 15%`, priority: 'high', detail: `${highSeverity} of ${total} events are high severity` })
  }
  if (per100km > 5) {
    insights.push({ text: `Event rate ${per100km}/100km is above fleet target (< 3.0)`, priority: 'medium', detail: 'Smoother driving reduces wear and fuel consumption' })
  }

  return {
    total, highSeverity, medSeverity, lowSeverity,
    score, grade, tripCount, totalKm,
    per100km, perTrip,
    highPct, medPct, lowPct,
    byType: typeList, worstAreas, problemBehaviors,
    speedingTrips, speedingPct,
    insights,
  }
})

const ecoScoreColor = computed(() => {
  if (!ecoAnalysis.value) return '#888'
  const s = ecoAnalysis.value.score
  if (s >= 80) return '#c8ffc8'
  if (s >= 60) return '#fff5cc'
  if (s >= 40) return '#ffd88c'
  return '#ffaaaa'
})

// Risk Index
const riskIndex = computed(() => {
  return computeRiskIndex(validTrips.value, vehicleAnoms.value, ecoEvents.value || [])
})

// Data Quality
const dataQuality = computed(() => {
  return computeDataQuality(trips.value, tripPositions.value || [])
})

// Explainability panel states
const showMethodology = ref(false)       // Efficiency methodology
const showEcoMethodology = ref(false)    // Driving Behavior methodology
const showRiskMethodology = ref(false)   // Risk Index methodology
const showForecastMethodology = ref(false) // Forecast methodology

// Accordion open state for sensor groups
const openGroups = ref({ power: false, engine: false, fuel: false, environment: false, io: false, other: false })
const showRawFeed = ref(false)

function toggleGroup(key) {
  openGroups.value[key] = !openGroups.value[key]
}

// Get sensor health status
function sensorStatus(name, value) {
  if (value == null || value === '—') return { status: 'nodata', label: 'No data', color: 'var(--text-muted)' }
  const thresh = SENSOR_THRESHOLDS[name]
  if (!thresh) return { status: 'ok', label: 'OK', color: 'var(--status-live)' }
  if (thresh.critical(value)) return { status: 'critical', label: 'Critical', color: 'var(--status-danger)', msg: thresh.critMsg }
  if (thresh.warn(value)) return { status: 'warn', label: 'Warning', color: 'var(--status-moving)', msg: thresh.warnMsg }
  return { status: 'ok', label: 'OK', color: 'var(--status-live)' }
}

// Get latest value for a sensor by name
function sensorLatest(name) {
  if (!allSensorData.value?.items?.length) return null
  const item = allSensorData.value.items.find(s => s.name === name)
  if (!item?.data?.length) return null
  const v = item.data[item.data.length - 1]?.v
  return typeof v === 'number' ? v : null
}

// Available sensor items grouped
const sensorGroups = computed(() => {
  if (!allSensorData.value?.items?.length) return []
  const items = allSensorData.value.items
  const groups = []
  for (const g of SENSOR_GROUPS) {
    const sensors = items.filter(s => SENSOR_META[s.name]?.group === g.key && s.data?.length)
    if (sensors.length) groups.push({ ...g, sensors })
  }
  // Any unmatched
  const matched = new Set(groups.flatMap(g => g.sensors.map(s => s.name)))
  const other = items.filter(s => !matched.has(s.name) && s.data?.length)
  if (other.length) {
    const existing = groups.find(g => g.key === 'other')
    if (existing) existing.sensors.push(...other)
    else groups.push({ key: 'other', label: 'Other', sensors: other })
  }
  return groups
})

// Health strip items: top sensors with status badges
const healthStrip = computed(() => {
  if (!allSensorData.value?.items?.length) return []
  return HEALTH_STRIP_SENSORS.map(name => {
    const item = allSensorData.value.items.find(s => s.name === name)
    const meta = SENSOR_META[name]
    const hasData = item?.data?.length > 0
    const latest = hasData ? item.data[item.data.length - 1]?.v : null
    const val = typeof latest === 'number' ? latest : null
    const health = sensorStatus(name, val)
    return { name, meta, hasData, val, health, data: item?.data || [] }
  })
})

// Sensor quality & coverage
const sensorQuality = computed(() => {
  if (!allSensorData.value?.items?.length) return null
  const items = allSensorData.value.items
  const totalRequested = ALL_SENSORS.length
  const withData = items.filter(s => s.data?.length > 0).length
  const missing = totalRequested - withData
  const coverage = Math.round((withData / totalRequested) * 100)

  // Count outliers (sentinel values that were filtered)
  let outliers = 0
  items.forEach(s => {
    if (!s.data?.length) return
    s.data.forEach(d => {
      const v = d.v
      if (typeof v === 'number' && (v <= -2147483640 || v >= 2147483640 || Math.abs(v) > 999990)) outliers++
    })
  })

  // Total samples
  const totalSamples = items.reduce((sum, s) => sum + (s.data?.length || 0), 0)

  return { coverage, withData, missing, totalRequested, outliers, totalSamples }
})

// Sensor anomalies: stale, out-of-range, fluctuating
const sensorAlerts = computed(() => {
  if (!allSensorData.value?.items?.length) return []
  const alerts = []
  const now = Date.now()

  allSensorData.value.items.forEach(s => {
    if (!s.data?.length) return
    const meta = SENSOR_META[s.name]
    if (!meta) return
    const lastPoint = s.data[s.data.length - 1]
    const lastTime = lastPoint?.t ? new Date(lastPoint.t).getTime() : 0
    const lastVal = typeof lastPoint?.v === 'number' ? lastPoint.v : null

    // Stale: last update > 30 min ago
    if (lastTime && now - lastTime > 30 * 60 * 1000) {
      const minsAgo = Math.round((now - lastTime) / 60000)
      alerts.push({ sensor: meta.label, name: s.name, type: 'stale', label: `Stale (${minsAgo}m ago)`, color: 'var(--status-moving)' })
    }

    // Out of range
    const thresh = SENSOR_THRESHOLDS[s.name]
    if (thresh && lastVal != null && thresh.critical(lastVal)) {
      alerts.push({ sensor: meta.label, name: s.name, type: 'critical', label: `Out of range (${thresh.critMsg})`, color: 'var(--status-danger)' })
    }

    // Fluctuation: high coefficient of variation in last 20 samples
    if (s.data.length >= 10 && lastVal != null) {
      const recent = s.data.slice(-20).map(d => d.v).filter(v => typeof v === 'number')
      if (recent.length >= 10) {
        const mean = recent.reduce((a, b) => a + b, 0) / recent.length
        if (mean !== 0) {
          const std = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length)
          const cv = Math.abs(std / mean)
          if (cv > 0.5) alerts.push({ sensor: meta.label, name: s.name, type: 'fluctuating', label: `Fluctuating (CV ${(cv * 100).toFixed(0)}%)`, color: 'var(--status-moving)' })
        }
      }
    }
  })
  return alerts
})

// All sensors flat (for raw feed table)
const rawSensorFeed = computed(() => {
  if (!allSensorData.value?.items?.length) return []
  const rows = []
  allSensorData.value.items.forEach(s => {
    if (!s.data?.length) return
    const meta = SENSOR_META[s.name]
    s.data.forEach(d => {
      rows.push({ sensor: meta?.label || s.name, name: s.name, time: d.t, value: d.v, unit: meta?.unit || s.units || '' })
    })
  })
  rows.sort((a, b) => new Date(b.time) - new Date(a.time))
  return rows
})

// Environment matrix: group temps and humidities as zones
const envZones = computed(() => {
  if (!allSensorData.value?.items?.length) return []
  const zones = []
  for (let i = 1; i <= 4; i++) {
    const temp = allSensorData.value.items.find(s => s.name === `Temperature${i}`)
    const hum = allSensorData.value.items.find(s => s.name === `Humidity${i}`)
    if (temp?.data?.length || hum?.data?.length) {
      const tVal = temp?.data?.length ? temp.data[temp.data.length - 1]?.v : null
      const hVal = hum?.data?.length ? hum.data[hum.data.length - 1]?.v : null
      zones.push({
        zone: i,
        temp: typeof tVal === 'number' ? tVal.toFixed(1) : null,
        humidity: typeof hVal === 'number' ? hVal.toFixed(0) : null,
        tempData: temp?.data || [],
        humData: hum?.data || [],
      })
    }
  }
  return zones
})

function exportSensorsCsv() {
  if (!rawSensorFeed.value.length) return
  const header = 'Sensor,Time,Value,Unit\n'
  const rows = rawSensorFeed.value.map(r => `"${r.sensor}","${r.time}",${r.value},"${r.unit}"`).join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sensors-${props.code}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function loadData() {
  if (!vehicle.value) return
  loading.value = true
  trips.value = []
  tripPositions.value = null
  selectedTrip.value = null

  const { from, to } = dateRange(period.value)
  const s24 = dateRange('24h')

  const [tripsRes, relay, sensors, eco, branchRes] = await Promise.all([
    api.getTrips(props.code, from, to),
    api.getRelayState(props.code),
    api.getSensors(props.code, ['Speed', 'Rpm', 'FuelConsumptionActual'], s24.from, s24.to),
    api.getEcoDriving(props.code, from, to),
    fleet.activeGroup ? api.getBranches(fleet.activeGroup) : null,
  ])

  if (tripsRes) trips.value = cleanTrips(tripsRes)
  if (relay) relayState.value = relay
  if (sensors) sensorData.value = sensors
  if (eco) ecoEvents.value = Array.isArray(eco) ? eco : []
  if (branchRes) {
    branches.value = Array.isArray(branchRes) ? branchRes : []
    // Try to find current branch
    if (vehicle.value?.BranchId) selectedBranch.value = vehicle.value.BranchId
  }

  loading.value = false
}

async function loadAllSensors() {
  sensorLoading.value = true
  const s24 = dateRange('24h')
  const data = await api.getSensors(props.code, ALL_SENSORS, s24.from, s24.to)
  if (data) allSensorData.value = data
  sensorLoading.value = false
}

function normalizeDate(ts, offsetMinutes = 0) {
  if (!ts) return null
  try {
    // Trip times from API are CET without timezone suffix.
    // Parse as UTC to avoid browser CET→UTC shift (which loses 1h).
    const s = typeof ts === 'string' ? ts.replace(' ', 'T') : new Date(ts).toISOString().slice(0, 19)
    const d = new Date(s + 'Z') // Force UTC interpretation
    if (isNaN(d.getTime())) return null
    if (offsetMinutes) d.setUTCMinutes(d.getUTCMinutes() + offsetMinutes)
    return d.toISOString().slice(0, 19)
  } catch { return null }
}

async function showRoute(trip, idx) {
  // Prevent re-selecting the same trip (no flicker on double-click)
  if (selectedTrip.value === idx && !routeError.value) return

  const reqId = ++routeRequestId
  selectedTrip.value = idx
  tripPositions.value = null
  routeError.value = null
  showingAllRoutes.value = false
  loadingRoute.value = true

  const from = normalizeDate(trip.StartTime, -1)
  const to = normalizeDate(trip.FinishTime, 1)

  if (!from || !to) {
    routeError.value = 'Invalid trip time data'
    loadingRoute.value = false
    return
  }

  const data = await api.getHistory(props.code, from, to)

  // Race condition guard: ignore stale responses
  if (reqId !== routeRequestId) return

  const positions = data?.[0]?.Positions || data?.Positions
  if (positions?.length) {
    // Filter out invalid GPS points (null, 0/0, or extreme jumps)
    const valid = positions.filter(p => {
      const lat = parseFloat(p.Lat || p.Latitude)
      const lng = parseFloat(p.Lng || p.Longitude)
      return lat && lng && Math.abs(lat) > 0.1 && Math.abs(lng) > 0.1
    })
    tripPositions.value = valid.length ? valid : null
    if (!valid.length) routeError.value = 'Route has no valid GPS positions'
  } else {
    const dist = trip.TotalDistance || 0
    routeError.value = dist < 3
      ? `No GPS data — short trips (${dist.toFixed(1)} km) often have no recorded positions`
      : 'No route data available from the API for this trip'
  }
  loadingRoute.value = false
}

async function showAllRoutes() {
  const reqId = ++routeRequestId
  selectedTrip.value = null
  tripPositions.value = null
  routeError.value = null
  showingAllRoutes.value = true
  loadingAllRoutes.value = true
  loadingRoute.value = true

  const { from, to } = dateRange(period.value)
  const data = await api.getHistory(props.code, from, to)

  if (reqId !== routeRequestId) return

  const positions = data?.[0]?.Positions || data?.Positions
  if (positions?.length) {
    const valid = positions.filter(p => {
      const lat = parseFloat(p.Lat || p.Latitude)
      const lng = parseFloat(p.Lng || p.Longitude)
      return lat && lng && Math.abs(lat) > 0.1 && Math.abs(lng) > 0.1
    })
    tripPositions.value = valid.length ? valid : null
    if (!valid.length) routeError.value = 'No valid GPS positions found in this period'
  } else {
    routeError.value = 'No position history available for this period'
  }
  loadingAllRoutes.value = false
  loadingRoute.value = false
}

function clearRoute() {
  selectedTrip.value = null
  tripPositions.value = null
  routeError.value = null
  showingAllRoutes.value = false
}

async function changeBranch() {
  if (!selectedBranch.value) return
  branchLoading.value = true
  branchSaved.value = false
  await api.changeBranch(props.code, selectedBranch.value)
  branchLoading.value = false
  branchSaved.value = true
  setTimeout(() => { branchSaved.value = false }, 2000)
  await fleet.refresh()
}

function startEditPurpose(idx) {
  editingPurpose.value = idx
  purposeText.value = validTrips.value[idx]?.Purpose || ''
}

async function savePurpose() {
  if (editingPurpose.value === null) return
  purposeLoading.value = true
  await api.setTripPurpose(props.code, purposeText.value)
  // Update local trip data
  const trip = validTrips.value[editingPurpose.value]
  if (trip) trip.Purpose = purposeText.value
  editingPurpose.value = null
  purposeText.value = ''
  purposeLoading.value = false
}

function cancelEditPurpose() {
  editingPurpose.value = null
  purposeText.value = ''
}

// Load all sensors when switching to sensors tab
watch(tab, (newTab) => {
  if (newTab === 'sensors' && !allSensorData.value) loadAllSensors()
})

onMounted(loadData)
watch(period, loadData)
</script>

<template>
  <div v-if="vehicle" class="flex-1 overflow-auto p-5">

    <!-- Header -->
    <div class="flex items-center gap-3 mb-5 animate-rise">
      <button @click="router.push({ name: 'dashboard' })" class="lumi-btn">← Back</button>
      <div class="flex-1">
        <div class="text-2xl font-display font-bold text-lumi">{{ vehicle.Name || vehicle.Code }}</div>
        <div class="text-[16px] text-dim">{{ vehicle.SPZ || 'No plate' }} · <span class="font-mono">{{ vehicle.Code }}</span></div>
      </div>
      <span
        class="lumi-badge ml-1"
        :style="{
          color: status?.color,
          background: status?.color + '10',
          boxShadow: `0 0 12px ${status?.color}22`
        }"
      >
        <span class="w-2 h-2 rounded-full animate-pulse-slow" :style="{ background: status?.color, boxShadow: `0 0 6px ${status?.color}88` }" />
        {{ status?.label }}
      </span>

      <!-- Efficiency grade badge -->
      <span
        v-if="vehicleEfficiency?.score > 0"
        class="lumi-badge ml-1 cursor-pointer"
        :style="{
          color: vehicleEfficiency.score >= 65 ? 'var(--status-live)' : vehicleEfficiency.score >= 50 ? 'var(--status-moving)' : 'var(--status-danger)',
          background: (vehicleEfficiency.score >= 65 ? 'var(--status-live)' : vehicleEfficiency.score >= 50 ? 'var(--status-moving)' : 'var(--status-danger)') + '12',
        }"
        @click="showMethodology = !showMethodology"
        :title="`Click for methodology · ${vehicleEfficiency.score}/100`"
      >
        {{ vehicleEfficiency.grade }} · {{ vehicleEfficiency.score }}
      </span>

      <!-- Risk badge -->
      <span
        v-if="riskIndex.score > 0"
        class="lumi-badge ml-1"
        :style="{
          color: riskIndex.level === 'high' ? 'var(--status-danger)' : riskIndex.level === 'medium' ? 'var(--status-moving)' : 'var(--status-live)',
          background: (riskIndex.level === 'high' ? 'var(--status-danger)' : riskIndex.level === 'medium' ? 'var(--status-moving)' : 'var(--status-live)') + '12',
        }"
        :title="riskIndex.factors.map(f => `${f.name}: ${f.value}% — ${f.detail}`).join('\n')"
      >
        Risk {{ riskIndex.level }}
      </span>

      <!-- Data quality indicator -->
      <span
        v-if="dataQuality.totalTrips > 0"
        class="text-[12px] font-mono ml-2"
        :style="{ color: dataQuality.integrity >= 90 ? 'var(--text-dim)' : dataQuality.integrity >= 70 ? 'var(--status-moving)' : 'var(--status-danger)' }"
        :title="`${dataQuality.validTrips}/${dataQuality.totalTrips} valid trips · ${dataQuality.flaggedTrips} flagged · ${dataQuality.sentinelTrips} sentinel values filtered`"
      >
        Data {{ dataQuality.integrity }}%
      </span>

      <!-- Branch selector -->
      <div v-if="branches.length" class="flex items-center gap-2 ml-2">
        <select
          v-model="selectedBranch"
          @change="changeBranch"
          class="lumi-select"
          :disabled="branchLoading"
        >
          <option :value="null" disabled>Branch...</option>
          <option v-for="b in branches" :key="b.Id" :value="b.Id">{{ b.Name }}</option>
        </select>
        <span v-if="branchSaved" class="text-[14px]" style="color:var(--status-live)">✓ Saved</span>
        <span v-if="branchLoading" class="text-[14px] text-dim">Saving...</span>
      </div>
    </div>

    <!-- Quick stats row -->
    <div class="grid grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5 animate-rise" style="animation-delay:50ms">
      <div class="lumi-card p-3.5" :title="vehicle.Speed === 0 ? 'Vehicle stationary' : vehicle.Speed ? `Current speed: ${vehicle.Speed} km/h` : 'Insufficient valid samples'">
        <div class="lumi-stat text-2xl" style="text-shadow:0 0 25px var(--glow-shadow)">{{ vehicle.Speed != null ? vehicle.Speed : '—' }}</div>
        <div class="text-[13px] text-dim uppercase tracking-[0.1em] mt-1">km/h</div>
      </div>
      <div class="lumi-card p-3.5" :title="vehicle.Odometer ? `Odometer: ${vehicle.Odometer} m (${fmtKm(vehicle.Odometer)} km)` : 'Insufficient valid samples — odometer not reported or sentinel value filtered'">
        <div class="lumi-stat text-2xl">{{ vehicle.Odometer ? fmtKm(vehicle.Odometer) : '—' }}</div>
        <div class="text-[13px] text-dim uppercase tracking-[0.1em] mt-1">Total km</div>
      </div>
      <div class="lumi-card p-3.5" :title="vehicle.BatteryPercentage > 0 ? `Tracker battery level: ${vehicle.BatteryPercentage}%` : 'Not available — combustion vehicle, no battery sensor, or sentinel value filtered'">
        <div class="lumi-stat text-2xl" :style="{ color: vehicle.BatteryPercentage > 20 ? 'var(--status-live)' : vehicle.BatteryPercentage > 0 ? 'var(--status-danger)' : 'var(--text-muted)' }">
          {{ vehicle.BatteryPercentage > 0 ? vehicle.BatteryPercentage + '%' : '—' }}
        </div>
        <div class="text-[13px] text-dim uppercase tracking-[0.1em] mt-1">Battery</div>
      </div>
      <div class="lumi-card p-3.5">
        <div class="lumi-stat text-2xl">{{ tripStats.count }}</div>
        <div class="text-[13px] text-dim uppercase tracking-[0.1em] mt-1">Trips ({{ period }})</div>
      </div>
      <div class="lumi-card p-3.5">
        <div class="lumi-stat text-2xl">{{ tripStats.dist }}</div>
        <div class="text-[13px] text-dim uppercase tracking-[0.1em] mt-1">Total km</div>
      </div>
      <div class="lumi-card p-3.5" :title="tripStats.max > 0 ? `Peak speed across all trips: ${tripStats.max} km/h` : 'Insufficient valid samples'">
        <div class="lumi-stat text-2xl" :style="{ color: tripStats.max > 130 ? 'var(--status-danger)' : 'var(--text-primary)' }">{{ tripStats.max || '—' }}</div>
        <div class="text-[13px] text-dim uppercase tracking-[0.1em] mt-1">Max km/h</div>
      </div>
    </div>

    <!-- Efficiency Methodology Explainer (toggle) -->
    <div v-if="showMethodology && vehicleEfficiency?.methodology" class="lumi-card p-5 mb-5 animate-rise">
      <div class="flex items-center justify-between mb-3">
        <span class="text-[15px] font-display font-bold" style="color:var(--text-primary)">{{ vehicleEfficiency.methodology.title }}</span>
        <button @click="showMethodology = false" class="lumi-btn-icon text-[14px]">×</button>
      </div>
      <p class="text-[13px] text-dim mb-2">{{ vehicleEfficiency.methodology.description }}</p>
      <div class="text-[12px] font-mono mb-3 px-3 py-2 rounded" style="background:var(--surface-raised); color:var(--text-secondary)">{{ vehicleEfficiency.methodology.math }}</div>
      <div class="space-y-2">
        <div v-for="f in vehicleEfficiency.methodology.factors" :key="f.name" class="flex items-start gap-2 text-[13px]">
          <span class="font-mono font-bold w-10 flex-shrink-0" style="color:var(--text-secondary)">{{ f.weight }}</span>
          <div>
            <span class="font-semibold" style="color:var(--text-primary)">{{ f.name }}</span>
            <span class="text-dim"> — {{ f.detail }}</span>
          </div>
        </div>
      </div>
      <div class="mt-3 flex gap-2 text-[12px] font-mono flex-wrap">
        <span v-for="(range, g) in vehicleEfficiency.methodology.grades" :key="g"
          class="px-2 py-0.5 rounded"
          :style="{ background: g === 'A' ? 'rgba(200,255,200,0.1)' : g === 'B' ? 'rgba(200,255,200,0.06)' : g === 'F' ? 'rgba(255,100,100,0.1)' : 'var(--surface-raised)', color: g === 'A' ? 'var(--status-live)' : g === 'F' ? 'var(--status-danger)' : 'var(--text-dim)' }"
        >{{ g }}: {{ range }}</span>
      </div>
    </div>

    <!-- Risk Methodology Panel (toggle) -->
    <div v-if="showRiskMethodology" class="lumi-card p-5 mb-5 animate-rise">
      <div class="flex items-center justify-between mb-3">
        <span class="text-[15px] font-display font-bold" style="color:var(--text-primary)">{{ RISK_METHODOLOGY.title }}</span>
        <button @click="showRiskMethodology = false" class="lumi-btn-icon text-[14px]">×</button>
      </div>
      <p class="text-[13px] text-dim mb-2">{{ RISK_METHODOLOGY.description }}</p>
      <p class="text-[12px] mb-3" style="color:var(--text-secondary)">{{ RISK_METHODOLOGY.scaleExplain }}</p>
      <div class="space-y-2">
        <div v-for="f in RISK_METHODOLOGY.factors" :key="f.name" class="flex items-start gap-2 text-[13px]">
          <span class="font-mono font-bold w-10 flex-shrink-0" style="color:var(--text-secondary)">{{ f.weight }}</span>
          <div>
            <span class="font-semibold" style="color:var(--text-primary)">{{ f.name }}</span>
            <span class="text-dim"> — {{ f.detail }}</span>
          </div>
        </div>
      </div>
      <div class="mt-3 flex gap-2 text-[12px] font-mono">
        <span v-for="(range, lvl) in RISK_METHODOLOGY.levels" :key="lvl"
          class="px-2 py-0.5 rounded"
          :style="{ background: lvl === 'high' ? 'rgba(255,100,100,0.1)' : lvl === 'medium' ? 'rgba(255,200,100,0.1)' : 'rgba(200,255,200,0.1)', color: lvl === 'high' ? 'var(--status-danger)' : lvl === 'medium' ? 'var(--status-moving)' : 'var(--status-live)' }"
        >{{ lvl }}: {{ range }}</span>
      </div>
    </div>

    <!-- Forecast Methodology Panel (toggle) -->
    <div v-if="showForecastMethodology" class="lumi-card p-5 mb-5 animate-rise">
      <div class="flex items-center justify-between mb-3">
        <span class="text-[15px] font-display font-bold" style="color:var(--text-primary)">{{ FORECAST_METHODOLOGY.title }}</span>
        <button @click="showForecastMethodology = false" class="lumi-btn-icon text-[14px]">×</button>
      </div>
      <p class="text-[13px] text-dim mb-3">{{ FORECAST_METHODOLOGY.description }}</p>
      <div class="space-y-2">
        <div v-for="f in FORECAST_METHODOLOGY.factors" :key="f.name" class="flex items-start gap-2 text-[13px]">
          <span class="font-mono font-bold w-16 flex-shrink-0" style="color:var(--text-secondary)">{{ f.weight }}</span>
          <div>
            <span class="font-semibold" style="color:var(--text-primary)">{{ f.name }}</span>
            <span class="text-dim"> — {{ f.detail }}</span>
          </div>
        </div>
      </div>
      <p class="text-[12px] text-dim mt-3">{{ FORECAST_METHODOLOGY.note }}</p>
    </div>

    <!-- Vehicle Analytics Panel -->
    <div v-if="vehicleEfficiency || speedProfile || vehicleForecast" class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5 animate-rise" style="animation-delay:75ms">
      <!-- Efficiency Breakdown -->
      <div v-if="vehicleEfficiency?.score > 0" class="lumi-card p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-[13px] text-dim uppercase tracking-wider font-semibold">Fleet Efficiency</span>
            <button @click="showMethodology = !showMethodology" class="text-[11px] px-1.5 py-0.5 rounded cursor-pointer" style="background:var(--surface-hover); color:var(--text-dim)" title="How is this calculated?">?</button>
          </div>
          <span class="text-[22px] font-display font-bold" :style="{ color: vehicleEfficiency.score >= 65 ? 'var(--status-live)' : vehicleEfficiency.score >= 50 ? 'var(--status-moving)' : 'var(--status-danger)' }">
            {{ vehicleEfficiency.grade }}
          </span>
        </div>
        <div class="space-y-2">
          <div v-for="c in vehicleEfficiency.components" :key="c.name" class="flex items-center gap-2" :title="c.detail">
            <span class="text-[12px] text-dim w-24 flex-shrink-0">{{ c.name }}</span>
            <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background:var(--surface-raised)">
              <div class="h-full rounded-full transition-all" :style="{ width: c.value + '%', background: c.value > 60 ? 'var(--status-live)' : c.value > 30 ? 'var(--status-moving)' : 'var(--status-danger)', opacity: 0.6 }"></div>
            </div>
            <span class="text-[12px] font-mono w-8 text-right" style="color:var(--text-secondary)">{{ c.value }}</span>
          </div>
        </div>
        <div class="text-[11px] text-dim mt-2 font-mono">{{ vehicleEfficiency.score }}/100 · Vehicle utilization (not driving behavior)</div>
      </div>

      <!-- Speed Profile + Risk -->
      <div v-if="speedProfile" class="lumi-card p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-[13px] text-dim uppercase tracking-wider font-semibold">Speed Profile</span>
          <span class="text-[16px] font-mono font-bold" :style="{ color: speedProfile.maxSpeed > 130 ? 'var(--status-danger)' : 'var(--text-primary)' }">{{ speedProfile.maxSpeed }} km/h</span>
        </div>
        <div class="flex items-center gap-3 mb-3">
          <div class="text-center flex-1">
            <div class="text-[18px] font-mono font-bold" style="color:var(--text-primary)">{{ speedProfile.avgSpeed }}</div>
            <div class="text-[10px] text-dim uppercase">avg km/h</div>
          </div>
          <div class="text-center flex-1">
            <div class="text-[18px] font-mono font-bold" :style="{ color: speedProfile.maxSpeed > 130 ? 'var(--status-danger)' : 'var(--text-primary)' }">{{ speedProfile.maxSpeed }}</div>
            <div class="text-[10px] text-dim uppercase">max km/h</div>
          </div>
          <div v-if="speedProfile.overSpeed > 0" class="text-center flex-1">
            <div class="text-[18px] font-mono font-bold" style="color:var(--status-danger)">{{ speedProfile.overSpeed }}</div>
            <div class="text-[10px] text-dim uppercase">trips &gt;130</div>
          </div>
        </div>
        <!-- Speed distribution bar -->
        <div class="flex gap-0.5 h-4 rounded overflow-hidden" style="background:var(--surface-raised)">
          <div v-if="speedProfile.buckets.slow" class="h-full flex items-center justify-center text-[9px] font-mono" :style="{ width: (speedProfile.buckets.slow / speedProfile.totalTrips * 100) + '%', background: 'var(--status-moving)', opacity: 0.3 }">{{ speedProfile.buckets.slow }}</div>
          <div v-if="speedProfile.buckets.normal" class="h-full flex items-center justify-center text-[9px] font-mono" :style="{ width: (speedProfile.buckets.normal / speedProfile.totalTrips * 100) + '%', background: 'var(--status-live)', opacity: 0.3 }">{{ speedProfile.buckets.normal }}</div>
          <div v-if="speedProfile.buckets.fast" class="h-full flex items-center justify-center text-[9px] font-mono" :style="{ width: (speedProfile.buckets.fast / speedProfile.totalTrips * 100) + '%', background: 'var(--status-moving)', opacity: 0.4 }">{{ speedProfile.buckets.fast }}</div>
          <div v-if="speedProfile.buckets.veryFast" class="h-full flex items-center justify-center text-[9px] font-mono" :style="{ width: (speedProfile.buckets.veryFast / speedProfile.totalTrips * 100) + '%', background: 'var(--status-danger)', opacity: 0.4 }">{{ speedProfile.buckets.veryFast }}</div>
        </div>
        <div class="flex gap-2 mt-1.5 text-[10px] text-dim">
          <span>&lt;30</span><span>30-70</span><span>70-100</span><span>&gt;100 km/h</span>
        </div>
        <div v-if="speedCap" class="mt-2 text-[11px] px-2 py-1 rounded" style="background:rgba(255,180,100,0.1); color:var(--status-moving)">
          Device speed cap detected: all trips max {{ speedCap }} km/h
        </div>
        <!-- Risk mini-display -->
        <div v-if="riskIndex.score > 0" class="mt-2 pt-2" style="border-top:1px solid var(--border)">
          <div class="flex items-center justify-between text-[11px]">
            <div class="flex items-center gap-1.5">
              <span class="text-dim uppercase tracking-wider font-semibold">Driver Risk</span>
              <button @click="showRiskMethodology = !showRiskMethodology" class="text-[10px] px-1 py-0.5 rounded cursor-pointer" style="background:var(--surface-hover); color:var(--text-dim)" title="How is this calculated?">?</button>
            </div>
            <span class="font-mono font-bold" :style="{ color: riskIndex.level === 'high' ? 'var(--status-danger)' : riskIndex.level === 'medium' ? 'var(--status-moving)' : 'var(--status-live)' }">{{ riskIndex.score }}/100 {{ riskIndex.level }}</span>
          </div>
          <div class="text-[10px] text-dim mt-0.5" style="opacity:0.6">Scale 0 (safest) → 100 (highest risk) · not a percentile</div>
          <div class="flex gap-1 mt-1 flex-wrap">
            <span v-for="f in riskIndex.factors.filter(f => f.value > 0)" :key="f.name" class="text-[10px] px-1.5 py-0.5 rounded"
              :style="{ background: f.value > 50 ? 'rgba(255,100,100,0.1)' : 'var(--surface-raised)', color: f.value > 50 ? 'var(--status-danger)' : 'var(--text-dim)' }"
              :title="f.detail"
            >{{ f.name }} {{ f.value }}%</span>
          </div>
        </div>
      </div>

      <!-- Forecast + Daily Trend -->
      <div class="lumi-card p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-1.5">
            <span class="text-[13px] text-dim uppercase tracking-wider font-semibold">Driving Trend</span>
            <button @click="showForecastMethodology = !showForecastMethodology" class="text-[10px] px-1 py-0.5 rounded cursor-pointer" style="background:var(--surface-hover); color:var(--text-dim)" title="How is this calculated?">?</button>
          </div>
          <span v-if="vehicleForecast?.trend && vehicleForecast.confidence !== 'insufficient' && vehicleForecast.confidence !== 'low'" class="text-[13px] font-mono" :style="{ color: vehicleForecast.trend === 'up' ? 'var(--status-live)' : vehicleForecast.trend === 'down' ? 'var(--status-danger)' : 'var(--text-dim)' }">
            {{ vehicleForecast.trend === 'up' ? '↑ Increasing' : vehicleForecast.trend === 'down' ? '↓ Decreasing' : '→ Stable' }}
          </span>
          <span v-else-if="vehicleForecast?.confidence === 'insufficient' || vehicleForecast?.confidence === 'low'" class="text-[11px] px-1.5 py-0.5 rounded" style="background:var(--surface-raised); color:var(--text-dim)">
            Insufficient data
          </span>
        </div>
        <!-- Interactive daily km chart with forecast overlay -->
        <DailyKmChart
          v-if="dailyKmTrend.length"
          :past="dailyKmTrend.map(d => ({ date: d.date, label: d.date.slice(5), km: d.km }))"
          :forecast="vehicleForecast?.forecast?.length && vehicleForecast.confidence !== 'insufficient' && vehicleForecast.confidence !== 'low' ? vehicleForecast.forecast.map(f => ({ date: f.date, label: f.label, km: Math.max(0, f.km) })) : []"
          :height="120"
        />
        <!-- Forecast info (only show when confidence is at least medium) -->
        <div v-if="vehicleForecast" class="mt-2 space-y-1">
          <div v-if="vehicleForecast.confidence !== 'insufficient'" class="flex items-center gap-2 text-[12px]">
            <span class="text-dim">Confidence:</span>
            <span class="font-mono" :style="{ color: vehicleForecast.confidence === 'high' ? 'var(--status-live)' : vehicleForecast.confidence === 'medium' ? 'var(--status-moving)' : 'var(--text-dim)' }">{{ vehicleForecast.confidence }}</span>
          </div>
          <div v-if="vehicleForecast.forecast?.length && vehicleForecast.confidence !== 'insufficient' && vehicleForecast.confidence !== 'low'" class="flex items-center gap-2 text-[12px]">
            <span class="text-dim">Forecast 7d:</span>
            <span class="font-mono" style="color:var(--text-secondary)">~{{ Math.max(0, Math.round(vehicleForecast.forecast.reduce((s, f) => s + f.km, 0))) }} km</span>
          </div>
          <div v-else-if="vehicleForecast.message" class="text-[11px] text-dim">{{ vehicleForecast.message }}</div>
          <div v-if="vehicleUtilization" class="flex items-center gap-2 text-[12px]">
            <span class="text-dim">{{ vehicleUtilization.kmPerDay }} km/day avg</span>
            <span class="text-dim">· {{ vehicleUtilization.tripCount }} trips</span>
          </div>
        </div>
        <div v-if="vehicleAnoms.length" class="mt-2 flex gap-1 flex-wrap">
          <span v-for="a in vehicleAnoms.slice(0, 4)" :key="a.type" class="text-[10px] px-1.5 py-0.5 rounded" :style="{ background: a.color + '15', color: a.color }" :title="a.detail">{{ a.icon }} {{ a.label }}</span>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex items-center gap-0.5 mb-4 animate-rise" style="animation-delay:100ms; border-bottom:1px solid var(--border)">
      <button
        v-for="t in [
          { key: 'trips', label: 'Trips', count: tripStats.count },
          { key: 'costs', label: 'Costs' },
          { key: 'sensors', label: 'Sensors' },
          { key: 'eco', label: 'Eco Driving', count: ecoEvents?.length },
          { key: 'controls', label: 'Controls' },
        ]" :key="t.key"
        @click="tab = t.key"
        class="px-4 py-2.5 text-[16px] font-medium transition-all duration-200 border-b-2 cursor-pointer"
        :class="tab === t.key
          ? 'text-lumi'
          : 'text-dim border-transparent'"
        :style="tab === t.key ? 'border-color:var(--text-dim); text-shadow:0 0 15px var(--glow-shadow)' : ''"
      >
        {{ t.label }}
        <span v-if="t.count" class="ml-1.5 text-[13px] px-1.5 py-0.5 rounded-full" style="background:var(--surface-raised)">
          {{ t.count }}
        </span>
      </button>
      <div class="ml-auto flex gap-1 mb-1">
        <button
          v-for="p in ['24h', '7d', '30d']" :key="p"
          @click="period = p"
          class="lumi-btn text-[14px] px-3 py-1"
          :class="{ 'lumi-btn-accent': period === p }"
        >{{ p }}</button>
      </div>
    </div>

    <!-- Tab content -->
    <Transition name="page" mode="out-in">

      <!-- ═══════ TRIPS - 50/50 SPLIT ═══════ -->
      <div v-if="tab === 'trips'" key="trips">
        <div class="flex gap-4" style="height:calc(100vh - 300px); min-height:400px">

          <!-- Left: Trip list (50%) -->
          <div class="w-1/2 flex flex-col min-h-0">
            <!-- Trip summary stats -->
            <div class="grid grid-cols-5 gap-2 mb-3 flex-shrink-0">
              <div v-for="(s, i) in [
                { val: tripStats.count, label: 'TRIPS' },
                { val: tripStats.dist, label: 'KM' },
                { val: tripStats.avg, label: 'AVG' },
                { val: tripStats.max, label: 'MAX', color: tripStats.max > 130 ? 'var(--status-danger)' : undefined },
                { val: tripStats.avgDist, label: 'AVG/T' },
              ]" :key="i"
                class="p-2.5 rounded-lg text-center" style="background:var(--surface-hover); border:1px solid var(--border)"
              >
                <div class="lumi-stat text-[18px]" :style="{ color: s.color || 'var(--text-primary)' }">{{ s.val }}</div>
                <div class="text-[10px] text-dim uppercase tracking-[0.12em]">{{ s.label }}</div>
              </div>
            </div>

            <!-- Loading -->
            <div v-if="loading" class="flex-1 flex flex-col items-center justify-center">
              <div class="loading-spinner mb-3"></div>
              <div class="text-[16px] text-dim">Loading trips...</div>
            </div>

            <!-- Empty -->
            <div v-else-if="!validTrips.length" class="flex-1 flex flex-col items-center justify-center">
              <div class="text-3xl mb-2">🛣️</div>
              <div class="text-[16px] text-dim">No trips in this period</div>
            </div>

            <!-- Trip list (compact) -->
            <div v-else class="flex-1 overflow-y-auto lumi-card min-h-0">
              <div
                v-for="(t, i) in validTrips" :key="i"
                @click="showRoute(t, i)"
                class="px-4 py-3 cursor-pointer transition-all duration-150 border-b"
                :style="{ borderColor: 'var(--border)', background: selectedTrip === i ? 'var(--surface-raised)' : '' }"
              >
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-2">
                    <span class="text-[14px] text-dim font-mono">#{{ i + 1 }}</span>
                    <span class="text-[15px] font-semibold" style="color:var(--text-primary)">{{ fmtDist(t.TotalDistance) }} km</span>
                  </div>
                  <span
                    class="text-[13px] font-mono"
                    :style="{ color: (t.MaxSpeed || 0) > 120 ? 'var(--status-danger)' : 'var(--text-dim)' }"
                  >max {{ t.MaxSpeed || 0 }}</span>
                </div>

                <div class="flex items-center gap-2 text-[13px] text-dim">
                  <span>{{ fmtDate(t.StartTime) }}</span>
                  <span style="color:var(--text-muted)">→</span>
                  <span>{{ fmtDate(t.FinishTime) }}</span>
                </div>

                <div class="flex items-center gap-3 mt-1.5 text-[13px]">
                  <span class="text-dim">{{ t.TripLength || '—' }}</span>
                  <span class="text-dim">avg {{ t.AverageSpeed || 0 }} km/h</span>
                  <span v-if="t.DriverName" class="text-dim">👤 {{ t.DriverName }}</span>
                  <span v-if="t._flags?.length" class="text-[11px] px-1.5 py-0.5 rounded" style="background:rgba(200,200,255,0.1); color:#c8c8ff" :title="t._flags.join(', ')">⊙ data issue</span>
                </div>

                <!-- Purpose with edit -->
                <div class="flex items-center gap-2 mt-1.5">
                  <template v-if="editingPurpose === i">
                    <input
                      v-model="purposeText"
                      class="lumi-input flex-1 text-[13px] py-1 px-2"
                      placeholder="Trip purpose..."
                      @keyup.enter="savePurpose"
                      @keyup.escape="cancelEditPurpose"
                    />
                    <button @click="savePurpose" class="lumi-btn text-[12px] px-2 py-0.5" :disabled="purposeLoading">
                      {{ purposeLoading ? '...' : '✓' }}
                    </button>
                    <button @click="cancelEditPurpose" class="lumi-btn text-[12px] px-2 py-0.5">✕</button>
                  </template>
                  <template v-else>
                    <span class="text-[13px]" :style="{ color: t.Purpose ? 'var(--text-dim)' : 'var(--text-muted)' }">
                      {{ t.Purpose || 'No purpose set' }}
                    </span>
                    <button
                      @click.stop="startEditPurpose(i)"
                      class="text-[12px] text-dim hover:text-white/60 transition-colors cursor-pointer"
                      title="Edit purpose"
                    >✎</button>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Speed Chart + Map (50%) -->
          <div class="w-1/2 flex flex-col gap-2 min-h-0">
            <!-- Speed timeline chart (always visible) -->
            <div class="lumi-card p-3 flex-shrink-0">
              <div v-if="tripPositions?.length">
                <TripSpeedChart
                  :positions="tripPositions"
                  :height="100"
                />
              </div>
              <div v-else class="flex items-center justify-center gap-3 py-3">
                <div class="text-[13px] text-dim">
                  {{ loadingRoute ? 'Loading speed data...' : 'Select a trip or load all routes to see speed analytics' }}
                </div>
                <div v-if="!loadingRoute && validTrips.length" class="flex gap-3 text-[13px] font-mono">
                  <span style="color:var(--text-secondary)">avg {{ tripStats.avg }} km/h</span>
                  <span :style="{ color: tripStats.max > 130 ? 'var(--status-danger)' : 'var(--text-secondary)' }">max {{ tripStats.max }} km/h</span>
                  <span style="color:var(--text-dim)">{{ tripStats.dist }} km total</span>
                </div>
              </div>
            </div>

            <div class="lumi-card overflow-hidden flex-1 relative min-h-0">
              <div class="px-4 py-2 flex items-center justify-between flex-shrink-0" style="border-bottom:1px solid var(--border)">
                <span class="text-[15px] font-semibold text-lumi">
                  {{ showingAllRoutes ? `All Routes (${period})` : selectedTrip !== null ? `Trip #${selectedTrip + 1} Route` : 'Position' }}
                </span>
                <div class="flex gap-1.5">
                  <button
                    v-if="!showingAllRoutes && validTrips.length"
                    @click="showAllRoutes"
                    class="lumi-btn text-[13px]"
                    :disabled="loadingAllRoutes"
                  >{{ loadingAllRoutes ? 'Loading...' : `All Routes (${period})` }}</button>
                  <button v-if="selectedTrip !== null || showingAllRoutes" @click="clearRoute" class="lumi-btn text-[13px]">Clear</button>
                </div>
              </div>
              <!-- Route loading overlay (semi-transparent, vehicle marker visible) -->
              <div v-if="loadingRoute" class="absolute inset-0 z-[1000] flex items-center justify-center" style="background:rgba(0,0,0,0.35);backdrop-filter:blur(1px)">
                <div class="flex flex-col items-center glass-strong rounded-xl px-6 py-4">
                  <div class="loading-spinner mb-2"></div>
                  <div class="text-[14px] text-dim">{{ showingAllRoutes ? `Loading all routes (${period})...` : 'Loading route...' }}</div>
                </div>
              </div>
              <!-- Route error overlay (semi-transparent, shows vehicle location behind) -->
              <div v-else-if="routeError && (selectedTrip !== null || showingAllRoutes)" class="absolute inset-0 z-[1000] flex items-center justify-center" style="background:rgba(0,0,0,0.3);backdrop-filter:blur(1px)">
                <div class="flex flex-col items-center text-center glass-strong rounded-xl px-6 py-4 max-w-sm">
                  <div class="text-2xl mb-2">⚠</div>
                  <div class="text-[14px] font-semibold" style="color:var(--text-secondary)">{{ routeError }}</div>
                  <div class="text-[12px] text-dim mt-1">Showing vehicle location instead.</div>
                  <div class="flex gap-2 mt-3">
                    <button v-if="selectedTrip !== null" @click="showRoute(validTrips[selectedTrip], selectedTrip)" class="lumi-btn text-[13px]">Retry</button>
                    <button @click="clearRoute" class="lumi-btn text-[13px]">Dismiss</button>
                  </div>
                </div>
              </div>
              <FleetMap
                ref="tripMapRef"
                :selected-vehicle="vehicle"
                :trip-route="tripPositions"
                height="100%"
              />
              <!-- Trip summary overlay -->
              <div
                v-if="selectedTrip !== null && tripPositions && validTrips[selectedTrip]"
                class="absolute bottom-3 left-3 right-3 z-[1000] glass-strong rounded-xl px-3 py-2 flex items-center gap-4"
              >
                <div v-for="(s, si) in [
                  { val: fmtDist(validTrips[selectedTrip].TotalDistance) + ' km', label: 'Distance' },
                  { val: validTrips[selectedTrip].TripLength || '—', label: 'Duration' },
                  { val: (validTrips[selectedTrip].AverageSpeed || 0) + ' km/h', label: 'Avg Speed' },
                  { val: (validTrips[selectedTrip].MaxSpeed || 0) + ' km/h', label: 'Max Speed', color: (validTrips[selectedTrip].MaxSpeed || 0) > 130 ? 'var(--status-danger)' : undefined },
                ]" :key="si" class="text-center">
                  <div class="text-[16px] font-bold" :style="{ color: s.color || 'var(--text-primary)' }">{{ s.val }}</div>
                  <div class="text-[10px] text-dim uppercase tracking-wider">{{ s.label }}</div>
                </div>
              </div>
              <!-- All routes summary overlay -->
              <div
                v-else-if="showingAllRoutes && tripPositions?.length"
                class="absolute bottom-3 left-3 right-3 z-[1000] glass-strong rounded-xl px-3 py-2 flex items-center gap-4"
              >
                <div class="text-center">
                  <div class="text-[16px] font-bold" style="color:var(--text-primary)">{{ tripPositions.length }}</div>
                  <div class="text-[10px] text-dim uppercase tracking-wider">Points</div>
                </div>
                <div class="text-center">
                  <div class="text-[16px] font-bold" style="color:var(--text-primary)">{{ tripStats.count }}</div>
                  <div class="text-[10px] text-dim uppercase tracking-wider">Trips</div>
                </div>
                <div class="text-center">
                  <div class="text-[16px] font-bold" style="color:var(--text-primary)">{{ tripStats.dist }} km</div>
                  <div class="text-[10px] text-dim uppercase tracking-wider">Total</div>
                </div>
                <div class="text-center">
                  <div class="text-[16px] font-bold" style="color:var(--text-primary)">{{ period }}</div>
                  <div class="text-[10px] text-dim uppercase tracking-wider">Period</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══════ COSTS FORECAST TAB ═══════ -->
      <div v-else-if="tab === 'costs'" key="costs">
        <CostForecast
          :trips="validTrips"
          :forecast="vehicleForecast"
          :period="period"
          :vehicle-name="vehicle.Name || vehicle.Code"
          :eco-events="ecoEvents || []"
          :anomalies="vehicleAnoms"
          :utilization="vehicleUtilization"
        />
      </div>

      <!-- ═══════ SENSORS HEALTH DASHBOARD ═══════ -->
      <div v-else-if="tab === 'sensors'" key="sensors">
        <!-- Loading -->
        <div v-if="sensorLoading" class="flex flex-col items-center justify-center py-16">
          <div class="loading-spinner mb-3"></div>
          <div class="text-[16px] text-dim">Loading sensor data...</div>
        </div>

        <!-- No data -->
        <div v-else-if="!sensorGroups.length" class="text-center py-16">
          <div class="text-4xl mb-2">📊</div>
          <div class="text-[16px] text-dim">No sensor data available for this vehicle</div>
          <button @click="loadAllSensors" class="lumi-btn mt-4">Retry</button>
        </div>

        <!-- Sensor dashboard -->
        <div v-else>

          <!-- ── DATA HEALTH bar ── -->
          <div v-if="sensorQuality" class="lumi-card p-4 mb-5">
            <div class="flex items-center gap-3 mb-2">
              <span class="text-[14px] font-display font-semibold uppercase tracking-wider" style="color:var(--text-primary)">Data Health</span>
              <span v-if="sensorAlerts.length" class="text-[11px] px-1.5 py-0.5 rounded font-mono" style="background:rgba(255,180,80,0.1); color:var(--status-moving)">{{ sensorAlerts.length }} alert{{ sensorAlerts.length !== 1 ? 's' : '' }}</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
              <div>
                <div class="text-[12px] text-dim mb-1">Coverage</div>
                <div class="flex items-baseline gap-1">
                  <span class="text-[28px] font-mono font-bold leading-none" :style="{ color: sensorQuality.coverage >= 80 ? 'var(--status-live)' : sensorQuality.coverage >= 50 ? 'var(--status-moving)' : 'var(--status-danger)' }">{{ sensorQuality.coverage }}</span>
                  <span class="text-[13px] text-dim">%</span>
                </div>
                <!-- Progress bar -->
                <div class="h-1.5 rounded-full mt-1.5 overflow-hidden" style="background:var(--surface-raised)">
                  <div class="h-full rounded-full transition-all" :style="{ width: sensorQuality.coverage + '%', background: sensorQuality.coverage >= 80 ? 'var(--status-live)' : sensorQuality.coverage >= 50 ? 'var(--status-moving)' : 'var(--status-danger)', opacity: 0.6 }"></div>
                </div>
              </div>
              <div>
                <div class="text-[12px] text-dim mb-1">Missing</div>
                <div class="flex items-baseline gap-1">
                  <span class="text-[28px] font-mono font-bold leading-none" :style="{ color: sensorQuality.missing > 10 ? 'var(--status-moving)' : 'var(--text-secondary)' }">{{ sensorQuality.missing }}</span>
                  <span class="text-[13px] text-dim">/ {{ sensorQuality.totalRequested }}</span>
                </div>
              </div>
              <div>
                <div class="text-[12px] text-dim mb-1">Outliers</div>
                <div class="flex items-baseline gap-1">
                  <span class="text-[28px] font-mono font-bold leading-none" :style="{ color: sensorQuality.outliers > 100 ? 'var(--status-moving)' : 'var(--text-secondary)' }">{{ sensorQuality.outliers }}</span>
                  <span class="text-[13px] text-dim">filtered</span>
                </div>
              </div>
              <div>
                <div class="text-[12px] text-dim mb-1">Samples</div>
                <div class="flex items-baseline gap-1">
                  <span class="text-[28px] font-mono font-bold leading-none" style="color:var(--text-secondary)">{{ sensorQuality.totalSamples >= 1000 ? (sensorQuality.totalSamples / 1000).toFixed(1) + 'k' : sensorQuality.totalSamples }}</span>
                  <span class="text-[13px] text-dim">24h</span>
                </div>
              </div>
            </div>
            <!-- Sensor alerts -->
            <div v-if="sensorAlerts.length" class="flex gap-2 flex-wrap">
              <span
                v-for="(a, ai) in sensorAlerts.slice(0, 8)" :key="ai"
                class="text-[11px] px-2 py-1 rounded font-mono flex items-center gap-1"
                :style="{ background: a.type === 'critical' ? 'rgba(255,80,80,0.08)' : 'rgba(255,180,80,0.06)', color: a.color, border: '1px solid ' + a.color + '22' }"
              >⚠ {{ a.sensor }}: {{ a.label }}</span>
            </div>
          </div>

          <!-- ── Health Strip (key sensors) ── -->
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-5">
            <div
              v-for="h in healthStrip"
              :key="h.name"
              class="lumi-card p-3 relative overflow-hidden"
              :title="h.hasData ? `${h.meta?.label}: ${h.val != null ? h.val.toFixed(1) : '—'} ${h.meta?.unit || ''} — ${h.health.label}${h.health.msg ? ' (' + h.health.msg + ')' : ''}` : `${h.meta?.label}: No data available`"
            >
              <div class="absolute top-0 left-0 right-0 h-[3px]" :style="{ background: h.health.color, opacity: h.health.status === 'nodata' ? 0.3 : 0.7 }"></div>
              <div class="text-[11px] text-dim truncate mb-1">{{ h.meta?.label || h.name }}</div>
              <div class="text-[28px] font-mono font-bold leading-none" :style="{ color: h.hasData ? (h.meta?.color || 'var(--text-secondary)') : 'var(--text-muted)' }">
                {{ h.val != null ? (Math.abs(h.val) >= 100 ? Math.round(h.val) : h.val.toFixed(1)) : '—' }}
              </div>
              <div class="flex items-center justify-between mt-1">
                <span class="text-[12px] text-dim">{{ h.meta?.unit || '' }}</span>
                <span
                  class="text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider"
                  :style="{
                    background: h.health.status === 'ok' ? 'rgba(100,255,100,0.08)' : h.health.status === 'warn' ? 'rgba(255,200,100,0.1)' : h.health.status === 'critical' ? 'rgba(255,100,100,0.12)' : 'var(--surface-raised)',
                    color: h.health.color
                  }"
                >{{ h.health.label }}</span>
              </div>
            </div>
          </div>

          <!-- ── Systems: 2-column compact grid layout ── -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <template v-for="group in sensorGroups" :key="group.key">

              <!-- I/O group: binary chips + analog values (keep special) -->
              <div v-if="group.key === 'io'" class="lumi-card p-4">
                <div class="flex items-center gap-2 mb-3">
                  <span class="text-[14px]">{{ group.icon }}</span>
                  <span class="text-[15px] font-display font-semibold" style="color:var(--text-primary)">{{ group.label }}</span>
                  <span class="text-[11px] font-mono text-dim">{{ group.sensors.length }}</span>
                </div>
                <!-- Binary toggle chips -->
                <div class="flex gap-2 flex-wrap mb-3">
                  <div
                    v-for="s in group.sensors.filter(s => s.name.startsWith('BinaryInput'))"
                    :key="s.name"
                    class="px-3 py-1.5 rounded-lg flex items-center gap-2 text-[13px] font-mono"
                    :style="{
                      background: s.data?.length && s.data[s.data.length - 1]?.v ? 'rgba(100,255,100,0.08)' : 'var(--surface-raised)',
                      border: '1px solid ' + (s.data?.length && s.data[s.data.length - 1]?.v ? 'rgba(100,255,100,0.2)' : 'var(--border)'),
                      color: s.data?.length && s.data[s.data.length - 1]?.v ? 'var(--status-live)' : 'var(--text-dim)',
                    }"
                  >
                    <span class="w-2 h-2 rounded-full" :style="{ background: s.data?.length && s.data[s.data.length - 1]?.v ? 'var(--status-live)' : 'var(--text-muted)', boxShadow: s.data?.length && s.data[s.data.length - 1]?.v ? '0 0 6px var(--status-live)' : 'none' }"></span>
                    {{ SENSOR_META[s.name]?.label || s.name }}
                    <span class="text-[10px]">{{ s.data?.length ? (s.data[s.data.length - 1]?.v ? 'ON' : 'OFF') : 'N/A' }}</span>
                  </div>
                </div>
                <!-- Analog as compact values -->
                <div v-if="group.sensors.some(s => s.name.startsWith('AnalogInput'))" class="grid grid-cols-3 gap-2">
                  <div
                    v-for="s in group.sensors.filter(s => s.name.startsWith('AnalogInput'))"
                    :key="s.name"
                    class="p-2 rounded-lg text-center"
                    style="background:var(--surface-hover); border:1px solid var(--border)"
                  >
                    <div class="text-[11px] text-dim mb-0.5">{{ SENSOR_META[s.name]?.label || s.name }}</div>
                    <div class="text-[22px] font-mono font-bold leading-none" :style="{ color: SENSOR_META[s.name]?.color || 'var(--text-secondary)' }">
                      {{ s.data?.length ? (typeof s.data[s.data.length - 1]?.v === 'number' ? s.data[s.data.length - 1].v.toFixed(1) : s.data[s.data.length - 1]?.v) : '—' }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Environment group: zone matrix -->
              <div v-else-if="group.key === 'environment'" class="lumi-card p-4">
                <div class="flex items-center gap-2 mb-3">
                  <span class="text-[14px]">{{ group.icon }}</span>
                  <span class="text-[15px] font-display font-semibold" style="color:var(--text-primary)">{{ group.label }}</span>
                  <span class="text-[11px] font-mono text-dim">{{ group.sensors.length }}</span>
                  <button @click="toggleGroup('environment')" class="text-[11px] px-1.5 py-0.5 rounded cursor-pointer ml-auto" style="background:var(--surface-hover); color:var(--text-dim)">{{ openGroups.environment ? 'Hide charts' : 'Show charts' }}</button>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <div v-for="z in envZones" :key="z.zone" class="p-3 rounded-lg" style="background:var(--surface-hover); border:1px solid var(--border)">
                    <div class="text-[11px] text-dim mb-1 font-semibold">Zone {{ z.zone }}</div>
                    <div v-if="z.temp != null" class="mb-1">
                      <span class="text-[28px] font-mono font-bold leading-none" style="color:rgba(255,180,180,0.8)">{{ z.temp }}</span>
                      <span class="text-[12px] text-dim ml-0.5">°C</span>
                    </div>
                    <div v-if="z.humidity != null">
                      <span class="text-[22px] font-mono font-bold leading-none" style="color:rgba(180,220,255,0.8)">{{ z.humidity }}</span>
                      <span class="text-[12px] text-dim ml-0.5">%</span>
                    </div>
                  </div>
                </div>
                <!-- Light sensor inline -->
                <div v-if="group.sensors.find(s => s.name === 'LightSensor')" class="mt-2 p-2 rounded-lg flex items-center gap-3" style="background:var(--surface-hover); border:1px solid var(--border)">
                  <span class="text-[11px] text-dim">Light</span>
                  <span class="text-[22px] font-mono font-bold leading-none" style="color:rgba(255,255,200,0.7)">
                    {{ (() => { const ls = group.sensors.find(s => s.name === 'LightSensor'); return ls?.data?.length ? (typeof ls.data[ls.data.length-1]?.v === 'number' ? ls.data[ls.data.length-1].v.toFixed(0) : ls.data[ls.data.length-1]?.v) : '—' })() }}
                  </span>
                  <span class="text-[12px] text-dim">lux</span>
                </div>
                <!-- Expandable charts -->
                <div v-if="openGroups.environment" class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 animate-rise" style="animation-duration:200ms">
                  <template v-for="z in envZones" :key="'tc'+z.zone">
                    <SensorChart v-if="z.tempData.length" :data="z.tempData" :name="`Temp ${z.zone}`" units="°C" :color="SENSOR_META[`Temperature${z.zone}`]?.color || 'rgba(255,180,180,0.7)'" :height="80" />
                  </template>
                  <template v-for="z in envZones" :key="'hc'+z.zone">
                    <SensorChart v-if="z.humData.length" :data="z.humData" :name="`Hum ${z.zone}`" units="%" :color="SENSOR_META[`Humidity${z.zone}`]?.color || 'rgba(180,220,255,0.7)'" :height="80" />
                  </template>
                </div>
              </div>

              <!-- Standard groups: compact metric grid -->
              <div v-else class="lumi-card p-4">
                <div class="flex items-center gap-2 mb-3">
                  <span class="text-[14px]">{{ group.icon }}</span>
                  <span class="text-[15px] font-display font-semibold" style="color:var(--text-primary)">{{ group.label }}</span>
                  <span class="text-[11px] font-mono text-dim">{{ group.sensors.length }}</span>
                  <button @click="toggleGroup(group.key)" class="text-[11px] px-1.5 py-0.5 rounded cursor-pointer ml-auto" style="background:var(--surface-hover); color:var(--text-dim)">{{ openGroups[group.key] ? 'Hide charts' : 'Show charts' }}</button>
                </div>
                <!-- Compact metric cards grid -->
                <div :class="group.sensors.length <= 3 ? 'grid grid-cols-3 gap-2.5' : 'grid grid-cols-2 md:grid-cols-3 gap-2.5'">
                  <div
                    v-for="s in group.sensors" :key="s.name"
                    class="p-2.5 rounded-lg"
                    style="background:var(--surface-hover); border:1px solid var(--border)"
                    :title="`${SENSOR_META[s.name]?.label}: ${sensorStatus(s.name, s.data?.length ? s.data[s.data.length - 1]?.v : null).label}`"
                  >
                    <div class="flex items-center gap-1.5 mb-1">
                      <span class="w-1.5 h-1.5 rounded-full" :style="{ background: sensorStatus(s.name, s.data?.length ? s.data[s.data.length - 1]?.v : null).color }"></span>
                      <span class="text-[11px] text-dim truncate">{{ SENSOR_META[s.name]?.label || s.name }}</span>
                    </div>
                    <div class="text-[30px] font-mono font-bold leading-none" :style="{ color: SENSOR_META[s.name]?.color || 'var(--text-secondary)' }">
                      {{ s.data?.length ? (typeof s.data[s.data.length - 1]?.v === 'number' ? (Math.abs(s.data[s.data.length - 1].v) >= 100 ? Math.round(s.data[s.data.length - 1].v) : s.data[s.data.length - 1].v.toFixed(1)) : s.data[s.data.length - 1]?.v ?? '—') : '—' }}
                    </div>
                    <div class="text-[12px] text-dim mt-0.5">{{ SENSOR_META[s.name]?.unit || '' }}</div>
                  </div>
                </div>
                <!-- Expandable charts -->
                <div v-if="openGroups[group.key]" class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 animate-rise" style="animation-duration:200ms">
                  <SensorChart
                    v-for="s in group.sensors" :key="'ch'+s.name"
                    :data="s.data"
                    :name="SENSOR_META[s.name]?.label || s.name"
                    :units="SENSOR_META[s.name]?.unit || (s.units === 'int' ? '' : s.units)"
                    :color="SENSOR_META[s.name]?.color || 'var(--text-secondary)'"
                    :height="80"
                  />
                </div>
              </div>
            </template>
          </div>

          <!-- ── Raw / Advanced Feed ── -->
          <div class="mb-5">
            <button
              @click="showRawFeed = !showRawFeed"
              class="flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-150 cursor-pointer text-[14px]"
              :style="{ background: showRawFeed ? 'var(--surface-hover)' : 'transparent', border: '1px solid ' + (showRawFeed ? 'var(--border)' : 'transparent') }"
            >
              <span class="transition-transform duration-200" :style="{ transform: showRawFeed ? 'rotate(90deg)' : '' }">▸</span>
              <span class="font-display font-semibold" style="color:var(--text-primary)">Raw Feed</span>
              <span class="text-[12px] font-mono text-dim ml-1">{{ rawSensorFeed.length.toLocaleString() }} readings</span>
              <button v-if="showRawFeed" @click.stop="exportSensorsCsv" class="lumi-btn text-[12px] ml-auto">Export CSV</button>
            </button>

            <div v-if="showRawFeed" class="lumi-card mt-1 overflow-hidden animate-rise" style="animation-duration:200ms">
              <div class="flex items-center justify-between px-4 py-2" style="border-bottom:1px solid var(--border)">
                <span class="text-[13px] text-dim">Latest {{ Math.min(rawSensorFeed.length, 200) }} of {{ rawSensorFeed.length.toLocaleString() }} readings</span>
                <button @click="exportSensorsCsv" class="lumi-btn text-[12px]">Export CSV</button>
              </div>
              <div class="overflow-auto" style="max-height:400px">
                <table class="w-full text-[12px] font-mono">
                  <thead>
                    <tr style="background:var(--surface-raised)">
                      <th class="text-left px-3 py-2 text-dim font-semibold">Sensor</th>
                      <th class="text-left px-3 py-2 text-dim font-semibold">Time</th>
                      <th class="text-right px-3 py-2 text-dim font-semibold">Value</th>
                      <th class="text-left px-3 py-2 text-dim font-semibold">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(r, ri) in rawSensorFeed.slice(0, 200)"
                      :key="ri"
                      class="border-b"
                      :style="{ borderColor: 'var(--border)' }"
                    >
                      <td class="px-3 py-1.5" style="color:var(--text-secondary)">{{ r.sensor }}</td>
                      <td class="px-3 py-1.5 text-dim">{{ r.time ? new Date(r.time).toLocaleTimeString() : '—' }}</td>
                      <td class="px-3 py-1.5 text-right" style="color:var(--text-primary)">{{ typeof r.value === 'number' ? r.value.toFixed(2) : r.value }}</td>
                      <td class="px-3 py-1.5 text-dim">{{ r.unit }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ═══════ ECO DRIVING DASHBOARD ═══════ -->
      <div v-else-if="tab === 'eco'" key="eco">
        <div v-if="!ecoEvents?.length" class="text-center py-16">
          <div class="text-4xl mb-2">🌿</div>
          <div class="text-[16px] text-dim">No eco driving events in this period</div>
        </div>

        <div v-else-if="ecoAnalysis">

          <!-- Eco Methodology Panel (toggle) -->
          <div v-if="showEcoMethodology" class="lumi-card p-5 mb-5 animate-rise">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[15px] font-display font-bold" style="color:var(--text-primary)">{{ ECO_METHODOLOGY.title }}</span>
              <button @click="showEcoMethodology = false" class="lumi-btn-icon text-[14px]">×</button>
            </div>
            <p class="text-[13px] text-dim mb-2">{{ ECO_METHODOLOGY.description }}</p>
            <div class="text-[13px] font-mono mb-3 px-3 py-2 rounded" style="background:var(--surface-raised); color:var(--text-secondary)">{{ ECO_METHODOLOGY.formula }}</div>
            <div class="space-y-2 mb-3">
              <div v-for="f in ECO_METHODOLOGY.factors" :key="f.name" class="flex items-start gap-2 text-[13px]">
                <span class="font-mono font-bold flex-shrink-0" style="color:var(--text-secondary); min-width:100px">{{ f.weight }}</span>
                <div>
                  <span class="font-semibold" style="color:var(--text-primary)">{{ f.name }}</span>
                  <span class="text-dim"> — {{ f.detail }}</span>
                </div>
              </div>
            </div>
            <p class="text-[12px] text-dim mb-3">{{ ECO_METHODOLOGY.note }}</p>
            <div class="flex gap-2 text-[12px] font-mono mb-3">
              <span v-for="(range, g) in ECO_METHODOLOGY.grades" :key="g"
                class="px-2 py-0.5 rounded"
                :style="{ background: g === 'Excellent' ? 'rgba(200,255,200,0.1)' : g === 'Good' ? 'rgba(200,255,200,0.06)' : g === 'Poor' ? 'rgba(255,100,100,0.1)' : 'var(--surface-raised)', color: g === 'Excellent' ? 'var(--status-live)' : g === 'Poor' ? 'var(--status-danger)' : 'var(--text-dim)' }"
              >{{ g }}: {{ range }}</span>
            </div>
            <div class="text-[12px] p-3 rounded" style="background:rgba(200,200,255,0.06); border:1px solid rgba(200,200,255,0.1); color:var(--text-dim)">
              <span class="font-semibold" style="color:var(--text-secondary)">Driving Behavior vs Fleet Efficiency:</span> {{ ECO_METHODOLOGY.vs_efficiency }}
            </div>
          </div>

          <!-- ── 1. SUMMARY: Is this driver safe? ── -->
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
            <!-- Driving Behavior Score (big) -->
            <div class="lumi-card p-6 lg:col-span-2 flex flex-col items-center justify-center">
              <div class="flex items-center gap-1.5 mb-2">
                <span class="text-[14px] text-dim uppercase tracking-wider">Driving Behavior</span>
                <button @click="showEcoMethodology = !showEcoMethodology" class="text-[11px] px-1.5 py-0.5 rounded cursor-pointer" style="background:var(--surface-hover); color:var(--text-dim)" title="How is this calculated?">?</button>
              </div>
              <div
                class="text-[52px] font-display font-bold leading-none"
                :style="{ color: ecoScoreColor, textShadow: `0 0 30px ${ecoScoreColor}44` }"
              >{{ ecoAnalysis.score }}</div>
              <div class="text-[15px] mt-1 font-semibold" :style="{ color: ecoScoreColor }">{{ ecoAnalysis.grade }}</div>
              <!-- Key context metrics -->
              <div class="flex items-center gap-3 mt-3 text-[12px] font-mono">
                <span class="px-2 py-0.5 rounded" style="background:var(--surface-raised); color:var(--text-secondary)">{{ ecoAnalysis.per100km }}/100km</span>
                <span class="px-2 py-0.5 rounded" style="background:var(--surface-raised); color:var(--text-secondary)">{{ ecoAnalysis.perTrip }}/trip</span>
              </div>
              <div class="text-[11px] text-dim mt-2">{{ ecoAnalysis.tripCount }} trips · {{ ecoAnalysis.totalKm.toFixed(0) }} km</div>
            </div>

            <!-- Events summary with rates -->
            <div class="lumi-card p-5">
              <div class="text-[13px] text-dim uppercase tracking-wider mb-3 font-semibold">Events</div>
              <div class="text-[28px] font-display font-bold text-lumi leading-none mb-1">{{ ecoAnalysis.total }}</div>
              <div class="text-[12px] font-mono mb-3" style="color:var(--text-secondary)">{{ ecoAnalysis.per100km }} per 100 km · {{ ecoAnalysis.perTrip }} per trip</div>
              <div class="space-y-1.5">
                <div class="flex items-center gap-2 text-[13px]">
                  <span class="w-2 h-2 rounded-full" style="background:#ffaaaa"></span>
                  <span class="text-dim flex-1">High</span>
                  <span class="font-mono font-semibold" style="color:#ffaaaa">{{ ecoAnalysis.highSeverity }}</span>
                  <span class="text-[11px] font-mono text-dim">{{ ecoAnalysis.highPct }}%</span>
                </div>
                <div class="flex items-center gap-2 text-[13px]">
                  <span class="w-2 h-2 rounded-full" style="background:#ffd88c"></span>
                  <span class="text-dim flex-1">Medium</span>
                  <span class="font-mono font-semibold" style="color:#ffd88c">{{ ecoAnalysis.medSeverity }}</span>
                  <span class="text-[11px] font-mono text-dim">{{ ecoAnalysis.medPct }}%</span>
                </div>
                <div class="flex items-center gap-2 text-[13px]">
                  <span class="w-2 h-2 rounded-full" style="background:#fff5cc"></span>
                  <span class="text-dim flex-1">Low</span>
                  <span class="font-mono font-semibold" style="color:#fff5cc">{{ ecoAnalysis.lowSeverity }}</span>
                  <span class="text-[11px] font-mono text-dim">{{ ecoAnalysis.lowPct }}%</span>
                </div>
              </div>
            </div>

            <!-- Risk & Speed -->
            <div class="lumi-card p-5 lg:col-span-2">
              <div class="text-[13px] text-dim uppercase tracking-wider mb-3 font-semibold">Risk Profile</div>
              <div class="flex items-center gap-4 mb-3">
                <div v-if="riskIndex.score > 0" class="text-center">
                  <div class="text-[26px] font-display font-bold leading-none" :style="{ color: riskIndex.level === 'high' ? 'var(--status-danger)' : riskIndex.level === 'medium' ? 'var(--status-moving)' : 'var(--status-live)' }">{{ riskIndex.score }}</div>
                  <div class="text-[10px] text-dim uppercase mt-0.5">Risk Index</div>
                </div>
                <div class="text-center">
                  <div class="text-[26px] font-display font-bold leading-none" :style="{ color: ecoAnalysis.speedingPct > 10 ? 'var(--status-danger)' : 'var(--text-secondary)' }">{{ ecoAnalysis.speedingPct }}%</div>
                  <div class="text-[10px] text-dim uppercase mt-0.5">Trips >130</div>
                </div>
                <div class="text-center">
                  <div class="text-[26px] font-display font-bold leading-none" :style="{ color: ecoAnalysis.highPct > 30 ? 'var(--status-danger)' : ecoAnalysis.highPct > 15 ? 'var(--status-moving)' : 'var(--text-secondary)' }">{{ ecoAnalysis.highPct }}%</div>
                  <div class="text-[10px] text-dim uppercase mt-0.5">High severity</div>
                </div>
              </div>
              <!-- Severity bar with percentages -->
              <div class="flex gap-0.5 h-5 rounded overflow-hidden mb-2" style="background:var(--surface-raised)">
                <div
                  v-if="ecoAnalysis.highPct"
                  class="h-full flex items-center justify-center text-[10px] font-mono font-semibold"
                  :style="{ width: ecoAnalysis.highPct + '%', background: 'rgba(255,100,100,0.3)', color: '#ffaaaa' }"
                >{{ ecoAnalysis.highPct }}%</div>
                <div
                  v-if="ecoAnalysis.medPct"
                  class="h-full flex items-center justify-center text-[10px] font-mono font-semibold"
                  :style="{ width: ecoAnalysis.medPct + '%', background: 'rgba(255,180,80,0.25)', color: '#ffd88c' }"
                >{{ ecoAnalysis.medPct }}%</div>
                <div
                  v-if="ecoAnalysis.lowPct"
                  class="h-full flex items-center justify-center text-[10px] font-mono font-semibold"
                  :style="{ width: ecoAnalysis.lowPct + '%', background: 'rgba(255,230,100,0.15)', color: '#fff5cc' }"
                >{{ ecoAnalysis.lowPct }}%</div>
              </div>
              <div class="flex gap-3 text-[10px] text-dim">
                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:#ffaaaa"></span> High</span>
                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:#ffd88c"></span> Med</span>
                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full" style="background:#fff5cc"></span> Low</span>
              </div>
            </div>
          </div>

          <!-- ── 2. WHY: Top Problem Behaviors ── -->
          <div v-if="ecoAnalysis.problemBehaviors.length" class="lumi-card p-5 mb-5">
            <div class="text-[16px] font-display font-semibold text-lumi mb-4">Top Problem Behaviors</div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div
                v-for="(pb, pbi) in ecoAnalysis.problemBehaviors"
                :key="pb.name"
                class="p-4 rounded-lg relative overflow-hidden"
                :style="{ background: pbi === 0 ? 'rgba(255,80,80,0.05)' : 'var(--surface-hover)', border: '1px solid ' + (pbi === 0 ? 'rgba(255,80,80,0.15)' : 'var(--border)') }"
              >
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded" :style="{ background: pbi === 0 ? 'rgba(255,80,80,0.12)' : 'var(--surface-raised)', color: pbi === 0 ? 'var(--status-danger)' : 'var(--text-dim)' }">#{{ pbi + 1 }}</span>
                  <span class="text-[16px] font-semibold" :style="{ color: ecoColor(pb.name) }">{{ pb.name }}</span>
                </div>
                <div class="text-[24px] font-display font-bold leading-none mb-1" style="color:var(--text-primary)">{{ pb.total }}</div>
                <div class="text-[12px] font-mono mb-2" style="color:var(--text-secondary)">{{ pb.per100km }}/100km · {{ pb.perTrip }}/trip</div>
                <div class="space-y-1">
                  <div class="flex items-center justify-between text-[12px]">
                    <span class="text-dim">Score impact</span>
                    <span class="font-mono font-semibold" style="color:var(--status-danger)">-{{ pb.scoreImpact }} pts</span>
                  </div>
                  <div class="flex items-center justify-between text-[12px]">
                    <span class="text-dim">Est. cost impact</span>
                    <span class="font-mono" style="color:var(--status-moving)">+{{ pb.costImpact }} CZK/mo</span>
                  </div>
                  <div class="flex items-center justify-between text-[12px]">
                    <span class="text-dim">Risk weight</span>
                    <span class="font-mono" :style="{ color: pb.riskWeight === 'High' ? 'var(--status-danger)' : pb.riskWeight === 'Medium' ? 'var(--status-moving)' : 'var(--text-dim)' }">{{ pb.riskWeight }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── 3. HOW SERIOUS: Event Breakdown with Analytics ── -->
          <div class="lumi-card p-5 mb-5">
            <div class="text-[16px] font-display font-semibold text-lumi mb-4">Event Breakdown</div>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <div
                v-for="item in ecoAnalysis.byType"
                :key="item.name"
                class="rounded-lg p-4"
                style="background:var(--surface-hover); border:1px solid var(--border)"
              >
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[15px] font-semibold" :style="{ color: ecoColor(item.name) }">{{ item.name }}</span>
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded font-mono"
                    :style="{ background: item.riskWeight === 'High' ? 'rgba(255,80,80,0.1)' : item.riskWeight === 'Medium' ? 'rgba(255,180,80,0.1)' : 'var(--surface-raised)', color: item.riskWeight === 'High' ? 'var(--status-danger)' : item.riskWeight === 'Medium' ? 'var(--status-moving)' : 'var(--text-dim)' }"
                  >{{ item.riskWeight }}</span>
                </div>
                <div class="text-[24px] font-display font-bold leading-none mb-1" style="color:var(--text-primary)">{{ item.total }}</div>
                <div class="text-[12px] font-mono mb-2" style="color:var(--text-secondary)">{{ item.per100km }} per 100 km</div>
                <div class="flex gap-1.5 text-[11px] flex-wrap mb-2">
                  <span v-if="item.high" class="px-1.5 py-0.5 rounded" style="background:rgba(255,80,80,0.1); color:#ffaaaa">{{ item.high }} high</span>
                  <span v-if="item.med" class="px-1.5 py-0.5 rounded" style="background:rgba(255,180,80,0.1); color:#ffd88c">{{ item.med }} med</span>
                  <span v-if="item.low" class="px-1.5 py-0.5 rounded" style="background:rgba(255,230,100,0.08); color:#fff5cc">{{ item.low }} low</span>
                </div>
                <div v-if="item.scoreImpact > 0" class="text-[11px] text-dim">
                  Impact: <span class="font-mono" style="color:var(--status-danger)">-{{ item.scoreImpact }} pts</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ── 4. WHAT TO FIX: AI Insights / Recommendations ── -->
          <div v-if="ecoAnalysis.insights.length" class="lumi-card p-5 mb-5">
            <div class="text-[16px] font-display font-semibold text-lumi mb-4">Recommendations</div>
            <div class="space-y-2.5">
              <div
                v-for="(ins, ii) in ecoAnalysis.insights"
                :key="ii"
                class="flex items-start gap-3 p-3 rounded-lg"
                :style="{ background: ins.priority === 'high' ? 'rgba(255,80,80,0.04)' : 'var(--surface-hover)', border: '1px solid ' + (ins.priority === 'high' ? 'rgba(255,80,80,0.1)' : 'var(--border)') }"
              >
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider mt-0.5 flex-shrink-0"
                  :style="{ background: ins.priority === 'high' ? 'rgba(255,80,80,0.12)' : 'rgba(255,180,80,0.1)', color: ins.priority === 'high' ? 'var(--status-danger)' : 'var(--status-moving)' }"
                >{{ ins.priority }}</span>
                <div class="flex-1">
                  <div class="text-[14px] font-semibold" style="color:var(--text-primary)">{{ ins.text }}</div>
                  <div class="text-[12px] text-dim mt-0.5">{{ ins.detail }}</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ═══════ CONTROLS ═══════ -->
      <div v-else-if="tab === 'controls'" key="controls">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Engine control -->
          <EngineControl
            :vehicle-code="code"
            :relay-state="relayState"
            @update="relayState = $event"
          />

          <!-- Fuel cards -->
          <div class="lumi-card p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-[16px] text-dim">◇</span>
              <span class="text-[16px] font-semibold" style="color:var(--text-primary)">Fuel Cards</span>
            </div>
            <div v-if="vehicle.RefuelingCards?.length" class="flex gap-2 flex-wrap">
              <span
                v-for="(c, i) in vehicle.RefuelingCards" :key="i"
                class="px-3 py-1.5 rounded text-[14px] font-mono"
                style="background:var(--surface-hover); border:1px solid var(--border)"
              >{{ c }}</span>
            </div>
            <div v-else class="text-[14px] text-dim">No fuel cards assigned</div>
          </div>

          <!-- Map (current position) -->
          <div class="lumi-card overflow-hidden lg:col-span-2" style="height:340px">
            <FleetMap
              :selected-vehicle="vehicle"
              height="100%"
            />
          </div>
        </div>
      </div>
    </Transition>
  </div>

  <!-- No vehicle fallback -->
  <div v-else class="flex-1 flex items-center justify-center text-dim">
    Vehicle not found.
    <button @click="router.push({ name: 'dashboard' })" class="lumi-btn ml-3">← Dashboard</button>
  </div>
</template>

<script>
// Helper for eco event type colors (used in template)
const ecoColorMap = {
  'Braking': 'rgba(255,170,170,0.9)',
  'Acceleration': 'rgba(255,200,140,0.9)',
  'Cornering': 'rgba(255,245,200,0.9)',
  'Corner L': 'rgba(255,245,200,0.8)',
  'Corner R': 'rgba(255,245,200,0.7)',
  'Bump': 'rgba(200,200,255,0.8)',
  'Long Clutch': 'rgba(200,255,200,0.7)',
  'Neutral': 'rgba(180,220,255,0.7)',
  'Freewheel': 'rgba(220,220,255,0.7)',
}

export default {
  methods: {
    ecoColor(name) {
      return ecoColorMap[name] || 'var(--text-secondary)'
    }
  }
}
</script>
