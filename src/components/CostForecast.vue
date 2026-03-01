<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import { format, subDays, differenceInMinutes } from 'date-fns'

Chart.register(...registerables)

const props = defineProps({
  trips: { type: Array, default: () => [] },
  forecast: { type: Object, default: null },
  period: { type: String, default: '7d' },
  vehicleName: { type: String, default: '' },
  ecoEvents: { type: Array, default: () => [] },
  anomalies: { type: Array, default: () => [] },
  utilization: { type: Object, default: null },
})

// ─── CONFIGURABLE ASSUMPTIONS ────────────────────────────────────────
const fuelPrice = ref(38.5)           // CZK per liter
const fuelConsumption = ref(6.5)      // liters per 100km
const idleFuelRate = ref(0.8)         // liters per hour idle
const maintenanceCostKm = ref(0.45)   // CZK per km maintenance
const depreciationKmRate = ref(0.35)  // CZK per km depreciation
const currency = ref(0)
const volumeUnit = ref(0)
const showAssumptions = ref(false)

const CURRENCIES = {
  0: { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  1: { code: 'EUR', symbol: '€', name: 'Euro' },
  2: { code: 'USD', symbol: '$', name: 'US Dollar' },
  3: { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  4: { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  5: { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev' },
}

const VOLUME_UNITS = {
  0: { code: 'L', name: 'Litre' },
  1: { code: 'gal', name: 'US Gallon' },
  2: { code: 'gal', name: 'UK Gallon' },
}

const VOL_FACTOR = { 0: 1, 1: 0.264172, 2: 0.219969 }
const cur = computed(() => CURRENCIES[currency.value] || CURRENCIES[0])
const vol = computed(() => VOLUME_UNITS[volumeUnit.value] || VOLUME_UNITS[0])

// ─── CORE METRICS ────────────────────────────────────────────────────
const validTrips = computed(() => (props.trips || []).filter(t => (t.TotalDistance || 0) >= 1))
const periodDays = computed(() => props.period === '24h' ? 1 : props.period === '7d' ? 7 : 30)

// ─── IDLE TIME ESTIMATION ────────────────────────────────────────────
// Estimate idle from trip gaps: time between trip end → next trip start within same day
const idleAnalysis = computed(() => {
  const sorted = [...validTrips.value].sort((a, b) =>
    new Date(a.StartTime).getTime() - new Date(b.StartTime).getTime()
  )
  let totalIdleMin = 0
  let shortStops = 0  // stops < 15 min (likely engine running)
  for (let i = 0; i < sorted.length - 1; i++) {
    const end = sorted[i].FinishTime
    const nextStart = sorted[i + 1].StartTime
    if (!end || !nextStart) continue
    const gap = differenceInMinutes(new Date(nextStart), new Date(end))
    // Gaps 1-30 min are likely idle (engine on, waiting)
    if (gap > 0 && gap <= 30) {
      totalIdleMin += gap
      if (gap <= 15) shortStops++
    }
  }
  const idleHours = totalIdleMin / 60
  const idleFuel = idleHours * idleFuelRate.value
  const idleCost = idleFuel * fuelPrice.value
  return { totalIdleMin, idleHours, idleFuel, idleCost, shortStops }
})

// ─── ECO BEHAVIOR PENALTIES ──────────────────────────────────────────
// Harsh events increase fuel consumption and maintenance wear
const behaviorPenalty = computed(() => {
  const events = props.ecoEvents || []
  const highSev = events.filter(e => e.EventSeverity === 3).length
  const medSev = events.filter(e => e.EventSeverity === 2).length
  const lowSev = events.filter(e => e.EventSeverity === 1).length

  // Fuel penalty: aggressive driving increases consumption
  // Model: +0.5% per 100 high events, +0.2% per 100 medium events
  const fuelPenaltyPct = (highSev * 0.5 + medSev * 0.2 + lowSev * 0.05) / 100
  // Maintenance penalty: harsh events increase wear
  // Model: braking → brake wear, cornering → tire wear, accel → drivetrain
  const brakingEvents = events.filter(e => e.EventType === 5).length
  const corneringEvents = events.filter(e => [1, 2, 3].includes(e.EventType)).length
  const accelEvents = events.filter(e => e.EventType === 4).length
  // Extra maintenance cost (CZK): approximate per event type
  const brakeWearCost = brakingEvents * 0.15 * fuelPrice.value
  const tireWearCost = corneringEvents * 0.10 * fuelPrice.value
  const drivetrainCost = accelEvents * 0.08 * fuelPrice.value
  const totalWearCost = brakeWearCost + tireWearCost + drivetrainCost

  return {
    fuelPenaltyPct,
    totalEvents: events.length,
    highSev, medSev, lowSev,
    brakeWearCost, tireWearCost, drivetrainCost, totalWearCost,
    brakingEvents, corneringEvents, accelEvents,
  }
})

// ─── FULL COST MODEL ─────────────────────────────────────────────────
const costModel = computed(() => {
  const totalKm = validTrips.value.reduce((s, t) => s + (t.TotalDistance || 0), 0)
  const kmPerDay = periodDays.value > 0 ? totalKm / periodDays.value : 0
  const fuelPerKm = fuelConsumption.value / 100

  // A) Fuel cost (base + behavior penalty + idle waste)
  const baseFuelCost = totalKm * fuelPerKm * fuelPrice.value
  const behaviorExtraCost = baseFuelCost * behaviorPenalty.value.fuelPenaltyPct
  const idleCost = idleAnalysis.value.idleCost
  const totalFuelCost = baseFuelCost + behaviorExtraCost + idleCost

  // B) Maintenance cost (base + wear from harsh events)
  const baseMaintenanceCost = totalKm * maintenanceCostKm.value
  const wearExtraCost = behaviorPenalty.value.totalWearCost
  const totalMaintenanceCost = baseMaintenanceCost + wearExtraCost

  // C) Depreciation
  const depreciationCost = totalKm * depreciationKmRate.value

  // D) Total
  const totalCost = totalFuelCost + totalMaintenanceCost + depreciationCost
  const costPerKm = totalKm > 0 ? totalCost / totalKm : 0

  // Daily / Monthly / Yearly projections
  const dailyCost = kmPerDay > 0 ? costPerKm * kmPerDay : 0
  const monthlyCost = dailyCost * 30
  const yearlyCost = dailyCost * 365
  const monthlyKm = kmPerDay * 30

  // Fuel volume
  const totalFuelLiters = totalKm * fuelPerKm + idleAnalysis.value.idleFuel
  const dailyFuelLiters = periodDays.value > 0 ? totalFuelLiters / periodDays.value : 0

  // Breakdown percentages
  const fuelPct = totalCost > 0 ? Math.round((totalFuelCost / totalCost) * 100) : 0
  const maintPct = totalCost > 0 ? Math.round((totalMaintenanceCost / totalCost) * 100) : 0
  const deprPct = totalCost > 0 ? Math.round((depreciationCost / totalCost) * 100) : 0

  // Daily costs for chart
  const dailyCosts = {}
  validTrips.value.forEach(t => {
    if (!t.StartTime) return
    const day = t.StartTime.slice(0, 10)
    const km = t.TotalDistance || 0
    const dayCost = km * costPerKm
    dailyCosts[day] = (dailyCosts[day] || 0) + dayCost
  })
  const now = new Date()
  const past = []
  for (let d = periodDays.value - 1; d >= 0; d--) {
    const date = subDays(now, d)
    const key = format(date, 'yyyy-MM-dd')
    const label = format(date, 'dd.MM')
    past.push({ date: key, label, cost: Math.round((dailyCosts[key] || 0) * 100) / 100 })
  }

  // Forecast costs
  const forecastCosts = []
  if (props.forecast?.forecast?.length && props.forecast.confidence !== 'insufficient') {
    props.forecast.forecast.forEach(f => {
      const km = Math.max(0, f.km)
      forecastCosts.push({ date: f.date, label: f.label, cost: Math.round(km * costPerKm * 100) / 100 })
    })
  }

  const forecast7dCost = forecastCosts.reduce((s, f) => s + f.cost, 0)

  // Confidence for estimates
  const dataConfidence = validTrips.value.length >= 10 ? 'high' : validTrips.value.length >= 5 ? 'medium' : 'low'

  return {
    totalKm, kmPerDay, totalCost, costPerKm, dailyCost, monthlyCost, yearlyCost, monthlyKm,
    // Breakdown
    totalFuelCost, baseFuelCost, behaviorExtraCost, idleCost,
    totalMaintenanceCost, baseMaintenanceCost, wearExtraCost,
    depreciationCost,
    fuelPct, maintPct, deprPct,
    // Fuel
    totalFuelLiters, dailyFuelLiters,
    // Forecast
    past, forecastCosts, forecast7dCost,
    // Meta
    dataConfidence,
  }
})

// ─── SAVINGS LEVERS ──────────────────────────────────────────────────
const savingsLevers = computed(() => {
  const levers = []
  const cm = costModel.value
  const bp = behaviorPenalty.value
  const idle = idleAnalysis.value

  // 1. Idle reduction (20% target)
  if (idle.idleCost > 0) {
    const savings = idle.idleCost * 0.2
    const monthly = (savings / periodDays.value) * 30
    levers.push({
      name: 'Idle reduction',
      icon: '⏱',
      description: `Reduce idle time by 20% (${Math.round(idle.totalIdleMin * 0.2)} min)`,
      savingsPeriod: savings,
      savingsMonthly: monthly,
      confidence: idle.totalIdleMin > 30 ? 'medium' : 'low',
      detail: `Current: ${idle.idleHours.toFixed(1)}h idle → ${fmtVol(idle.idleFuel)} ${vol.value.code} wasted`,
      metric: `${idle.shortStops} short stops detected`,
    })
  }

  // 2. Harsh event reduction (30% target)
  if (bp.totalEvents > 0) {
    const fuelSavings = cm.behaviorExtraCost * 0.3
    const wearSavings = bp.totalWearCost * 0.3
    const total = fuelSavings + wearSavings
    const monthly = (total / periodDays.value) * 30
    levers.push({
      name: 'Driving behavior',
      icon: '🛡',
      description: `Reduce harsh events by 30% (${Math.round(bp.totalEvents * 0.3)} events)`,
      savingsPeriod: total,
      savingsMonthly: monthly,
      confidence: bp.totalEvents >= 20 ? 'medium' : 'low',
      detail: `${bp.highSev} high + ${bp.medSev} medium severity events`,
      metric: `Fuel penalty: +${(bp.fuelPenaltyPct * 100).toFixed(1)}%`,
    })
  }

  // 3. Speed reduction
  const overSpeedTrips = validTrips.value.filter(t => (t.MaxSpeed || 0) > 130).length
  if (overSpeedTrips > 0) {
    // Speeding increases consumption by ~15-20% per overspeed trip
    const overSpeedCost = overSpeedTrips * (cm.costPerKm * 5) // ~5km worth of extra cost per overspeed trip
    const savings = overSpeedCost * 0.5
    const monthly = (savings / periodDays.value) * 30
    levers.push({
      name: 'Speed compliance',
      icon: '⚡',
      description: `Eliminate 50% of >130 km/h trips (${Math.round(overSpeedTrips * 0.5)} trips)`,
      savingsPeriod: savings,
      savingsMonthly: monthly,
      confidence: overSpeedTrips >= 3 ? 'medium' : 'low',
      detail: `${overSpeedTrips}/${validTrips.value.length} trips exceeded 130 km/h`,
      metric: `Higher speed = exponentially higher fuel & tire wear`,
    })
  }

  // 4. Route optimization (if long average trip distance)
  const avgTripDist = validTrips.value.length
    ? validTrips.value.reduce((s, t) => s + (t.TotalDistance || 0), 0) / validTrips.value.length
    : 0
  if (avgTripDist > 10 && validTrips.value.length >= 5) {
    // Assume 5% route optimization possible
    const savings = cm.totalCost * 0.05
    const monthly = (savings / periodDays.value) * 30
    levers.push({
      name: 'Route optimization',
      icon: '🗺',
      description: `Optimize routes for 5% shorter total distance`,
      savingsPeriod: savings,
      savingsMonthly: monthly,
      confidence: 'low',
      detail: `Avg trip: ${avgTripDist.toFixed(1)} km · ${validTrips.value.length} trips`,
      metric: `Model-based estimate — requires route analysis`,
    })
  }

  // Total potential
  const totalMonthly = levers.reduce((s, l) => s + l.savingsMonthly, 0)
  return { levers, totalMonthly }
})

// ─── TOP WASTE DRIVER ────────────────────────────────────────────────
const topWaste = computed(() => {
  const items = []
  const cm = costModel.value
  const idle = idleAnalysis.value
  if (idle.idleCost > 0) items.push({ name: 'Idle waste', cost: idle.idleCost })
  if (cm.behaviorExtraCost > 0) items.push({ name: 'Harsh driving', cost: cm.behaviorExtraCost })
  if (cm.wearExtraCost > 0) items.push({ name: 'Wear & tear', cost: cm.wearExtraCost })
  items.sort((a, b) => b.cost - a.cost)
  return items[0] || null
})

function fmt(val) {
  return val.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })
}

function fmtVol(liters) {
  return (liters * VOL_FACTOR[volumeUnit.value]).toFixed(1)
}

// ─── CHARTS ──────────────────────────────────────────────────────────
const costCanvas = ref(null)
const breakdownCanvas = ref(null)
let costChart = null
let breakdownChart = null

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
}

function renderCostChart() {
  if (!costCanvas.value || !costModel.value.past.length) return
  if (costChart) costChart.destroy()

  const light = isLightTheme()
  const ctx = costCanvas.value.getContext('2d')
  const cm = costModel.value

  const labels = [...cm.past.map(d => d.label), ...cm.forecastCosts.map(d => d.label)]
  const pastData = cm.past.map(d => d.cost)
  const forecastData = [...new Array(cm.past.length).fill(null), ...cm.forecastCosts.map(d => d.cost)]
  if (cm.forecastCosts.length && pastData.length) forecastData[pastData.length - 1] = pastData[pastData.length - 1]

  const datasets = [{
    label: `Actual (${cur.value.code})`,
    data: pastData,
    backgroundColor: light ? 'rgba(200,100,0,0.25)' : 'rgba(255,180,100,0.3)',
    borderWidth: 0, type: 'bar', borderRadius: 3, order: 1,
  }]

  if (cm.forecastCosts.length) {
    datasets.push({
      label: `Forecast (${cur.value.code})`,
      data: forecastData,
      borderColor: light ? 'rgba(0,80,200,0.5)' : 'rgba(180,200,255,0.4)',
      borderWidth: 2, borderDash: [4, 4], fill: false, type: 'line', tension: 0.3,
      pointRadius: 0, pointHoverRadius: 4,
      pointHoverBackgroundColor: light ? 'rgba(0,80,200,0.7)' : 'rgba(180,200,255,0.7)',
      order: 0,
    })
  }

  costChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: cm.forecastCosts.length > 0, labels: { boxWidth: 12, boxHeight: 2, color: light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.3)', font: { size: 11, family: 'Satoshi' }, padding: 8 }, position: 'top', align: 'end' },
        tooltip: {
          backgroundColor: light ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,10,0.9)',
          borderColor: light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)',
          borderWidth: 1, titleFont: { family: 'Satoshi', size: 13 }, bodyFont: { family: 'JetBrains Mono', size: 13 },
          titleColor: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
          bodyColor: light ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)',
          padding: 10, cornerRadius: 8,
          callbacks: { label: (ctx) => ctx.raw === null ? null : `${ctx.dataset.label.includes('Forecast') ? '~ ' : ''}${ctx.raw.toFixed(0)} ${cur.value.symbol}` },
          filter: (item) => item.raw !== null,
        },
      },
      scales: {
        x: { display: true, grid: { display: false }, ticks: { color: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.15)', font: { size: 10, family: 'Satoshi' }, maxTicksLimit: 10 }, border: { display: false } },
        y: { display: true, beginAtZero: true, grid: { color: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)' }, ticks: { color: light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.15)', font: { size: 10, family: 'JetBrains Mono' }, callback: v => `${v} ${cur.value.symbol}` }, border: { display: false } },
      },
      interaction: { intersect: false, mode: 'index' },
    },
  })
}

function renderBreakdownChart() {
  if (!breakdownCanvas.value) return
  if (breakdownChart) breakdownChart.destroy()

  const light = isLightTheme()
  const ctx = breakdownCanvas.value.getContext('2d')
  const cm = costModel.value

  breakdownChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Fuel', 'Maintenance', 'Depreciation'],
      datasets: [{
        data: [cm.totalFuelCost, cm.totalMaintenanceCost, cm.depreciationCost],
        backgroundColor: [
          light ? 'rgba(200,140,0,0.6)' : 'rgba(255,200,100,0.5)',
          light ? 'rgba(0,120,200,0.5)' : 'rgba(140,200,255,0.4)',
          light ? 'rgba(120,120,120,0.4)' : 'rgba(180,180,180,0.3)',
        ],
        borderColor: light ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.5)',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)', font: { size: 12, family: 'Satoshi' }, padding: 12, boxWidth: 12, boxHeight: 12 } },
        tooltip: {
          backgroundColor: light ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,10,0.9)',
          borderColor: light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)',
          borderWidth: 1, titleFont: { family: 'Satoshi', size: 13 }, bodyFont: { family: 'JetBrains Mono', size: 13 },
          titleColor: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
          bodyColor: light ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)',
          padding: 10, cornerRadius: 8,
          callbacks: { label: ctx => `${ctx.label}: ${fmt(ctx.raw)} ${cur.value.symbol} (${Math.round(ctx.raw / costModel.value.totalCost * 100)}%)` },
        },
      },
    },
  })
}

function renderCharts() {
  renderCostChart()
  renderBreakdownChart()
}

onMounted(() => nextTick(renderCharts))
watch([costModel, currency], () => nextTick(renderCharts), { deep: true })
</script>

<template>
  <div>
    <!-- KPI row (top) -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
      <div class="lumi-card p-4">
        <div class="text-[11px] text-dim uppercase tracking-wider mb-1">Cost / km</div>
        <div class="text-[26px] font-display font-bold" style="color:var(--text-primary)">{{ costModel.costPerKm.toFixed(2) }}</div>
        <div class="text-[12px] text-dim">{{ cur.symbol }}/km</div>
      </div>
      <div class="lumi-card p-4">
        <div class="text-[11px] text-dim uppercase tracking-wider mb-1">Cost / month</div>
        <div class="text-[26px] font-display font-bold" style="color:var(--text-primary)">{{ fmt(costModel.monthlyCost) }}</div>
        <div class="text-[12px] text-dim">{{ cur.symbol }}/month</div>
      </div>
      <div class="lumi-card p-4">
        <div class="text-[11px] text-dim uppercase tracking-wider mb-1">Projected savings</div>
        <div class="text-[26px] font-display font-bold" style="color:var(--status-live)">{{ fmt(savingsLevers.totalMonthly) }}</div>
        <div class="text-[12px] text-dim">{{ cur.symbol }}/month potential</div>
      </div>
      <div class="lumi-card p-4">
        <div class="text-[11px] text-dim uppercase tracking-wider mb-1">Top waste</div>
        <div v-if="topWaste" class="text-[18px] font-display font-bold" style="color:var(--status-danger)">{{ topWaste.name }}</div>
        <div v-if="topWaste" class="text-[12px] text-dim">{{ fmt(topWaste.cost) }} {{ cur.symbol }}/{{ period }}</div>
        <div v-else class="text-[14px] text-dim mt-1">No waste detected</div>
      </div>
      <div class="lumi-card p-4">
        <div class="text-[11px] text-dim uppercase tracking-wider mb-1">Data confidence</div>
        <div class="text-[18px] font-mono font-bold" :style="{ color: costModel.dataConfidence === 'high' ? 'var(--status-live)' : costModel.dataConfidence === 'medium' ? 'var(--status-moving)' : 'var(--text-dim)' }">{{ costModel.dataConfidence }}</div>
        <div class="text-[12px] text-dim">{{ validTrips.length }} trips analyzed</div>
      </div>
    </div>

    <!-- Configuration bar (collapsible) -->
    <div class="lumi-card p-4 mb-5">
      <div class="flex items-center justify-between cursor-pointer" @click="showAssumptions = !showAssumptions">
        <span class="text-[13px] text-dim uppercase tracking-wider font-semibold">Assumptions & Parameters</span>
        <span class="text-[12px] text-dim">{{ showAssumptions ? '▼ Hide' : '► Show' }}</span>
      </div>
      <div v-if="showAssumptions" class="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-[11px] text-dim uppercase">Fuel price</label>
          <div class="flex items-center gap-1">
            <input v-model.number="fuelPrice" type="number" step="0.5" min="0" class="lumi-input w-full text-[13px] py-1 px-2 font-mono text-center" />
            <span class="text-[11px] text-dim flex-shrink-0">{{ cur.symbol }}/{{ vol.code }}</span>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[11px] text-dim uppercase">Consumption</label>
          <div class="flex items-center gap-1">
            <input v-model.number="fuelConsumption" type="number" step="0.1" min="0" class="lumi-input w-full text-[13px] py-1 px-2 font-mono text-center" />
            <span class="text-[11px] text-dim flex-shrink-0">{{ vol.code }}/100km</span>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[11px] text-dim uppercase">Idle fuel rate</label>
          <div class="flex items-center gap-1">
            <input v-model.number="idleFuelRate" type="number" step="0.1" min="0" class="lumi-input w-full text-[13px] py-1 px-2 font-mono text-center" />
            <span class="text-[11px] text-dim flex-shrink-0">{{ vol.code }}/h</span>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[11px] text-dim uppercase">Maintenance/km</label>
          <div class="flex items-center gap-1">
            <input v-model.number="maintenanceCostKm" type="number" step="0.05" min="0" class="lumi-input w-full text-[13px] py-1 px-2 font-mono text-center" />
            <span class="text-[11px] text-dim flex-shrink-0">{{ cur.symbol }}/km</span>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[11px] text-dim uppercase">Depreciation/km</label>
          <div class="flex items-center gap-1">
            <input v-model.number="depreciationKmRate" type="number" step="0.05" min="0" class="lumi-input w-full text-[13px] py-1 px-2 font-mono text-center" />
            <span class="text-[11px] text-dim flex-shrink-0">{{ cur.symbol }}/km</span>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[11px] text-dim uppercase">Currency</label>
          <select v-model="currency" class="lumi-select text-[13px] py-1">
            <option v-for="(c, idx) in CURRENCIES" :key="idx" :value="Number(idx)">{{ c.code }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Cost breakdown + chart row -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
      <!-- Breakdown cards -->
      <div class="space-y-3">
        <div class="lumi-card p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[13px] font-semibold" style="color:var(--status-moving)">Fuel</span>
            <span class="text-[11px] font-mono text-dim">{{ costModel.fuelPct }}%</span>
          </div>
          <div class="text-[20px] font-display font-bold" style="color:var(--text-primary)">{{ fmt(costModel.totalFuelCost) }} {{ cur.symbol }}</div>
          <div class="space-y-1 mt-2 text-[12px]">
            <div class="flex justify-between"><span class="text-dim">Base fuel</span><span class="font-mono">{{ fmt(costModel.baseFuelCost) }} {{ cur.symbol }}</span></div>
            <div v-if="costModel.behaviorExtraCost > 0" class="flex justify-between"><span class="text-dim">Behavior penalty</span><span class="font-mono" style="color:var(--status-danger)">+{{ fmt(costModel.behaviorExtraCost) }} {{ cur.symbol }}</span></div>
            <div v-if="idleAnalysis.idleCost > 0" class="flex justify-between"><span class="text-dim">Idle waste</span><span class="font-mono" style="color:var(--status-danger)">+{{ fmt(idleAnalysis.idleCost) }} {{ cur.symbol }}</span></div>
          </div>
          <div class="text-[11px] text-dim mt-2">{{ fmtVol(costModel.totalFuelLiters) }} {{ vol.code }} total · {{ fmtVol(costModel.dailyFuelLiters) }} {{ vol.code }}/day</div>
        </div>
        <div class="lumi-card p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[13px] font-semibold" style="color:rgba(140,200,255,0.8)">Maintenance</span>
            <span class="text-[11px] font-mono text-dim">{{ costModel.maintPct }}%</span>
          </div>
          <div class="text-[20px] font-display font-bold" style="color:var(--text-primary)">{{ fmt(costModel.totalMaintenanceCost) }} {{ cur.symbol }}</div>
          <div class="space-y-1 mt-2 text-[12px]">
            <div class="flex justify-between"><span class="text-dim">Base maintenance</span><span class="font-mono">{{ fmt(costModel.baseMaintenanceCost) }} {{ cur.symbol }}</span></div>
            <div v-if="costModel.wearExtraCost > 0" class="flex justify-between"><span class="text-dim">Harsh event wear</span><span class="font-mono" style="color:var(--status-danger)">+{{ fmt(costModel.wearExtraCost) }} {{ cur.symbol }}</span></div>
          </div>
        </div>
        <div class="lumi-card p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[13px] font-semibold text-dim">Depreciation</span>
            <span class="text-[11px] font-mono text-dim">{{ costModel.deprPct }}%</span>
          </div>
          <div class="text-[20px] font-display font-bold" style="color:var(--text-primary)">{{ fmt(costModel.depreciationCost) }} {{ cur.symbol }}</div>
          <div class="text-[12px] text-dim mt-2">{{ depreciationKmRate }} {{ cur.symbol }}/km × {{ costModel.totalKm.toFixed(0) }} km</div>
        </div>
      </div>

      <!-- Breakdown donut -->
      <div class="lumi-card p-5 flex flex-col items-center justify-center">
        <div class="text-[13px] text-dim uppercase tracking-wider mb-3">Cost Breakdown</div>
        <div style="height:200px; width:200px">
          <canvas ref="breakdownCanvas" />
        </div>
        <div class="text-[11px] text-dim mt-3 text-center">
          Total: <span class="font-mono font-bold" style="color:var(--text-primary)">{{ fmt(costModel.totalCost) }} {{ cur.symbol }}</span>
          over {{ period }}
        </div>
      </div>

      <!-- Projections -->
      <div class="space-y-3">
        <div class="lumi-card p-4">
          <div class="text-[11px] text-dim uppercase tracking-wider mb-1">Daily</div>
          <div class="text-[22px] font-display font-bold" style="color:var(--text-primary)">{{ fmt(costModel.dailyCost) }} {{ cur.symbol }}</div>
          <div class="text-[12px] text-dim">{{ costModel.kmPerDay.toFixed(0) }} km/day</div>
        </div>
        <div class="lumi-card p-4">
          <div class="text-[11px] text-dim uppercase tracking-wider mb-1">Monthly projection</div>
          <div class="text-[22px] font-display font-bold" style="color:var(--status-moving)">{{ fmt(costModel.monthlyCost) }} {{ cur.symbol }}</div>
          <div class="text-[12px] text-dim">{{ costModel.monthlyKm.toFixed(0) }} km projected</div>
        </div>
        <div class="lumi-card p-4">
          <div class="text-[11px] text-dim uppercase tracking-wider mb-1">Yearly projection</div>
          <div class="text-[22px] font-display font-bold" style="color:var(--status-danger)">{{ fmt(costModel.yearlyCost) }} {{ cur.symbol }}</div>
        </div>
        <div v-if="costModel.forecast7dCost > 0" class="lumi-card p-4">
          <div class="text-[11px] text-dim uppercase tracking-wider mb-1">7d forecast</div>
          <div class="text-[22px] font-display font-bold" style="color:var(--status-moving)">~{{ fmt(costModel.forecast7dCost) }} {{ cur.symbol }}</div>
          <div class="text-[12px] text-dim">Based on trend regression</div>
        </div>
      </div>
    </div>

    <!-- Savings Levers -->
    <div v-if="savingsLevers.levers.length" class="mb-5">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-[16px] font-display font-semibold text-lumi">Savings Levers</span>
        <span class="text-[12px] font-mono px-2 py-0.5 rounded" style="background:rgba(200,255,200,0.08); color:var(--status-live)">
          {{ fmt(savingsLevers.totalMonthly) }} {{ cur.symbol }}/month potential
        </span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div v-for="lever in savingsLevers.levers" :key="lever.name" class="lumi-card p-4">
          <div class="flex items-start gap-3">
            <span class="text-2xl">{{ lever.icon }}</span>
            <div class="flex-1">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[14px] font-semibold" style="color:var(--text-primary)">{{ lever.name }}</span>
                <span class="text-[11px] font-mono px-1.5 py-0.5 rounded"
                  :style="{ background: lever.confidence === 'medium' ? 'rgba(255,200,100,0.1)' : 'var(--surface-raised)', color: lever.confidence === 'medium' ? 'var(--status-moving)' : 'var(--text-dim)' }"
                >{{ lever.confidence }}</span>
              </div>
              <div class="text-[13px] text-dim mb-2">{{ lever.description }}</div>
              <div class="flex items-center gap-4">
                <div>
                  <div class="text-[18px] font-display font-bold" style="color:var(--status-live)">{{ fmt(lever.savingsMonthly) }} {{ cur.symbol }}</div>
                  <div class="text-[11px] text-dim">/month savings</div>
                </div>
                <div class="text-[12px] text-dim flex-1">
                  <div>{{ lever.detail }}</div>
                  <div class="mt-0.5 font-mono text-[11px]" style="color:var(--text-muted)">{{ lever.metric }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Daily cost chart -->
    <div class="lumi-card p-5 mb-5">
      <div class="text-[14px] font-display font-semibold text-lumi mb-3">Daily Total Cost</div>
      <div style="height:200px">
        <canvas v-if="costModel.past.length" ref="costCanvas" />
        <div v-else class="flex items-center justify-center h-full text-dim text-[14px]">No cost data</div>
      </div>
    </div>

    <!-- Methodology & Assumptions -->
    <div class="lumi-card p-5">
      <div class="text-[14px] font-display font-semibold text-lumi mb-3">Methodology & Assumptions</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
        <div>
          <div class="font-semibold mb-2" style="color:var(--text-secondary)">Cost Model</div>
          <div class="space-y-1.5 text-dim">
            <div><span class="font-mono" style="color:var(--text-secondary)">Fuel:</span> Distance × ({{ fuelConsumption }} {{ vol.code }}/100km) × {{ fuelPrice }} {{ cur.symbol }}/{{ vol.code }}</div>
            <div><span class="font-mono" style="color:var(--text-secondary)">Idle:</span> Estimated idle hours × {{ idleFuelRate }} {{ vol.code }}/h × fuel price. Idle detected from inter-trip gaps ≤30 min.</div>
            <div><span class="font-mono" style="color:var(--text-secondary)">Behavior:</span> Harsh events increase base consumption by {{ (behaviorPenalty.fuelPenaltyPct * 100).toFixed(2) }}%. Model: +0.5%/100 high events, +0.2%/100 medium.</div>
            <div><span class="font-mono" style="color:var(--text-secondary)">Maintenance:</span> {{ maintenanceCostKm }} {{ cur.symbol }}/km base + wear from harsh braking ({{ behaviorPenalty.brakingEvents }} events), cornering ({{ behaviorPenalty.corneringEvents }}), acceleration ({{ behaviorPenalty.accelEvents }}).</div>
            <div><span class="font-mono" style="color:var(--text-secondary)">Depreciation:</span> {{ depreciationKmRate }} {{ cur.symbol }}/km linear model.</div>
          </div>
        </div>
        <div>
          <div class="font-semibold mb-2" style="color:var(--text-secondary)">Confidence & Limitations</div>
          <div class="space-y-1.5 text-dim">
            <div><span class="font-mono" style="color:var(--text-secondary)">Data:</span> {{ validTrips.length }} trips over {{ periodDays }} days. Confidence: <span :style="{ color: costModel.dataConfidence === 'high' ? 'var(--status-live)' : costModel.dataConfidence === 'medium' ? 'var(--status-moving)' : 'var(--text-dim)' }">{{ costModel.dataConfidence }}</span>.</div>
            <div><span class="font-mono" style="color:var(--text-secondary)">Idle model:</span> Approximation from inter-trip gaps. Real idle requires engine-on sensor data.</div>
            <div><span class="font-mono" style="color:var(--text-secondary)">Wear model:</span> Simplified — production would use OBD-II data and service records.</div>
            <div><span class="font-mono" style="color:var(--text-secondary)">Savings:</span> Model-based estimates with configurable assumptions. Actual results vary by driver, route, and conditions.</div>
            <div class="mt-2 p-2 rounded" style="background:rgba(200,200,255,0.06); border:1px solid rgba(200,200,255,0.1)">
              All parameters above are configurable. Expand "Assumptions & Parameters" to adjust fuel price, consumption, maintenance costs, and depreciation rate for your fleet.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
