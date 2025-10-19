<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import PostCard from '@/components/PostCard.vue'
import Modal from '@/components/Modal.vue'
import AddRecommendationForm from '@/components/AddRecommendationForm.vue'
import axios from 'axios'
import { useRoute } from 'vue-router'
import { useRouter } from 'vue-router'

// === Backend config ===
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } })
// In dev, use relative paths so requests go through Vite dev proxy (no CORS)
const IMAGE_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_IMAGE_BASE_URL || API_BASE)
function resolveImageUrl(p) {
  if (!p) return null
  const s = String(p)
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s
  const clean = s.replace(/^\/+/, '')
  return IMAGE_BASE ? `${IMAGE_BASE}/${clean}` : `/${clean}`
}
// TEMP: until auth is wired, use a fixed user for friends feed
const ACTIVE_EMAIL = import.meta.env.VITE_ACTIVE_EMAIL || 'clarice.lim.2024@computing.smu.edu.sg'

const posts = ref([])
const trendingSlides = ref([])
const showAdd = ref(false)
const currentUser = ref({ email: ACTIVE_EMAIL })
const highlightedPostId = ref(null)

// === Filter bar state and helpers ===
const friendsOnly = ref(true)
const filters = ref({
  cuisine: '',
  area: '',
  priceSymbol: '', // "$", "$$", "$$$", "$$$$", "$$$$$"
})

const cuisineQuery = ref('')
const areaQuery = ref('')
const cuisineSuggestions = ref([])
const areaSuggestions = ref([])
const showCuisineList = ref(false)
const showAreaList = ref(false)
// Detect whether backend feed uses $$$ max (scaleMax=3) or $$$$ max (scaleMax=4)
const priceScaleMax = ref(4)

let cuisineTimer = null
let areaTimer = null
// --- Typeahead helpers for filter bar ---
async function getAllCuisines(q) {
  const url = '/map/getAllCuisines'
  const tries = [
    () => api.post(url, { query: q }),
    () => api.get(url, { params: { query: q } }),
    () => api.post(url, { search: q }),
    () => api.get(url, { params: { search: q } }),
  ]
  for (const t of tries) {
    try {
      const r = await t()
      const data = Array.isArray(r.data?.data) ? r.data.data : r.data
      return Array.isArray(data) ? data : []
    } catch {}
  }
  return []
}

async function getAllLocations(q) {
  const url = '/map/getAllLocations'
  const tries = [
    () => api.post(url, { query: q }),
    () => api.get(url, { params: { query: q } }),
    () => api.post(url, { search: q }),
    () => api.get(url, { params: { search: q } }),
  ]
  for (const t of tries) {
    try {
      const r = await t()
      const data = Array.isArray(r.data?.data) ? r.data.data : r.data
      return Array.isArray(data) ? data : []
    } catch {}
  }
  return []
}

function onCuisineInput() {
  showCuisineList.value = true
  clearTimeout(cuisineTimer)
  const q = cuisineQuery.value.trim()
  cuisineTimer = setTimeout(async () => {
    cuisineSuggestions.value = q ? await getAllCuisines(q) : []
  }, 180)
}
function onAreaInput() {
  showAreaList.value = true
  clearTimeout(areaTimer)
  const q = areaQuery.value.trim()
  areaTimer = setTimeout(async () => {
    areaSuggestions.value = q ? await getAllLocations(q) : []
  }, 180)
}

function pickCuisine(v) {
  filters.value.cuisine = v
  cuisineQuery.value = v
  showCuisineList.value = false
}
function pickArea(v) {
  filters.value.area = v
  areaQuery.value = v
  showAreaList.value = false
}

// Helper: Map price symbol to index (0..3)
function priceSymbolToIndex(s) {
  if (!s) return null
  const table = ['$', '$$', '$$$', '$$$$'] // max 4
  const idx = table.indexOf(String(s))
  return idx >= 0 ? idx : null
}

// Normalize a backend price value (number or symbol) to 0..(scaleMax-1) index
function normalizePriceIndex(v, scaleMax = 4) {
  if (v == null) return null
  const cap = Math.max(1, Math.min(4, Number(scaleMax))) - 1 // 3 for $$$$, 2 for $$$
  const str = String(v)
  // Symbol form: '$'..'$$$$'
  if (/^\$+$/.test(str)) {
    let idx = str.length - 1
    if (idx > cap) idx = cap // clamp if feed only has up to $$$
    return idx >= 0 ? idx : null
  }
  // Numeric forms some backends use — prefer 1-based encodings first (most common)
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  // B) 1..4 → 0..3 (preferred)
  if (n >= 1 && n <= 4) return Math.min(n - 1, cap)
  // C) 1..3 → 0..2 (some feeds max at $$$)
  if (n >= 1 && n <= 3) return Math.min(n - 1, cap)
  // A) 0..3 direct indices (least common)
  if (n >= 0 && n <= 3) return Math.min(n, cap)
  return null
}

function priceIndexFromPost(p) {
  // Prefer explicit post.price_range, else raw fields, else symbol
  const candidates = [
    p?.price_range,
    p?.raw?.price_range,
    p?.raw?.priceLevel,
    p?.raw?.price_level,
    p?.raw?.price,
    p?.price,
    p?.price_symbol,
    p?.raw?.price_symbol,
  ]
  for (const v of candidates) {
    const idx = normalizePriceIndex(v, priceScaleMax.value)
    if (idx !== null) return idx
  }
  // As a last resort, infer from restaurant if present
  const rest = p?.restaurant
  if (rest) {
    const idx2 = normalizePriceIndex(
      rest.price_range || rest.price_level || rest.price,
      priceScaleMax.value,
    )
    if (idx2 !== null) return idx2
  }
  return null
}

// --- String normalization helpers ---
function normStr(v) {
  if (v == null) return ''
  return String(v).trim()
}
function isNonEmpty(v) {
  return normStr(v) !== ''
}

// --- Main search runner for feed ---
async function runSearch() {
  const cuisine = normStr(filters.value.cuisine || cuisineQuery.value)
  const area = normStr(filters.value.area || areaQuery.value)
  const sym = normStr(filters.value.priceSymbol)

  const payload = {
    user_email: ACTIVE_EMAIL,
  }

  // Public/friends compatibility
  payload.friends = !!friendsOnly.value
  payload.public = !friendsOnly.value
  payload.show_public = !friendsOnly.value
  payload.is_public = !friendsOnly.value

  // Cuisine compatibility keys
  if (isNonEmpty(cuisine)) {
    payload.cuisine_type = cuisine
    payload.cuisine = cuisine
    payload.cuisineType = cuisine
    payload.cuisine_query = cuisine
  }

  // Area/location compatibility keys
  if (isNonEmpty(area)) {
    payload.area = area
    payload.location = area
    payload.loc = area
    payload.area_name = area
    payload.neighbourhood = area
    payload.neighborhood = area
    payload.area_query = area
  }

  // Price symbol + strict equality hints for diverse backends
  if (isNonEmpty(sym)) {
    payload.price_symbol = sym // e.g. "$", "$$$"
    const pr0 = priceSymbolToIndex(sym) // 0..3 index
    if (pr0 !== null) {
      // Common shapes used across our endpoints; the backend may choose one
      payload.price_range = pr0 // 0..3
      payload.price_range_eq = pr0 // enforce exact match if supported
      payload.price_level_eq = pr0 + 1 // some use 1..4
      payload.price_eq = pr0 + 1 // fallback exact key used by some services
    }
    // Avoid ambiguous keys
    delete payload.price
    delete payload.price_level
    delete payload.priceLevel
  }

  console.log('[Dashboard] filter payload →', JSON.parse(JSON.stringify(payload)))

  const rows = await getFilteredPosts(payload)
  console.log('[Dashboard] rows len', rows?.length, rows?.slice?.(0, 2))

  const safeRows = Array.isArray(rows) ? rows : []
  let feed = safeRows.map(rowToPost)
  console.log('[Dashboard] feed mapped →', feed.length, feed[0])

  // Detect price scale in current payload results
  const hasFourDollar = feed.some((p) => {
    const cand = [
      p?.price_range,
      p?.price,
      p?.price_symbol,
      p?.raw?.price_range,
      p?.raw?.price_level,
      p?.raw?.price,
      p?.raw?.price_symbol,
      p?.restaurant?.price_range,
      p?.restaurant?.price_level,
    ]
    return cand.some((v) => (typeof v === 'string' && /^\${4}$/.test(v)) || Number(v) === 4)
  })
  const hasThreeDollar = feed.some((p) => {
    const cand = [
      p?.price_range,
      p?.price,
      p?.price_symbol,
      p?.raw?.price_range,
      p?.raw?.price_level,
      p?.raw?.price,
      p?.raw?.price_symbol,
      p?.restaurant?.price_range,
      p?.restaurant?.price_level,
    ]
    return cand.some((v) => (typeof v === 'string' && /^\${3}$/.test(v)) || Number(v) === 3)
  })
  priceScaleMax.value = hasFourDollar ? 4 : hasThreeDollar ? 3 : 4

  // === FE price filter (robust to 0..3, 1..4, 1..3 and '$' symbols) ===
  if (isNonEmpty(sym)) {
    const want = priceSymbolToIndex(sym)
    if (want !== null) {
      feed = feed.filter((p) => {
        const have = priceIndexFromPost(p)
        return have !== null && have === want
      })
    }
  }

  const needHydrate = feed.filter((p) => !p.text && p.id).slice(0, 5)
  if (needHydrate.length) {
    const hydrated = await Promise.all(
      needHydrate.map(async (p) => {
        const detail = await getPostById(p.id)
        if (!detail) return p
        return {
          ...p,
          text: detail.review || p.text,
          rating: Number(detail.rating ?? p.rating),
          area: detail.area ?? p.area ?? null,
          price_range: detail.price_range ?? p.price_range ?? null,
          photos: Array.isArray(detail.pictures)
            ? detail.pictures.map(resolveImageUrl).filter(Boolean)
            : p.photos,
          pictures: Array.isArray(detail.pictures)
            ? detail.pictures.map(resolveImageUrl).filter(Boolean)
            : p.pictures,
          restaurant: {
            ...p.restaurant,
            name: detail.restaurant_name || p.restaurant.name,
            address: detail.restaurant_address || p.restaurant.address,
            cuisine_type: detail.cuisine_type || p.restaurant.cuisine_type,
          },
          raw: { ...p.raw, created_at: detail.created_at ?? p.raw.created_at },
        }
      }),
    )
    const byId = new Map(hydrated.map((h) => [h.id, h]))
    feed = feed.map((p) => byId.get(p.id) || p)
  }

  feed.sort((a, b) => new Date(b.raw.created_at || 0) - new Date(a.raw.created_at || 0))

  if (!Array.isArray(posts.value)) {
    console.warn('[Dashboard] posts ref not an array, reinitialising')
    posts.value = []
  }
  // Make the update bulletproof:
  posts.value.splice(0, posts.value.length, ...feed)
  console.log('[Dashboard] posts updated →', posts.value.length)

  await nextTick()
  await scrollToPostIfAny()
}

// When you click the post in map it directs you to the post here

const route = useRoute()
const router = useRouter()

function applyVisibilityFromQuery() {
  const q = route.query || {}
  if (q.feed === 'public') {
    friendsOnly.value = false
    return true
  }
  if (q.feed === 'friends') {
    friendsOnly.value = true
    return true
  }
  if (q.is_public === '1' || q.public === '1' || q.public === 'true' || q.is_public === 'true') {
    friendsOnly.value = false
    return true
  }
  if (q.friends === '1' || q.friends === 'true') {
    friendsOnly.value = true
    return true
  }
  return false
}

async function scrollToPostIfAny() {
  const postId = route.query.postId
  if (!postId) return
  // Apply visibility from query and refresh results if it changed
  const prev = friendsOnly.value
  const changed = applyVisibilityFromQuery()
  if (changed && friendsOnly.value !== prev) {
    await runSearch()
  }
  await nextTick()
  const el = document.getElementById(`post-${postId}`)
  if (!el) return
  highlightedPostId.value = String(postId)
  const header = document.querySelector('.navbar, header.sticky')
  const headerOffset = header ? Math.max(header.clientHeight, 56) : 56
  const pad = 12
  const viewport = window.innerHeight
  const rect = el.getBoundingClientRect()
  const elTopAbs = rect.top + window.pageYOffset
  const elHeight = el.offsetHeight
  const available = viewport - headerOffset - pad * 2
  let y
  if (elHeight <= available) {
    const extra = (available - elHeight) / 2
    y = elTopAbs - headerOffset - pad - extra
  } else {
    y = elTopAbs - headerOffset - pad
  }
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
  if (typeof el.focus === 'function') {
    el.setAttribute('tabindex', '-1')
    el.focus({ preventScroll: true })
  }
  // Re-adjust once after images/content settle
  setTimeout(() => {
    const rect2 = el.getBoundingClientRect()
    const elTopAbs2 = rect2.top + window.pageYOffset
    const elHeight2 = el.offsetHeight
    let y2
    if (elHeight2 <= available) {
      const extra2 = (available - elHeight2) / 2
      y2 = elTopAbs2 - headerOffset - pad - extra2
    } else {
      y2 = elTopAbs2 - headerOffset - pad
    }
    window.scrollTo({ top: Math.max(0, y2), behavior: 'auto' })
  }, 350)
  // Clear the query and end highlight
  setTimeout(() => {
    highlightedPostId.value = null
    clearPostQuery()
  }, 1400)
}

function clearPostQuery() {
  const q = { ...route.query }
  delete q.postId
  router.replace({ query: q })
}

// --- Tooltip initializer (Bootstrap 5 if available) ---
function initTooltips() {
  try {
    const Tooltip = window.bootstrap?.Tooltip
    const els = document.querySelectorAll('[data-bs-toggle="tooltip"]')
    if (Tooltip && els.length) {
      els.forEach((el) => {
        const existing = Tooltip.getInstance?.(el)
        if (existing) existing.dispose()
        new Tooltip(el)
      })
    }
    // If Bootstrap JS isn't present, the native browser tooltip still works via `title`.
  } catch (e) {
    console.warn('[Dashboard tooltip] init failed (fallback to native title)', e)
  }
}

watch(
  () => route.query.postId,
  () => {
    scrollToPostIfAny()
  },
)

// Handlers for scope toggle (avoid multi-line inline expressions in the template)
function setFriends() {
  friendsOnly.value = true
  runSearch()
}
function setPublic() {
  friendsOnly.value = false
  runSearch()
}
// Handler: clear all filters and run search
function clearFilters() {
  filters.value.cuisine = ''
  filters.value.area = ''
  filters.value.priceSymbol = ''
  cuisineQuery.value = ''
  areaQuery.value = ''
  showCuisineList.value = false
  showAreaList.value = false
  cuisineSuggestions.value = []
  areaSuggestions.value = []
  runSearch()
}
// -------- Helpers to call your backend (same as MapView style) --------
// New: unified filtered posts endpoint (friends/public + filters)
async function getFilteredPosts(payload) {
  try {
    const r = await api.post('/map/getFilteredPosts', payload)
    const body = r.data
    if (Array.isArray(body)) return body
    if (Array.isArray(body?.data)) return body.data
    return []
  } catch (e) {
    console.error(
      '[Dashboard] getFilteredPosts failed:',
      e.response?.status,
      e.response?.data || e.message,
    )
    return []
  }
}

async function getPostById(postId) {
  const url = '/user/getPostbyId'
  const id = String(postId)
  // Try common shapes the backend may accept
  const tries = [
    () => api.post(url, { post_id: id }),
    () => api.post(url, { postID: id }),
    () => api.post(url, { postid: id }),
    () => api.get(url, { params: { post_id: id } }),
    () => api.get(url, { params: { postID: id } }),
    () => api.get(url, { params: { postid: id } }),
  ]
  for (const t of tries) {
    try {
      const r = await t()
      return (Array.isArray(r.data?.data) ? r.data.data[0] : r.data?.data) || null
    } catch (err) {
      if (err?.response?.status && err.response.status !== 400) {
        console.warn(
          '[Dashboard] getPostById failed try:',
          err.response.status,
          err.response.data || err.message,
        )
      }
    }
  }
  return null
}

function toNicePost(pin, detail) {
  // Some backends use `longitude`; others used `longtitude`
  const lng = Number(pin.longitude ?? pin.longtitude)
  const lat = Number(pin.latitude)
  return {
    id: detail?.postid || pin.postid,
    text: detail?.review || '',
    rating: Number(detail?.rating) || 0,
    area: detail?.area ?? null,
    price_range: detail?.price_range ?? null,
    photos: Array.isArray(detail?.pictures)
      ? detail.pictures.map(resolveImageUrl).filter(Boolean)
      : [],
    pictures: Array.isArray(detail?.pictures)
      ? detail.pictures.map(resolveImageUrl).filter(Boolean)
      : [],
    user: {
      id: detail?.poster_email,
      name: detail?.poster_username || detail?.poster_email,
      username: detail?.poster_username || detail?.poster_email,
      avatar: '/images/avatar1.png',
    },
    restaurant: {
      id: pin.restaurant_id,
      name: detail?.restaurant_name || pin.restaurant_id,
      address: detail?.restaurant_address || '',
      cuisine_type: detail?.cuisine_type || '',
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lng) ? lng : undefined,
    },
    likes: 0,
    raw: {
      created_at: detail?.created_at,
      upvote_count: 0,
      user_has_upvoted: false,
      comments: [],
    },
  }
}

function rowToPost(row) {
  const lat = Number(row.lat ?? row.latitude)
  const lng = Number(row.long ?? row.lng ?? row.longitude ?? row.longtitude)
  return {
    id: row.postid || row.post_id,
    text: row.review || '',
    rating: Number(row.rating ?? 0),
    area: row.area ?? null,
    price_range: row.price_range ?? null,
    photos: Array.isArray(row.pictures) ? row.pictures.map(resolveImageUrl).filter(Boolean) : [],
    pictures: Array.isArray(row.pictures) ? row.pictures.map(resolveImageUrl).filter(Boolean) : [],
    user: {
      id: row.poster_email || row.poster_username,
      name: row.poster_username || row.poster_email || '@user',
      username: row.poster_username || row.poster_email || '@user',
      avatar: '/images/avatar1.png',
    },
    restaurant: {
      id: row.restaurant_id,
      name: row.restaurant_name || row.name || row.restaurant_id,
      address: row.address || '',
      cuisine_type: row.cuisine_type || '',
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lng) ? lng : undefined,
    },
    likes: 0,
    raw: {
      created_at: row.created_at,
      public: row.public ?? row['public?'] ?? true,
      upvote_count: row.upvote_count ?? 0,
      user_has_upvoted: row.user_has_upvoted ?? false,
      comments: row.comments ?? [],
    },
  }
}

async function load() {
  try {
    await runSearch()
    // Trending slides (group by restaurant) logic (copied from previous load)
    const feed = posts.value
    const byRest = new Map()
    for (const post of feed) {
      const r = post.restaurant
      if (!r?.id) continue
      if (!byRest.has(r.id))
        byRest.set(r.id, {
          id: r.id,
          title: r.name,
          address: r.address,
          cuisine: r.cuisine_type,
          ratings: [],
          cover: post.photos?.[0] || null,
        })
      const entry = byRest.get(r.id)
      entry.ratings.push(Number(post.rating) || 0)
      if (!entry.cover && post.photos?.[0]) entry.cover = post.photos[0]
    }
    const slides = Array.from(byRest.values()).map((s) => {
      const avg = s.ratings.length
        ? (s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length).toFixed(1)
        : '—'
      return {
        ...s,
        avgRating: avg,
        subtitle: `${s.cuisine || ''}${s.cuisine && s.address ? ' • ' : ''}${s.address || ''}`,
      }
    })
    trendingSlides.value = slides
      .sort((a, b) => Number(b.avgRating) - Number(a.avgRating))
      .slice(0, 6)
  } catch (e) {
    console.error('Dashboard load failed:', e)
  }
}

function handleAdded() {
  showAdd.value = false
  load() // refresh after posting
}

function viewOnMap(post) {
  // Navigate to MapView (root path assumed); carry the post id in query and feed
  router.push({
    path: '/map',
    query: { postId: String(post?.id), feed: friendsOnly.value ? 'friends' : 'public' },
  })
}

onMounted(load)

// Ensure tooltips are initialized after mount and when chips re-render
onMounted(() => nextTick(() => initTooltips()))

watch(
  () => [filters.value.priceSymbol, showCuisineList.value, showAreaList.value],
  () => nextTick(() => initTooltips()),
)
</script>

<template>
  <div class="page sage-bg">
    <!-- Trending Section -->

    <section class="hero container">
      <h2 class="section-title">Trending Food</h2>

      <div id="trendingCarousel" class="carousel slide sage-glass" data-bs-ride="carousel">
        <div class="carousel-indicators" v-if="trendingSlides.length > 1">
          <button
            v-for="(s, i) in trendingSlides"
            :key="s.id || i"
            type="button"
            data-bs-target="#trendingCarousel"
            :data-bs-slide-to="i"
            :class="{ active: i === 0 }"
            :aria-current="i === 0 ? 'true' : undefined"
            :aria-label="`Slide ${i + 1}`"
          ></button>
        </div>

        <div class="carousel-inner">
          <div
            v-for="(s, i) in trendingSlides"
            :key="s.id || i"
            :class="['carousel-item', { active: i === 0 }]"
          >
            <div class="d-flex align-items-center justify-content-center trend-slide">
              <div class="text-center">
                <span class="slide-text">{{ s.title || 'Loading…' }}</span>
                <span v-if="s.avgRating" class="slide-sub d-block mt-1">⭐ {{ s.avgRating }}</span>
                <span v-if="s.subtitle" class="slide-sub d-block">{{ s.subtitle }}</span>
              </div>
            </div>
          </div>
        </div>

        <button
          class="carousel-control-prev"
          type="button"
          data-bs-target="#trendingCarousel"
          data-bs-slide="prev"
          v-if="trendingSlides.length > 1"
        >
          <span class="carousel-control-prev-icon" aria-hidden="true"></span>
          <span class="visually-hidden">Previous</span>
        </button>
        <button
          class="carousel-control-next"
          type="button"
          data-bs-target="#trendingCarousel"
          data-bs-slide="next"
          v-if="trendingSlides.length > 1"
        >
          <span class="carousel-control-next-icon" aria-hidden="true"></span>
          <span class="visually-hidden">Next</span>
        </button>
      </div>
    </section>

    <!-- Posts Feed -->
    <section class="feed container">
      <div class="d-flex align-items-center justify-content-between mb-2">
        <h3 class="feed-title mb-0">Posts</h3>
      </div>

      <div class="feed-shell sage-glass p-3">
        <!-- Filter Bar (mirrors Map) -->
        <div class="card mb-3">
          <div class="card-body py-3 px-3 px-md-4">
            <!-- Row 1: Typeaheads + Price chips -->
            <div class="row g-3 align-items-end">
              <!-- Cuisine typeahead -->
              <div class="col-12 col-md-6 col-lg-4 position-relative">
                <label class="form-label mb-1 small fw-semibold text-secondary">Cuisine</label>
                <input
                  class="form-control form-control-sm text-start"
                  placeholder="Type to search (e.g. Japanese)"
                  v-model="cuisineQuery"
                  @focus="onCuisineInput"
                  @input="onCuisineInput"
                  @blur="() => setTimeout(() => (showCuisineList = false), 120)"
                />
                <ul
                  v-if="showCuisineList"
                  class="dropdown-menu show w-100 shadow-sm"
                  style="max-height: 260px; overflow: auto; z-index: 1200"
                >
                  <li>
                    <button type="button" class="dropdown-item text-muted" @click="pickCuisine('')">
                      Show all cuisines
                    </button>
                  </li>
                  <li v-if="!cuisineSuggestions.length" class="dropdown-item disabled text-muted">No match</li>
                  <li v-for="(c, i) in cuisineSuggestions" :key="'c-' + i">
                    <button type="button" class="dropdown-item" @mousedown.prevent="pickCuisine(c)">
                      {{ c }}
                    </button>
                  </li>
                </ul>
              </div>

              <!-- Area typeahead -->
              <div class="col-12 col-md-6 col-lg-4 position-relative">
                <label class="form-label mb-1 small fw-semibold text-secondary">Area</label>
                <input
                  class="form-control form-control-sm text-start"
                  placeholder="Type to search (e.g. Bugis)"
                  v-model="areaQuery"
                  @focus="onAreaInput"
                  @input="onAreaInput"
                  @blur="() => setTimeout(() => (showAreaList = false), 120)"
                />
                <ul
                  v-if="showAreaList"
                  class="dropdown-menu show w-100 shadow-sm"
                  style="max-height: 260px; overflow: auto; z-index: 1200"
                >
                  <li>
                    <button type="button" class="dropdown-item text-muted" @click="pickArea('')">
                      Show all areas
                    </button>
                  </li>
                  <li v-if="!areaSuggestions.length" class="dropdown-item disabled text-muted">No match</li>
                  <li v-for="(a, i) in areaSuggestions" :key="'a-' + i">
                    <button type="button" class="dropdown-item" @mousedown.prevent="pickArea(a)">
                      {{ a }}
                    </button>
                  </li>
                </ul>
              </div>

              <!-- Price chips -->
              <div class="col-12 col-lg-4">
                <label class="form-label mb-1 small fw-semibold text-secondary">Price Range</label>
                <div class="d-flex gap-2 flex-wrap">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary price-chip"
                    :class="{ active: filters.priceSymbol === '$' }"
                    @click="filters.priceSymbol = '$'"
                    data-bs-toggle="tooltip"
                    title="Under $10 per person"
                  >
                    $
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary price-chip"
                    :class="{ active: filters.priceSymbol === '$$' }"
                    @click="filters.priceSymbol = '$$'"
                    data-bs-toggle="tooltip"
                    title="$10–$30 per person"
                  >
                    $$
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary price-chip"
                    :class="{ active: filters.priceSymbol === '$$$' }"
                    @click="filters.priceSymbol = '$$$'"
                    data-bs-toggle="tooltip"
                    title="$30–$60 per person"
                  >
                    $$$
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary price-chip"
                    :class="{ active: filters.priceSymbol === '$$$$' }"
                    @click="filters.priceSymbol = '$$$$'"
                    data-bs-toggle="tooltip"
                    title="$60+ per person"
                  >
                    $$$$
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary price-chip"
                    :class="{ active: filters.priceSymbol === '' }"
                    @click="filters.priceSymbol = ''"
                    title="Show all prices"
                  >
                    All
                  </button>
                </div>
              </div>
            </div>

            <!-- Row 2: Scope + Actions -->
            <div class="row g-3 align-items-center mt-2">
              <div class="col-12 col-md-6">
                <div class="btn-group" role="group" aria-label="Scope toggle">
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    :class="{ active: friendsOnly }"
                    @click="setFriends"
                  >
                    Friends
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    :class="{ active: !friendsOnly }"
                    @click="setPublic"
                  >
                    Public
                  </button>
                </div>
              </div>
              <div class="col-12 col-md-6 text-md-end">
                <div class="d-inline-flex gap-2">
                  <button type="button" class="btn btn-sm btn-outline-secondary px-3" @click="clearFilters">
                    Clear
                  </button>
                  <button type="button" class="btn btn-sm btn-primary px-3" @click="runSearch">
                    Search
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <template v-if="posts.length">
          <div class="row g-3 g-md-4">
            <div
              v-for="(p, i) in posts"
              :key="p.id || p.raw?.id || p.restaurant?.id || i"
              class="col-12 col-lg-6"
            >
              <div
                class="card themed-card"
                :id="`post-${p.id}`"
                :class="{ active: highlightedPostId === p.id }"
              >
                <div>
                  <PostCard :post="p" :feed="friendsOnly ? 'friends' : 'public'" />
                </div>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="empty">No posts yet. Create one!</div>
      </div>
    </section>

    <!-- Floating Create button -->
    <button class="fab fab-terracotta" aria-label="Create Post" @click="showAdd = true">+</button>
    <div class="fab-label sage-chip">Create Post</div>

    <!-- Bottom social bar -->
    <footer class="bottom-bar">
      <div class="left">
        <img src="/images/x.png" alt="X" class="icon" />
        <img src="/images/ig.jpeg" alt="Instagram" class="icon" />
        <span class="handle">@forkinggood.sg</span>
      </div>
    </footer>
  </div>

  <!-- Modal -->
  <Modal :show="showAdd" title="Add Food Recommendation" @close="showAdd = false">
    <AddRecommendationForm @added="handleAdded" />
  </Modal>
</template>

<style scoped>
.page {
  min-height: calc(100vh - 56px);
  background: transparent;
  padding: 16px 0 80px;
}
.hero {
  margin: 0 auto 18px;
}
.section-title {
  font-weight: 800;
  margin: 0 0 10px 8px;
  color: var(--charcoal);
}
.slide-text {
  font-size: clamp(22px, 5vw, 40px);
  color: rgba(255, 255, 255, 0.95);
  user-select: none;
  font-weight: 800;
  display: block;
}
.slide-sub {
  display: block;
  margin-top: 6px;
  color: #e5e7eb;
  font-weight: 600;
}

.trend-slide {
  height: 260px;
  width: 100%;
  background: linear-gradient(180deg, var(--sage-500) 0%, var(--sage-600) 100%);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  margin: 12px auto;
  max-width: 86%;
}
.feed {
  margin: 14px auto 0;
}
.feed-title {
  font-weight: 800;
  color: var(--charcoal);
  margin: 0 0 12px 8px;
}
.feed-shell {
  padding: 18px 18px 8px;
}
.empty {
  text-align: center;
  color: var(--ink-400);
  font-weight: 500;
  padding: 20px 0;
}
.fab {
  position: fixed;
  right: 28px;
  bottom: 86px;
  border: none;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.fab-label {
  position: fixed;
  right: 28px;
  bottom: 54px;
}
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 50px;
  display: flex;
  align-items: center;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  padding: 0 16px;
}
.bottom-bar .left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.icon {
  width: 20px;
  height: 20px;
}
.handle {
  font-size: 14px;
  color: #111;
  font-weight: 600;
}

/* When you click the post in map it directs you to the post here */
.highlight {
  animation: flash 5s ease forwards;
}

@keyframes flash {
  0% {
    background-color: #fff3bf;
  }
  100% {
    background-color: transparent;
  }
}

.themed-card:hover {
  transform: none !important;
}

/* ==========================
   Active (opened from map) state
   ========================== */
.card.active {
  background: var(--ink-400); /* charcoal */
  color: #f9fafb; /* near-white text */
  border-color: rgba(255, 255, 255, 0.08);
}
.card.active .card-title,
.card.active .rating-pill,
.card.active .post-chip,
.card.active .post-chip--cuisine,
.card.active .post-chip--addr {
  color: #f9fafb;
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
}
.card.active .post-chip--addr {
  color: #cbd5e1; /* softer for secondary */
}
.card.active .themed-card,
.card.active .card-body {
  background: transparent;
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
.dropdown-menu { max-height: 260px; overflow: auto; }

</style>
