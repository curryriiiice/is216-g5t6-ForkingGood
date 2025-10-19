<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import axios from 'axios'
import AddRecommendationForm from '@/components/AddRecommendationForm.vue'
import Modal from '@/components/Modal.vue'

const API_BASE = 'http://localhost:8000'
const ACTIVE_EMAIL = 'clarice.lim.2024@computing.smu.edu.sg' // TEMP: replace when auth is ready

const api = axios.create({ baseURL: API_BASE })

// --- Filter + data endpoints --- //
// Suggestions (searchable dropdowns if you later hook @search)
async function getAllCuisines(query = '') {
  try {
    const r = await api.get('/map/getAllCuisines', { params: query ? { q: query } : {} })
    return Array.isArray(r.data?.data) ? r.data.data : []
  } catch (e) {
    console.error('getAllCuisines failed:', e.response?.status, e.response?.data || e.message)
    return []
  }
}
async function getAllLocations(query = '') {
  try {
    const r = await api.get('/map/getAllLocations', { params: query ? { q: query } : {} })
    return Array.isArray(r.data?.data) ? r.data.data : []
  } catch (e) {
    console.error('getAllLocations failed:', e.response?.status, e.response?.data || e.message)
    return []
  }
}

// Unified filtered posts (friends/public + cuisine/area/price)
async function getFilteredPosts(payload) {
  try {
    const r = await api.post('/map/getFilteredPosts', payload)
    console.log('[api] getFilteredPosts payload ->', payload)
    return Array.isArray(r.data?.data) ? r.data.data : []
  } catch (e) {
    console.error('getFilteredPosts failed:', e.response?.status, e.response?.data || e.message)
    return []
  }
}

const route = useRoute()
const router = useRouter()

function clearRestaurantQuery() {
  const q = { ...route.query }
  delete q.restaurant
  router.replace({ query: q })
}

// --- FILTERS --- //

// Master options (populated from backend endpoints)
const cuisines = ref(['All'])
const areas = ref(['All'])

// Current selections
const selectedCuisine = ref('All')
const selectedArea = ref('All')
const selectedPrice = ref('All') // 'All' | '$' | '$$' | '$$$' | '$$$$'
const feedScope = ref('friends') // 'friends' | 'public'

// Lock UI when a drawer is open
const uiLocked = computed(() => !!(selected.value || showAdd.value))
/** Extract a rough "area" from an address.
 *  Heuristic: take the first comma-part (e.g. "Tiong Bahru Plaza, ...")
 *  Tweak this to match your addresses better if needed.
 */
function inferArea(address = '', pinArea = '') {
  if (pinArea) return pinArea
  const first = String(address).split(',')[0]?.trim()
  return first || 'Unknown'
}

// --- Tooltip initializer (Bootstrap 5 if available) ---
function initTooltips() {
  try {
    const Tooltip = window.bootstrap?.Tooltip // works if bootstrap.bundle.js is loaded
    const els = document.querySelectorAll('[data-bs-toggle="tooltip"]')
    if (Tooltip && els.length) {
      els.forEach((el) => {
        const existing = Tooltip.getInstance?.(el)
        if (existing) existing.dispose() // avoid duplicates on HMR/rerender
        new Tooltip(el)
      })
    }
    // If Bootstrap JS isn't present, the native browser tooltip still works via `title`.
  } catch (e) {
    console.warn('[tooltip] init failed (fallback to native title)', e)
  }
}
// ===== Price helpers (strict, up to 4 dollars) =====
function priceSymbolToIndex(sym) {
  if (!sym) return null
  const s = String(sym)
  const table = ['$', '$$', '$$$', '$$$$']
  const idx = table.indexOf(s)
  return idx >= 0 ? idx : null
}
function normalizePriceIndex(v) {
  if (v == null) return null
  const str = String(v)
  // Symbol '$'..'$$$$' → 0..3
  if (/^\$+$/.test(str)) {
    const idx = str.length - 1
    return idx >= 0 && idx <= 3 ? idx : null
  }
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  // Prefer 1-based encodings first (1..4 → 0..3; 1..3 → 0..2)
  if (n >= 1 && n <= 4) return n - 1
  if (n >= 1 && n <= 3) return n - 1
  // Fallback: 0..3 direct indices
  if (n >= 0 && n <= 3) return n
  return null
}

/** Cuisine options from backend */
const cuisineOptions = computed(() => cuisines.value)

/** Area options derived from pins */
const areaOptions = computed(() => areas.value)

/** Pins after applying filters */
const filteredPins = computed(() => pins.value)

watch([feedScope, selectedCuisine, selectedArea, selectedPrice], async () => {
  selectedPost.value = null
  selected.value = null
  await loadPinsFromFilters()
})

// Load pins based on current filter selections using /map/getFilteredPosts
async function loadPinsFromFilters() {
  console.log(
    '[filters] scope:',
    feedScope.value,
    'cuisine:',
    selectedCuisine.value,
    'area:',
    selectedArea.value,
    'price:',
    selectedPrice.value,
  )

  // Build payload: omit "All" keys, include both legacy and new fields for compatibility
  const payload = {
    user_email: ACTIVE_EMAIL,

    // scope semantics:
    //  - 'friends' => friends' private + public
    //  - 'public'  => everyone public
    friends: feedScope.value === 'friends',
    scope: feedScope.value,
  }

  // Only include filters if they're not "All"
  if (selectedArea.value && selectedArea.value !== 'All') {
    payload.area = selectedArea.value
  }
  if (selectedCuisine.value && selectedCuisine.value !== 'All') {
    payload.cuisine_type = selectedCuisine.value // common key
    payload.cuisine = selectedCuisine.value // alt key if BE uses `cuisine`
  }
  if (selectedPrice.value && selectedPrice.value !== 'All') {
    const sym = selectedPrice.value
    const idx = priceSymbolToIndex(sym) // 0..3
    payload.price_symbol = sym
    if (idx !== null) {
      // Send multiple exact-match hints for diverse backends
      payload.price_range = idx // 0..3
      payload.price_range_eq = idx // exact
      payload.price_level_eq = idx + 1 // some use 1..4
      payload.price_eq = idx + 1 // fallback exact
    }
  }

  const rows = await getFilteredPosts(payload)
  console.log('[api] rows returned:', rows.length, rows[0])

  // Strict FE price filter so $$$ and $$$$ are never grouped
  let filteredRows = rows
  if (selectedPrice.value && selectedPrice.value !== 'All') {
    const want = priceSymbolToIndex(selectedPrice.value)
    if (want !== null) {
      filteredRows = rows.filter((r) => {
        const cand = [r.price_range, r.price_level, r.price, r.price_symbol]
        for (const v of cand) {
          const have = normalizePriceIndex(v)
          if (have !== null) return have === want
        }
        return false // drop unknown-price rows for strictness
      })
    }
  }

  if (!filteredRows.length) {
    console.warn('[pins] No rows for filters:', {
      scope: feedScope.value,
      cuisine: selectedCuisine.value,
      area: selectedArea.value,
      price: selectedPrice.value,
    })
  }

  // 1) Group rows by restaurant_id → postsByRestaurant
  const groups = new Map()

  for (const r of filteredRows) {
    const lat = Number(r.lat ?? r.latitude)
    const lng = Number(r.long ?? r.lng ?? r.longitude ?? r.longtitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const restaurantId = r.restaurant_id || r.restaurantId || r.restaurant_name || r.name
    const restaurantName = r.restaurant_name || r.name || String(restaurantId || '')
    const address = r.address || ''
    const area = r.area || inferArea(address || '')
    const cuisine = r.cuisine_type || 'Unknown'

    // Normalize a post object for the drawer list
    const post = {
      id: r.postid || r.post_id,
      rating: Number(r.rating ?? 0),
      text: r.review || '',
      photos: Array.isArray(r.pictures) ? r.pictures : [],
      raw: {
        created_at: r.created_at,
        public: r.public ?? r['public?'] ?? true,
        upvote_count: r.upvote_count ?? 0,
        user_has_upvoted: r.user_has_upvoted ?? false,
        comments: r.comments ?? [],
      },
      user: { id: r.poster_username, name: r.poster_username, username: r.poster_username },
      restaurant: {
        id: restaurantId,
        name: restaurantName,
        address,
        cuisine_type: cuisine,
        latitude: lat,
        longitude: lng,
      },
    }

    if (!groups.has(restaurantId)) groups.set(restaurantId, [])
    groups.get(restaurantId).push(post)
  }

  // 2) Convert groups → unique pins (one per restaurant), using first post as the representative
  const nextPins = []
  for (const [restaurantId, posts] of groups.entries()) {
    const first = posts[0]
    nextPins.push({
      restaurant_id: restaurantId,
      post_id: first.id, // representative post for the View button id
      name: first.restaurant.name || String(restaurantId),
      address: first.restaurant.address || '',
      // ✅ derive area from the representative post's address
      area: inferArea(first.restaurant.address || ''),
      cuisine: first.restaurant.cuisine_type || 'Unknown',
      position: { lat: Number(first.restaurant.latitude), lng: Number(first.restaurant.longitude) },
      by: first.user?.username || first.user?.name || first.user?.id,
      rating: Number(first.rating ?? 0),
      photo: first.photos?.[0] || null,
      post: first, // keep the representative post
    })
  }

  // Build an index postId -> restaurantId so we can jump from a post to its marker quickly
  const idx = new Map()
  for (const [rid, posts] of groups.entries()) {
    for (const p of posts) {
      if (p?.id) idx.set(String(p.id), rid)
    }
  }
  postIdToRestaurantId.value = idx

  // 3) Commit the groups so the drawer has posts
  postsByRestaurant.value = groups

  pins.value = nextPins

  // Optional enrich (kept from your existing codebase)
  await enrichPinsWithPlaces(pins.value)
  await enrichPinsWithAreas(pins.value)

  await rebuildMarkers()
  await fitMapToFilteredPins()
}

async function focusPostOnMap(postId, { openDrawer = true } = {}) {
  const id = String(postId || '')
  if (!id) return

  // Find the restaurant for this post
  const rid = postIdToRestaurantId.value.get(id)

  // Fallback: scan if index is missing (should be rare)
  let restaurantId = rid
  if (!restaurantId && postsByRestaurant?.value instanceof Map) {
    for (const [rKey, posts] of postsByRestaurant.value.entries()) {
      if (posts.some((p) => String(p.id) === id)) {
        restaurantId = rKey
        break
      }
    }
  }
  if (!restaurantId) {
    console.warn('[map] post not found in index:', id)
    return
  }

  // Find the corresponding pin
  const pin = pins.value.find((p) => String(p.restaurant_id) === String(restaurantId))
  if (!pin) {
    console.warn('[map] pin not found for restaurant:', restaurantId)
    return
  }

  // Select it, populate drawer posts, and center/zoom
  selected.value = pin
  selectedPosts.value = postsByRestaurant.value.get(restaurantId) || []

  try {
    // Center and zoom (tweak zoom as you like)
    if (map?.value) {
      map.value.panTo(pin.position)
      if (map.value.getZoom && map.value.setZoom) {
        const z = map.value.getZoom()
        if (typeof z === 'number' && z < 16) map.value.setZoom(16)
      }
    }
  } catch (e) {
    console.warn('[map] pan/zoom failed', e)
  }

  // Optionally open your side drawer if you gate it behind a flag
  if (openDrawer && typeof showDetails === 'function') {
    // If you have a function to open a drawer, call it here.
  }
}

async function rebuildMarkers() {
  await nextTick()
  if (!map.value) return

  // Sweep and remove any orphan markers that aren't tracked in markers.value
  console.log('[rebuild] sweeping ALL_MARKERS:', ALL_MARKERS.size)
  ALL_MARKERS.forEach((m) => m && m.setMap && m.setMap(null))
  ALL_MARKERS.clear()

  // clear existing (tracked) markers
  console.log('[rebuild] clearing', markers.value.length, 'markers')
  markers.value.forEach((m) => m.setMap(null))
  markers.value = []

  const { Marker: GMarker } = await google.maps.importLibrary('marker')
  addPinsWith(GMarker) // this reads filteredPins
  console.log(
    '[rebuild] added',
    markers.value.length,
    'markers for',
    filteredPins.value.length,
    'filtered pins',
  )
  console.log('[rebuild] will place', filteredPins.value.length, 'pins')
}

/* -----------------
   Map + data state
------------------*/
const mapEl = ref(null)
const map = ref(null)
const markers = ref([])
// Track every Google Marker ever created (survives HMR), so we can fully clear
const ALL_MARKERS = (window.__ALL_MARKERS ||= new Set())
const infoWindow = ref(null)
const loading = ref(true)
const error = ref('')

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const userPos = ref(null)

const pins = ref([]) // unique restaurants
const postsByRestaurant = ref(new Map()) // restaurant_id -> posts[]
const postIdToRestaurantId = ref(new Map())
const feedPosts = ref([]) // flat posts

// Cache for Google Places lookups
const placeCache = new Map() // placeId -> { name, address }

// Cache for reverse-geocoded areas (neighborhoods)
const areaCache = new Map() // key: "lat,lng" (rounded) -> area string

/* -----------------
   Selection/drawers
------------------*/
const selected = ref(null) // selected pin (for reference)
const selectedPost = ref(null) // post shown in the “view post” drawer
const showAdd = ref(false)
const selectedPosts = ref([]) // all posts for the selected restaurant

// Typeahead state for Cuisine and Area
const taCuisine = ref({
  q: '',
  items: [],
  open: false,
  loading: false,
  noMatch: false,
  suppressOpen: false,
})
const taArea = ref({
  q: '',
  items: [],
  open: false,
  loading: false,
  noMatch: false,
  suppressOpen: false,
})

function chooseCuisine(v) {
  selectedCuisine.value = v
  taCuisine.value.q = v
  taCuisine.value.suppressOpen = true
  taCuisine.value.open = false
}
function chooseArea(v) {
  selectedArea.value = v
  taArea.value.q = v
  taArea.value.suppressOpen = true
  taArea.value.open = false
}

// Debounced fetchers
const fetchCuisineHints = debounce(async () => {
  const q = taCuisine.value.q?.trim()
  if (!q) {
    taCuisine.value.items = []
    taCuisine.value.noMatch = false
    return
  }
  taCuisine.value.loading = true
  try {
    const list = await getAllCuisines(q)
    taCuisine.value.items = Array.isArray(list) ? list : []
    taCuisine.value.noMatch = taCuisine.value.items.length === 0
  } catch (e) {
    console.warn('[typeahead] cuisines failed', e)
    taCuisine.value.items = []
    taCuisine.value.noMatch = true
  } finally {
    taCuisine.value.loading = false
  }
}, 250)

const fetchAreaHints = debounce(async () => {
  const q = taArea.value.q?.trim()
  if (!q) {
    taArea.value.items = []
    taArea.value.noMatch = false
    return
  }
  taArea.value.loading = true
  try {
    const list = await getAllLocations(q)
    taArea.value.items = Array.isArray(list) ? list : []
    taArea.value.noMatch = taArea.value.items.length === 0
  } catch (e) {
    console.warn('[typeahead] areas failed', e)
    taArea.value.items = []
    taArea.value.noMatch = true
  } finally {
    taArea.value.loading = false
  }
}, 250)

/* -----------------
   Map options
------------------*/
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  gestureHandling: 'greedy',
}

/* -----------------
   Load Maps script
------------------*/
async function ensureMapsApiLoaded(key) {
  if (window.google?.maps?.importLibrary) return
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly&libraries=places`
    s.async = true
    s.defer = true
    s.onload = resolve
    s.onerror = () => reject(new Error('Failed to load Google Maps JS API'))
    document.head.appendChild(s)
  })
}

/* -----------------
   Lifecycle
------------------*/
function closePostDrawer() {
  // Clear selection state first so the drawer unmounts immediately
  selectedPost.value = null
  selected.value = null
  selectedPosts.value = []

  // Close any open Google Maps InfoWindow (defensive)
  try {
    infoWindow.value && infoWindow.value.close && infoWindow.value.close()
  } catch {}

  // Defer query cleanup to avoid fighting with route watchers during unmount
  nextTick(() => clearRestaurantQuery())
}
function onBackdropClick() {
  if (showAdd.value) return closeCreateDrawer()
  return closePostDrawer()
}

function closeCreateDrawer() {
  showAdd.value = false
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (showAdd.value) return closeCreateDrawer()
    closePostDrawer()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  init()
  nextTick(() => initTooltips())
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

watch(
  () => route.query.restaurant,
  (rid) => {
    if (rid && pins.value.length && map.value) {
      focusRestaurant(String(rid), { openDrawer: true })
    }
  },
)

watch(
  () => route.query.postId,
  async (newId) => {
    if (!newId) return
    // Ensure pins have been loaded at least once
    if (!pins.value.length) {
      await loadPinsFromFilters()
    }
    await focusPostOnMap(String(newId), { openDrawer: true })

    // Optional: clear the query after focusing so back/forward feels clean
    const q = { ...route.query }
    delete q.postId
    router.replace({ query: q })
  },
  { immediate: true },
)

watch(
  () => taCuisine.value.q,
  () => {
    if (taCuisine.value.suppressOpen) {
      taCuisine.value.open = false
      taCuisine.value.suppressOpen = false
      return
    }
    taCuisine.value.open = !!taCuisine.value.q
    fetchCuisineHints()
  },
)
watch(
  () => taArea.value.q,
  () => {
    if (taArea.value.suppressOpen) {
      taArea.value.open = false
      taArea.value.suppressOpen = false
      return
    }
    taArea.value.open = !!taArea.value.q
    fetchAreaHints()
  },
)

// Keep inputs synced when filters change programmatically (e.g., Clear)
watch(selectedCuisine, (v) => {
  if (!taCuisine.value.open) taCuisine.value.q = v === 'All' ? '' : v
})
watch(selectedArea, (v) => {
  if (!taArea.value.open) taArea.value.q = v === 'All' ? '' : v
})
watch([selectedPrice, uiLocked], () => nextTick(() => initTooltips()))

// Unified POST for /user/getPostbyId
async function getPostById(postId) {
  const { data } = await api.post('/user/getPostbyId', { post_id: String(postId) })
  const row = Array.isArray(data?.data) ? data.data[0] : data?.data
  return row || null
}
// Shared coordinate validator (used in init() and refreshPinsAndMarkers())
function isValidCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}
const parseNum = (v) => (v === '' || v == null ? NaN : Number(v))
// Try to normalize obviously-bad coordinates that sometimes appear from the DB
// Heuristics:
// 1) If values look like microdegrees (|v| > 1000 but < 1e8), divide by 1e6
// 2) If swapping lat/lng makes them valid, swap
function normalizeCoords(latRaw, lngRaw) {
  let lat = Number(latRaw)
  let lng = Number(lngRaw)

  const fixMicro = (v) =>
    Number.isFinite(v) && Math.abs(v) > 1000 && Math.abs(v) < 1e8 ? v / 1e6 : v
  lat = fixMicro(lat)
  lng = fixMicro(lng)

  if (!isValidCoord(lat, lng) && isValidCoord(lng, lat)) {
    // looks swapped; fix it
    const t = lat
    lat = lng
    lng = t
  }

  return { lat, lng, ok: isValidCoord(lat, lng) }
}

// Enrich pin names/addresses using Google Places Details for Place IDs (e.g., starting with "ChI...")
async function enrichPinsWithPlaces(pinArr) {
  if (!map.value || !window.google?.maps?.places) return
  const svc = new google.maps.places.PlacesService(map.value)

  const needs = pinArr.filter(
    (p) =>
      (!p.name || p.name === 'Unknown' || p.name === p.restaurant_id) &&
      String(p.restaurant_id).startsWith('ChI'),
  )

  for (const p of needs) {
    const pid = String(p.restaurant_id)
    if (placeCache.has(pid)) {
      const cached = placeCache.get(pid)
      p.name = cached.name || p.name
      p.address = cached.address || p.address
      continue
    }

    // Wrap PlacesService.getDetails in a Promise for sequential requests to avoid OVER_QUERY_LIMIT
    /* eslint-disable no-await-in-loop */
    await new Promise((resolve) => {
      svc.getDetails({ placeId: pid, fields: ['name', 'formatted_address'] }, (res, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && res) {
          const record = { name: res.name, address: res.formatted_address }
          placeCache.set(pid, record)
          p.name = record.name || p.name
          p.address = record.address || p.address
        } else {
          console.warn('[places] getDetails failed', pid, status)
        }
        resolve()
      })
    })
    /* eslint-enable no-await-in-loop */
  }
}

// Reverse geocode each pin to derive a generic area name (Bugis, Hougang, etc.)
async function enrichPinsWithAreas(pinArr) {
  if (!map.value || !window.google?.maps?.Geocoder) return
  const geocoder = new google.maps.Geocoder()

  const targets = pinArr.filter(
    (p) =>
      !p.area && p.position && Number.isFinite(p.position.lat) && Number.isFinite(p.position.lng),
  )

  for (const p of targets) {
    const key = `${p.position.lat.toFixed(4)},${p.position.lng.toFixed(4)}`
    if (areaCache.has(key)) {
      p.area = areaCache.get(key)
      continue
    }
    /* eslint-disable no-await-in-loop */
    await new Promise((resolve) => {
      geocoder.geocode({ location: p.position }, (results, status) => {
        if (status === 'OK' && Array.isArray(results) && results.length) {
          const comps = results[0].address_components || []
          const pick = (type) => comps.find((c) => c.types.includes(type))?.long_name
          let areaName =
            pick('neighborhood') ||
            pick('sublocality_level_1') ||
            pick('sublocality') ||
            pick('locality') ||
            ''
          if (!areaName) {
            areaName = String(results[0].formatted_address || '')
              .split(',')[0]
              .trim()
          }
          p.area = areaName || 'Unknown'
          areaCache.set(key, p.area)
        } else {
          console.warn('[geocode] failed', p, status)
          p.area = p.area || 'Unknown'
          areaCache.set(key, p.area)
        }
        resolve()
      })
    })
    /* eslint-enable no-await-in-loop */
  }
}

/* -----------------
   Init / data load
------------------*/

async function init() {
  try {
    // 1) Load dropdown suggestions
    const cuisineList = await getAllCuisines()
    cuisines.value = ['All', ...cuisineList]

    const areaList = await getAllLocations()
    areas.value = ['All', ...areaList]

    // Reset filter defaults and load pins
    selectedCuisine.value = 'All'
    selectedArea.value = 'All'
    selectedPrice.value = 'All'
    feedScope.value = 'friends'

    // prime inputs
    taCuisine.value.q = ''
    taArea.value.q = ''

    await loadPinsFromFilters()

    console.log('[init] initial pins', pins.value)

    // 2) user location
    userPos.value = await getUserLocation()

    if (!apiKey) {
      error.value = 'Missing Google Maps API key. Set VITE_GOOGLE_MAPS_API_KEY in your .env file.'
      loading.value = false
      return
    }

    // 3) ensure container
    await nextTick()
    if (!mapEl.value) {
      error.value = 'Map container not mounted.'
      loading.value = false
      return
    }

    // 4) load google
    await ensureMapsApiLoaded(apiKey)
    const { Map: GMap, InfoWindow: GInfoWindow } = await google.maps.importLibrary('maps')
    const { Marker: GMarker } = await google.maps.importLibrary('marker')

    // 5) create map
    map.value = new GMap(mapEl.value, {
      ...mapOptions,
      center: userPos.value ?? { lat: 1.3521, lng: 103.8198 },
      zoom: 15,
    })

    // 7) pins
    infoWindow.value = new GInfoWindow()
    // Try to resolve restaurant names/addresses from Place IDs
    await enrichPinsWithPlaces(pins.value)
    await enrichPinsWithAreas(pins.value)

    // ensure filtered view renders markers according to defaults
    await rebuildMarkers()

    // deep link
    const rid = route.query.restaurant
    if (rid) focusRestaurant(rid, { openDrawer: true })

    loading.value = false
  } catch (e) {
    console.error(e)
    error.value = 'Failed to load map.'
    loading.value = false
  }
}

/* -----------------
   Markers & focus
------------------*/
function addPinsWith(GMarker) {
  console.log('[markers] filteredPins', filteredPins.value)

  for (const pin of filteredPins.value) {
    const marker = new GMarker({
      position: pin.position,
      map: map.value,
      title: `${pin.name} • ${pin.cuisine}`,
    })
    marker.addListener('click', () => {
      const html = renderInfoWindow(pin)
      infoWindow.value.setContent(html)
      infoWindow.value.open({ anchor: marker, map: map.value })

      google.maps.event.addListenerOnce(infoWindow.value, 'domready', () => {
        const id = `view-post-btn-${pin.post_id || pin.restaurant_id}`
        const btn = document.getElementById(id)
        if (!btn) {
          console.warn('[infoWindow] view-post button not found for', id, pin)
          return
        }
        btn.addEventListener('click', () => {
          selected.value = pin
          selectedPost.value = null
          selectedPosts.value = postsByRestaurant.value.get(pin.restaurant_id) || []
          infoWindow.value.close()
        })
      })
    })
    ALL_MARKERS.add(marker)
    markers.value.push(marker)
  }
}

function focusRestaurant(restaurantId, { openDrawer = false } = {}) {
  const pin = pins.value.find((p) => String(p.restaurant_id) === String(restaurantId))
  if (!pin || !map.value) return
  map.value.setCenter(pin.position)
  map.value.setZoom(16)

  if (openDrawer) {
    selected.value = pin
    selectedPost.value = null
    selectedPosts.value = postsByRestaurant.value.get(pin.restaurant_id) || []
    return
  } else {
    const marker = markers.value.find((m) => {
      const pos = m.getPosition()
      return pos?.lat() === pin.position.lat && pos?.lng() === pin.position.lng
    })
    if (marker) {
      const html = renderInfoWindow(pin)
      infoWindow.value.setContent(html)
      infoWindow.value.open({ anchor: marker, map: map.value })
    }
  }
}

function openDrawerFor(restaurantId) {
  const firstPin = pins.value.find((p) => String(p.restaurant_id) === String(restaurantId))
  if (firstPin) {
    selected.value = firstPin
    selectedPost.value = null
    selectedPosts.value = postsByRestaurant.value.get(firstPin.restaurant_id) || []
    return
  }

  // Fallback to the grouped map (if present)
  const arr = postsByRestaurant.value.get(restaurantId) || []
  selected.value = arr[0]?.restaurant
    ? {
        restaurant_id: restaurantId,
        name: arr[0].restaurant.name || restaurantId,
        address: arr[0].restaurant.address || '',
        cuisine: arr[0].restaurant.cuisine_type || 'Unknown',
        position: {
          lat: Number(arr[0].restaurant.latitude) || 0,
          lng: Number(arr[0].restaurant.longitude) || 0,
        },
      }
    : null
  selectedPost.value = null
  selectedPosts.value = arr
}

function renderInfoWindow(pin) {
  const id = `view-post-btn-${pin.post_id || pin.restaurant_id}`
  const photo = pin.photo
    ? `<img src="${pin.photo}" alt="" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:8px;" />`
    : ''
  return `
    <div class="map-info">
      ${photo}
      <div class="title">${escapeHtml(pin.name)}</div>
      <div class="meta">${escapeHtml(pin.cuisine)} • ${escapeHtml(pin.address || '')}</div>
      <div class="rating">
        ⭐ ${Number(pin.rating).toFixed(1)}
        <span style="color: var(--ink-400); font-weight: 500;"></span>
      </div>
      <button id="${id}">View post</button>
    </div>
  `
}

function goToPost(postId) {
  if (!postId) return
  // quick visual feedback by briefly dimming the drawer
  const drawer = document.querySelector('aside.side')
  if (drawer) {
    drawer.classList.add('clicking')
    setTimeout(() => drawer.classList.remove('clicking'), 180)
  }
  // Navigate to Dashboard with a query param the home page can use to highlight/scroll
  router.push({ path: '/dashboard', query: { postId: String(postId) } })
}

/* -----------------
   Refresh after add
------------------*/
// 🔁 Re-fetch feed, rebuild postsByRestaurant, rebuild pins from real lat/lng, and redraw markers
async function refreshPinsAndMarkers() {
  await loadPinsFromFilters()
  await rebuildMarkers()
  await fitMapToFilteredPins()
}

// Called when the form emits "added"
async function handleAdded() {
  showAdd.value = false
  await refreshPinsAndMarkers()
  // Optionally fit to filtered pins after refresh
  await fitMapToFilteredPins()
}

/* -----------------
   Helpers
------------------*/
function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}

function escapeHtml(str = '') {
  return String(str).replace(
    /[&<>"']/g,
    (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[s],
  )
}

// Simple debounce helper
function debounce(fn, wait = 250) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}

/* Drawer helpers (likes/comments) */
const liked = computed(() => Boolean(selectedPost.value?.raw?.user_has_upvoted))
const likeCount = computed(() =>
  Number(selectedPost.value?.likes ?? selectedPost.value?.raw?.upvote_count ?? 0),
)
const commentItems = computed(() => selectedPost.value?.raw?.comments ?? [])

async function toggleLike() {
  if (!selectedPost.value) return
  try {
    const cur = selectedPost.value
    const already = Boolean(cur.raw?.user_has_upvoted)
    cur.raw.user_has_upvoted = !already
    cur.likes = (cur.likes ?? cur.raw?.upvote_count ?? 0) + (already ? -1 : +1)
    await api.post('/upvotes/toggle', { recommendation_id: cur.id })
  } catch (e) {
    console.error('toggle like failed', e)
  }
}

async function fitMapToFilteredPins() {
  await nextTick()
  if (!map.value || !filteredPins.value.length) return

  // Build bounds that include all filtered pins
  const { LatLngBounds } = await google.maps.importLibrary('core')
  const bounds = new LatLngBounds()

  filteredPins.value.forEach((p) => bounds.extend(p.position))

  // If only 1 pin, center & zoom nicely; else fit all
  if (filteredPins.value.length === 1) {
    map.value.setCenter(filteredPins.value[0].position)
    map.value.setZoom(16)
  } else {
    map.value.fitBounds(bounds, 80) // padding px
  }
}

function clearFilters() {
  selectedCuisine.value = 'All'
  selectedArea.value = 'All'
  selectedPrice.value = 'All'
  feedScope.value = 'friends'

  // reset typeahead inputs and close lists
  taCuisine.value.q = ''
  taArea.value.q = ''
  taCuisine.value.open = false
  taArea.value.open = false
  taCuisine.value.suppressOpen = false
  taArea.value.suppressOpen = false

  rebuildMarkers().then(() => fitMapToFilteredPins())
}
</script>

<template>
  <div class="page sage-bg">
    <!-- Map -->
    <div ref="mapEl" class="map sage-map"></div>

    <!-- Responsive Filter Bar (Bootstrap + Vue bindings preserved) -->
    <div
      class="position-absolute top-0 start-50 translate-middle-x mt-3 w-100"
      style="z-index: 95; max-width: 920px"
    >
      <div
        :class="[
          'card border-0 shadow rounded-4 glass sage-glass',
          { 'pe-none': uiLocked, 'opacity-75': uiLocked },
        ]"
      >
        <div class="card-body py-3 px-3 px-md-4">
          <!-- Row 1: Typeaheads -->
          <div class="row g-3 align-items-end">
            <!-- Cuisine typeahead -->
            <div class="col-12 col-md-6 col-lg-4 position-relative">
              <label class="form-label mb-1 small fw-semibold text-secondary">Cuisine</label>
              <input
                class="form-control form-control-sm text-start"
                placeholder="Type to search (e.g. Japanese)"
                v-model="taCuisine.q"
                @focus="taCuisine.open = !!taCuisine.q"
                :disabled="uiLocked"
                :aria-disabled="uiLocked ? 'true' : null"
                @input="taCuisine.open = !!taCuisine.q"
              />
              <ul
                v-if="taCuisine.open"
                class="dropdown-menu show w-100 shadow-sm"
                style="max-height: 260px; overflow: auto; z-index: 1200"
              >
                <li>
                  <button
                    type="button"
                    class="dropdown-item text-muted"
                    @click="chooseCuisine('All')"
                  >
                    Show all cuisines
                  </button>
                </li>
                <li v-if="taCuisine.loading" class="dropdown-item disabled">Loading…</li>
                <li v-for="(c, i) in taCuisine.items" :key="'c-' + i">
                  <button
                    type="button"
                    class="dropdown-item"
                    @click="chooseCuisine(c.name || c.cuisine || c)"
                  >
                    {{ c.name || c.cuisine || c }}
                  </button>
                </li>
                <li v-if="taCuisine.noMatch" class="dropdown-item disabled text-muted">No match</li>
              </ul>
            </div>

            <!-- Area typeahead -->
            <div class="col-12 col-md-6 col-lg-4 position-relative">
              <label class="form-label mb-1 small fw-semibold text-secondary">Area</label>
              <input
                class="form-control form-control-sm text-start"
                placeholder="Type to search (e.g. Bugis)"
                v-model="taArea.q"
                @focus="taArea.open = !!taArea.q"
                :disabled="uiLocked"
                :aria-disabled="uiLocked ? 'true' : null"
                @input="taArea.open = !!taArea.q"
              />
              <ul
                v-if="taArea.open"
                class="dropdown-menu show w-100 shadow-sm"
                style="max-height: 260px; overflow: auto; z-index: 1200"
              >
                <li>
                  <button type="button" class="dropdown-item text-muted" @click="chooseArea('All')">
                    Show all areas
                  </button>
                </li>
                <li v-if="taArea.loading" class="dropdown-item disabled">Loading…</li>
                <li v-for="(a, i) in taArea.items" :key="'a-' + i">
                  <button
                    type="button"
                    class="dropdown-item"
                    @click="chooseArea(a.name || a.area || a)"
                  >
                    {{ a.name || a.area || a }}
                  </button>
                </li>
                <li v-if="taArea.noMatch" class="dropdown-item disabled text-muted">No match</li>
              </ul>
            </div>

            <!-- Price chips -->
            <div class="col-12 col-lg-4">
              <label class="form-label mb-1 small fw-semibold text-secondary">Price Range</label>
              <div class="d-flex gap-2 flex-wrap">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary price-chip"
                  :class="{ active: selectedPrice === '$' }"
                  @click="selectedPrice = '$'"
                  data-bs-toggle="tooltip"
                  title="Under $10 per person"
                  :disabled="uiLocked"
                >
                  $
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary price-chip"
                  :class="{ active: selectedPrice === '$$' }"
                  @click="selectedPrice = '$$'"
                  data-bs-toggle="tooltip"
                  title="$10–$30 per person"
                  :disabled="uiLocked"
                >
                  $$
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary price-chip"
                  :class="{ active: selectedPrice === '$$$' }"
                  @click="selectedPrice = '$$$'"
                  data-bs-toggle="tooltip"
                  title="$30–$60 per person"
                  :disabled="uiLocked"
                >
                  $$$
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary price-chip"
                  :class="{ active: selectedPrice === '$$$$' }"
                  @click="selectedPrice = '$$$$'"
                  data-bs-toggle="tooltip"
                  title="$60+ per person"
                  :disabled="uiLocked"
                >
                  $$$$
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary price-chip"
                  :class="{ active: selectedPrice === 'All' }"
                  @click="selectedPrice = 'All'"
                  title="Show all prices"
                  :disabled="uiLocked"
                >
                  All
                </button>
              </div>
            </div>
          </div>

          <!-- Row 2: Scope + Actions -->
          <div class="row g-3 align-items-center mt-1">
            <div class="col-12 col-md-6">
              <div class="btn-group" role="group" aria-label="Scope toggle">
                <input
                  type="radio"
                  class="btn-check"
                  name="scopeToggle"
                  id="scopeFriends"
                  value="friends"
                  v-model="feedScope"
                  :disabled="uiLocked"
                />
                <label class="btn btn-outline-primary btn-sm" for="scopeFriends">Friends</label>

                <input
                  type="radio"
                  class="btn-check"
                  name="scopeToggle"
                  id="scopePublic"
                  value="public"
                  v-model="feedScope"
                  :disabled="uiLocked"
                />
                <label class="btn btn-outline-primary btn-sm" for="scopePublic">Public</label>
              </div>
            </div>
            <div class="col-12 col-md-6 text-md-end">
              <div class="d-inline-flex gap-2">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary px-3 btn-clear"
                  @click="clearFilters"
                  :disabled="uiLocked"
                  :aria-disabled="uiLocked ? 'true' : null"
                >
                  Clear
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-primary px-3 btn-fit"
                  @click="fitMapToFilteredPins"
                  title="Fit to filtered pins"
                  :disabled="uiLocked"
                  :aria-disabled="uiLocked ? 'true' : null"
                >
                  Fit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Overlays -->
    <div v-if="loading" class="overlay">Loading map…</div>
    <!-- <div v-else-if="error" class="overlay error">{{ error }}</div> -->
    <div v-else-if="!loading && !error && !filteredPins.length" class="overlay">
      <div class="text-muted small bg-white rounded-3 px-3 py-2 shadow-sm">
        No posts match your filters.
        <button class="btn btn-sm btn-outline-secondary ms-2" @click="clearFilters()">
          Clear filters
        </button>
        <span class="ms-2 d-inline-flex align-items-center">
          <div class="btn-group" role="group" aria-label="Scope toggle">
            <input
              type="radio"
              class="btn-check"
              name="scopeToggle2"
              id="scopeFriends2"
              value="friends"
              v-model="feedScope"
            />
            <label class="btn btn-outline-primary btn-sm" for="scopeFriends2">Friends</label>

            <input
              type="radio"
              class="btn-check"
              name="scopeToggle2"
              id="scopePublic2"
              value="public"
              v-model="feedScope"
            />
            <label class="btn btn-outline-primary btn-sm" for="scopePublic2">Public</label>
          </div>
        </span>
      </div>
    </div>

    <!-- FAB: Create Post -->
    <button class="fab fab-terracotta" @click="showAdd = true" title="Create Post">＋</button>
    <div class="fab-label sage-chip">Create Post</div>

    <!-- Backdrop for drawers -->
    <div v-if="selected || showAdd" class="backdrop" @click="onBackdropClick"></div>

    <!-- Drawer: View Restaurant -->
    <transition name="slide">
      <aside
        v-if="selected"
        class="side"
        aria-label="Restaurant details"
        @wheel.stop
        @touchmove.stop
        @click.stop
      >
        <button class="close" @click.stop.prevent="closePostDrawer()" aria-label="Close">✕</button>

        <header class="side-head">
          <h2 class="rname">{{ selected?.name }}</h2>
          <div class="rmeta">
            {{ selected?.cuisine }} •
            {{ selected?.address }}
          </div>
        </header>

        <section class="post">
          <h3 class="c-title">Posts</h3>
          <div v-if="selectedPosts.length">
            <div
              v-for="p in selectedPosts"
              :key="p.id"
              class="card mb-3 border-0 shadow-sm card-hover card-clickable"
              role="button"
              tabindex="0"
              @click="goToPost(p.id)"
              @keydown.enter="goToPost(p.id)"
            >
              <div class="card-body">
                <div class="d-flex align-items-center mb-2">
                  <img
                    :src="p.user?.avatar || '/images/avatar1.png'"
                    class="rounded-circle me-2"
                    style="width: 36px; height: 36px; object-fit: cover"
                    alt=""
                  />
                  <div>
                    <div class="fw-bold text-dark">
                      {{ p.user?.name || p.user?.username || p.user?.id }}
                    </div>
                    <div class="text-muted small">Recommended this place</div>
                  </div>
                  <div class="ms-auto">
                    <span
                      class="badge text-bg-warning-subtle border border-warning-subtle text-dark"
                    >
                      ⭐ {{ Number(p.rating || 0).toFixed(1) }}
                    </span>
                  </div>
                </div>

                <p v-if="p.text" class="mb-2">{{ p.text }}</p>

                <div v-if="p.photos?.length" class="row g-2 mb-2">
                  <div v-for="(ph, i) in p.photos" :key="i" class="col-6">
                    <img :src="ph" class="img-fluid rounded" alt="" />
                  </div>
                </div>

                <div class="d-flex flex-wrap align-items-center gap-2">
                  <span v-if="p.raw?.created_at" class="text-muted small ms-auto">
                    {{ new Date(p.raw.created_at).toLocaleString() }}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="c-empty">No posts yet.</div>
        </section>
      </aside>
    </transition>

    <!-- Modal: Add Recommendation -->
    <Modal :show="showAdd" title="Add Food Recommendation" @close="showAdd = false">
      <AddRecommendationForm @added="handleAdded" />
    </Modal>
  </div>
</template>

<style scoped>
.page {
  position: relative;
  min-height: calc(100vh - 56px);
  background: transparent;
  display: grid;
  place-items: center;
}
.map {
  width: min(1100px, 94vw);
  height: min(70vh, 68vw);
}
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
.overlay.error {
  color: var(--terra-500);
}

/* FAB */
.fab {
  position: fixed;
  right: 28px;
  bottom: 86px;
  border: none;
  cursor: pointer;
  display: grid;
  place-items: center;
  z-index: 85;
}
.fab-label {
  position: fixed;
  right: 28px;
  bottom: 54px;
  z-index: 85;
}

/* Backdrop + Drawer */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
}
.side {
  position: fixed;
  top: 0;
  right: 0;
  width: 360px;
  max-width: 92vw;
  height: 100vh;
  z-index: 100;
  overflow-y: auto; /* allow scrolling inside the drawer */
  -webkit-overflow-scrolling: touch; /* smooth iOS scroll */
  overscroll-behavior: contain; /* stop scroll from propagating to map/body */
}
.close {
  position: absolute;
  top: 10px;
  right: 12px;
  border: none;
  font-size: 20px;
  cursor: pointer;
}
.side-head {
  margin: 12px 8px 10px;
}
.rname {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--charcoal);
}
.rmeta {
  color: var(--ink-400);
  font-size: 12px;
  margin-top: 2px;
}

/* Post drawer content */
.post {
  margin-top: 10px;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.28s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

/* Click feedback for post cards */
.card-clickable {
  transition:
    transform 0.06s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}

.card-clickable:active {
  transform: translateY(1px);
}

/* Brief dim on drawer when clicking a card to navigate */
aside.side.clicking {
  filter: brightness(0.5);
  transition: filter 0.18s ease;
}

/* ensure typeahead lists float above the glass card */
.list-group {
  z-index: 1200;
}

/* Price range chips */
.price-chip {
  border: 1px solid var(--line-200);
  border-radius: 10px;
  background: #fff;
  font-weight: 700;
  padding: 6px 12px;
}

.price-chip:hover {
  background-color: #e0e0e0;
  color: var(--charcoal);
}
.price-chip.active {
  background: var(--cream-100);
  border-color: var(--sage-500);
  box-shadow: inset 0 0 0 1px var(--sage-500);
  color: var(--charcoal);
}
</style>
