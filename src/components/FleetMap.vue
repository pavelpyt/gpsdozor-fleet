<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import L from 'leaflet'
import { vehicleStatus, ago } from '../lib/utils'

const props = defineProps({
  vehicles: { type: Array, default: () => [] },
  selectedVehicle: { type: Object, default: null },
  tripRoute: { type: Array, default: null },
  parkingHotspots: { type: Array, default: null },
  selectedHotspot: { type: Number, default: null },
  height: { type: String, default: '100%' },
})

const emit = defineEmits(['select'])

const container = ref(null)
let map = null
let layer = null
let resizeObs = null
let tileBase = null
let tileLabels = null
let themeObs = null
let hotspotCircles = []

// Default center: Prague / Czech Republic
const DEFAULT_CENTER = [50.0755, 14.4378]
const DEFAULT_ZOOM = 7

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
const DARK_LABELS = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
const LIGHT_LABELS = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png'
const ATTR = '&copy; OSM &copy; CARTO'

function isValidCoord(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' &&
    !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1) // reject 0,0 sentinel
}

function getVehicleCenter(vehicle) {
  if (!vehicle?.LastPosition) return null
  const lat = parseFloat(vehicle.LastPosition.Latitude)
  const lng = parseFloat(vehicle.LastPosition.Longitude)
  return isValidCoord(lat, lng) ? [lat, lng] : null
}

function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark'
}

function updateTiles() {
  if (!map || !tileBase || !tileLabels) return
  const isLight = getTheme() === 'light'
  tileBase.setUrl(isLight ? LIGHT_TILES : DARK_TILES)
  tileLabels.setUrl(isLight ? LIGHT_LABELS : DARK_LABELS)
}

function vehicleIcon(color, selected = false) {
  const s = selected ? 24 : 18
  const isLight = getTheme() === 'light'
  const borderColor = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)'
  return L.divIcon({
    className: '',
    iconSize: [s + 6, s + 6],
    iconAnchor: [(s + 6) / 2, (s + 6) / 2],
    html: `<div style="
      width:${s}px;height:${s}px;
      background:${color};
      border:2px solid ${borderColor};
      border-radius:50%;
      box-shadow: 0 0 ${selected ? 30 : 15}px ${color}aa, 0 0 ${selected ? 50 : 30}px ${color}55;
      transition:all 0.3s;
    "></div>`,
  })
}

function endpointIcon(label, color) {
  const isLight = getTheme() === 'light'
  const borderColor = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)'
  return L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="
      width:26px;height:26px;
      background:${color};
      border:2px solid ${borderColor};
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-family:Syne,sans-serif;
      font-size:14px;font-weight:700;color:#000;
      box-shadow: 0 0 20px ${color}88, 0 0 40px ${color}44;
    ">${label}</div>`,
  })
}

function centerOnVehicle(zoom = 13) {
  if (!map) return
  const center = getVehicleCenter(props.selectedVehicle)
  if (center) map.setView(center, zoom, { animate: true })
  else map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true })
}

function render() {
  if (!map || !layer) return
  layer.clearLayers()

  // Trip route
  if (props.tripRoute?.length) {
    const coords = props.tripRoute
      .map(p => {
        const lat = parseFloat(p.Lat || p.Latitude)
        const lng = parseFloat(p.Lng || p.Longitude)
        return isValidCoord(lat, lng) ? [lat, lng] : null
      })
      .filter(Boolean)

    if (coords.length < 2) {
      // Polyline invalid → fallback to vehicle position
      centerOnVehicle()
      // Still render vehicle marker below
    } else {
      const isLight = getTheme() === 'light'
      const lineColor = isLight ? '#333333' : '#ffffff'
      const line = L.polyline(coords, {
        color: lineColor,
        weight: 3,
        opacity: 0.6,
        smoothFactor: 1.5,
        lineCap: 'round',
      })
      layer.addLayer(line)

      // Glow line behind
      layer.addLayer(L.polyline(coords, { color: lineColor, weight: 8, opacity: 0.08, smoothFactor: 1.5 }))

      layer.addLayer(L.marker(coords[0], { icon: endpointIcon('A', '#c8ffc8') }))
      layer.addLayer(L.marker(coords[coords.length - 1], { icon: endpointIcon('B', '#ffaaaa') }))

      // Speed dots
      const step = Math.max(1, Math.floor(coords.length / 25))
      for (let i = step; i < coords.length - step; i += step) {
        const spd = props.tripRoute[i]?.Speed || 0
        const c = spd > 120 ? '#ffaaaa' : spd > 80 ? '#fff5cc' : 'rgba(255,255,255,0.5)'
        const dot = L.circleMarker(coords[i], { radius: 2.5, fillColor: c, fillOpacity: 0.7, stroke: false })
        dot.bindTooltip(`${spd} km/h`, { direction: 'top' })
        layer.addLayer(dot)
      }

      try {
        map.fitBounds(line.getBounds(), { padding: [40, 40] })
      } catch {
        centerOnVehicle()
      }
      return
    }
  }

  // Vehicle markers
  const vList = props.selectedVehicle ? [props.selectedVehicle] : props.vehicles
  if (!vList.length) {
    // No vehicles, show CZ default
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false })
    return
  }

  const bounds = L.latLngBounds([])
  vList.forEach(v => {
    if (!v.LastPosition) return
    const lat = parseFloat(v.LastPosition.Latitude)
    const lng = parseFloat(v.LastPosition.Longitude)
    if (!isValidCoord(lat, lng)) return
    const pos = [lat, lng]
    bounds.extend(pos)

    const st = vehicleStatus(v)
    const sel = props.selectedVehicle?.Code === v.Code
    const marker = L.marker(pos, { icon: vehicleIcon(st.color, sel) })

    marker.bindTooltip(`
      <div style="font-family:Satoshi,sans-serif;min-width:200px;padding:2px">
        <div style="font-weight:700;font-size:16px;margin-bottom:2px">${v.Name || v.Code}</div>
        <div style="font-size:14px;opacity:0.5">${v.SPZ || 'No plate'}</div>
        <div style="margin-top:6px;font-size:15px;display:flex;align-items:center;gap:5px">
          <span style="width:8px;height:8px;border-radius:50%;background:${st.color};display:inline-block;box-shadow:0 0 8px ${st.color}88"></span>
          ${st.label} · ${v.Speed} km/h
        </div>
        <div style="font-size:13px;opacity:0.4;margin-top:3px">Last seen ${ago(v.LastPositionTimestamp)}</div>
      </div>
    `, {
      direction: 'top',
      offset: [0, -12],
      className: 'vehicle-tooltip',
      sticky: false,
    })

    marker.on('click', () => emit('select', v))
    layer.addLayer(marker)
  })

  // Parking hotspots
  hotspotCircles = []
  if (props.parkingHotspots?.length) {
    props.parkingHotspots.forEach((h, idx) => {
      if (!isValidCoord(h.lat, h.lng)) return
      const isHistory = h.fromHistory
      const isSelected = isHistory && props.selectedHotspot === idx
      const radius = isHistory ? 12 + Math.min(h.count, 20) : 10 + Math.min(h.count * 2, 16)
      const color = isHistory ? '#ffd88c' : '#fff5cc'

      const circle = L.circleMarker([h.lat, h.lng], {
        radius: isSelected ? radius + 6 : radius,
        fillColor: color,
        fillOpacity: isSelected ? 0.4 : (isHistory ? 0.18 : 0.12),
        color,
        weight: isSelected ? 3 : (isHistory ? 1.5 : 1),
        opacity: isSelected ? 0.8 : (isHistory ? 0.4 : 0.25),
      })
      if (isHistory) hotspotCircles.push(circle)

      const label = isHistory
        ? `Most frequent parking #${idx + 1}: ${h.count} stops`
        : `Parking area (${h.count} vehicles)`
      circle.bindTooltip(label, { direction: 'top', className: 'vehicle-tooltip' })

      // Number label for history hotspots
      if (isHistory && idx < 10) {
        const marker = L.marker([h.lat, h.lng], {
          icon: L.divIcon({
            className: '',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            html: `<div style="
              width:24px;height:24px;
              background:rgba(255,220,140,0.2);
              border:1.5px solid rgba(255,220,140,0.5);
              border-radius:50%;
              display:flex;align-items:center;justify-content:center;
              font-family:JetBrains Mono,monospace;
              font-size:11px;font-weight:700;color:#ffd88c;
              text-shadow: 0 0 8px rgba(255,220,140,0.4);
            ">${idx + 1}</div>`,
          }),
          interactive: false,
        })
        layer.addLayer(marker)
      }

      layer.addLayer(circle)
    })
  }

  if (bounds.isValid()) {
    if (vList.length === 1) map.setView(bounds.getCenter(), 14, { animate: true })
    else map.fitBounds(bounds, { padding: [40, 40], animate: true })
  } else {
    // No valid vehicle positions — default to CZ
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false })
  }
}

onMounted(async () => {
  await nextTick()
  if (!container.value) return

  map = L.map(container.value, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: true,
    attributionControl: true,
  })

  const isLight = getTheme() === 'light'
  tileBase = L.tileLayer(isLight ? LIGHT_TILES : DARK_TILES, { attribution: ATTR, maxZoom: 19 }).addTo(map)
  tileLabels = L.tileLayer(isLight ? LIGHT_LABELS : DARK_LABELS, { maxZoom: 19, opacity: 0.6 }).addTo(map)
  layer = L.layerGroup().addTo(map)

  // Watch for theme changes
  themeObs = new MutationObserver(updateTiles)
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  setTimeout(() => map?.invalidateSize(), 150)

  resizeObs = new ResizeObserver(() => map?.invalidateSize())
  resizeObs.observe(container.value)

  render()
})

onUnmounted(() => {
  themeObs?.disconnect()
  resizeObs?.disconnect()
  map?.remove()
  map = null
})

watch(() => [props.vehicles, props.selectedVehicle, props.tripRoute, props.parkingHotspots], render, { deep: true })
watch(() => props.selectedHotspot, () => render())

function zoomTo(lat, lng, zoom = 16) {
  if (map) map.setView([lat, lng], zoom, { animate: true })
}

defineExpose({ zoomTo, centerOnVehicle })
</script>

<template>
  <div ref="container" class="w-full" :style="{ height }" />
</template>
