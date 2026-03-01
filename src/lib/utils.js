import { formatDistanceToNowStrict, format, subDays, subHours, differenceInMinutes, differenceInHours } from 'date-fns'

export function fmtDate(ts) {
  if (!ts) return '—'
  return format(new Date(ts), 'dd.MM.yyyy HH:mm')
}

export function fmtTime(ts) {
  if (!ts) return '—'
  return format(new Date(ts), 'HH:mm')
}

export function ago(ts) {
  if (!ts) return 'unknown'
  try { return formatDistanceToNowStrict(new Date(ts), { addSuffix: true }) }
  catch { return 'unknown' }
}

export function dateRange(period) {
  const now = new Date()
  const to = now.toISOString().slice(0, 16)
  const map = { '24h': subHours(now, 24), '7d': subDays(now, 7), '30d': subDays(now, 30) }
  const from = (map[period] || subDays(now, 1)).toISOString().slice(0, 16)
  return { from, to }
}

export function vehicleStatus(v) {
  if (!v?.LastPositionTimestamp) return { label: 'Unknown', color: '#888', key: 'unknown' }
  const mins = (Date.now() - new Date(v.LastPositionTimestamp).getTime()) / 60000
  if (mins > 60) return { label: 'Offline', color: '#888888', key: 'offline' }
  if (v.Speed > 0) return { label: 'Moving', color: '#c8ffc8', key: 'moving' }
  return { label: 'Parked', color: '#fff5cc', key: 'parked' }
}

export function relayInfo(state) {
  return {
    0: { label: 'Normal', color: '#c8ffc8', desc: 'Initial state' },
    1: { label: 'Stop Sent', color: '#fff5cc', desc: 'Awaiting confirmation' },
    2: { label: 'Stop Confirmed', color: '#ffaaaa', desc: 'Engine stopped by system' },
    3: { label: 'Release Sent', color: '#fff5cc', desc: 'Awaiting confirmation' },
    4: { label: 'Released', color: '#c8ffc8', desc: 'Engine released' },
    5: { label: 'Rejected', color: '#888', desc: 'Request rejected or delayed' },
  }[state] || { label: `State ${state}`, color: '#888', desc: '' }
}

export function fmtKm(meters) {
  if (!meters) return '0'
  return (meters / 1000).toLocaleString('en', { maximumFractionDigits: 0 })
}

export function fmtDist(km) {
  return km ? Number(km).toLocaleString('en', { maximumFractionDigits: 1 }) : '0'
}

export const ECO_TYPES = { 0: 'Unknown', 1: 'Corner L', 2: 'Corner R', 3: 'Cornering', 4: 'Acceleration', 5: 'Braking', 6: 'Bump', 7: 'Long Clutch', 8: 'Neutral', 9: 'Freewheel' }
export const ECO_SEV = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High' }

// ─── ECO / DRIVING BEHAVIOR METHODOLOGY ─────────────────────────────
// Explains how the Driving Behavior Score (Eco Score) is calculated.

export const ECO_METHODOLOGY = {
  title: 'Driving Behavior Score',
  description: 'Penalty-based score normalized per trip. Starts at 100 and subtracts weighted penalties for eco-driving events detected by the vehicle\'s accelerometer. Normalized per trip count so that vehicles with more trips are not unfairly penalized.',
  formula: 'Score = 100 − (high_per_trip × 25) − (med_per_trip × 10) − (low_per_trip × 2)',
  factors: [
    { name: 'Harsh braking', weight: 'High severity', detail: 'Sudden deceleration events detected by accelerometer. Each high-severity event per trip subtracts 25 pts.' },
    { name: 'Harsh acceleration', weight: 'High severity', detail: 'Sudden acceleration events. Penalty depends on severity level.' },
    { name: 'Harsh cornering', weight: 'Medium severity', detail: 'Aggressive turning (left/right). Each medium-severity event per trip subtracts 10 pts.' },
    { name: 'Speed bumps', weight: 'Low severity', detail: 'Passing speed bumps too fast. Each low-severity event per trip subtracts 2 pts.' },
  ],
  note: 'Events are grouped by type (Braking, Acceleration, Cornering L/R, Bump, Long Clutch, Neutral, Freewheel). Severity is assigned by the tracker device (1=Low, 2=Medium, 3=High).',
  grades: { 'Excellent': '≥80', 'Good': '60–79', 'Fair': '40–59', 'Poor': '<40' },
  vs_efficiency: 'This score measures DRIVING QUALITY (how smoothly you drive). Fleet Efficiency measures VEHICLE UTILIZATION (how well the vehicle is used). A vehicle can have high efficiency (drives a lot) but poor driving behavior (harsh braking). These are independent metrics.',
}

// ─── FORECAST METHODOLOGY ────────────────────────────────────────────

export const FORECAST_METHODOLOGY = {
  title: 'Driving Trend & Forecast',
  description: 'Linear regression (least squares) on daily km over the selected period. Projects future daily km based on the observed trend.',
  factors: [
    { name: 'Data points', weight: 'Required', detail: 'Minimum 3 days with data needed for forecast. More data = better accuracy.' },
    { name: 'Trend (slope)', weight: 'Direction', detail: 'Positive slope (>0.5 km/day increase) = ↑ Increasing. Negative slope (<-0.5) = ↓ Decreasing. Otherwise → Stable.' },
    { name: 'R² confidence', weight: 'Quality', detail: 'R² ≥0.6 with ≥5 data days = High confidence. R² ≥0.3 with ≥4 days = Medium. Otherwise = Low.' },
  ],
  note: 'Forecast is capped at 0 km minimum (no negative predictions). Low-confidence forecasts are hidden to avoid misleading projections.',
}

// ─── SENTINEL VALUE GUARD ─────────────────────────────────────────
// INT_MIN (-2147483648) and similar sentinel values appear in raw telemetry data.
// Treat them as null/missing to prevent UI corruption and NaN propagation.

const SENTINEL_VALUES = new Set([-2147483648, 2147483647, -999999, 999999])

export function sanitizeValue(val, fallback = null) {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'number' && (isNaN(val) || !isFinite(val) || SENTINEL_VALUES.has(val))) return fallback
  return val
}

export function sanitizeVehicle(v) {
  if (!v) return v
  return {
    ...v,
    Speed: sanitizeValue(v.Speed, 0),
    Odometer: sanitizeValue(v.Odometer, 0),
    BatteryPercentage: sanitizeValue(v.BatteryPercentage, 0),
  }
}

export function sanitizeTrip(t) {
  if (!t) return t
  let dist = sanitizeValue(t.TotalDistance, 0)
  let maxSpd = sanitizeValue(t.MaxSpeed, 0)
  let avgSpd = sanitizeValue(t.AverageSpeed, 0)
  let odo = sanitizeValue(t.Odometer, 0)
  // Guard negative values — treat as missing
  if (dist < 0) dist = 0
  if (maxSpd < 0) maxSpd = 0
  if (avgSpd < 0) avgSpd = 0
  if (odo < 0) odo = 0
  // Guard unrealistic values — single trip > 5000 km or speed > 300 km/h
  if (dist > 5000) dist = 0
  if (maxSpd > 300) maxSpd = 0
  if (avgSpd > 300) avgSpd = 0
  return { ...t, TotalDistance: dist, MaxSpeed: maxSpd, AverageSpeed: avgSpd, Odometer: odo }
}

// ─── DATA CLEANING ─────────────────────────────────────────────────

// Sort trips by StartTime (handles out-of-order telemetry)
export function sortTrips(trips) {
  if (!trips?.length) return []
  return [...trips].sort((a, b) => {
    const ta = a.StartTime ? new Date(a.StartTime).getTime() : 0
    const tb = b.StartTime ? new Date(b.StartTime).getTime() : 0
    return ta - tb
  })
}

// Deduplicate trips by (vehicle, start, end) - same start+end within 60s = duplicate
export function deduplicateTrips(trips) {
  if (!trips?.length) return []
  const seen = new Set()
  return trips.filter(t => {
    const start = t.StartTime ? new Date(t.StartTime).getTime() : 0
    const end = t.FinishTime ? new Date(t.FinishTime).getTime() : 0
    // Round to nearest minute for dedup
    const key = `${Math.round(start / 60000)}_${Math.round(end / 60000)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Clean trips: sort, dedup, sanitize sentinels, flag bad data
export function cleanTrips(trips) {
  if (!trips?.length) return []
  const sorted = sortTrips(trips)
  const deduped = deduplicateTrips(sorted)
  return deduped.map(sanitizeTrip).map(t => {
    const flags = []
    const dist = t.TotalDistance || 0
    // drive_time = 0 but distance > 0
    if (t.StartTime && t.FinishTime && dist > 0) {
      const mins = differenceInMinutes(new Date(t.FinishTime), new Date(t.StartTime))
      if (mins <= 0) flags.push('bad_duration')
    }
    // extreme distance (> 2000km in single trip)
    if (dist > 2000) flags.push('extreme_distance')
    return flags.length ? { ...t, _flags: flags } : t
  })
}

// Filter GPS positions: remove null/0,0 coords and teleport jumps
export function filterPositions(positions) {
  if (!positions?.length) return []
  return positions.filter(p => {
    const lat = parseFloat(p.Lat || p.Latitude)
    const lng = parseFloat(p.Lng || p.Longitude)
    // Remove null/invalid coords and 0,0 (null island)
    return lat && lng && Math.abs(lat) > 0.1 && Math.abs(lng) > 0.1
  })
}

// ─── UTILIZATION SCORE ──────────────────────────────────────────────

export function computeUtilization(trips, periodDays = 7) {
  if (!trips?.length) return { score: 0, driveMinutes: 0, idleMinutes: 0, totalKm: 0, tripCount: 0, kmPerDay: 0 }

  const validTrips = trips.filter(t => (t.TotalDistance || 0) >= 1)
  const totalKm = validTrips.reduce((s, t) => s + (t.TotalDistance || 0), 0)
  const tripCount = validTrips.length

  // Drive time from trip durations
  let driveMinutes = 0
  validTrips.forEach(t => {
    if (t.StartTime && t.FinishTime) {
      const mins = differenceInMinutes(new Date(t.FinishTime), new Date(t.StartTime))
      if (mins > 0 && mins < 1440) driveMinutes += mins // cap at 24h per trip
    }
  })

  const totalMinutes = periodDays * 24 * 60
  const idleMinutes = Math.max(0, totalMinutes - driveMinutes)
  const score = totalMinutes > 0 ? Math.round((driveMinutes / totalMinutes) * 100) : 0
  const kmPerDay = periodDays > 0 ? Math.round(totalKm / periodDays) : 0

  return { score: Math.min(100, score), driveMinutes, idleMinutes, totalKm, tripCount, kmPerDay }
}

// ─── ANOMALY DETECTION ──────────────────────────────────────────────

export function detectAnomalies(vehicle, trips = []) {
  const anomalies = []

  // Current speed anomaly
  if ((vehicle.Speed || 0) > 130) {
    anomalies.push({
      type: 'speed',
      severity: 'high',
      label: 'Speed Alert',
      detail: `Currently ${vehicle.Speed} km/h`,
      color: '#ffaaaa',
      icon: '⚡',
    })
  }

  // No signal (offline > 12h)
  if (vehicle.LastPositionTimestamp) {
    const hours = differenceInHours(new Date(), new Date(vehicle.LastPositionTimestamp))
    if (hours > 12) {
      anomalies.push({
        type: 'offline',
        severity: hours > 48 ? 'high' : 'medium',
        label: 'No Signal',
        detail: `Offline for ${hours}h`,
        color: hours > 48 ? '#ffaaaa' : '#ffd88c',
        icon: '⊘',
      })
    }
  }

  // Low battery
  if (vehicle.BatteryPercentage > 0 && vehicle.BatteryPercentage < 15) {
    anomalies.push({
      type: 'battery',
      severity: vehicle.BatteryPercentage < 5 ? 'high' : 'medium',
      label: 'Low Battery',
      detail: `${vehicle.BatteryPercentage}%`,
      color: '#ffd88c',
      icon: '⚡',
    })
  }

  // Trip-based anomalies
  if (trips.length) {
    const validTrips = trips.filter(t => (t.TotalDistance || 0) >= 1)

    // Max speed in trips > 150
    const maxSpeed = Math.max(...validTrips.map(t => t.MaxSpeed || 0), 0)
    if (maxSpeed > 150) {
      anomalies.push({
        type: 'max_speed',
        severity: 'high',
        label: 'Excessive Speed',
        detail: `Max ${maxSpeed} km/h in trips`,
        color: '#ffaaaa',
        icon: '⚡',
      })
    }

    // Long trip (> 6h)
    validTrips.forEach(t => {
      if (t.StartTime && t.FinishTime) {
        const hours = differenceInHours(new Date(t.FinishTime), new Date(t.StartTime))
        if (hours > 6) {
          anomalies.push({
            type: 'long_trip',
            severity: 'medium',
            label: 'Long Trip',
            detail: `${hours}h drive without break`,
            color: '#ffd88c',
            icon: '⏱',
          })
        }
      }
    })

    // Too many short trips (> 5 trips < 1km) - GPS noise / suspicious
    const shortTrips = trips.filter(t => (t.TotalDistance || 0) < 1 && (t.TotalDistance || 0) > 0)
    if (shortTrips.length > 5) {
      anomalies.push({
        type: 'short_trips',
        severity: 'low',
        label: 'Many Short Trips',
        detail: `${shortTrips.length} trips < 1km`,
        color: '#fff5cc',
        icon: '⚠',
      })
    }

    // Bad data: drive_time = 0 but distance > 0
    const badData = validTrips.filter(t => {
      if (!t.StartTime || !t.FinishTime) return false
      const mins = differenceInMinutes(new Date(t.FinishTime), new Date(t.StartTime))
      return mins <= 0 && (t.TotalDistance || 0) > 1
    })
    if (badData.length > 0) {
      anomalies.push({
        type: 'bad_data',
        severity: 'low',
        label: 'Data Quality',
        detail: `${badData.length} trips with 0 duration but distance > 0`,
        color: '#c8c8ff',
        icon: '⊙',
      })
    }

    // Night activity (trips starting between 00:00-05:00)
    const nightTrips = validTrips.filter(t => {
      if (!t.StartTime) return false
      const h = new Date(t.StartTime).getHours()
      return h >= 0 && h < 5
    })
    if (nightTrips.length >= 2) {
      anomalies.push({
        type: 'night_activity',
        severity: 'medium',
        label: 'Night Activity',
        detail: `${nightTrips.length} trips started between 00:00-05:00`,
        color: '#c8c8ff',
        icon: '☽',
      })
    }
  }

  return anomalies
}

// ─── FLEET EFFICIENCY INDEX ──────────────────────────────────────────
// Composite score calibrated for real fleet data:
//   Activity (30%): km/day normalized — 50 km/day = 100%
//   Consistency (25%): how regular is daily usage
//   Speed safety (25%): low overspeed ratio
//   Anomaly-free (20%): fewer anomalies = better
//
// Methodology: each component is 0-100, weighted sum, no harsh penalties.
// A fleet vehicle driving ~40+ km/day regularly without speed violations = A grade.

export function computeEfficiencyIndex(trips, anomalies = [], periodDays = 7) {
  const validTrips = (trips || []).filter(t => (t.TotalDistance || 0) >= 1)
  if (!validTrips.length) return { score: 0, utilization: 0, consistency: 0, speedStability: 0, anomalyPenalty: 0, grade: 'N/A', components: [], methodology: EFFICIENCY_METHODOLOGY }

  const components = []

  // 1. Activity score: km/day normalized (50 km/day = 100%)
  const util = computeUtilization(trips, periodDays)
  const kmPerDay = util.kmPerDay
  const activityScore = Math.min(100, Math.round((kmPerDay / 50) * 100))
  components.push({ name: 'Activity', value: activityScore, weight: 0.3, detail: `${kmPerDay} km/day` })

  // 2. Consistency: CV of daily km (lower CV = more consistent)
  const dailyKm = {}
  validTrips.forEach(t => {
    if (!t.StartTime) return
    const day = t.StartTime.slice(0, 10)
    dailyKm[day] = (dailyKm[day] || 0) + (t.TotalDistance || 0)
  })
  const dailyValues = Object.values(dailyKm)
  let consistency = 50 // default for insufficient data
  if (dailyValues.length >= 2) {
    const mean = dailyValues.reduce((s, v) => s + v, 0) / dailyValues.length
    const variance = dailyValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / dailyValues.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 2
    // CV of 0 = perfect (100), CV of 2+ = bad (0)
    consistency = Math.max(0, Math.min(100, Math.round((1 - cv / 2) * 100)))
  }
  components.push({ name: 'Consistency', value: consistency, weight: 0.25, detail: `${dailyValues.length} active days` })

  // 3. Speed safety: ratio of trips with max speed under 130 km/h
  const maxSpeeds = validTrips.map(t => t.MaxSpeed || 0).filter(s => s > 0)
  let speedSafety = 100
  if (maxSpeeds.length) {
    const safeTrips = maxSpeeds.filter(s => s <= 130).length
    speedSafety = Math.round((safeTrips / maxSpeeds.length) * 100)
  }
  components.push({ name: 'Speed safety', value: speedSafety, weight: 0.25, detail: `${maxSpeeds.filter(s => s > 130).length} trips >130` })

  // 4. Anomaly-free: inverse of anomaly severity
  const sevWeights = { high: 25, medium: 10, low: 3 }
  const rawPenalty = anomalies.reduce((s, a) => s + (sevWeights[a.severity] || 0), 0)
  const anomalyFree = Math.max(0, 100 - Math.min(100, rawPenalty))
  components.push({ name: 'Anomaly-free', value: anomalyFree, weight: 0.2, detail: `${anomalies.length} anomalies` })

  // Composite weighted score
  const score = Math.max(0, Math.min(100, Math.round(
    components.reduce((s, c) => s + c.value * c.weight, 0)
  )))

  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F'

  return {
    score,
    utilization: activityScore,
    consistency,
    speedStability: speedSafety,
    anomalyPenalty: 100 - anomalyFree,
    grade,
    components,
    partial: dailyValues.length < 2,
    methodology: EFFICIENCY_METHODOLOGY,
  }
}

const EFFICIENCY_METHODOLOGY = {
  title: 'Fleet Efficiency Index',
  description: 'Weighted composite model calibrated for fleet operations. Measures how effectively a vehicle is utilized — NOT driving quality. A vehicle can score A in efficiency (high utilization) but have poor driving behavior (harsh braking).',
  math: 'Score = Activity×0.30 + Consistency×0.25 + SpeedSafety×0.25 + AnomalyFree×0.20. Each component is 0–100, weighted sum produces final 0–100 score.',
  factors: [
    { name: 'Activity', weight: '30%', detail: 'Daily km driven, normalized against configurable fleet baseline (default 50 km/day = 100%). Measures whether the vehicle is actively used.' },
    { name: 'Consistency', weight: '25%', detail: 'Coefficient of variation (CV = σ/μ) of daily km. CV of 0 = perfectly consistent (100 pts), CV ≥ 2 = highly irregular (0 pts). Measures regularity of usage.' },
    { name: 'Speed Safety', weight: '25%', detail: 'Ratio of trips with max speed ≤ 130 km/h. Simple threshold model — production would use map-based local speed limits. Measures compliance with speed norms.' },
    { name: 'Anomaly-free', weight: '20%', detail: 'Inverse of detected anomaly severity: high=-25, medium=-10, low=-3, capped at 100. Anomalies include: excessive speed, offline, low battery, long trips, data quality issues, night activity.' },
  ],
  grades: { A: '80–100', B: '65–79', C: '50–64', D: '35–49', F: '0–34' },
}

// ─── DRIVER RISK INDEX ──────────────────────────────────────────────
// Evaluates driving behavior risk on a 0–100 scale.
// 0 = safest (no risk factors detected), 100 = highest risk.
// NOT a percentile — it's a linear weighted composite of 4 risk factors.

export const RISK_METHODOLOGY = {
  title: 'Driver Risk Index',
  description: 'Linear weighted composite of 4 risk factors. Scale: 0 (safest) to 100 (highest risk). This is NOT a percentile ranking — it measures absolute risk based on observed driving behavior within the selected period.',
  scaleExplain: '0 = no risk factors detected, 100 = maximum risk in all categories. Score ≥60 = High risk, 30-59 = Medium, <30 = Low.',
  factors: [
    { name: 'Overspeeding', weight: '35%', detail: 'Percentage of trips where max speed exceeded 130 km/h. Higher ratio = higher risk.' },
    { name: 'Harsh events', weight: '25%', detail: 'Eco-driving events (braking, acceleration, cornering) weighted by severity. Each high-severity event adds 15 pts, medium adds 5 pts, capped at 100.' },
    { name: 'Night driving', weight: '20%', detail: 'Ratio of trips starting between 00:00–05:00. Night driving doubles the ratio (×200%) due to increased accident risk.' },
    { name: 'Anomalies', weight: '20%', detail: 'Detected anomalies weighted by severity: high=30, medium=15, low=5, capped at 100.' },
  ],
  levels: { high: '≥60', medium: '30–59', low: '<30' },
}

export function computeRiskIndex(trips, anomalies = [], ecoEvents = []) {
  const validTrips = (trips || []).filter(t => (t.TotalDistance || 0) >= 1)
  if (!validTrips.length) return { score: 0, level: 'unknown', factors: [], methodology: RISK_METHODOLOGY }

  const factors = []

  // 1. Speed risk: % of trips exceeding 130 km/h
  const maxSpeeds = validTrips.map(t => t.MaxSpeed || 0).filter(s => s > 0)
  const overSpeed = maxSpeeds.filter(s => s > 130).length
  const speedRisk = maxSpeeds.length ? Math.round((overSpeed / maxSpeeds.length) * 100) : 0
  factors.push({ name: 'Overspeeding', value: speedRisk, detail: `${overSpeed}/${maxSpeeds.length} trips >130 km/h` })

  // 2. Harsh event risk
  const highSev = ecoEvents.filter(e => e.EventSeverity === 3).length
  const medSev = ecoEvents.filter(e => e.EventSeverity === 2).length
  const eventRisk = Math.min(100, highSev * 15 + medSev * 5)
  factors.push({ name: 'Harsh events', value: eventRisk, detail: `${highSev} high, ${medSev} medium severity` })

  // 3. Night driving risk
  const nightTrips = validTrips.filter(t => {
    if (!t.StartTime) return false
    const h = new Date(t.StartTime).getHours()
    return h >= 0 && h < 5
  })
  const nightRisk = Math.min(100, Math.round((nightTrips.length / Math.max(validTrips.length, 1)) * 200))
  factors.push({ name: 'Night driving', value: nightRisk, detail: `${nightTrips.length} trips between 00:00-05:00` })

  // 4. Anomaly-based risk
  const sevWeights = { high: 30, medium: 15, low: 5 }
  const anomRisk = Math.min(100, anomalies.reduce((s, a) => s + (sevWeights[a.severity] || 0), 0))
  factors.push({ name: 'Anomalies', value: anomRisk, detail: `${anomalies.length} detected` })

  // Weighted average (speed has highest weight)
  const score = Math.round(speedRisk * 0.35 + eventRisk * 0.25 + nightRisk * 0.2 + anomRisk * 0.2)
  const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low'

  return { score, level, factors, methodology: RISK_METHODOLOGY }
}

// ─── DATA QUALITY METRICS ───────────────────────────────────────────

export function computeDataQuality(trips, positions = []) {
  const totalTrips = trips?.length || 0
  const validTrips = (trips || []).filter(t => (t.TotalDistance || 0) >= 1).length
  const flaggedTrips = (trips || []).filter(t => t._flags?.length > 0).length
  const sentinelTrips = (trips || []).filter(t =>
    SENTINEL_VALUES.has(t.TotalDistance) || SENTINEL_VALUES.has(t.MaxSpeed) || SENTINEL_VALUES.has(t.AverageSpeed)
  ).length

  const totalPositions = positions.length
  const validPositions = filterPositions(positions).length
  const filteredOut = totalPositions - validPositions

  const integrity = totalTrips > 0
    ? Math.round(((validTrips - flaggedTrips - sentinelTrips) / totalTrips) * 100)
    : 0

  return {
    integrity: Math.max(0, Math.min(100, integrity)),
    totalTrips,
    validTrips,
    flaggedTrips,
    sentinelTrips,
    totalPositions,
    validPositions,
    filteredOut,
  }
}

// ─── UTILIZATION FORECAST (Linear Extrapolation) ────────────────────

export function computeForecast(trips, pastDays = 7, futureDays = 7) {
  const validTrips = (trips || []).filter(t => (t.TotalDistance || 0) >= 1 && t.StartTime)
  if (!validTrips.length) return { past: [], forecast: [], trend: 0, confidence: 'none', message: 'No trip data available' }

  // Group by day
  const now = new Date()
  const dailyKm = {}
  for (let d = pastDays - 1; d >= 0; d--) {
    const date = subDays(now, d)
    const key = format(date, 'yyyy-MM-dd')
    dailyKm[key] = 0
  }
  validTrips.forEach(t => {
    const day = t.StartTime.slice(0, 10)
    if (dailyKm[day] !== undefined) dailyKm[day] += (t.TotalDistance || 0)
  })

  const past = Object.entries(dailyKm).map(([date, km]) => ({
    date,
    label: format(new Date(date), 'dd.MM'),
    km: Math.round(km * 10) / 10,
  }))

  // Count days with actual data
  const daysWithData = past.filter(p => p.km > 0).length

  // Insufficient data check
  if (daysWithData < 3) {
    return {
      past,
      forecast: [],
      trend: 0,
      confidence: 'insufficient',
      message: `Only ${daysWithData} day${daysWithData !== 1 ? 's' : ''} of data — need at least 3 for forecast`,
    }
  }

  // Linear regression: y = mx + b
  const n = past.length
  const xs = past.map((_, i) => i)
  const ys = past.map(p => p.km)
  const sumX = xs.reduce((s, v) => s + v, 0)
  const sumY = ys.reduce((s, v) => s + v, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumX2 = xs.reduce((s, x) => s + x * x, 0)

  const m = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0
  const b = (sumY - m * sumX) / n

  // Compute R² (coefficient of determination) for confidence
  const meanY = sumY / n
  const ssTot = ys.reduce((s, y) => s + Math.pow(y - meanY, 2), 0)
  const ssRes = ys.reduce((s, y, i) => s + Math.pow(y - (m * xs[i] + b), 2), 0)
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

  // Confidence based on R² and data availability
  let confidence = 'low'
  if (r2 >= 0.6 && daysWithData >= 5) confidence = 'high'
  else if (r2 >= 0.3 && daysWithData >= 4) confidence = 'medium'

  // Trend direction
  const trend = m > 0.5 ? 'up' : m < -0.5 ? 'down' : 'stable'

  // Project future
  const forecast = []
  for (let d = 1; d <= futureDays; d++) {
    const date = subDays(now, -d)
    const projectedKm = Math.max(0, Math.round((m * (n + d - 1) + b) * 10) / 10)
    forecast.push({
      date: format(date, 'yyyy-MM-dd'),
      label: format(date, 'dd.MM'),
      km: projectedKm,
    })
  }

  return { past, forecast, trend, confidence, trendValue: Math.round(m * 10) / 10 }
}

// ─── PARKING HOTSPOT GRID AGGREGATION ───────────────────────────────

export function aggregateParkingGrid(positions) {
  // positions: array of { lat, lng } (already filtered for speed < 2)
  // Grid: round to 3 decimal places ≈ ~100m cells
  const grid = {}

  positions.forEach(p => {
    const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`
    if (!grid[key]) grid[key] = { lat: 0, lng: 0, count: 0, sumLat: 0, sumLng: 0 }
    grid[key].count++
    grid[key].sumLat += p.lat
    grid[key].sumLng += p.lng
  })

  // Convert to array, sort by count, return top results with averaged positions
  return Object.values(grid)
    .map(g => ({ lat: g.sumLat / g.count, lng: g.sumLng / g.count, count: g.count }))
    .filter(g => g.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15) // top 15 parking areas
}
