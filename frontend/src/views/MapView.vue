<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'
import { useRoute } from 'vue-router'

import axios from 'axios'
import AddRecommendationForm from '@/components/AddRecommendationForm.vue'

const API_BASE = 'http://localhost:8000'
const ACTIVE_EMAIL = 'clarice.lim.2024@computing.smu.edu.sg' // TEMP: replace when auth is ready

const api = axios.create({ baseURL: API_BASE });

const route = useRoute()



// --- FILTERS --- //

const selectedCuisine = ref('All')
const selectedArea = ref('All')

/** Extract a rough "area" from an address.
 *  Heuristic: take the first comma-part (e.g. "Tiong Bahru Plaza, ...")
 *  Tweak this to match your addresses better if needed.
 */
function inferArea(address = '', pinArea = '') {
  if (pinArea) return pinArea
  const first = String(address).split(',')[0]?.trim()
  return first || 'Unknown'
}

/** Cuisine options derived from loaded data (no extra API call) */
const cuisineOptions = computed(() => {
  const set = new Set()
  // Prefer cuisines on pins
  pins.value.forEach(p => { if (p.cuisine) set.add(p.cuisine) })
  // Fallback to feed (if any posts didn’t produce pins yet)
  feedPosts.value.forEach(fp => {
    const c = fp.restaurant?.cuisine_type ?? fp.cuisine_type
    if (c) set.add(c)
  })
  return ['All', ...Array.from(set).sort()]
})

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
    const okCuisine = selectedCuisine.value === 'All' || p.cuisine === selectedCuisine.value
    const okArea = selectedArea.value === 'All' || area === selectedArea.value
    return okCuisine && okArea
  })
})

/** When filters change, rebuild markers */
watch([selectedCuisine, selectedArea], async () => {
  selectedPost.value = null
  selected.value = null

  await rebuildMarkers()
  await fitMapToFilteredPins()
})

async function rebuildMarkers() {
  await nextTick()
  if (!map.value) return
  // clear existing
  markers.value.forEach((m) => m.setMap(null))
  markers.value = []
  const { Marker: GMarker } = await google.maps.importLibrary('marker')
  addPinsWith(GMarker) // this will read filteredPins
}

/* -----------------
   Map + data state
------------------*/
const mapEl = ref(null)
const map = ref(null)
const markers = ref([])
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
const showCreate = ref(false) // drawer with AddRecommendationForm
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
}
function closeCreateDrawer() {
  showCreate.value = false
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (showCreate.value) return closeCreateDrawer()
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

  const fixMicro = (v) => (Number.isFinite(v) && Math.abs(v) > 1000 && Math.abs(v) < 1e8 ? v / 1e6 : v)
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

  const needs = pinArr.filter((p) => (
    (!p.name || p.name === 'Unknown' || p.name === p.restaurant_id) && String(p.restaurant_id).startsWith('ChI')
  ))

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
    p => !p.area && p.position && Number.isFinite(p.position.lat) && Number.isFinite(p.position.lng)
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
          const pick = (type) => comps.find(c => c.types.includes(type))?.long_name
          let areaName =
            pick('neighborhood') ||
            pick('sublocality_level_1') ||
            pick('sublocality') ||
            pick('locality') || ''
          if (!areaName) {
            areaName = String(results[0].formatted_address || '').split(',')[0].trim()
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
    const r = await api.post('/friends/getFriendRecs', { user_email: userEmail });
    return Array.isArray(r.data?.data) ? r.data.data : [];
  } catch (e) {
    console.error('getFriendRecs failed:', e.response?.status, e.response?.data || e.message);
    return [];
  }
}


async function init() {
  try {
    // 1) Build feed from existing backend endpoints
    //    a) Get friend recommendations (postids + coords)
    const pinsRaw = await getFriendRecs(ACTIVE_EMAIL);
    console.log('[init] pinsRaw', pinsRaw)

    //    b) Fetch details for each postid
    const details = await Promise.all(pinsRaw.map(p => getPostById(p.postid)))
    console.log('[init] details', details)

    const feed = []
    pinsRaw.forEach((p, i) => {
      const d = details[i] || null
      // Some backends use `longitude`; others (your screenshot) used `longtitude`
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
          cuisine_type: d?.cuisine_type || '',   // <-- take from getPostById result
          latitude: Number.isFinite(lat) ? lat : undefined,
          longitude: Number.isFinite(lng) ? lng : undefined,
        },
        raw: { created_at: d?.created_at },
      })
    })
    console.log('[init] feed', feed)
    feedPosts.value = feed

    // index by restaurant
    const byRest = new Map()
    for (const p of feed) {
      const r = p.restaurant
      if (!r?.id) continue
      if (!byRest.has(r.id)) byRest.set(r.id, [])
      byRest.get(r.id).push(p)
    }
    for (const [rid, arr] of byRest.entries()) {
      arr.sort((a, b) => {
        const ad = new Date(a.raw?.created_at || 0)
        const bd = new Date(b.raw?.created_at || 0)
        return bd - ad
      })
    }
    postsByRestaurant.value = byRest
    // Populate cuisine filter options from backend
    

    // pins (REAL coords from DB) — one pin PER POST so clicking a pin shows that exact post
    const pinList = []
    for (const p of feed) {
      const r = p.restaurant || {}
      const { lat, lng, ok } = normalizeCoords(parseNum(r?.latitude), parseNum(r?.longitude ?? r?.longtitude))
      if (!ok) {
        console.warn('Pin dropped (bad coords):', { rid: r?.id, lat: r?.latitude, lng: r?.longitude ?? r?.longtitude })
        continue
      }
      pinList.push({
        restaurant_id: r.id,
        post_id: p.id,
        name: r.name || r.id || 'Unknown',
        address: r.address || '',
        cuisine: r.cuisine_type || 'Unknown',
        position: { lat, lng },
        by: p.user?.name,
        photo: p.photos?.[0],
        rating: p.rating ?? 0,
        post: p, // keep a direct reference so clicking the marker opens this post
      })
    }
    pins.value = pinList
    console.log('[init] pinList', pinList)
    // reset filters to show everything on first load
    selectedCuisine.value = 'All'
    selectedArea.value = 'All'

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
    addPinsWith(GMarker)

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
  markers.value.forEach((m) => m.setMap(null))
  markers.value = []
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
  selected.value = arr[0]?.restaurant ? {
    restaurant_id: restaurantId,
    name: arr[0].restaurant.name || restaurantId,
    address: arr[0].restaurant.address || '',
    cuisine: arr[0].restaurant.cuisine_type || 'Unknown',
    position: { lat: Number(arr[0].restaurant.latitude) || 0, lng: Number(arr[0].restaurant.longitude) || 0 }
  } : null
  selectedPost.value = null
  selectedPosts.value = arr
}

function renderInfoWindow(pin) {
  const id = `view-post-btn-${pin.post_id || pin.restaurant_id}`
  const photo = pin.photo
    ? `<img src="${pin.photo}" alt="" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:8px;" />`
    : ''
  return `
    <div style="max-width:240px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial;">
      ${photo}
      <div style="font-weight:800;color:#111;margin:4px 0 2px">${escapeHtml(pin.name)}</div>
      <div style="color:#6b7280;font-size:12px;margin-bottom:6px">${escapeHtml(pin.cuisine)} • ${escapeHtml(pin.address || '')}</div>
      <div style="display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:8px">
        <span>⭐</span><strong>${Number(pin.rating).toFixed(1)}</strong>
        <span style="color:#6b7280">by ${escapeHtml(pin.by || 'friend')}</span>
      </div>
      <button id="${id}" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;">
        View post
      </button>
    </div>
  `
}

/* -----------------
   Refresh after add
------------------*/
// 🔁 Re-fetch feed, rebuild postsByRestaurant, rebuild pins from real lat/lng, and redraw markers
async function refreshPinsAndMarkers() {
  // 1) Re-fetch via backend endpoints and rebuild feed
  const pinsRaw = await getFriendRecs(ACTIVE_EMAIL);
  console.log('[refresh] pinsRaw', pinsRaw)

  const details = await Promise.all(pinsRaw.map(p => getPostById(p.postid)))
  console.log('[refresh] details', details)

  const feed = []
  pinsRaw.forEach((p, i) => {
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
        cuisine_type: d?.cuisine_type || '',   // <-- take from getPostById result
        latitude: Number.isFinite(lat) ? lat : undefined,
        longitude: Number.isFinite(lng) ? lng : undefined,
      },
      raw: { created_at: d?.created_at },
    })
  })
  console.log('[refresh] feed', feed)
  feedPosts.value = feed

  // 2) Rebuild index: restaurant_id -> posts[]
  const byRest = new Map()
  for (const p of feed) {
    const r = p.restaurant
    if (!r?.id) continue
    if (!byRest.has(r.id)) byRest.set(r.id, [])
    byRest.get(r.id).push(p)
  }
  // newest first per restaurant
  for (const [rid, arr] of byRest.entries()) {
    arr.sort((a, b) => {
      const ad = new Date(a.raw?.created_at || 0)
      const bd = new Date(b.raw?.created_at || 0)
      return bd - ad
    })
  }
  postsByRestaurant.value = byRest
  // Refresh cuisine filter options from backend


  // 3) Build pins from restaurant coordinates (✅ use real DB lat/lng) — one pin PER POST
  const nextPins = []
  for (const p of feed) {
    const r = p.restaurant || {}
    const { lat, lng, ok } = normalizeCoords(parseNum(r?.latitude), parseNum(r?.longitude ?? r?.longtitude))
    if (!ok) {
      console.warn('Pin dropped (bad coords):', { rid: r?.id, lat: r?.latitude, lng: r?.longitude ?? r?.longtitude })
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
  console.log('[refresh] nextPins', nextPins)

  // 4) Redraw markers for the current filters
  await nextTick()
  if (!map.value) return
  markers.value.forEach((m) => m.setMap(null))
  markers.value = []
  const { Marker: GMarker } = await google.maps.importLibrary('marker')
  await enrichPinsWithPlaces(pins.value)
  await enrichPinsWithAreas(pins.value)
  addPinsWith(GMarker)

  // 5) Optionally, focus the newly added restaurant if you track it (skip if not needed)
  // if (nextPins.length) {
  //   const newest = nextPins[0]
  //   focusRestaurant(newest.restaurant_id, { openDrawer: true })
  // }
}

// Called when the form emits "added"
async function handleAdded() {
  showCreate.value = false
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
</script>

<template>
  <div class="page">
    <!-- Map -->
    <div ref="mapEl" class="map"></div>

    <!-- Filter bar (floating on map) -->
    <div class="filter-bar">
      <div class="filter-group">
        <label class="filter-label">Cuisine</label>
        <select v-model="selectedCuisine" class="filter-select">
          <option v-for="c in cuisineOptions" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>

      <div class="filter-group">
        <label class="filter-label">Area</label>
        <select v-model="selectedArea" class="filter-select">
          <option v-for="a in areaOptions" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>
    </div>

    <!-- Overlays -->
    <div v-if="loading" class="overlay">Loading map…</div>
    <div v-else-if="error" class="overlay error">{{ error }}</div>

    <!-- FAB: Create Post -->
    <button class="fab" @click="showCreate = true" title="Create Post">＋</button>
    <div class="fab-label">Create Post</div>

    <!-- Backdrop for drawers -->
    <div
      v-if="selected || showCreate"
      class="backdrop"
      @click="showCreate ? closeCreateDrawer() : closePostDrawer()"
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
            <div v-for="p in selectedPosts" :key="p.id" class="post">
              <div class="post-head">
                <img :src="p.user?.avatar || '/images/avatar1.png'" class="avatar" alt="" />
                <div class="who">
                  <div class="uname">{{ p.user?.name || p.user?.username || p.user?.id }}</div>
                  <div class="by">Recommended this place</div>
                </div>
              </div>

              <p v-if="p.text" class="text">{{ p.text }}</p>

              <div v-if="p.photos?.length" class="photos">
                <img v-for="(ph, i) in p.photos" :key="i" :src="ph" alt="" />
              </div>

              <div class="actions">
                <span>🍽️ {{ p.restaurant?.cuisine_type || selected?.cuisine || 'Unknown' }}</span>
                <span style="margin-left:12px">⭐ {{ Number(p.rating || 0).toFixed(1) }}</span>
                <span style="margin-left:8px;color:#6b7280">{{ p.raw?.created_at || '' }}</span>
              </div>

              <div class="divider"></div>
            </div>
          </div>
          <div v-else class="c-empty">No posts yet.</div>
        </section>
      </aside>
    </transition>

    <!-- Drawer: Add Recommendation (same form reused) -->
    <transition name="slide">
      <aside v-if="showCreate" class="side" aria-label="Add recommendation">
        <button class="close" @click="closeCreateDrawer" aria-label="Close">✕</button>
        <header class="side-head">
          <h2 class="rname">Add recommendation</h2>
          <div class="rmeta">
            Search for the place near you, pick the result, add cuisine, rating, comment.
          </div>
        </header>

        <!-- Reusing the same component -->
        <AddRecommendationForm @added="handleAdded" />
      </aside>
    </transition>
  </div>
</template>

<style scoped>
.page {
  position: relative;
  min-height: calc(100vh - 56px);
  background: #cfe8f7;
  display: grid;
  place-items: center;
}
.map {
  width: min(1100px, 94vw);
  height: min(70vh, 68vw);
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.12);
}
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #374151;
  font-weight: 600;
  pointer-events: none;
}
.overlay.error {
  color: #b91c1c;
}

/* FAB */
.fab {
  position: fixed;
  right: 28px;
  bottom: 86px;
  width: 56px;
  height: 56px;
  border-radius: 999px;
  background: #111;
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 28px;
  font-weight: 700;
  display: grid;
  place-items: center;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
  z-index: 85;
}
.fab-label {
  position: fixed;
  right: 28px;
  bottom: 54px;
  font-size: 14px;
  color: #111;
  font-weight: 600;
  z-index: 85;
}

/* Backdrop + Drawer */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 90;
}
.side {
  position: fixed;
  top: 0;
  right: 0;
  width: 360px;
  max-width: 92vw;
  height: 100vh;
  background: #fff;
  box-shadow: -6px 0 22px rgba(0, 0, 0, 0.14);
  z-index: 100;
  padding: 18px 16px 24px;
  overflow-y: auto;
}
.close {
  position: absolute;
  top: 10px;
  right: 12px;
  border: none;
  background: transparent;
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
  color: #111;
}
.rmeta {
  color: #6b7280;
  font-size: 12px;
  margin-top: 2px;
}

/* Post drawer content */
.post {
  margin-top: 10px;
}
.post-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  object-fit: cover;
}
.who .uname {
  font-weight: 700;
  color: #111;
}
.who .by {
  color: #6b7280;
  font-size: 12px;
}
.text {
  margin: 10px 0;
  color: #111;
}
.photos {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.photos img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  border-radius: 6px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.btn {
  background: none;
  border: 1px solid transparent;
  color: #374151;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
}
.btn:hover {
  background: #f5f6f7;
}
.heart {
  font-size: 18px;
  transition: color 0.2s ease;
}
.heart.on {
  color: #ff4b5c;
}

.divider {
  height: 1px;
  background: #eee;
  margin: 12px 0;
}

.c-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 800;
  color: #111;
}
.comments {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.comment {
  display: flex;
  gap: 8px;
}
.c-ava {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  object-fit: cover;
}
.c-name {
  font-weight: 700;
  font-size: 12px;
  color: #111;
}
.c-text {
  font-size: 13px;
  color: #374151;
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

/* Filter bar */
.filter-bar {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 95;
  display: flex;
  gap: 10px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(6px);
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.filter-label {
  font-size: 12px;
  color: #374151;
  font-weight: 700;
}
.filter-select {
  appearance: none;
  padding: 0.4rem 0.6rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  color: #111827;
  outline: none;
}
.filter-select:focus {
  border-color: #94a3b8;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.2);
}
</style>
