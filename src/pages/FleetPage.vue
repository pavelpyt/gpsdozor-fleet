<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useFleetStore } from '../stores/fleet'
import { vehicleStatus, ago, fmtKm, detectAnomalies } from '../lib/utils'

const router = useRouter()
const fleet = useFleetStore()

const search = ref('')
const statusFilter = ref('all')
const sortBy = ref('name')
const showAnomaliesOnly = ref(false)

const filtered = computed(() => {
  let list = [...fleet.vehicles]

  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(v =>
      (v.Name || '').toLowerCase().includes(q) ||
      (v.SPZ || '').toLowerCase().includes(q) ||
      v.Code.toLowerCase().includes(q)
    )
  }

  if (statusFilter.value !== 'all') {
    list = list.filter(v => vehicleStatus(v).key === statusFilter.value)
  }

  if (showAnomaliesOnly.value) {
    list = list.filter(v => {
      const anoms = fleet.vehicleAnomalies[v.Code] || detectAnomalies(v)
      return anoms.length > 0
    })
  }

  list.sort((a, b) => {
    switch (sortBy.value) {
      case 'name': return (a.Name || a.Code).localeCompare(b.Name || b.Code)
      case 'speed': return (b.Speed || 0) - (a.Speed || 0)
      case 'odometer': return (b.Odometer || 0) - (a.Odometer || 0)
      case 'lastSeen': return new Date(b.LastPositionTimestamp) - new Date(a.LastPositionTimestamp)
      case 'utilization': {
        const ua = fleet.vehicleUtilization[a.Code]?.score || 0
        const ub = fleet.vehicleUtilization[b.Code]?.score || 0
        return ub - ua
      }
      case 'efficiency': {
        const ea = fleet.vehicleEfficiency[a.Code]?.score || 0
        const eb = fleet.vehicleEfficiency[b.Code]?.score || 0
        return eb - ea
      }
      default: return 0
    }
  })

  return list
})

const quickStats = computed(() => {
  const moving = fleet.vehicles.filter(v => v.Speed > 0)
  const avgSpd = moving.length ? (moving.reduce((s, v) => s + v.Speed, 0) / moving.length).toFixed(0) : 0
  const anomalyVehicles = fleet.vehicles.filter(v => (fleet.vehicleAnomalies[v.Code] || detectAnomalies(v)).length > 0).length
  return {
    total: fleet.vehicles.length,
    online: fleet.stats.online,
    avgSpd,
    totalKm: fmtKm(fleet.vehicles.reduce((s, v) => s + (v.Odometer || 0), 0)),
    anomalies: anomalyVehicles,
  }
})

function open(v) {
  router.push({ name: 'vehicle', params: { code: v.Code } })
}
</script>

<template>
  <div class="flex-1 overflow-auto p-5 space-y-4">

    <!-- Quick stats -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 stagger">
      <div v-for="(s, i) in [
        { val: quickStats.total, label: 'TOTAL' },
        { val: quickStats.online, label: 'ONLINE', color: 'var(--status-live)' },
        { val: quickStats.avgSpd, label: 'AVG KM/H' },
        { val: quickStats.totalKm, label: 'FLEET KM' },
        { val: quickStats.anomalies, label: 'ALERTS', color: quickStats.anomalies > 0 ? 'var(--status-danger)' : undefined },
      ]" :key="i" class="lumi-card p-4">
        <div class="lumi-stat text-2xl" :style="{ color: s.color || 'var(--text-primary)' }">{{ s.val }}</div>
        <div class="text-[13px] text-dim uppercase tracking-[0.12em] mt-1 font-medium">{{ s.label }}</div>
      </div>
    </div>

    <!-- Table -->
    <div class="lumi-card p-5 animate-rise">
      <!-- Toolbar -->
      <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
        <span class="text-[18px] font-display font-semibold text-lumi">
          Fleet Vehicles <span class="text-dim font-normal">({{ filtered.length }})</span>
        </span>
        <div class="flex gap-2 flex-wrap items-center">
          <div class="relative">
            <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim text-[15px]">⌕</span>
            <input v-model="search" placeholder="Search name, plate..." class="lumi-input pl-8 w-56" />
          </div>
          <select v-model="statusFilter" class="lumi-select">
            <option value="all">All Status</option>
            <option value="moving">Moving</option>
            <option value="parked">Parked</option>
            <option value="offline">Offline</option>
          </select>
          <select v-model="sortBy" class="lumi-select">
            <option value="name">Sort: Name</option>
            <option value="speed">Sort: Speed</option>
            <option value="odometer">Sort: Odometer</option>
            <option value="lastSeen">Sort: Last Seen</option>
            <option value="utilization">Sort: Utilization</option>
            <option value="efficiency">Sort: Efficiency</option>
          </select>
          <button
            @click="showAnomaliesOnly = !showAnomaliesOnly"
            class="lumi-btn text-[14px]"
            :class="{ 'lumi-btn-danger': showAnomaliesOnly }"
          >
            {{ showAnomaliesOnly ? '⚠ Anomalies Only' : '⚠ Show Anomalies' }}
          </button>
        </div>
      </div>

      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr>
              <th v-for="h in ['Vehicle', 'Plate', 'Status', 'Speed', 'Odometer', 'Utilization', 'Efficiency', 'Alerts', 'Last Seen', 'Branch', '']"
                :key="h"
                class="text-left px-3.5 py-2.5 text-[13px] font-semibold text-dim uppercase tracking-[0.1em]"
                style="border-bottom: 1px solid var(--border)"
              >{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="v in filtered"
              :key="v.Code"
              @click="open(v)"
              class="cursor-pointer transition-all duration-200 group hover-highlight"
              style="border-bottom: 1px solid var(--border)"
            >
              <td class="px-3.5 py-3 max-w-[200px]">
                <div class="font-semibold text-[16px] group-hover:text-lumi transition-colors truncate" style="color:var(--text-secondary)" :title="v.Name || v.Code">
                  {{ v.Name || v.Code }}
                </div>
                <div class="text-[13px] font-mono text-dim">{{ v.Code }}</div>
              </td>
              <td class="px-3.5 py-3 text-[16px]" style="color:var(--text-secondary)">{{ v.SPZ || '—' }}</td>
              <td class="px-3.5 py-3">
                <span class="lumi-badge" :style="{ color: vehicleStatus(v).color, background: vehicleStatus(v).color + '10', boxShadow: `0 0 8px ${vehicleStatus(v).color}18` }">
                  <span class="w-2 h-2 rounded-full" :style="{ background: vehicleStatus(v).color, boxShadow: `0 0 5px ${vehicleStatus(v).color}88` }" />
                  {{ vehicleStatus(v).label }}
                </span>
              </td>
              <td class="px-3.5 py-3 text-[16px] font-mono" style="color:var(--text-secondary)">
                {{ v.Speed }} <span class="text-dim">km/h</span>
              </td>
              <td class="px-3.5 py-3 text-[16px]" style="color:var(--text-dim)">{{ fmtKm(v.Odometer) }} km</td>
              <!-- Utilization -->
              <td class="px-3.5 py-3">
                <div v-if="fleet.vehicleUtilization[v.Code]" class="flex items-center gap-2">
                  <div class="w-16 h-2 rounded-full overflow-hidden" style="background:var(--surface-raised)">
                    <div
                      class="h-full rounded-full transition-all"
                      :style="{
                        width: fleet.vehicleUtilization[v.Code].score + '%',
                        background: fleet.vehicleUtilization[v.Code].score > 50 ? 'var(--status-live)' : fleet.vehicleUtilization[v.Code].score > 20 ? 'var(--status-moving)' : 'var(--status-danger)',
                        opacity: 0.6,
                      }"
                    />
                  </div>
                  <span class="text-[14px] font-mono" :style="{
                    color: fleet.vehicleUtilization[v.Code].score > 50 ? 'var(--status-live)' : fleet.vehicleUtilization[v.Code].score > 20 ? 'var(--status-moving)' : 'var(--status-danger)',
                  }">{{ fleet.vehicleUtilization[v.Code].score }}%</span>
                </div>
                <span v-else class="text-[14px] text-dim">—</span>
              </td>
              <!-- Efficiency -->
              <td class="px-3.5 py-3">
                <div v-if="fleet.vehicleEfficiency[v.Code]?.score > 0" class="flex items-center gap-1.5" :title="`Utilization: ${fleet.vehicleEfficiency[v.Code].utilization}% | Consistency: ${fleet.vehicleEfficiency[v.Code].consistency}% | Speed stability: ${fleet.vehicleEfficiency[v.Code].speedStability}% | Anomaly penalty: -${fleet.vehicleEfficiency[v.Code].anomalyPenalty}`">
                  <span class="text-[14px] font-mono font-semibold" :style="{
                    color: fleet.vehicleEfficiency[v.Code].score >= 65 ? 'var(--status-live)' : fleet.vehicleEfficiency[v.Code].score >= 45 ? 'var(--status-moving)' : 'var(--status-danger)',
                  }">{{ fleet.vehicleEfficiency[v.Code].score }}</span>
                  <span class="text-[11px] font-semibold px-1 py-0.5 rounded" :style="{
                    background: fleet.vehicleEfficiency[v.Code].grade === 'A' ? 'rgba(13,122,13,0.1)' : fleet.vehicleEfficiency[v.Code].grade === 'B' ? 'rgba(13,122,13,0.07)' : 'var(--surface-raised)',
                    color: fleet.vehicleEfficiency[v.Code].score >= 65 ? 'var(--status-live)' : fleet.vehicleEfficiency[v.Code].score >= 45 ? 'var(--status-moving)' : 'var(--text-dim)',
                  }">{{ fleet.vehicleEfficiency[v.Code].grade }}</span>
                </div>
                <span v-else class="text-[14px] text-dim">—</span>
              </td>
              <!-- Anomalies -->
              <td class="px-3.5 py-3">
                <div class="flex gap-1 flex-wrap">
                  <span
                    v-for="a in (fleet.vehicleAnomalies[v.Code] || detectAnomalies(v)).slice(0, 3)"
                    :key="a.type"
                    class="text-[11px] px-1.5 py-0.5 rounded"
                    :style="{ background: a.color + '15', color: a.color }"
                    :title="a.detail"
                  >{{ a.icon }} {{ a.label }}</span>
                  <span v-if="!(fleet.vehicleAnomalies[v.Code] || detectAnomalies(v)).length" class="text-[13px] text-dim">—</span>
                </div>
              </td>
              <td class="px-3.5 py-3 text-[15px] text-dim">{{ ago(v.LastPositionTimestamp) }}</td>
              <td class="px-3.5 py-3 text-[15px] text-dim">{{ v.BranchName || '—' }}</td>
              <td class="px-3.5 py-3 text-dim group-hover:text-lumi transition-colors text-[16px]">&#8250;</td>
            </tr>
          </tbody>
        </table>

        <div v-if="!filtered.length" class="text-center py-16">
          <div class="text-[18px] font-semibold" style="color:var(--text-secondary)">No vehicles match your filters</div>
          <div class="text-[14px] text-dim mt-1">Try adjusting your search, status filter, or clearing the anomalies-only filter.</div>
        </div>
      </div>
    </div>
  </div>
</template>
