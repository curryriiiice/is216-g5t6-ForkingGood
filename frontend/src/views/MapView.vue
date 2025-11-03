<script setup>
import { ref, onMounted, onBeforeUnmount, onUnmounted, watch, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AddRecommendationForm from '@/components/AddRecommendationForm.vue'
import Modal from '@/components/Modal.vue'
import { useAuthUser } from '@/lib/useAuthUser'

import api from '@/lib/api.js'

const { user: authUser, refresh: refreshAuthUser } = useAuthUser()
const activeEmail = computed(() => authUser.value?.email ?? null)

const IMAGE_BASE = import.meta.env.DEV ? '' : import.meta.env.VITE_IMAGE_BASE_URL || api.defaults.baseURL

function resolveImageUrl(p) {
  if (!p) return null
  let s = String(p)
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s
  s = s.replace(/^[./]+/, '').replace(/^\/+/, '')
  return IMAGE_BASE ? `${IMAGE_BASE}/${s}` : `/${s}`
}

const DEFAULT_AVATAR = '/images/default-avatar.jpg'
const DEFAULT_AVATAR_REGEX = /default-avatar/i
const AVATAR_CACHE = new Map()
const AVATAR_REQUESTS = new Map()

function sanitizeUsername(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === '@user') return null
  return trimmed
}

function isDefaultAvatarUrl(url) {
  if (!url) return true
  if (typeof url !== 'string') return false
  return DEFAULT_AVATAR_REGEX.test(url)
}

async function fetchPfpByUsername(username) {
  const clean = sanitizeUsername(username)
  if (!clean) return null
  if (AVATAR_CACHE.has(clean)) return AVATAR_CACHE.get(clean)
  if (AVATAR_REQUESTS.has(clean)) return AVATAR_REQUESTS.get(clean)

  const request = api
    .post('/user/getPfpByUsername', { username: clean })
    .then((response) => {
      const rawUrl = response.data?.data || null
      const resolved = rawUrl ? resolveImageUrl(rawUrl) : null
      AVATAR_CACHE.set(clean, resolved || null)
      return resolved
    })
    .catch(() => {
      AVATAR_CACHE.set(clean, null)
      return null
    })
    .finally(() => {
      AVATAR_REQUESTS.delete(clean)
    })

  AVATAR_REQUESTS.set(clean, request)
  return request
}

async function ensurePostAvatar(post) {
  if (!post || !post.user) return null
  if (post.user.avatar && !isDefaultAvatarUrl(post.user.avatar)) return null

  const username = sanitizeUsername(post.user.username)
  if (!username) return null

  const url = await fetchPfpByUsername(username)
  if (url && !isDefaultAvatarUrl(url)) {
    post.user.avatar = url
  }
}

function onDrawerAvatarError(ev) {
  ev.target.onerror = null
  ev.target.src = DEFAULT_AVATAR
}

// --- THEME PERSISTENCE ---
// Apply theme from localStorage on mount
const THEME_KEY = 'fg_theme_v2'
function applyStoredTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'light'
  document.documentElement.setAttribute('data-theme', savedTheme)
}

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
  delete q.postId
  router.replace({ query: q })
}

function parseFeedScope(input, fallback = 'public') {
  if (input === null || input === undefined) return fallback
  if (typeof input === 'string') {
    const t = input.trim().toLowerCase()
    if (!t) return fallback
    if (['friends', 'friend', 'friends_only', 'friends-only', 'private'].includes(t)) return 'friends'
    if (['public', 'everyone', 'all'].includes(t)) return 'public'
    if (['true', '1', 't', 'yes', 'y'].includes(t)) return 'public'
    if (['false', '0', 'f', 'no', 'n'].includes(t)) return 'friends'
    return fallback
  }
  if (typeof input === 'boolean') return input ? 'public' : 'friends'
  if (typeof input === 'number') return input === 0 ? 'friends' : 'public'
  return fallback
}

// --- FILTERS --- //

// Master options (populated from backend endpoints)
const cuisines = ref(['All'])
const areas = ref(['All'])

// Current selections
const selectedCuisine = ref('All')
const selectedArea = ref('All')
const selectedPrice = ref('All') // 'All' | '$' | '$$' | '$$$' | '$$$$'
const feedScope = ref(parseFeedScope(route.query.feed ?? route.query.scope ?? null, 'public')) // 'friends' | 'public'

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
  const str = String(v).trim().toLowerCase()
  // Map descriptive labels to price levels
  if (['free', 'inexpensive', 'cheap'].includes(str)) return 0 // $
  if (['moderate'].includes(str)) return 1 // $$
  if (['expensive'].includes(str)) return 2 // $$$
  if (['very expensive', 'very_expensive', 'luxury'].includes(str)) return 3 // $$$$
  // Symbol '$'..'$$$$' → 0..3
  if (/^\$+$/.test(str)) {
    const idx = str.length - 1
    return idx >= 0 && idx <= 3 ? idx : null
  }
  const n = Number(v)
  if (Number.isFinite(n)) {
    // Map numeric 0: Free, 1: Inexpensive, 2: Moderate, 3: Expensive, 4: Very Expensive
    if (n === 0 || n === 1) return 0 // $
    if (n === 2) return 1 // $$
    if (n === 3) return 2 // $$$
    if (n === 4) return 3 // $$$$
    if (n >= 1 && n <= 4) return n - 1
  }
  return null
}

function eqIgnoreCase(a, b) {
  if (!a || !b) return false
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
}

function normalizeVisibilityFlag(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase()
    if (!t) return null
    if (['true', '1', 't', 'public', 'everyone', 'yes', 'y', 'all'].includes(t)) return true
    if (['false', '0', 'f', 'friends', 'friends_only', 'private', 'no', 'n'].includes(t)) return false
  }
  return null
}

function extractVisibilityFlag(obj) {
  if (!obj || typeof obj !== 'object') return null
  const candidates = [
    obj.is_public,
    obj.public,
    obj.visibility,
    obj.visible_to_everyone,
    obj['public?'],
    obj.scope,
  ]
  for (const v of candidates) {
    const flag = normalizeVisibilityFlag(v)
    if (flag !== null) return flag
  }
  return null
}

function derivePostVisibility(post) {
  return (
    extractVisibilityFlag(post) ??
    extractVisibilityFlag(post?.raw) ??
    null
  )
}

function rowMatchesSelectedFilters(row) {
  const areaFilter = selectedArea.value
  if (areaFilter && areaFilter !== 'All') {
    const rowArea =
      row.area ||
      row.location ||
      row.loc ||
      row.neighbourhood ||
      row.neighborhood ||
      inferArea(row.address || row.restaurant_address || row.restaurant?.address || '')
    if (!eqIgnoreCase(rowArea, areaFilter)) return false
  }

  const cuisineFilter = selectedCuisine.value
  if (cuisineFilter && cuisineFilter !== 'All') {
    const rowCuisine = row.cuisine_type || row.cuisine || row.cuisineType || ''
    if (!eqIgnoreCase(rowCuisine, cuisineFilter)) return false
  }

  const priceFilter = selectedPrice.value
  if (priceFilter && priceFilter !== 'All') {
    const want = priceSymbolToIndex(priceFilter)
    if (want !== null) {
      const cand = [row.price_range, row.price_level, row.price, row.price_symbol]
      const hasMatch = cand.some((v) => {
        const have = normalizePriceIndex(v)
        return have !== null && have === want
      })
      if (!hasMatch) return false
    }
  }

  return true
}

async function includeOwnPosts(rows, email, scope = 'public') {
  if (!email || !Array.isArray(rows)) return

  const seen = new Set(
    rows
      .map((r) => r && (r.postid || r.post_id || r.id))
      .filter(Boolean)
      .map((id) => String(id)),
  )

  try {
    const wantFriendScope = scope === 'friends'
    const res = await api.post('/user/getUserPosts', {
      user_email: email,
      friends: wantFriendScope,
    })
    const mine = Array.isArray(res.data?.data) ? res.data.data : []
    for (const row of mine) {
      const pid = row?.postid || row?.post_id || row?.id
      if (!pid) continue
      const key = String(pid)
      if (seen.has(key)) continue
      if (!rowMatchesSelectedFilters(row)) continue
      const vis = derivePostVisibility(row)
      if (scope === 'public' && vis === false) continue
      rows.push(row)
      seen.add(key)
    }
  } catch (e) {
    console.warn(
      '[map] includeOwnPosts failed:',
      e?.response?.status,
      e?.response?.data || e?.message || e,
    )
  }
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

watch(
  () => activeEmail.value,
  (email, prev) => {
    if (email && email !== prev) {
      loadPinsFromFilters()
    }
  },
)

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
  let email = activeEmail.value
  if (!email) {
    const refreshed = await refreshAuthUser()
    email = refreshed?.email ?? null
  }
  if (!email) {
    console.warn('[map] no authenticated email found; skipping filtered pins fetch')
    pins.value = []
    return
  }

  const payload = {
    user_email: email,

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

  const fetchedRows = await getFilteredPosts(payload)
  const safeRows = Array.isArray(fetchedRows) ? [...fetchedRows] : []
  await includeOwnPosts(safeRows, email, feedScope.value)
  console.log('[api] rows (with mine) returned:', safeRows.length, safeRows[0])

  // Strict FE price filter so $$$ and $$$$ are never grouped
  let filteredRows = safeRows
  if (selectedPrice.value && selectedPrice.value !== 'All') {
    const want = priceSymbolToIndex(selectedPrice.value)
    if (want !== null) {
      filteredRows = safeRows.filter((r) => {
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
  const avatarTasks = []

  for (const r of filteredRows) {
    const lat = Number(r.lat ?? r.latitude)
    const lng = Number(r.long ?? r.lng ?? r.longitude ?? r.longtitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const restaurantId = r.restaurant_id || r.restaurantId || r.restaurant_name || r.name
    const restaurantName = r.restaurant_name || r.name || String(restaurantId || '')
    const address = r.address || ''
    const area = r.area || inferArea(address || '')
    const cuisine = r.cuisine_type || 'Unknown'

    // Normalize visibility field across backends
    const visibilityFlag = derivePostVisibility(r)
    const isPublic = visibilityFlag === null ? true : visibilityFlag

    // Normalize a post object for the drawer list
    const posterEmail =
      r.poster_email || r.user_email || r.owner_email || r.email || r.userEmail || null
    const rawAvatar =
      r.poster_avatar ||
      r.avatar ||
      r.profile_pic ||
      r.user_avatar ||
      r.avatar_url ||
      r.poster_profile_pic ||
      r.profile_image_url ||
      null
    const normalizedUsername = sanitizeUsername(r.poster_username) || null
    const displayName = normalizedUsername || r.poster_username || posterEmail || '@user'

    const post = {
      id: r.postid || r.post_id,
      rating: Number(r.rating ?? 0),
      text: r.review || '',
      photos: Array.isArray(r.pictures) ? r.pictures : [],
      is_public: (isPublic === null ? true : isPublic),
      raw: {
        created_at: r.created_at,
        public: (isPublic === null ? true : isPublic),
        upvote_count: r.upvote_count ?? 0,
        user_has_upvoted: r.user_has_upvoted ?? false,
        comments: r.comments ?? [],
      },
      poster_email: posterEmail,
      user_email: posterEmail,
      restaurant: {
        id: restaurantId,
        name: restaurantName,
        address,
        cuisine_type: cuisine,
        latitude: lat,
        longitude: lng,
      },
    }
    const baseAvatar = resolveImageUrl(rawAvatar)
    post.user = {
      id: normalizedUsername || posterEmail || displayName,
      name: displayName,
      username: normalizedUsername,
      email: posterEmail,
      avatar: baseAvatar || DEFAULT_AVATAR,
    }
    const task = ensurePostAvatar(post)
    if (task instanceof Promise) {
      avatarTasks.push(task.catch(() => null))
    }
    if (!groups.has(restaurantId)) groups.set(restaurantId, [])
    groups.get(restaurantId).push(post)
  }

  if (avatarTasks.length) {
    await Promise.allSettled(avatarTasks)
  }


  // 2) Convert groups → unique pins (one per restaurant), using first post as the representative
  const nextPins = []
  for (const [restaurantId, posts] of groups.entries()) {
    const first = posts[0]
    const scores = posts
      .map((p) => Number(p.rating))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 5)
    const count = scores.length
    const avg = count ? scores.reduce((a, b) => a + b, 0) / count : null
    const avgLabel = (avg == null) ? '—' : avg.toFixed(1)

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
      photo: first.photos?.[0] || null,
      post: first, // keep the representative post
      // NEW: aggregated rating fields
      avg_rating: avg,
      avg_rating_label: avgLabel,
      rating_count: count,
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

  let restaurantId = postIdToRestaurantId.value.get(id)

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

  // Delegate to focusRestaurant to pan/zoom + open UI
  focusRestaurant(String(restaurantId), { openDrawer })
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

// Track filter panel open/closed state
const filtersOpen = ref(false)

// Mobile filter sheet behavior
const isMobile = ref(false)
function updateIsMobile() {
  try {
    isMobile.value = window.matchMedia('(max-width: 576px)').matches
  } catch {
    isMobile.value = window.innerWidth <= 576
  }
}
onMounted(() => updateIsMobile())
window.addEventListener('resize', updateIsMobile)

watch(
  () => filtersOpen.value,
  (open) => {
    // Prevent background scroll when mobile sheet is open
    if (isMobile.value) {
      document.body.style.overflow = open ? 'hidden' : ''
    }
  },
)
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile)
  document.body.style.overflow = ''
})

// Caches of all options for "show all when empty"
const allCuisineList = ref([])
const allAreaList = ref([])

// Refs to detect outside-click and blur inputs after pick
const cuisineBox = ref(null)
const areaBox = ref(null)
const cuisineInput = ref(null)
const areaInput = ref(null)

function normalizeList(arr) {
  if (!Array.isArray(arr)) return []
  const out = Array.from(new Set(arr.map(x => (x == null ? '' : String(x).trim())).filter(Boolean)))
  out.sort((a, b) => a.localeCompare(b))
  return out
}

function chooseCuisine(v) {
  selectedCuisine.value = v
  // For "All", clear the input box; otherwise show the picked string
  taCuisine.value.q = (v === 'All') ? '' : v
  taCuisine.value.suppressOpen = true
  taCuisine.value.open = false
  // Blur so user exits the control immediately
  requestAnimationFrame(() => cuisineInput.value && cuisineInput.value.blur())
  // Reload pins based on new filters
  loadPinsFromFilters()
}
function chooseArea(v) {
  selectedArea.value = v
  taArea.value.q = (v === 'All') ? '' : v
  taArea.value.suppressOpen = true
  taArea.value.open = false
  requestAnimationFrame(() => areaInput.value && areaInput.value.blur())
  loadPinsFromFilters()
}

// Debounced fetchers
const fetchCuisineHints = debounce(async () => {
  const q = taCuisine.value.q?.trim()
  // Ensure caches are ready
  if (!allCuisineList.value.length) {
    const list = await getAllCuisines()
    allCuisineList.value = normalizeList(list)
  }
  const base = allCuisineList.value
  if (!q) {
    // Empty → show full list (without 'All')
    taCuisine.value.items = base
    taCuisine.value.noMatch = false
    return
  }
  const needle = q.toLowerCase()
  // Start with client-side contains filter for instant UX
  let items = base.filter(s => s.toLowerCase().includes(needle))
  // Try backend search and merge (defensive)
  try {
    const remote = await getAllCuisines(q)
    const merged = normalizeList([ ...items, ...(Array.isArray(remote) ? remote : []) ])
    items = merged.filter(s => s.toLowerCase().includes(needle))
  } catch {}
  taCuisine.value.items = items
  taCuisine.value.noMatch = items.length === 0
}, 200)

const fetchAreaHints = debounce(async () => {
  const q = taArea.value.q?.trim()
  if (!allAreaList.value.length) {
    const list = await getAllLocations()
    allAreaList.value = normalizeList(list)
  }
  const base = allAreaList.value
  if (!q) {
    taArea.value.items = base
    taArea.value.noMatch = false
    return
  }
  const needle = q.toLowerCase()
  let items = base.filter(s => s.toLowerCase().includes(needle))
  try {
    const remote = await getAllLocations(q)
    const merged = normalizeList([ ...items, ...(Array.isArray(remote) ? remote : []) ])
    items = merged.filter(s => s.toLowerCase().includes(needle))
  } catch {}
  taArea.value.items = items
  taArea.value.noMatch = items.length === 0
}, 200)

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
  applyStoredTheme() // Apply saved theme from localStorage
  init()
  nextTick(() => initTooltips())
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

watch(
  () => route.query.feed || route.query.scope,
  (next) => {
    const desired = parseFeedScope(next, null)
    if (desired && feedScope.value !== desired) {
      feedScope.value = desired
    }
  },
  { immediate: true },
)

watch(
  () => route.query.restaurant,
  async (rid) => {
    if (!rid) return
    // wait for map and pins to be ready
    let tries = 0
    while ((!map.value || !pins.value.length) && tries < 20) {
      await new Promise((r) => setTimeout(r, 120)) // ~2.4s max
      tries++
    }
    if (!map.value || !pins.value.length) return
    await nextTick()
    focusRestaurant(String(rid), { openDrawer: true })
  },
  { immediate: true },
)

watch(
  () => route.query.postId,
  async (newId) => {
    if (!newId) return

    const pid = String(newId)
    const { changed: scopeChanged } = await ensureFeedScopeForPost(pid)

    // Wait for map to be initialized
    let tries = 0
    while (!map.value && tries < 30) {
      await new Promise((r) => setTimeout(r, 100)) // ~3s max
      tries++
    }
    if (!map.value) return

    // Allow existing data (or scope change) to populate the index
    let postExists = postIdToRestaurantId.value.has(pid)
    if (!postExists) {
      const budget = scopeChanged ? 8 : 4
      let waitCycles = 0
      while (!postExists && waitCycles < budget) {
        await new Promise((r) => setTimeout(r, 120))
        postExists = postIdToRestaurantId.value.has(pid)
        waitCycles++
      }
    }

    if (!postExists) {
      // Clear filters to ensure the post loads
      const resetCuisine = selectedCuisine.value !== 'All'
      const resetArea = selectedArea.value !== 'All'
      const resetPrice = selectedPrice.value !== 'All'

      if (resetCuisine) selectedCuisine.value = 'All'
      if (resetArea) selectedArea.value = 'All'
      if (resetPrice) selectedPrice.value = 'All'

      if (resetCuisine || resetArea || resetPrice) {
        await nextTick()
      }

      // Wait for pins to reload
      await loadPinsFromFilters()
      await nextTick()
      postExists = postIdToRestaurantId.value.has(pid)
    }

    if (!postExists) {
      // Final short wait in case the index updates slightly later
      let attempts = 0
      while (!postExists && attempts < 5) {
        await new Promise((r) => setTimeout(r, 120))
        postExists = postIdToRestaurantId.value.has(pid)
        attempts++
      }
    }

    // Try to focus on the post
    await focusPostOnMap(pid, { openDrawer: true })

    // Don't clear query param - let the drawer handle it when closed
    // This ensures back/forward navigation works properly
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
    taCuisine.value.open = true
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
    taArea.value.open = true
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

    // Preload caches for typeahead
    allCuisineList.value = normalizeList(cuisineList)
    allAreaList.value = normalizeList(areaList)

    // Reset filter defaults and load pins
    selectedCuisine.value = 'All'
    selectedArea.value = 'All'
    selectedPrice.value = 'All'
    const explicitScopeProvided =
      route.query?.feed !== undefined && route.query?.feed !== null ||
      route.query?.scope !== undefined && route.query?.scope !== null
    if (!explicitScopeProvided) {
      feedScope.value = 'public'
    }

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
// Handle outside-click to close dropdowns
function handleOutsidePointerDown(e) {
  const t = e.target
  const inC = cuisineBox.value && cuisineBox.value.contains(t)
  const inA = areaBox.value && areaBox.value.contains(t)
  if (!inC) taCuisine.value.open = false
  if (!inA) taArea.value.open = false
}
onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointerDown, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
})

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
        btn.addEventListener('click', async () => {
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

async function focusRestaurant(restaurantId, { openDrawer = false } = {}) {
  const pin = pins.value.find((p) => String(p.restaurant_id) === String(restaurantId))
  if (!pin || !map.value) return

  // Center and zoom in tightly
  try {
    map.value.panTo(pin.position)
    const z = map.value.getZoom && map.value.getZoom()
    if (typeof z !== 'number' || z < 17) {
      map.value.setZoom(17)
    }
  } catch {}

  // Open InfoWindow on that marker so it's obvious which pin
  const marker = markers.value.find((m) => {
    const pos = m.getPosition && m.getPosition()
    return pos && pos.lat && pos.lng && pos.lat() === pin.position.lat && pos.lng() === pin.position.lng
  })
  if (marker) {
    const html = renderInfoWindow(pin)
    infoWindow.value.setContent(html)
    infoWindow.value.open({ anchor: marker, map: map.value })
  }

  if (openDrawer) {
    selected.value = pin
    selectedPost.value = null
    selectedPosts.value = postsByRestaurant.value.get(pin.restaurant_id) || []
  }
}

async function openDrawerFor(restaurantId) {
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
  const avgLabel = (pin.avg_rating_label != null) ? pin.avg_rating_label : (pin.avg_rating != null ? Number(pin.avg_rating).toFixed(1) : '—')
  const count = Number.isFinite(pin.rating_count) ? pin.rating_count : 1
  return `
    <div class="map-info">
      ${photo}
      <div class="title">${escapeHtml(pin.name)}</div>
      <div class="meta">${escapeHtml(pin.cuisine)} • ${escapeHtml(pin.address || '')}</div>
      <div class="rating" style="margin: 6px 0 8px;">
        ⭐ ${avgLabel} <span style="color: var(--ink-400); font-weight: 600;">(${count})</span>
      </div>
      <button id="${id}">View posts</button>
    </div>
  `
}

function findPostById(postId) {
  const id = String(postId || '')
  if (!id) return null

  const groups = postsByRestaurant.value
  if (!(groups instanceof Map)) return null

  const rid = postIdToRestaurantId.value.get(id)
  if (rid) {
    const arr = groups.get(rid)
    if (Array.isArray(arr)) {
      const hit = arr.find((p) => String(p?.id ?? '') === id)
      if (hit) return hit
    }
  }

  for (const arr of groups.values()) {
    if (!Array.isArray(arr)) continue
    const hit = arr.find((p) => String(p?.id ?? '') === id)
    if (hit) return hit
  }
  return null
}

async function ensureFeedScopeForPost(postId) {
  const pid = String(postId || '')
  if (!pid) return { post: null, scope: null, changed: false }

  const originalScope = feedScope.value
  let post = findPostById(pid)

  if (!post) {
    try {
      post = await getPostById(pid)
    } catch (e) {
      console.warn('[map] ensureFeedScopeForPost: lookup failed', e)
    }
  }
  if (!post) return { post: null, scope: null, changed: false }

  const routeScope = parseFeedScope(route.query.feed ?? route.query.scope ?? null, null)
  if (routeScope) {
    const changedFromRoute = feedScope.value !== routeScope
    if (changedFromRoute) {
      feedScope.value = routeScope
    }
    return { post, scope: routeScope, changed: changedFromRoute }
  }

  const visibility = derivePostVisibility(post)
  if (visibility === null) return { post, scope: null, changed: false }

  const desiredScope = visibility ? 'public' : 'friends'
  const changed = feedScope.value !== desiredScope
  if (changed) {
    feedScope.value = desiredScope
    try {
      const nextQuery = { ...route.query, feed: desiredScope }
      router.replace({ query: nextQuery })
    } catch (err) {
      console.warn('[map] ensureFeedScopeForPost: failed to sync query feed', err)
    }
  }

  return { post, scope: desiredScope, changed: desiredScope !== originalScope }
}

function goToPost(postOrId) {
  if (!postOrId) return

  const post =
    typeof postOrId === 'object' && postOrId !== null
      ? postOrId
      : findPostById(postOrId)

  if (!post) return

  const pid = String(post.id || post.postid || '')
  if (!pid) return

  const ownerEmail =
    post.poster_email ||
    post.user_email ||
    post.owner_email ||
    (post.user && post.user.email) ||
    post.email ||
    null

  const isMine =
    ownerEmail && activeEmail.value && eqIgnoreCase(ownerEmail, activeEmail.value)

  if (isMine) {
    router.push({ path: '/activity', query: { postId: pid, tab: 'myPosts' } })
  } else {
    const visibility = derivePostVisibility(post)
    const scope = visibility === false ? 'friends' : 'public'
    const query = { postId: pid, feed: scope }
    router.push({ path: '/dashboard', query })
  }
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
  feedScope.value = 'public'

  // reset typeahead inputs and close lists WITHOUT re-opening via watchers
  taCuisine.value.suppressOpen = true
  taArea.value.suppressOpen = true
  taCuisine.value.q = ''
  taArea.value.q = ''
  taCuisine.value.open = false
  taArea.value.open = false
  // watchers will consume suppressOpen and set it back to false

  rebuildMarkers().then(() => fitMapToFilteredPins())
}
</script>

<template>
  <div class="page sage-bg">
    <!-- Filter Bar (static, above map) -->
    <div class="filter-bar w-100 d-flex flex-column align-items-center" :class="{ 'has-open-filters': filtersOpen && !isMobile }">
      <!-- Top scope + Filter pill toolbar -->
      <div class="d-flex align-items-center justify-content-between mb-2 filter-toolbar toolbar-container">
        <div class="segmented bg-white shadow-sm tool-left" role="tablist" aria-label="Feed scope">
          <!-- Friends Only -->
          <button
            type="button"
            class="seg-btn"
            :class="{ active: feedScope === 'friends' }"
            @click="feedScope = 'friends'"
            :aria-pressed="feedScope === 'friends' ? 'true' : 'false'"
            title="Friends only"
          >
            <img
              :src="feedScope === 'friends' ? '/images/friends_white.png' : '/images/friends.png'"
              alt="Friends"
              class="icon-20 me-1"
            />
            <span class="seg-label">Friends Only</span>
          </button>

          <!-- Everyone -->
          <button
            type="button"
            class="seg-btn"
            :class="{ active: feedScope === 'public' }"
            @click="feedScope = 'public'"
            :aria-pressed="feedScope === 'public' ? 'true' : 'false'"
            title="Public"
          >
            <img
              :src="feedScope === 'public' ? '/images/everyone_white.png' : '/images/everyone.png'"
              alt="Public"
              class="icon-20 me-1"
            />
            <span class="seg-label">Everyone</span>
          </button>
        </div>

        <button
          class="filter-pill tool-right"
          type="button"
          @click="filtersOpen = !filtersOpen"
          :aria-expanded="filtersOpen ? 'true' : 'false'"
          aria-controls="mapFiltersCollapse"
          title="Show/Hide Filters">
          Filter
        </button>
      </div>
      <!-- Mobile filter sheet (does not push the map) -->
      <transition name="fade">
        <div
          v-if="isMobile && filtersOpen"
          class="filter-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="filterTitle"
          @click.self="filtersOpen = false"
        >
          <div class="filter-panel" @click.stop>
            <div class="filter-header">
              <h3 id="filterTitle" class="m-0">Filters</h3>
              <button class="btn-close" type="button" aria-label="Close" @click="filtersOpen = false"></button>
            </div>

            <div
              :class="[
                'card',
                { 'pe-none': uiLocked, 'opacity-75': uiLocked },
              ]"
            >
              <div class="card-body py-3 px-3 px-md-4">
                <!-- Filters Grid: Cuisine | Area | Price (duplicated for sheet) -->
                <div class="filters-grid">
                  <!-- Cuisine typeahead -->
                  <div class="f-item" ref="cuisineBox">
                    <label class="form-label mb-1 small fw-semibold text-secondary">Cuisine</label>
                    <input
                      class="form-control form-control-sm text-start"
                      placeholder="Type to search (e.g. Japanese)"
                      v-model="taCuisine.q"
                      ref="cuisineInput"
                      @focus="taCuisine.open = true; fetchCuisineHints()"
                      :disabled="uiLocked"
                      :aria-disabled="uiLocked ? 'true' : null"
                      @input="taCuisine.open = true"
                    />
                    <ul
                      v-if="taCuisine.open"
                      class="dropdown-menu show w-100 shadow-sm filter-list"
                      style="z-index: 1200"
                    >
                      <li>
                        <button
                          type="button"
                          class="dropdown-item text-muted"
                          @mousedown.prevent
                          @click="chooseCuisine('All')"
                        >
                          Show all cuisines
                        </button>
                      </li>
                      <li v-if="taCuisine.loading" class="dropdown-item disabled">Loading…</li>
                      <li v-for="(c, i) in taCuisine.items" :key="'mc-' + i">
                        <button
                          type="button"
                          class="dropdown-item"
                          @mousedown.prevent
                          @click="chooseCuisine(c.name || c.cuisine || c)"
                        >
                          {{ c.name || c.cuisine || c }}
                        </button>
                      </li>
                      <li v-if="taCuisine.noMatch" class="dropdown-item disabled text-muted">No match</li>
                    </ul>
                  </div>

                  <!-- Area typeahead -->
                  <div class="f-item" ref="areaBox">
                    <label class="form-label mb-1 small fw-semibold text-secondary">Area</label>
                    <input
                      class="form-control form-control-sm text-start"
                      placeholder="Type to search (e.g. Bugis)"
                      v-model="taArea.q"
                      ref="areaInput"
                      @focus="taArea.open = true; fetchAreaHints()"
                      :disabled="uiLocked"
                      :aria-disabled="uiLocked ? 'true' : null"
                      @input="taArea.open = true"
                    />
                    <ul
                      v-if="taArea.open"
                      class="dropdown-menu show w-100 shadow-sm filter-list"
                      style="z-index: 1200"
                    >
                      <li>
                        <button type="button" class="dropdown-item text-muted" @mousedown.prevent @click="chooseArea('All')">
                          Show all areas
                        </button>
                      </li>
                      <li v-if="taArea.loading" class="dropdown-item disabled">Loading…</li>
                      <li v-for="(a, i) in taArea.items" :key="'ma-' + i">
                        <button
                          type="button"
                          class="dropdown-item"
                          @mousedown.prevent
                          @click="chooseArea(a.name || a.area || a)"
                        >
                          {{ a.name || a.area || a }}
                        </button>
                      </li>
                      <li v-if="taArea.noMatch" class="dropdown-item disabled text-muted">No match</li>
                    </ul>
                  </div>

                  <!-- Price chips -->
                  <div class="f-item">
                    <label class="form-label mb-1 small fw-semibold text-secondary">Price Range</label>
                    <div class="chips-wrap">
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary price-chip price-tooltip"
                        :class="{ active: selectedPrice === '$' }"
                        @click="selectedPrice = '$'"
                        :disabled="uiLocked"
                        data-tooltip="Inexpensive"
                      >
                        $
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary price-chip price-tooltip"
                        :class="{ active: selectedPrice === '$$' }"
                        @click="selectedPrice = '$$'"
                        :disabled="uiLocked"
                        data-tooltip="Moderate"
                      >
                        $$
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary price-chip price-tooltip"
                        :class="{ active: selectedPrice === '$$$' }"
                        @click="selectedPrice = '$$$'"
                        :disabled="uiLocked"
                        data-tooltip="Expensive"
                      >
                        $$$
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary price-chip price-tooltip"
                        :class="{ active: selectedPrice === '$$$$' }"
                        @click="selectedPrice = '$$$$'"
                        :disabled="uiLocked"
                        data-tooltip="Very Expensive"
                      >
                        $$$$
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary price-chip price-tooltip all-chip"
                        :class="{ active: selectedPrice === '' || selectedPrice === 'All' }"
                        @click="selectedPrice = 'All'"
                        :disabled="uiLocked"
                        data-tooltip="Show all prices"
                      >
                        All
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="row g-3 align-items-center mt-2 px-3 px-md-4 pb-3">
                <div class="col-12 d-flex justify-content-between">
                  <div class="d-inline-flex gap-2">
                    <button
                      type="button"
                      class="btn btn-sm btn-clear px-3"
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
      </transition>
      <div
        v-if="!isMobile"
        id="mapFiltersCollapse"
        :class="['collapse', { show: filtersOpen }]"
        style="width: 100%; max-width: 1400px;"
      >
        <div
          :class="[
            'card',
            { 'pe-none': uiLocked, 'opacity-75': uiLocked },
          ]"
          style="width: 100%; max-width: 1400px"
        >
        <div class="card-body py-3 px-3 px-md-4">
          <!-- Filters Grid: Cuisine | Area | Price -->
          <div class="filters-grid">
            <!-- Cuisine typeahead -->
            <div class="f-item" ref="cuisineBox">
              <label class="form-label mb-1 small fw-semibold text-secondary">Cuisine</label>
              <input
                class="form-control form-control-sm text-start"
                placeholder="Type to search (e.g. Japanese)"
                v-model="taCuisine.q"
                ref="cuisineInput"
                @focus="taCuisine.open = true; fetchCuisineHints()"
                :disabled="uiLocked"
                :aria-disabled="uiLocked ? 'true' : null"
                @input="taCuisine.open = true"
              />
              <ul
                v-if="taCuisine.open"
                class="dropdown-menu show w-100 shadow-sm filter-list"
                style="z-index: 1200"
              >
                <li>
                  <button
                    type="button"
                    class="dropdown-item text-muted"
                    @mousedown.prevent
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
                    @mousedown.prevent
                    @click="chooseCuisine(c.name || c.cuisine || c)"
                  >
                    {{ c.name || c.cuisine || c }}
                  </button>
                </li>
                <li v-if="taCuisine.noMatch" class="dropdown-item disabled text-muted">No match</li>
              </ul>
            </div>

            <!-- Area typeahead -->
            <div class="f-item" ref="areaBox">
              <label class="form-label mb-1 small fw-semibold text-secondary">Area</label>
              <input
                class="form-control form-control-sm text-start"
                placeholder="Type to search (e.g. Bugis)"
                v-model="taArea.q"
                ref="areaInput"
                @focus="taArea.open = true; fetchAreaHints()"
                :disabled="uiLocked"
                :aria-disabled="uiLocked ? 'true' : null"
                @input="taArea.open = true"
              />
              <ul
                v-if="taArea.open"
                class="dropdown-menu show w-100 shadow-sm filter-list"
                style="z-index: 1200"
              >
                <li>
                  <button type="button" class="dropdown-item text-muted" @mousedown.prevent @click="chooseArea('All')">
                    Show all areas
                  </button>
                </li>
                <li v-if="taArea.loading" class="dropdown-item disabled">Loading…</li>
                <li v-for="(a, i) in taArea.items" :key="'a-' + i">
                  <button
                    type="button"
                    class="dropdown-item"
                    @mousedown.prevent
                    @click="chooseArea(a.name || a.area || a)"
                  >
                    {{ a.name || a.area || a }}
                  </button>
                </li>
                <li v-if="taArea.noMatch" class="dropdown-item disabled text-muted">No match</li>
              </ul>
            </div>

            <!-- Price chips -->
            <div class="f-item price-item">
              <label class="form-label mb-1 small fw-semibold text-secondary">Price Range</label>
              <div class="chips-wrap">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary price-chip price-tooltip"
                  :class="{ active: selectedPrice === '$' }"
                  @click="selectedPrice = '$'"
                  :disabled="uiLocked"
                  data-tooltip="Inexpensive"
                >
                  $
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary price-chip price-tooltip"
                  :class="{ active: selectedPrice === '$$' }"
                  @click="selectedPrice = '$$'"
                  :disabled="uiLocked"
                  data-tooltip="Moderate"
                >
                  $$
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary price-chip price-tooltip"
                  :class="{ active: selectedPrice === '$$$' }"
                  @click="selectedPrice = '$$$'"
                  :disabled="uiLocked"
                  data-tooltip="Expensive"
                >
                  $$$
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary price-chip price-tooltip"
                  :class="{ active: selectedPrice === '$$$$' }"
                  @click="selectedPrice = '$$$$'"
                  :disabled="uiLocked"
                  data-tooltip="Very Expensive"
                >
                  $$$$
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary price-chip price-tooltip all-chip"
                  :class="{ active: selectedPrice === '' || selectedPrice === 'All' }"
                  @click="selectedPrice = 'All'"
                  :disabled="uiLocked"
                  data-tooltip="Show all prices"
                >
                  All
                </button>
              </div>
            </div>

            <!-- Actions inline (desktop only) -->
            <div class="f-actions">
              <div class="d-inline-flex gap-2 ms-auto">
                <button
                  type="button"
                  class="btn btn-sm btn-clear px-3"
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
    </div> <!-- /#mapFiltersCollapse -->

    <!-- Map -->
    <div ref="mapEl" class="map sage-map" :class="{ 'map-compact': !filtersOpen }"></div>

    <!-- Overlays -->
    <div v-if="loading" class="overlay">
      <div class="text-center text-muted">
        <div class="loading-compass mb-2">🧭</div><br></br>
        Loading map...
      </div>
    </div>
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
            <label class="btn btn-outline-primary btn-sm" for="scopePublic2">Everyone</label>
          </div>
        </span>
      </div>
    </div>

    <!-- FAB: Create Post (image button) -->
    <button class="fab fab-terracotta fab-img" @click="showAdd = true" title="Create Post">
      <img src="/images/CreatePost_White.png" alt="Create Post" class="fab-icon" />
    </button>

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
              @click="goToPost(p)"
              @keydown.enter="goToPost(p)"
            >
              <div class="card-body">
                <div class="d-flex align-items-start mb-2 drawer-row">
                  <img
                    :src="p.user?.avatar || DEFAULT_AVATAR"
                    class="drawer-avatar me-2"
                    alt="User avatar"
                    width="32"
                    height="32"
                    crossorigin="anonymous"
                    @error="onDrawerAvatarError"
                  />
                  <div class="flex-grow-1 min-w-0">
                    <div class="drawer-username">
                      {{ p.user?.name || p.user?.username || p.user?.id }}
                    </div>
                  </div>
                  <div class="ms-auto d-flex align-items-start gap-2 drawer-right">
                    <template v-if="p.is_public !== null">
                      <div class="vis-badge">
                        <span
                          class="badge visibility-tag"
                          :class="p.is_public ? 'vis-everyone' : 'vis-friends'"
                          :aria-label="p.is_public ? 'Visible to everyone' : 'Visible to friends only'"
                        >
                          {{ p.is_public ? 'Everyone' : 'Friends Only' }}
                        </span>
                      </div>
                    </template>
                    <div
                      v-if="Number.isFinite(Number(p.rating))"
                      class="rating-pill"
                      :aria-label="`Rated ${Number(p.rating || 0).toFixed(1)} stars`"
                    >
                      <span class="star">★</span>
                      <span class="rating-num">{{ Number(p.rating || 0).toFixed(1) }}</span>
                    </div>
                  </div>
                </div>
                <!-- <div class="d-flex justify-content-end mt-1">
                  <span
                    class="badge fw-semibold"
                    :class="p.is_public
                      ? 'bg-success-subtle text-success border border-success-subtle'
                      : 'bg-warning-subtle text-warning border border-warning-subtle'"
                    style="font-size: 0.75rem; padding: 4px 8px; border-radius: 8px;"
                  >
                    {{ p.is_public ? 'Everyone' : 'Friends Only' }}
                  </span>
                </div> -->

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
.loading-compass {
  animation: spin 1s linear infinite;
  font-size: 50px;
  display: inline-block;
}

@keyframes spin-compass {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.page {
  position: relative;
  min-height: 100vh; /* allow for content to grow */
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: visible; /* allow page scroll */
}

.map {
  width: 100%;
  max-width: 1400px; /* align with toolbar */
  height: calc(100vh - 160px); /* fill screen dynamically minus toolbar/navbar */
  margin: 0 auto; /* center horizontally */
  transition: height 0.3s ease;
}

/* Add slight spacing below filters when open */
.collapse.show + .map,
#mapFiltersCollapse.show + .map {
  margin-top: 12px;
}

.map-compact {
  height: calc(100vh - 220px); /* slightly smaller when filters are closed */
}

@media (max-width: 768px) {
  .map { height: calc(100vh - 200px); }
  .map-compact { height: calc(100vh - 260px); }
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
  bottom: 28px;
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
/* Custom image FAB styling */
.fab-img {
  background: transparent;
  border: none;
  padding: 0;
  /* border-radius: 50%; */
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.fab-img:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.fab-img:active {
  transform: scale(0.96);
}

.fab-icon {
  width: 50px;
  height: 50px;
  /* border-radius: 50%; */
  object-fit: contain;
}
/* Backdrop + Drawer */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 5000; /* above filter bar + map */
  background: transparent !important;
  backdrop-filter: none !important;
}
.side {
  position: fixed;
  top: 0;
  right: 0;
  width: 420px;
  max-width: 92vw;
  height: 100vh;
  z-index: 5100; /* above backdrop */
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

/* Custom tooltip for price chips */
.price-tooltip {
  position: relative;
}

.price-tooltip::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-8px);
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 1000;
}

.price-tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-2px);
  border: 5px solid transparent;
  border-top-color: rgba(0, 0, 0, 0.85);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 1000;
}

.price-tooltip:hover::after,
.price-tooltip:hover::before {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.price-tooltip:hover::before {
  transform: translateX(-50%) translateY(-4px);
}

.dropdown-menu.filter-list {
  max-height: calc(44px * 4); /* header + 3 options */
  overflow: auto;
}

.filter-bar {
  top: 0;
  z-index: 10; /* lower than navbar (20), but visible above map content */
  width: 100%;
  margin: 14px auto 0;
  padding: 0;
}

/* Add spacing between filter bar and map when desktop filters are open */
.filter-bar.has-open-filters {
  margin-bottom: 12px;
}

/* Filter bar card styling to match dashboard */
.filter-bar .card {
  border: 0;
  box-shadow: 0 12px 24px rgba(17, 24, 39, 0.08);
  border-radius: 16px;
}

/* Scope toggle button styling */
.btn-outline-secondary.active {
  background-color: var(--sage-600);
  border-color: var(--sage-600);
  color: #fff;
}

.vis-badge {
  position: relative;
  display: inline-block;
  margin-right: 6px;
}

.visibility-tag {
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: 8px;
  border: none;
}

.sage-tag {
  background-color: var(--sage-600, #8B9D83);
  color: #fff;
}

.terracotta-tag {
  background-color: var(--terracotta-500, #D4816F);
  color: #fff;
}

.rating-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
}
.rating-pill .star {
  color: #f59e0b;
  font-size: 16px;
  line-height: 1;
}
.rating-pill .rating-num {
  font-weight: 700;
  color: #f59e0b;
}

.drawer-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(17, 24, 39, 0.08);
  flex-shrink: 0;
}

/* Theme-aware visibility badges driven by data-theme */
:global(html[data-theme="light"]) {
  --vis-everyone-bg: var(--sage-600, #8B9D83);
  --vis-everyone-fg: #fff;
  --vis-friends-bg: var(--terracotta-500, #D4816F);
  --vis-friends-fg: #fff;
}
:global(html[data-theme="brand-mint"]) {
  --vis-everyone-bg: var(--mint-600, #2CA58D);
  --vis-everyone-fg: #fff;
  --vis-friends-bg: var(--terracotta-500, #D4816F);
  --vis-friends-fg: #fff;
}
:global(html[data-theme="brand-lagoon"]) {
  --vis-everyone-bg: var(--lagoon-600, #2B6CB0);
  --vis-everyone-fg: #fff;
  --vis-friends-bg: var(--terracotta-500, #D4816F);
  --vis-friends-fg: #fff;
}
:global(html[data-theme="brand-plum"]) {
  --vis-everyone-bg: var(--plum-600, #7E55A3);
  --vis-everyone-fg: #fff;
  --vis-friends-bg: var(--terracotta-500, #D4816F);
  --vis-friends-fg: #fff;
}

.vis-everyone {
  background-color: var(--vis-everyone-bg, var(--sage-600, #8B9D83));
  color: var(--vis-everyone-fg, #fff);
}
.vis-friends {
  background-color: var(--vis-friends-bg, var(--terracotta-500, #D4816F));
  color: var(--vis-friends-fg, #fff);
}

/* --- Per-card hover and click feedback (not whole drawer) --- */
.card-hover {
  transition: transform 0.06s ease, box-shadow 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}
.card-hover:hover {
  box-shadow: 0 8px 20px rgba(17, 24, 39, 0.12);
  background-color: var(--cream-100, #faf7f2);
  border-color: var(--line-200, #e5e7eb) !important;
}
.card-clickable {
  cursor: pointer;
}
.card-clickable:active {
  transform: translateY(1px) scale(0.998);
  background-color: var(--cream-100, #faf7f2);
}
.card-clickable:focus-visible {
  outline: 2px solid var(--sage-600, #8B9D83);
  outline-offset: 2px;
  border-radius: 10px;
}

/* --- Filter toolbar (Friends/Public segmented + Filter pill) --- */
.filter-toolbar { padding: 4px 2px; }
.segmented {
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border-radius: 16px;
  border: 1px solid var(--line-200);
  background: #fff;
}
.segmented .seg-btn {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 6px 12px;
  border-radius: 12px;
  font-weight: 700;
  color: var(--charcoal);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}
.segmented .seg-btn:hover {
  background: var(--sage-100);
  color: var(--charcoal);
}
.segmented .seg-btn.active {
  background: var(--sage-600);
  color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15) inset;
}
.segmented .seg-ico { display: inline-block; width: 18px; text-align: center; }
.filter-pill {
  border: 1px solid var(--line-300, #d1d5db);
  background: #fff;
  color: var(--charcoal);
  font-weight: 800;
  border-radius: 999px;
  padding: 8px 18px;
  box-shadow: 0 4px 14px rgba(0,0,0,.06);
}
.filter-pill:hover { background: #f9fafb; }
.filter-pill:active { transform: translateY(1px); }

/* Toolbar container widths + wrapping */
.toolbar-container {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;            /* center within page */
  padding: 0 8px;            /* small side breathing room */
  gap: 8px;                  /* space between left/right */
  flex-wrap: wrap;           /* wrap on small screens */
}
.tool-left { flex: 0 1 auto; }
.tool-right { margin-left: auto; }

/* When wrapped on narrow screens, center segmented and move Filter below to the right */
@media (max-width: 576px) {
  .toolbar-container { justify-content: center; }
  .tool-left { width: 100%; display: flex; justify-content: center; }
  .tool-right { margin-left: 0; margin-top: 6px; }
}

/* Slight size tuning so the segmented looks balanced */
.segmented .seg-btn { padding: 6px 12px; }
.filter-pill { padding: 10px 18px; }

/* --- Filters grid layout --- */
.filters-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 12px; /* space between controls */
}
.filters-grid .f-item {
  grid-column: span 12;
}
@media (min-width: 768px) {
  .filters-grid .f-item { grid-column: span 6; }
}
@media (min-width: 1200px) {
  .filters-grid .f-item { grid-column: span 4; }
}

@media (min-width: 992px) {
  /* 3 filter columns + 1 actions column pinned to the right */
  .filters-grid {
    grid-template-columns: 1fr 1fr 2fr auto;
    align-items: end; /* align contents by bottoms */
  }
  /* ensure every cell sits on the same baseline */
  .filters-grid > * { align-self: end; }
  .filters-grid .f-item { grid-column: auto; }
  .filters-grid .f-actions {
    grid-column: auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
}

/* Tablet layout: 768–991px
   Row 1: Cuisine (6) | Area (6)
   Row 2: Price (9) | Actions (3, right-aligned)
*/
@media (min-width: 768px) and (max-width: 991.98px) {
  .filters-grid {
    grid-template-columns: repeat(12, 1fr);
    align-items: end; /* align labels/controls baseline */
  }
  .filters-grid .f-item { grid-column: span 6; }      /* Cuisine & Area */
  .filters-grid .price-item { grid-column: span 9; }  /* Price wider */
  .filters-grid .f-actions {
    grid-column: span 3;
    display: flex;
    align-items: center;
    justify-content: flex-end; /* push Clear/Fit to right */
    gap: 8px;
  }

  /* Keep price chips to one line on tablets too */
  .chips-wrap { flex-wrap: nowrap; }
  .chips-wrap .all-chip { margin-left: 0; } /* All sits right beside $$$$ */
}

/* Keep inputs and chips aligned visually */
.filters-grid .form-label { margin-bottom: 6px; }
 .chips-wrap {
   display: flex;
   flex-wrap: wrap;
   gap: 8px;
   align-items: center;
 }
 /* On desktop, keep chips on one line and keep 'All' directly next to $$$$ (no push to far right) */
 @media (min-width: 992px) {
   .chips-wrap { flex-wrap: nowrap; }
   /* Keep 'All' directly next to $$$$ (no push to far right) */
   .chips-wrap .all-chip { margin-left: 0; }
 }

/* Ensure dropdown menus never overflow the card */
.filters-grid .dropdown-menu.filter-list {
  max-height: 220px;
  overflow: auto;
}


/* Drawer row: allow name to wrap while keeping right pills fixed-aligned */
.drawer-row { gap: 8px; }
.min-w-0 { min-width: 0; }
.drawer-username {
  font-weight: 700;
  color: var(--charcoal);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.2;
  word-break: break-word;
}
.drawer-right { flex-shrink: 0; white-space: nowrap; }


/* --- Mobile filter sheet --- */
.filter-sheet {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  z-index: 5200; /* above backdrop & drawers */
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 60px; /* distance from top */
}
.filter-panel {
  width: 100%;
  max-width: 700px;
  background: #fff;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  box-shadow: 0 -6px 24px rgba(0,0,0,.15);
  max-height: 85vh;
  overflow: auto;
  padding: 10px 12px 16px;
  margin-top: 0;
  animation: sheet-fade 180ms ease-out;
}
.filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px 10px;
  border-bottom: 1px solid var(--line-200, #e5e7eb);
  margin-bottom: 8px;
}

@keyframes sheet-fade {
  from { transform: translateY(-8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Fade for backdrop */
.fade-enter-active, .fade-leave-active { transition: opacity .16s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Ensure desktop collapse never shows on mobile */
@media (max-width: 576px) {
  #mapFiltersCollapse { display: none !important; }
}
</style>
