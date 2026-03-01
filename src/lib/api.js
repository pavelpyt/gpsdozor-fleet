const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'https://a1.gpsguard.eu'
const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1'
const CORS_PROXY = import.meta.env.VITE_CORS_PROXY || 'https://corsproxy.io/?'
const AUTH = `Basic ${btoa(import.meta.env.VITE_API_CREDENTIALS || '')}`

const cache = new Map()
const CACHE_TTL = 30_000
let _proxy = import.meta.env.DEV ? null : true

function url(path, proxy = false) {
  if (proxy || _proxy === true)
    return `${CORS_PROXY}${encodeURIComponent(`${API_ORIGIN}${API_BASE}${path}`)}`
  if (import.meta.env.DEV) return `${API_BASE}${path}`
  return `${API_ORIGIN}${API_BASE}${path}`
}

async function request(path, { method = 'GET', body, ttl = CACHE_TTL } = {}) {
  if (method === 'GET' && ttl > 0) {
    const c = cache.get(path)
    if (c && Date.now() - c.ts < ttl) return c.data
  }

  const opts = {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    credentials: 'omit', // Prevent browser native auth dialog on 401
  }
  if (body) opts.body = JSON.stringify(body)

  const tries = _proxy === null ? [false, true] : [!!_proxy]
  for (const proxy of tries) {
    try {
      const res = await fetch(url(path, proxy), opts)
      if (res.status === 401) {
        console.warn(`API 401 Unauthorized:`, path, '— check auth credentials')
        continue // Try next proxy mode, don't show login
      }
      if (res.status === 403) {
        console.warn(`API 403 Forbidden:`, path)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (_proxy === null) _proxy = proxy
      if (method === 'GET' && ttl > 0) cache.set(path, { data, ts: Date.now() })
      return data
    } catch (e) {
      console.warn(`API ${proxy ? 'proxy' : 'direct'} fail:`, path, e.message)
    }
  }
  console.error('All API attempts failed:', path)
  return null
}

export const api = {
  getGroups: () => request('/groups'),
  getVehicles: (group) => request(`/vehicles/group/${group}`),
  getVehicle: (code) => request(`/vehicle/${code}`),
  getHistory: (codes, from, to) => {
    // API interprets from/to as CET and shifts -1h to UTC internally,
    // but position timestamps are stored in CET with Z suffix.
    // Shift +1h to compensate so the query window matches actual position times.
    const shift = (ts) => {
      const d = new Date(typeof ts === 'string' && !ts.includes('Z') ? ts + 'Z' : ts)
      d.setHours(d.getHours() + 1)
      return d.toISOString().slice(0, 19)
    }
    const f = shift(from), t = shift(to)
    return request(`/vehicles/history/${Array.isArray(codes) ? codes.join(',') : codes}?from=${f}&to=${t}`, { ttl: 120_000 })
  },
  getTrips: (code, from, to) => request(`/vehicle/${code}/trips?from=${from}&to=${to}`, { ttl: 120_000 }),
  getRelayState: (code) => request(`/vehicle/${code}/getEngineRelayState`, { ttl: 5_000 }),
  setRelayState: (code, action) => { cache.delete(`/vehicle/${code}/getEngineRelayState`); return request(`/vehicle/${code}/setEngineRelayState/${action}`, { ttl: 0 }) },
  resetRelay: (code) => { cache.delete(`/vehicle/${code}/getEngineRelayState`); return request(`/vehicle/${code}/resetEngineRelayState`, { ttl: 0 }) },
  getSensors: (code, types, from, to) => request(`/vehicle/${code}/sensors/${Array.isArray(types) ? types.join(',') : types}?from=${from}&to=${to}`, { ttl: 60_000 }),
  getEcoDriving: (code, from, to) => request(`/vehicle/${code}/eco-driving-events?from=${from}&to=${to}`, { ttl: 120_000 }),
  getBranches: (group) => request(`/groups/${group}/branches`, { ttl: 300_000 }),
  changeBranch: (vehicleCode, branchId) => request('/vehicle/change-branch', { method: 'PUT', body: { VehicleCode: vehicleCode, BranchId: branchId }, ttl: 0 }),
  changeBranchByName: (vehicleCode, branchName) => request('/vehicle/change-branch-by-name', { method: 'PUT', body: { VehicleCode: vehicleCode, BranchName: branchName }, ttl: 0 }),
  setTripPurpose: (vehicleCode, purpose) => request('/trip-purposes', { method: 'POST', body: { VehicleCode: vehicleCode, Purpose: purpose }, ttl: 0 }),
  updateRefuelingCards: (vehicleCode, cards) => request(`/vehicle/${vehicleCode}/update-vehicle-refueling-cards`, { method: 'PUT', body: { refuelingCards: cards }, ttl: 0 }),
  // Cache introspection
  getCacheInfo: () => {
    const entries = []
    for (const [path, { ts }] of cache.entries()) {
      entries.push({ path, ts, age: Date.now() - ts })
    }
    return { entries, size: cache.size, lastUpdate: entries.length ? new Date(Math.max(...entries.map(e => e.ts))) : null }
  },
  clearCache: () => cache.clear(),
}
