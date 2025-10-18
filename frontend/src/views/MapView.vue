<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import axios from 'axios'
import AddRecommendationForm from '@/components/AddRecommendationForm.vue'
import Modal from '@/components/Modal.vue'

const API_BASE = 'http://localhost:8000'
const ACTIVE_EMAIL = 'clarice.lim.2024@computing.smu.edu.sg' // TEMP: replace when auth is ready

const api = axios.create({ baseURL: API_BASE })

// --- Cuisine endpoints (server-driven filters) --- //
async function getFriendsCuisines(userEmail) {
  try {
    const r = await api.post('/map/cuisineFilter', { user_email: userEmail })
    return Array.isArray(r.data?.data) ? r.data.data : []
  } catch (e) {
    console.error('getFriendsCuisines failed:', e.response?.status, e.response?.data || e.message)
    return []
  }
}
async function getPostsByCuisine(userEmail, cuisineType) {
  try {
    const r = await api.post('/map/getPostbyCuisine', {
      user_email: userEmail,
      cuisine_type: cuisineType,
    })
    return Array.isArray(r.data?.data) ? r.data.data : []
  } catch (e) {
    console.error('getPostsByCuisine failed:', e.response?.status, e.response?.data || e.message)
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

// List of cuisines from backend (used to populate dropdown)
const cuisines = ref(['All'])

const selectedCuisine = ref('All')
const selectedArea = ref('All')

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

/** Cuisine options from backend */
const cuisineOptions = computed(() => cuisines.value)

/** Area options derived from pins */
const areaOptions = computed(() => {
  const set = new Set()
  pins.value.forEach((p) => set.add(inferArea(p.address, p.area)))
  return ['All', ...Array.from(set).sort()]
})

/** Pins after applying filters */
const filteredPins = computed(() => {
  return pins.value.filter((p) => {
    const area = inferArea(p.address, p.area)
    // Cuisine already enforced by backend; only area is filtered client-side
    const okArea = selectedArea.value === 'All' || area === selectedArea.value
    return okArea
  })
})

// When cuisine changes, fetch from backend and rebuild markers
watch(selectedCuisine, async (c) => {
  selectedPost.value = null
  selected.value = null
  await loadPinsForCuisine(c)
  await rebuildMarkers()
  await fitMapToFilteredPins()
})

// When area changes, just rebuild markers (pins already server-filtered by cuisine)
watch(selectedArea, async () => {
  selectedPost.value = null
  selected.value = null
  await rebuildMarkers()
  await fitMapToFilteredPins()
})
// Load pins feed for a given cuisine selection.
// 'All' => /friends/getFriendRecs ; specific => /map/getPostbyCuisine
async function loadPinsForCuisine(cuisine) {
  let postsRaw = []
  if (!cuisine || cuisine === 'All') {
    postsRaw = await getFriendRecs(ACTIVE_EMAIL)
  } else {
    postsRaw = await getPostsByCuisine(ACTIVE_EMAIL, cuisine)
  }

  // Fetch details for each post
  const details = await Promise.all(postsRaw.map((p) => getPostById(p.postid)))

  const feed = []
  postsRaw.forEach((p, i) => {
    const d = details[i] || null
    const lng = Number(p.longitude ?? p.longtitude)
    const lat = Number(p.latitude)
    feed.push({
      id: d?.postid || p.postid,
      text: d?.review || '',
      rating: Number(d?.rating) || 0,
      photos: [],
      user: { id: d?.poster_username, name: d?.poster_username, username: d?.poster_username },
      restaurant: {
        id: p.restaurant_id,
        name: p.restaurant_id,
        address: '',
        cuisine_type: d?.cuisine_type || '',
        latitude: Number.isFinite(lat) ? lat : undefined,
        longitude: Number.isFinite(lng) ? lng : undefined,
      },
      raw: { created_at: d?.created_at },
    })
  })
  feedPosts.value = feed

  // index posts by restaurant
  const byRest = new Map()
  for (const p of feed) {
    const r = p.restaurant
    if (!r?.id) continue
    if (!byRest.has(r.id)) byRest.set(r.id, [])
    byRest.get(r.id).push(p)
  }
  for (const [, arr] of byRest.entries()) {
    arr.sort((a, b) => new Date(b.raw?.created_at || 0) - new Date(a.raw?.created_at || 0))
  }
  postsByRestaurant.value = byRest

  // Build pins (one per POST) using DB coords
  const nextPins = []
  for (const p of feed) {
    const r = p.restaurant || {}
    const { lat, lng, ok } = normalizeCoords(
      parseNum(r?.latitude),
      parseNum(r?.longitude ?? r?.longtitude),
    )
    if (!ok) {
      console.warn('Pin dropped (bad coords):', {
        rid: r?.id,
        lat: r?.latitude,
        lng: r?.longitude ?? r?.longtitude,
      })
      continue
    }
    nextPins.push({
      restaurant_id: r.id,
      post_id: p.id,
      name: r.name || r.id || 'Unknown',
      address: r.address || '',
      cuisine: r.cuisine_type || 'Unknown',
      position: { lat, lng },
      by: p.user?.name,
      photo: p.photos?.[0],
      rating: p.rating ?? 0,
      post: p,
    })
  }
  pins.value = nextPins

  // Enrich (non-blocking) so area dropdown still works
  await enrichPinsWithPlaces(pins.value)
  await enrichPinsWithAreas(pins.value)
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
  selectedPost.value = null
  selected.value = null
  clearRestaurantQuery()
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
// Backend expects POST /friends/getFriendRecs with JSON { user_email }
async function getFriendRecs(userEmail) {
  try {
    const r = await api.post('/friends/getFriendRecs', { user_email: userEmail })
    return Array.isArray(r.data?.data) ? r.data.data : []
  } catch (e) {
    console.error('getFriendRecs failed:', e.response?.status, e.response?.data || e.message)
    return []
  }
}

async function init() {
  try {
    // 1) Load cuisines for dropdown from backend
    const list = await getFriendsCuisines(ACTIVE_EMAIL)
    cuisines.value = ['All', ...list]

    // Reset filters and load all pins initially
    selectedCuisine.value = 'All'
    selectedArea.value = 'All'
    await loadPinsForCuisine('All')
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
      ${photo ? `<img src="${photo}" alt="${escapeHtml(pin.name)}" />` : ''}
      <div class="title">${escapeHtml(pin.name)}</div>
      <div class="meta">${escapeHtml(pin.cuisine)} • ${escapeHtml(pin.address || '')}</div>
      <div class="rating">
        ⭐ ${Number(pin.rating).toFixed(1)}
        <span style="color: var(--ink-400); font-weight: 500;">by ${escapeHtml(pin.by || 'friend')}</span>
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
  // Re-fetch based on the currently selected cuisine, then redraw
  await loadPinsForCuisine(selectedCuisine.value)
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
  // Rebuild markers and refit after resetting filters
  rebuildMarkers().then(() => fitMapToFilteredPins())
}
</script>

<template>
  <div class="page sage-bg">
    <!-- Map -->
    <div ref="mapEl" class="map sage-map"></div>

    <!-- Filter bar (Bootstrap card) -->
    <div class="position-absolute top-0 start-50 translate-middle-x mt-3" style="z-index: 95">
      <div
        :class="[
          'card border-0 shadow rounded-4 glass sage-glass',
          { 'pe-none': uiLocked, 'opacity-75': uiLocked },
        ]"
        style="min-width: 340px; max-width: 720px"
      >
        <div class="card-body py-2">
          <div class="d-flex justify-content-center align-items-end gap-3 flex-wrap">
            <div style="min-width: 160px">
              <label class="form-label mb-1 small fw-semibold text-secondary">Cuisine</label>
              <select
                v-model="selectedCuisine"
                class="form-select form-select-sm text-center"
                :disabled="uiLocked"
                :aria-disabled="uiLocked ? 'true' : null"
              >
                <option v-for="c in cuisineOptions" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>

            <div style="min-width: 160px">
              <label class="form-label mb-1 small fw-semibold text-secondary">Area</label>
              <select
                v-model="selectedArea"
                class="form-select form-select-sm text-center"
                :disabled="uiLocked"
                :aria-disabled="uiLocked ? 'true' : null"
              >
                <option v-for="a in areaOptions" :key="a" :value="a">{{ a }}</option>
              </select>
            </div>

            <div class="d-flex gap-2 mt-2">
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary px-3 btn-clear"
                @click="clearFilters"
                :disabled="uiLocked"
                :aria-disabled="uiLocked ? 'true' : null"
              >
                <!-- Resets filters to show all pins again -->
                Clear
              </button>
              <button
                type="button"
                class="btn btn-sm px-3 btn-fit"
                @click="fitMapToFilteredPins"
                title="Fit to filtered pins"
                :disabled="uiLocked"
                :aria-disabled="uiLocked ? 'true' : null"
              >
                <!-- Zooms and pans map to show all current filtered pins -->
                Fit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Overlays -->
    <div v-if="loading" class="overlay">Loading map…</div>
    <div v-else-if="error" class="overlay error">{{ error }}</div>

    <!-- FAB: Create Post -->
    <button class="fab fab-terracotta" @click="showAdd = true" title="Create Post">＋</button>
    <div class="fab-label sage-chip">Create Post</div>

    <!-- Backdrop for drawers -->
    <div
      v-if="selected || showAdd"
      class="backdrop"
      @click="showAdd ? closeCreateDrawer() : closePostDrawer()"
    ></div>

    <!-- Drawer: View Restaurant -->
    <transition name="slide">
      <aside v-if="selected" class="side" aria-label="Restaurant details">
        <button class="close" @click="closePostDrawer" aria-label="Close">✕</button>

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
                  <span class="badge rounded-pill bg-light text-dark border">
                    {{ p.restaurant?.cuisine_type || selected?.cuisine || 'Unknown' }}
                  </span>
                  <span
                    v-if="p.restaurant?.address || selected?.address"
                    class="badge text-bg-light border"
                  >
                    📍 {{ p.restaurant?.address || selected?.address }}
                  </span>
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
      <template #footer>
        <button class="px-4 py-2 rounded-md border" @click="showAdd = false">Cancel</button>
      </template>
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
</style>
