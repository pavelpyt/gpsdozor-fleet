<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFleetStore } from '../stores/fleet'
import { vehicleStatus, ago, fmtKm, detectAnomalies } from '../lib/utils'
import { api } from '../lib/api'
import FleetMap from '../components/FleetMap.vue'
import ForecastSparkline from '../components/ForecastSparkline.vue'

const router = useRouter()
const fleet = useFleetStore()

const sidebarTab = ref('vehicles')
const cacheInfo = ref(null)
const mapRef = ref(null)

const stats = computed(() => fleet.stats)

// Basic parking hotspots from current positions
const currentParkingHotspots = computed(() => {
  const parked = fleet.vehicles.filter(v => {
    const st = vehicleStatus(v)
    return st.key === 'parked' && v.LastPosition
  })
  if (parked.length < 2) return []

  const THRESHOLD = 0.005
  const clusters = []
  const used = new Set()

  for (let i = 0; i < parked.length; i++) {
    if (used.has(i)) continue
    const pos = parked[i].LastPosition
    const lat = parseFloat(pos.Latitude)
    const lng = parseFloat(pos.Longitude)
    const group = [parked[i]]
    used.add(i)

    for (let j = i + 1; j < parked.length; j++) {
      if (used.has(j)) continue
      const p2 = parked[j].LastPosition
      if (Math.abs(parseFloat(p2.Latitude) - lat) < THRESHOLD && Math.abs(parseFloat(p2.Longitude) - lng) < THRESHOLD) {
        group.push(parked[j])
        used.add(j)
      }
    }

    if (group.length >= 2) {
      const avgLat = group.reduce((s, v) => s + parseFloat(v.LastPosition.Latitude), 0) / group.length
      const avgLng = group.reduce((s, v) => s + parseFloat(v.LastPosition.Longitude), 0) / group.length
      clusters.push({ lat: avgLat, lng: avgLng, count: group.length })
    }
  }
  return clusters
})

const allHotspots = computed(() => {
  const history = fleet.parkingHotspots || []
  return [...history.map(h => ({ ...h, fromHistory: true })), ...currentParkingHotspots.value]
})

const sortedVehicles = computed(() => {
  return [...fleet.vehicles].sort((a, b) => {
    const sa = vehicleStatus(a).key
    const sb = vehicleStatus(b).key
    const order = { moving: 0, parked: 1, offline: 2, unknown: 3 }
    return (order[sa] ?? 3) - (order[sb] ?? 3)
  })
})

const topVehicles = computed(() => {
  const vehs = fleet.vehicles
  if (!vehs.length) return []
  const items = []

  const fastest = [...vehs].sort((a, b) => (b.Speed || 0) - (a.Speed || 0))[0]
  if (fastest?.Speed > 0) items.push({ label: 'Fastest Now', name: fastest.Name || fastest.Code, val: `${fastest.Speed} km/h`, color: 'var(--status-live)', code: fastest.Code })

  const mostKm = [...vehs].sort((a, b) => (b.Odometer || 0) - (a.Odometer || 0))[0]
  if (mostKm?.Odometer > 0) items.push({ label: 'Most Distance', name: mostKm.Name || mostKm.Code, val: `${fmtKm(mostKm.Odometer)} km`, color: 'var(--status-moving)', code: mostKm.Code })

  const online = vehs.filter(v => vehicleStatus(v).key !== 'offline')
  if (online.length) {
    const latest = [...online].sort((a, b) => new Date(b.LastPositionTimestamp) - new Date(a.LastPositionTimestamp))[0]
    items.push({ label: 'Latest Update', name: latest.Name || latest.Code, val: ago(latest.LastPositionTimestamp), color: 'var(--text-secondary)', code: latest.Code })
  }

  return items
})

const quickAnomalies = computed(() => {
  const list = []
  fleet.vehicles.forEach(v => {
    const anoms = fleet.vehicleAnomalies[v.Code] || detectAnomalies(v)
    anoms.forEach(a => list.push({ ...a, vehicleCode: v.Code, vehicleName: v.Name || v.Code }))
  })
  return list.sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 }
    return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3)
  })
})

function openVehicle(v) {
  router.push({ name: 'vehicle', params: { code: typeof v === 'string' ? v : v.Code } })
}

function zoomToHotspot(h) {
  if (mapRef.value?.zoomTo) mapRef.value.zoomTo(h.lat, h.lng, 16)
}

function refreshCacheInfo() {
  cacheInfo.value = api.getCacheInfo()
}

onMounted(() => {
  if (!fleet.analyticsLoaded && !fleet.analyticsLoading) fleet.loadAnalytics('7d')
  refreshCacheInfo()
  setInterval(refreshCacheInfo, 10_000)
})
</script>

<template>
  <div class="flex-1 flex">

    <!-- Vehicle sidebar -->
    <div class="w-[420px] flex-shrink-0 flex flex-col border-r" style="border-color:var(--border); background:var(--sidebar-bg)">
      <!-- Header with stats -->
      <div class="px-5 py-4 border-b" style="border-color:var(--border)">
        <div class="flex items-center justify-between mb-3">
          <span class="text-[22px] font-display font-semibold text-lumi">Fleet</span>
          <div class="flex items-center gap-2">
            <span class="text-[14px] text-dim">{{ fleet.lastRefresh.toLocaleTimeString() }}</span>
            <span v-if="fleet.analyticsLoading" class="loading-spinner" style="width:14px;height:14px;border-width:1.5px"></span>
          </div>
        </div>
        <div class="flex gap-2">
          <div v-for="(s, i) in [
            { val: stats.total, label: 'ALL', color: 'var(--text-primary)' },
            { val: stats.online, label: 'ON', color: 'var(--status-live)' },
            { val: stats.moving, label: 'MOV', color: 'var(--status-moving)' },
            { val: stats.offline, label: 'OFF', color: 'var(--text-muted)' },
            { val: stats.anomalyCount, label: 'ALERT', color: stats.anomalyCount > 0 ? 'var(--status-danger)' : 'var(--text-muted)' },
          ]" :key="i"
            class="flex-1 text-center rounded-lg py-2"
            style="background:var(--surface-hover)"
          >
            <div class="text-[20px] font-display font-bold leading-none" :style="{ color: s.color }">{{ s.val }}</div>
            <div class="text-[11px] text-dim uppercase tracking-wider mt-1">{{ s.label }}</div>
          </div>
        </div>
      </div>

      <!-- Sidebar tabs -->
      <div class="flex border-b" style="border-color:var(--border)">
        <button
          v-for="t in [
            { key: 'vehicles', label: 'Vehicles' },
            { key: 'analytics', label: 'Analytics' },
            { key: 'anomalies', label: 'Alerts', count: quickAnomalies.length },
          ]" :key="t.key"
          @click="sidebarTab = t.key"
          class="flex-1 px-3 py-2.5 text-[13px] font-medium transition-all duration-200 cursor-pointer border-b-2"
          :class="sidebarTab === t.key ? 'text-lumi' : 'text-dim border-transparent'"
          :style="sidebarTab === t.key ? 'border-color:var(--text-dim)' : ''"
        >
          {{ t.label }}
          <span v-if="t.count" class="ml-1 text-[11px] px-1.5 py-0.5 rounded-full" :style="{ background: t.count > 0 ? 'rgba(255,100,100,0.1)' : 'var(--surface-raised)', color: t.count > 0 ? 'var(--status-danger)' : undefined }">{{ t.count }}</span>
        </button>
      </div>

      <!-- TAB: Vehicles -->
      <div v-if="sidebarTab === 'vehicles'" class="flex-1 overflow-y-auto">
        <div v-if="topVehicles.length" class="px-5 py-3 border-b" style="border-color:var(--border)">
          <div class="text-[13px] text-dim uppercase tracking-wider font-semibold mb-2">Top Vehicles</div>
          <div class="space-y-2">
            <div v-for="(t, i) in topVehicles" :key="i" @click="openVehicle(t.code)"
              class="flex items-center gap-3 cursor-pointer rounded-lg px-2.5 py-2 transition-all hover-raised">
              <div class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ background: t.color, boxShadow: `0 0 8px ${t.color}66` }"></div>
              <div class="flex-1 min-w-0">
                <div class="text-[16px] font-semibold truncate" style="color:var(--text-secondary)">{{ t.name }}</div>
                <div class="text-[12px] text-dim">{{ t.label }}</div>
              </div>
              <div class="text-[16px] font-mono font-semibold flex-shrink-0" :style="{ color: t.color }">{{ t.val }}</div>
            </div>
          </div>
        </div>

        <div v-for="v in sortedVehicles" :key="v.Code" @click="openVehicle(v)"
          class="px-5 py-3 cursor-pointer transition-all duration-150 hover-raised border-b group" style="border-color:var(--border)">
          <div class="flex items-center gap-3">
            <div class="w-3.5 h-3.5 rounded-full flex-shrink-0" :style="{ background: vehicleStatus(v).color, boxShadow: `0 0 10px ${vehicleStatus(v).color}88` }"/>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[17px] font-semibold truncate group-hover:text-lumi" style="color:var(--text-primary)" :title="(v.Name || v.Code) + (v.SPZ ? ' · ' + v.SPZ : '')">{{ v.Name || v.Code }}</span>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <span v-for="a in (fleet.vehicleAnomalies[v.Code] || detectAnomalies(v)).slice(0, 2)" :key="a.type"
                    class="text-[10px] px-1.5 py-0.5 rounded" :style="{ background: a.color + '15', color: a.color }" :title="a.detail">{{ a.icon }}</span>
                  <span class="text-[14px] font-semibold" :style="{ color: vehicleStatus(v).color }">{{ vehicleStatus(v).label }}</span>
                </div>
              </div>
              <div class="flex items-center gap-3 mt-0.5">
                <span class="text-[14px] text-dim">{{ v.SPZ || '—' }}</span>
                <span class="text-[14px] font-mono" style="color:var(--text-dim)">{{ v.Speed }} km/h</span>
                <span v-if="fleet.vehicleUtilization[v.Code]"
                  class="text-[11px] font-mono px-1.5 py-0.5 rounded"
                  :style="{ background: fleet.vehicleUtilization[v.Code].score > 30 ? 'var(--surface-raised)' : 'var(--surface-hover)', color: fleet.vehicleUtilization[v.Code].score > 30 ? 'var(--status-live)' : 'var(--text-muted)' }">{{ fleet.vehicleUtilization[v.Code].score }}% util</span>
                <span class="text-[13px] text-dim ml-auto">{{ ago(v.LastPositionTimestamp) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB: Analytics -->
      <div v-else-if="sidebarTab === 'analytics'" class="flex-1 overflow-y-auto">
        <div v-if="fleet.analyticsLoading" class="flex flex-col items-center justify-center py-12">
          <div class="loading-spinner mb-3"></div>
          <div class="text-[14px] text-dim">Loading fleet analytics...</div>
        </div>

        <div v-else-if="fleet.analyticsLoaded" class="p-4 space-y-4">
          <!-- Fleet Efficiency Index -->
          <div v-if="fleet.fleetEfficiency.count > 0">
            <div class="text-[13px] text-dim uppercase tracking-wider font-semibold mb-2" title="Composite score: 50% utilization + 20% trip consistency + 20% speed stability - 10% anomaly penalty">Fleet Efficiency Index</div>
            <div class="flex items-center gap-4 px-3 py-3 rounded-lg" style="background:var(--surface-hover); border:1px solid var(--border)">
              <div class="text-[36px] font-display font-bold leading-none" :style="{ color: fleet.fleetEfficiency.avgScore >= 65 ? 'var(--status-live)' : fleet.fleetEfficiency.avgScore >= 45 ? 'var(--status-moving)' : 'var(--status-danger)' }">
                {{ fleet.fleetEfficiency.avgScore }}
              </div>
              <div>
                <div class="text-[22px] font-display font-bold" :style="{ color: fleet.fleetEfficiency.avgScore >= 65 ? 'var(--status-live)' : fleet.fleetEfficiency.avgScore >= 45 ? 'var(--status-moving)' : 'var(--status-danger)' }">
                  Grade {{ fleet.fleetEfficiency.avgGrade }}
                </div>
                <div class="text-[12px] text-dim">{{ fleet.fleetEfficiency.count }} vehicles scored</div>
                <div class="text-[11px] text-dim mt-0.5">Score = utilization + stability - anomalies</div>
              </div>
            </div>
            <!-- Top efficiency ranking -->
            <div v-if="fleet.efficiencyRanking.length" class="space-y-1 mt-2">
              <div v-for="(v, i) in fleet.efficiencyRanking.slice(0, 5)" :key="v.code" @click="openVehicle(v.code)"
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all hover-raised text-[13px]">
                <span class="font-mono text-dim w-4">{{ i + 1 }}</span>
                <span class="flex-1 truncate" style="color:var(--text-secondary)">{{ v.name }}</span>
                <span class="font-mono font-semibold" :style="{ color: v.eff.score >= 65 ? 'var(--status-live)' : v.eff.score >= 45 ? 'var(--status-moving)' : 'var(--status-danger)' }">{{ v.eff.score }}</span>
                <span class="text-[11px] font-semibold px-1.5 py-0.5 rounded" :style="{ background: v.eff.grade === 'A' || v.eff.grade === 'B' ? 'rgba(13,122,13,0.1)' : 'var(--surface-raised)', color: v.eff.score >= 65 ? 'var(--status-live)' : v.eff.score >= 45 ? 'var(--status-moving)' : 'var(--text-dim)' }" :title="`Utilization: ${v.eff.utilization}% · Consistency: ${v.eff.consistency}% · Speed: ${v.eff.speedStability}% · Penalty: -${v.eff.anomalyPenalty}${v.eff.partial ? ' (partial data)' : ''}`">{{ v.eff.grade }}</span>
              </div>
            </div>
          </div>

          <!-- Utilization Forecast -->
          <div v-if="Object.keys(fleet.vehicleForecasts).length">
            <div class="text-[13px] text-dim uppercase tracking-wider font-semibold mb-2" title="Linear extrapolation from past daily km to projected next 7 days">Utilization Forecast</div>
            <div class="space-y-1.5">
              <template v-for="v in fleet.topUtilized.slice(0, 4)" :key="'fc-' + v.code">
                <div v-if="fleet.vehicleForecasts[v.code]?.confidence !== 'none'" @click="openVehicle(v.code)"
                  class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all hover-raised"
                  style="background:var(--surface-hover); border:1px solid var(--border)">
                  <div class="flex-1 min-w-0">
                    <div class="text-[14px] font-semibold truncate" style="color:var(--text-secondary)">{{ v.name }}</div>
                    <div class="text-[11px] text-dim">
                      <template v-if="fleet.vehicleForecasts[v.code]?.confidence === 'insufficient'">
                        <span style="color:var(--status-moving)">⚠ insufficient history</span>
                      </template>
                      <template v-else>
                        {{ fleet.vehicleForecasts[v.code]?.trend === 'up' ? '↑ trending up' : fleet.vehicleForecasts[v.code]?.trend === 'down' ? '↓ trending down' : '→ stable' }}
                        <span v-if="fleet.vehicleForecasts[v.code]?.confidence === 'low'" class="ml-1" style="color:var(--text-muted)">· low confidence</span>
                      </template>
                    </div>
                  </div>
                  <ForecastSparkline
                    v-if="fleet.vehicleForecasts[v.code]?.forecast?.length"
                    :past="fleet.vehicleForecasts[v.code].past"
                    :forecast="fleet.vehicleForecasts[v.code].forecast"
                    :width="140"
                    :height="36"
                  />
                  <span v-else class="text-[12px] text-dim">No forecast</span>
                </div>
              </template>
            </div>
          </div>

          <div>
            <div class="text-[13px] text-dim uppercase tracking-wider font-semibold mb-2">Top Utilized</div>
            <div class="space-y-1.5">
              <div v-for="(v, i) in fleet.topUtilized" :key="v.code" @click="openVehicle(v.code)"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all hover-raised"
                style="background:var(--surface-hover); border:1px solid var(--border)">
                <span class="text-[14px] font-mono text-dim">{{ i + 1 }}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-[15px] font-semibold truncate" style="color:var(--text-primary)">{{ v.name }}</div>
                  <div class="text-[12px] text-dim">{{ v.util.tripCount }} trips · {{ v.util.kmPerDay }} km/day</div>
                </div>
                <div class="text-[18px] font-mono font-bold" style="color:var(--status-live)">{{ v.util.score }}%</div>
              </div>
            </div>
          </div>

          <div v-if="fleet.underutilized.length">
            <div class="text-[13px] text-dim uppercase tracking-wider font-semibold mb-2">Underutilized</div>
            <div class="space-y-1.5">
              <div v-for="v in fleet.underutilized" :key="v.code" @click="openVehicle(v.code)"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all hover-raised"
                style="background:var(--surface-hover); border:1px solid var(--border)">
                <div class="flex-1 min-w-0">
                  <div class="text-[15px] font-semibold truncate" style="color:var(--text-secondary)">{{ v.name }}</div>
                  <div class="text-[12px] text-dim">{{ v.util.tripCount }} trips · {{ v.util.kmPerDay }} km/day</div>
                </div>
                <div class="text-[18px] font-mono font-bold" style="color:var(--status-danger)">{{ v.util.score }}%</div>
              </div>
            </div>
          </div>

          <div v-if="fleet.parkingHotspots.length">
            <div class="text-[13px] text-dim uppercase tracking-wider font-semibold mb-2">Parking Hotspots (7d)</div>
            <div class="space-y-1">
              <div v-for="(h, i) in fleet.parkingHotspots.slice(0, 5)" :key="i"
                class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all"
                :style="{ background: fleet.selectedHotspot === i ? 'var(--surface-raised)' : 'var(--surface-hover)', border: fleet.selectedHotspot === i ? '1px solid var(--border-strong)' : '1px solid var(--border)' }"
                @mouseenter="fleet.selectedHotspot = i"
                @mouseleave="fleet.selectedHotspot = null"
                @click="zoomToHotspot(h)">
                <span class="text-[14px] font-mono text-dim">#{{ i + 1 }}</span>
                <div class="flex-1">
                  <div class="text-[13px] font-mono text-dim">{{ h.lat.toFixed(4) }}, {{ h.lng.toFixed(4) }}</div>
                </div>
                <div class="text-[16px] font-mono font-bold" style="color:var(--status-moving)">{{ h.count }} stops</div>
              </div>
            </div>
          </div>

          <div>
            <div class="text-[13px] text-dim uppercase tracking-wider font-semibold mb-2">Utilization Distribution</div>
            <div class="flex gap-1 h-6 rounded overflow-hidden" style="background:var(--surface-hover)">
              <div v-for="(range, ri) in [
                { min: 50, color: 'var(--status-live)', label: '>50%' },
                { min: 20, max: 50, color: 'var(--status-moving)', label: '20-50%' },
                { max: 20, color: 'var(--status-danger)', label: '<20%' },
              ]" :key="ri"
                class="h-full flex items-center justify-center text-[10px] font-mono"
                :style="{
                  width: Math.max(10, fleet.utilizationRanking.filter(v => range.min && range.max ? v.util.score >= range.min && v.util.score < range.max : range.min ? v.util.score >= range.min : v.util.score < range.max).length / Math.max(fleet.utilizationRanking.length, 1) * 100) + '%',
                  background: range.color,
                  opacity: 0.35,
                  color: 'var(--text-primary)',
                }"
              >{{ fleet.utilizationRanking.filter(v => range.min && range.max ? v.util.score >= range.min && v.util.score < range.max : range.min ? v.util.score >= range.min : v.util.score < range.max).length }}</div>
            </div>
            <div class="flex gap-3 mt-1.5 text-[11px] text-dim">
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded" style="background:var(--status-live); opacity:0.5"></span> &gt;50%</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded" style="background:var(--status-moving); opacity:0.5"></span> 20-50%</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded" style="background:var(--status-danger); opacity:0.5"></span> &lt;20%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB: Anomalies -->
      <div v-else-if="sidebarTab === 'anomalies'" class="flex-1 overflow-y-auto">
        <div v-if="!quickAnomalies.length" class="flex flex-col items-center justify-center py-12 px-6 text-center">
          <div class="text-3xl mb-2">✓</div>
          <div class="text-[15px] font-semibold" style="color:var(--text-secondary)">No anomalies detected</div>
          <div class="text-[13px] text-dim mt-1">All vehicles operating within normal parameters. Anomalies include excessive speed, long idle times, night activity, and stale GPS data.</div>
        </div>
        <div v-else>
          <div v-for="(a, i) in quickAnomalies" :key="i" @click="openVehicle(a.vehicleCode)"
            class="px-4 py-3 cursor-pointer transition-all duration-150 hover-raised border-b" style="border-color:var(--border)">
            <div class="flex items-center gap-3">
              <span class="text-[16px]">{{ a.icon }}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[14px] font-semibold" :style="{ color: a.color }">{{ a.label }}</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold" :style="{ background: a.color + '15', color: a.color }">{{ a.severity }}</span>
                </div>
                <div class="text-[13px] text-dim">{{ a.vehicleName }}</div>
                <div class="text-[12px] text-dim mt-0.5">{{ a.detail }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Cache info footer -->
      <div class="px-4 py-2 border-t flex items-center gap-2 text-[11px] text-dim" style="border-color:var(--border)">
        <span v-if="cacheInfo?.lastUpdate" class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full" style="background:var(--status-live); opacity:0.6"></span>
          Data updated {{ cacheInfo.lastUpdate.toLocaleTimeString() }}
        </span>
        <span v-if="cacheInfo?.size" class="px-1.5 py-0.5 rounded text-[10px] font-mono" style="background:var(--surface-raised)">{{ cacheInfo.size }} cached</span>
        <span class="ml-auto cursor-pointer transition-colors" style="color:var(--text-muted)" @click="api.clearCache(); refreshCacheInfo()">Clear cache</span>
      </div>
    </div>

    <!-- Full screen map -->
    <div class="flex-1 relative">
      <FleetMap
        ref="mapRef"
        :vehicles="fleet.vehicles"
        :parking-hotspots="allHotspots"
        :selected-hotspot="fleet.selectedHotspot"
        height="100%"
        class="w-full h-full"
        @select="openVehicle"
      />
      <div v-if="fleet.parkingHotspots.length" class="absolute top-3 right-3 z-10 glass-strong rounded-xl px-4 py-2.5">
        <div class="text-[12px] text-dim uppercase tracking-wider mb-1">Parking Hotspots</div>
        <div class="text-[20px] font-display font-bold" style="color:var(--status-moving)">
          {{ fleet.parkingHotspots.length }}
          <span class="text-[13px] text-dim font-normal">areas (7d)</span>
        </div>
        <div class="text-[12px] text-dim mt-0.5">Most frequent: {{ fleet.parkingHotspots[0]?.count || 0 }} stops</div>
      </div>
    </div>
  </div>
</template>
