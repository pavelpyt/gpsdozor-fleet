<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useFleetStore } from '../stores/fleet'
import { vehicleStatus, fmtKm, ago } from '../lib/utils'

const router = useRouter()
const fleet = useFleetStore()

const vehicleA = ref(null)
const vehicleB = ref(null)

const vehA = computed(() => vehicleA.value ? fleet.getVehicle(vehicleA.value) : null)
const vehB = computed(() => vehicleB.value ? fleet.getVehicle(vehicleB.value) : null)

const utilA = computed(() => fleet.vehicleUtilization[vehicleA.value] || null)
const utilB = computed(() => fleet.vehicleUtilization[vehicleB.value] || null)

const anomA = computed(() => fleet.vehicleAnomalies[vehicleA.value] || [])
const anomB = computed(() => fleet.vehicleAnomalies[vehicleB.value] || [])

const tripsA = computed(() => fleet.vehicleTrips[vehicleA.value] || [])
const tripsB = computed(() => fleet.vehicleTrips[vehicleB.value] || [])

const validTripsA = computed(() => tripsA.value.filter(t => (t.TotalDistance || 0) >= 1))
const validTripsB = computed(() => tripsB.value.filter(t => (t.TotalDistance || 0) >= 1))

const comparisonRows = computed(() => {
  if (!vehA.value || !vehB.value) return []

  const maxSpdA = validTripsA.value.length ? Math.max(...validTripsA.value.map(t => t.MaxSpeed || 0)) : 0
  const maxSpdB = validTripsB.value.length ? Math.max(...validTripsB.value.map(t => t.MaxSpeed || 0)) : 0

  const avgSpdA = validTripsA.value.length ? Math.round(validTripsA.value.reduce((s, t) => s + (t.AverageSpeed || 0), 0) / validTripsA.value.length) : 0
  const avgSpdB = validTripsB.value.length ? Math.round(validTripsB.value.reduce((s, t) => s + (t.AverageSpeed || 0), 0) / validTripsB.value.length) : 0

  return [
    { label: 'Status', a: vehicleStatus(vehA.value).label, b: vehicleStatus(vehB.value).label, colorA: vehicleStatus(vehA.value).color, colorB: vehicleStatus(vehB.value).color },
    { label: 'Current Speed', a: `${vehA.value.Speed || 0} km/h`, b: `${vehB.value.Speed || 0} km/h`, better: (vehA.value.Speed || 0) !== (vehB.value.Speed || 0) ? ((vehA.value.Speed || 0) > (vehB.value.Speed || 0) ? 'a' : 'b') : null },
    { label: 'Total Odometer', a: `${fmtKm(vehA.value.Odometer)} km`, b: `${fmtKm(vehB.value.Odometer)} km`, better: (vehA.value.Odometer || 0) > (vehB.value.Odometer || 0) ? 'a' : 'b' },
    { label: 'Battery', a: `${vehA.value.BatteryPercentage || 0}%`, b: `${vehB.value.BatteryPercentage || 0}%`, better: (vehA.value.BatteryPercentage || 0) > (vehB.value.BatteryPercentage || 0) ? 'a' : 'b' },
    { label: 'Last Seen', a: ago(vehA.value.LastPositionTimestamp), b: ago(vehB.value.LastPositionTimestamp) },
    { label: `Trips (${fleet.analyticsPeriod})`, a: String(validTripsA.value.length), b: String(validTripsB.value.length), better: validTripsA.value.length > validTripsB.value.length ? 'a' : validTripsB.value.length > validTripsA.value.length ? 'b' : null },
    { label: 'Total km', a: utilA.value ? `${utilA.value.totalKm.toFixed(1)} km` : '—', b: utilB.value ? `${utilB.value.totalKm.toFixed(1)} km` : '—', better: (utilA.value?.totalKm || 0) > (utilB.value?.totalKm || 0) ? 'a' : 'b' },
    { label: 'km / day', a: utilA.value ? String(utilA.value.kmPerDay) : '—', b: utilB.value ? String(utilB.value.kmPerDay) : '—', better: (utilA.value?.kmPerDay || 0) > (utilB.value?.kmPerDay || 0) ? 'a' : 'b' },
    { label: 'Utilization', a: utilA.value ? `${utilA.value.score}%` : '—', b: utilB.value ? `${utilB.value.score}%` : '—', better: (utilA.value?.score || 0) > (utilB.value?.score || 0) ? 'a' : 'b' },
    { label: 'Drive Time', a: utilA.value ? `${Math.round(utilA.value.driveMinutes / 60)}h` : '—', b: utilB.value ? `${Math.round(utilB.value.driveMinutes / 60)}h` : '—', better: (utilA.value?.driveMinutes || 0) > (utilB.value?.driveMinutes || 0) ? 'a' : 'b' },
    { label: 'Max Speed', a: maxSpdA ? `${maxSpdA} km/h` : '—', b: maxSpdB ? `${maxSpdB} km/h` : '—', warn: maxSpdA > 130 || maxSpdB > 130 },
    { label: 'Avg Speed', a: avgSpdA ? `${avgSpdA} km/h` : '—', b: avgSpdB ? `${avgSpdB} km/h` : '—' },
    { label: 'Anomalies', a: String(anomA.value.length), b: String(anomB.value.length), better: anomA.value.length < anomB.value.length ? 'a' : anomB.value.length < anomA.value.length ? 'b' : null },
  ]
})

// Auto-load analytics if not loaded
watch([vehicleA, vehicleB], () => {
  if ((vehicleA.value || vehicleB.value) && !fleet.analyticsLoaded && !fleet.analyticsLoading) {
    fleet.loadAnalytics(fleet.analyticsPeriod)
  }
})
</script>

<template>
  <div class="flex-1 overflow-auto p-5">
    <div class="flex items-center gap-3 mb-5 animate-rise">
      <button @click="router.push({ name: 'dashboard' })" class="lumi-btn">← Back</button>
      <div class="text-2xl font-display font-bold text-lumi">Compare Vehicles</div>
    </div>

    <!-- Vehicle selectors -->
    <div class="grid grid-cols-2 gap-6 mb-6 animate-rise" style="animation-delay:50ms">
      <div class="lumi-card p-5">
        <div class="text-[14px] text-dim uppercase tracking-wider mb-3">Vehicle A</div>
        <select v-model="vehicleA" class="lumi-select w-full">
          <option :value="null" disabled>Select vehicle...</option>
          <option v-for="v in fleet.vehicles" :key="v.Code" :value="v.Code">
            {{ v.Name || v.Code }} ({{ v.SPZ || v.Code }})
          </option>
        </select>
        <div v-if="vehA" class="mt-3 flex items-center gap-3">
          <div
            class="w-4 h-4 rounded-full"
            :style="{ background: vehicleStatus(vehA).color, boxShadow: `0 0 10px ${vehicleStatus(vehA).color}88` }"
          />
          <div>
            <div class="text-[18px] font-semibold" style="color:var(--text-primary)">{{ vehA.Name || vehA.Code }}</div>
            <div class="text-[14px] text-dim">{{ vehA.SPZ || '—' }} · {{ vehicleStatus(vehA).label }}</div>
          </div>
        </div>
      </div>

      <div class="lumi-card p-5">
        <div class="text-[14px] text-dim uppercase tracking-wider mb-3">Vehicle B</div>
        <select v-model="vehicleB" class="lumi-select w-full">
          <option :value="null" disabled>Select vehicle...</option>
          <option v-for="v in fleet.vehicles" :key="v.Code" :value="v.Code">
            {{ v.Name || v.Code }} ({{ v.SPZ || v.Code }})
          </option>
        </select>
        <div v-if="vehB" class="mt-3 flex items-center gap-3">
          <div
            class="w-4 h-4 rounded-full"
            :style="{ background: vehicleStatus(vehB).color, boxShadow: `0 0 10px ${vehicleStatus(vehB).color}88` }"
          />
          <div>
            <div class="text-[18px] font-semibold" style="color:var(--text-primary)">{{ vehB.Name || vehB.Code }}</div>
            <div class="text-[14px] text-dim">{{ vehB.SPZ || '—' }} · {{ vehicleStatus(vehB).label }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Analytics loading hint -->
    <div v-if="fleet.analyticsLoading" class="flex items-center gap-3 mb-5 px-4 py-3 rounded-lg" style="background:var(--surface-hover); border:1px solid var(--border)">
      <div class="loading-spinner" style="width:20px;height:20px;border-width:2px"></div>
      <span class="text-[14px] text-dim">Loading fleet analytics...</span>
    </div>

    <!-- Comparison table -->
    <div v-if="vehA && vehB" class="lumi-card p-5 animate-rise" style="animation-delay:100ms">
      <div class="text-[16px] font-display font-semibold text-lumi mb-4">
        Comparison
        <span class="text-dim font-normal">({{ fleet.analyticsPeriod }})</span>
      </div>

      <table class="w-full border-collapse">
        <thead>
          <tr>
            <th class="text-left px-4 py-2.5 text-[13px] font-semibold text-dim uppercase tracking-wider" style="border-bottom:1px solid var(--border); width:30%">Metric</th>
            <th class="text-center px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider" style="border-bottom:1px solid var(--border); width:35%; color:var(--status-live)">{{ vehA.Name || vehA.Code }}</th>
            <th class="text-center px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider" style="border-bottom:1px solid var(--border); width:35%; color:#4488cc">{{ vehB.Name || vehB.Code }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in comparisonRows" :key="i"
            style="border-bottom:1px solid var(--border)"
          >
            <td class="px-4 py-3 text-[14px] text-dim">{{ row.label }}</td>
            <td class="px-4 py-3 text-center text-[16px] font-mono"
                :style="{
                  color: row.colorA || (row.better === 'a' ? 'var(--status-live)' : row.warn && row.a?.includes('1') ? 'var(--status-danger)' : 'var(--text-secondary)'),
                  fontWeight: row.better === 'a' ? 700 : 400,
                }"
            >
              {{ row.a }}
              <span v-if="row.better === 'a'" class="text-[11px] ml-1" style="color:var(--status-live); opacity:0.6">&#9650;</span>
            </td>
            <td class="px-4 py-3 text-center text-[16px] font-mono"
                :style="{
                  color: row.colorB || (row.better === 'b' ? '#4488cc' : row.warn && row.b?.includes('1') ? 'var(--status-danger)' : 'var(--text-secondary)'),
                  fontWeight: row.better === 'b' ? 700 : 400,
                }"
            >
              {{ row.b }}
              <span v-if="row.better === 'b'" class="text-[11px] ml-1" style="color:#4488cc; opacity:0.6">&#9650;</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- No selection hint -->
    <div v-else class="text-center py-20 animate-rise">
      <div class="text-4xl mb-3">⇋</div>
      <div class="text-[18px] text-dim">Select two vehicles above to compare them</div>
    </div>
  </div>
</template>
