import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../lib/api'
import { vehicleStatus, dateRange, computeUtilization, detectAnomalies, aggregateParkingGrid, computeEfficiencyIndex, computeForecast, cleanTrips, filterPositions, sanitizeVehicle } from '../lib/utils'

export const useFleetStore = defineStore('fleet', () => {
  const groups = ref([])
  const vehicles = ref([])
  const activeGroup = ref(null)
  const loading = ref(true)
  const error = ref(null)
  const lastRefresh = ref(new Date())

  // Fleet analytics
  const analyticsLoading = ref(false)
  const analyticsLoaded = ref(false)
  const vehicleTrips = ref({})       // code -> trips[]
  const vehicleUtilization = ref({}) // code -> utilization obj
  const vehicleAnomalies = ref({})   // code -> anomalies[]
  const vehicleEfficiency = ref({})  // code -> efficiency index
  const vehicleForecasts = ref({})   // code -> forecast data
  const parkingHotspots = ref([])    // aggregated hotspots from history
  const analyticsPeriod = ref('7d')
  const selectedHotspot = ref(null)  // index of hovered/selected hotspot

  const stats = computed(() => {
    const total = vehicles.value.length
    const online = vehicles.value.filter(v => {
      const diff = (Date.now() - new Date(v.LastPositionTimestamp).getTime()) / 60000
      return diff < 60
    }).length
    const moving = vehicles.value.filter(v => v.Speed > 0).length
    const anomalyCount = Object.values(vehicleAnomalies.value).reduce((s, a) => s + a.length, 0)
    return { total, online, moving, offline: total - online, anomalyCount }
  })

  // Utilization rankings
  const utilizationRanking = computed(() => {
    return vehicles.value
      .map(v => ({
        code: v.Code,
        name: v.Name || v.Code,
        spz: v.SPZ,
        util: vehicleUtilization.value[v.Code] || { score: 0, kmPerDay: 0, tripCount: 0, totalKm: 0 },
        status: vehicleStatus(v),
      }))
      .sort((a, b) => b.util.score - a.util.score)
  })

  const topUtilized = computed(() => utilizationRanking.value.slice(0, 3))
  const underutilized = computed(() => [...utilizationRanking.value].sort((a, b) => a.util.score - b.util.score).slice(0, 3).filter(v => v.util.score < 20))

  // Efficiency ranking
  const efficiencyRanking = computed(() => {
    return vehicles.value
      .map(v => ({
        code: v.Code,
        name: v.Name || v.Code,
        eff: vehicleEfficiency.value[v.Code] || { score: 0, grade: 'N/A' },
        util: vehicleUtilization.value[v.Code] || { score: 0 },
      }))
      .filter(v => v.eff.score > 0)
      .sort((a, b) => b.eff.score - a.eff.score)
  })

  // Fleet-wide efficiency average
  const fleetEfficiency = computed(() => {
    const effs = Object.values(vehicleEfficiency.value).filter(e => e.score > 0)
    if (!effs.length) return { avgScore: 0, avgGrade: 'N/A', count: 0 }
    const avg = Math.round(effs.reduce((s, e) => s + e.score, 0) / effs.length)
    const grade = avg >= 80 ? 'A' : avg >= 65 ? 'B' : avg >= 45 ? 'C' : avg >= 25 ? 'D' : 'F'
    return { avgScore: avg, avgGrade: grade, count: effs.length }
  })

  // All anomalies flattened with vehicle info
  const allAnomalies = computed(() => {
    const list = []
    for (const v of vehicles.value) {
      const anoms = vehicleAnomalies.value[v.Code] || detectAnomalies(v) // fallback to current-state anomalies
      anoms.forEach(a => list.push({ ...a, vehicleCode: v.Code, vehicleName: v.Name || v.Code }))
    }
    return list.sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 }
      return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3)
    })
  })

  async function init() {
    loading.value = true
    error.value = null
    const grps = await api.getGroups()
    if (!grps?.length) {
      error.value = 'No groups available'
      loading.value = false
      return
    }
    groups.value = grps
    activeGroup.value = grps[0].Code
    await refresh()
    loading.value = false
  }

  async function refresh() {
    if (!activeGroup.value) return
    const vehs = await api.getVehicles(activeGroup.value)
    if (vehs) vehicles.value = vehs.map(sanitizeVehicle)
    else error.value = 'Failed to load vehicles'
    lastRefresh.value = new Date()
  }

  function getVehicle(code) {
    return vehicles.value.find(v => v.Code === code)
  }

  // Load fleet analytics (trips, utilization, anomalies, hotspots)
  async function loadAnalytics(period = '7d') {
    if (analyticsLoading.value) return
    analyticsLoading.value = true
    analyticsPeriod.value = period

    const { from, to } = dateRange(period)
    const periodDays = period === '24h' ? 1 : period === '7d' ? 7 : 30

    // Load trips for all vehicles in parallel batches of 5
    const vehs = vehicles.value
    const batchSize = 5
    const allTrips = {}

    for (let i = 0; i < vehs.length; i += batchSize) {
      const batch = vehs.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(v => api.getTrips(v.Code, from, to).then(r => [v.Code, r]))
      )
      results.forEach(([code, trips]) => {
        allTrips[code] = cleanTrips(trips || [])
      })
    }

    vehicleTrips.value = allTrips

    // Compute utilization, anomalies, efficiency, and forecasts for each vehicle
    const utils = {}
    const anomalies = {}
    const efficiencies = {}
    const forecasts = {}
    for (const v of vehs) {
      const trips = allTrips[v.Code] || []
      utils[v.Code] = computeUtilization(trips, periodDays)
      anomalies[v.Code] = detectAnomalies(v, trips)
      efficiencies[v.Code] = computeEfficiencyIndex(trips, anomalies[v.Code], periodDays)
      forecasts[v.Code] = computeForecast(trips, periodDays, 7)
    }
    vehicleUtilization.value = utils
    vehicleAnomalies.value = anomalies
    vehicleEfficiency.value = efficiencies
    vehicleForecasts.value = forecasts

    // Load parking hotspots from history of top 5 most active vehicles
    const topActive = vehs
      .filter(v => vehicleStatus(v).key !== 'offline')
      .sort((a, b) => (b.Speed || 0) - (a.Speed || 0))
      .slice(0, 5)

    if (topActive.length) {
      const codes = topActive.map(v => v.Code)
      const historyData = await api.getHistory(codes, from, to)
      if (historyData?.length) {
        const stopPoints = []
        historyData.forEach(vh => {
          if (!vh.Positions) return
          const validPos = filterPositions(vh.Positions)
          validPos.forEach(p => {
            const spd = parseFloat(p.Speed || 0)
            if (spd < 2) {
              const lat = parseFloat(p.Lat || p.Latitude)
              const lng = parseFloat(p.Lng || p.Longitude)
              stopPoints.push({ lat, lng })
            }
          })
        })
        parkingHotspots.value = aggregateParkingGrid(stopPoints)
      }
    }

    analyticsLoaded.value = true
    analyticsLoading.value = false
  }

  return {
    groups, vehicles, activeGroup, loading, error, lastRefresh, stats,
    analyticsLoading, analyticsLoaded, vehicleTrips, vehicleUtilization, vehicleAnomalies,
    vehicleEfficiency, vehicleForecasts, parkingHotspots, analyticsPeriod,
    utilizationRanking, topUtilized, underutilized, allAnomalies,
    efficiencyRanking, fleetEfficiency, selectedHotspot,
    init, refresh, getVehicle, loadAnalytics,
  }
})
