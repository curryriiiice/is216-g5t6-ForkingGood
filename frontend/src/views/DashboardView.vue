<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import PostCard from '@/components/PostCard.vue'
import Modal from '@/components/Modal.vue'
import AddRecommendationForm from '@/components/AddRecommendationForm.vue'
import axios from 'axios'
import { useRoute, useRouter } from 'vue-router'

// === Backend config ===
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } })
// In dev, use relative paths so requests go through Vite proxy (no CORS)
const IMAGE_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_IMAGE_BASE_URL || API_BASE)
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

// ==========================
// THEME: light + brand-mint/brand-lagoon/brand-plum (no system, no dark)
// ==========================
const THEME_KEY = 'fg_theme_v2'
const theme = ref(localStorage.getItem(THEME_KEY) || 'light')

function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme.value)
  localStorage.setItem(THEME_KEY, theme.value)
}
function cycleTheme() {
  const order = ['light', 'brand-mint', 'brand-lagoon', 'brand-plum']
  const idx = order.indexOf(theme.value)
  theme.value = order[(idx + 1) % order.length]
  applyTheme()
}
function setTheme(val) { theme.value = val; applyTheme() }

// === Filter bar state and helpers ===
const friendsOnly = ref(true)
const filters = ref({ cuisine: '', area: '', priceSymbol: '' })

const cuisineQuery = ref('')
const areaQuery = ref('')
const cuisineSuggestions = ref([])
const areaSuggestions = ref([])
const showCuisineList = ref(false)
const showAreaList = ref(false)
const cuisineBox = ref(null)
const areaBox = ref(null)
const cuisineInput = ref(null)
const areaInput = ref(null)
// Caches of all options (so we can show full list when input is empty)
const allCuisines = ref([])
const allAreas = ref([])

// Normalize to unique, trimmed, sorted strings
function normalizeList(arr) {
  if (!Array.isArray(arr)) return []
  const out = Array.from(
    new Set(
      arr
        .map(x => (x == null ? '' : String(x).trim()))
        .filter(Boolean)
    )
  )
  out.sort((a, b) => a.localeCompare(b))
  return out
}
// Detect whether backend feed uses $$$ max (scaleMax=3) or $$$$ max (scaleMax=4)
const priceScaleMax = ref(4)

let cuisineTimer = null
let areaTimer = null

// --- Typeahead helpers ---
async function getAllCuisines(q) {
  const url = '/map/getAllCuisines'
  // If no query, try to fetch the full list from backend
  if (!q) {
    const triesAll = [
      () => api.get(url),
      () => api.post(url, {}),
      () => api.get(url, { params: {} }),
      () => api.post(url, { search: '' }),
      () => api.post(url, { query: '' }),
    ]
    for (const t of triesAll) {
      try {
        const r = await t()
        const data = Array.isArray(r.data?.data) ? r.data.data : r.data
        return normalizeList(data)
      } catch {}
    }
    return []
  }
  // Otherwise, pass the query to backend (fallback to client-side filtering later)
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
      return normalizeList(data)
    } catch {}
  }
  return []
}
async function getAllLocations(q) {
  const url = '/map/getAllLocations'
  if (!q) {
    const triesAll = [
      () => api.get(url),
      () => api.post(url, {}),
      () => api.get(url, { params: {} }),
      () => api.post(url, { search: '' }),
      () => api.post(url, { query: '' }),
    ]
    for (const t of triesAll) {
      try {
        const r = await t()
        const data = Array.isArray(r.data?.data) ? r.data.data : r.data
        return normalizeList(data)
      } catch {}
    }
    return []
  }
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
      return normalizeList(data)
    } catch {}
  }
  return []
}
function onCuisineInput() {
  showCuisineList.value = true
  clearTimeout(cuisineTimer)
  const qRaw = cuisineQuery.value
  const q = qRaw == null ? '' : String(qRaw).trim()
  cuisineTimer = setTimeout(async () => {
    // Ensure we have the full list cached
    if (!allCuisines.value.length) {
      allCuisines.value = normalizeList(await getAllCuisines(''))
    }
    if (!q) {
      // Empty input → show all
      cuisineSuggestions.value = allCuisines.value.slice(0, 500)
    } else {
      // Case-insensitive substring match
      const needle = q.toLowerCase()
      const base = allCuisines.value.length ? allCuisines.value : normalizeList(await getAllCuisines(''))
      cuisineSuggestions.value = base.filter(s => s.toLowerCase().includes(needle)).slice(0, 500)
      // If backend supports searching and returns more precise results, merge them in
      try {
        const remote = await getAllCuisines(q)
        const merged = normalizeList([...base, ...remote]).filter(s => s.toLowerCase().includes(needle))
        cuisineSuggestions.value = merged.slice(0, 500)
      } catch {}
    }
  }, 150)
}
function onAreaInput() {
  showAreaList.value = true
  clearTimeout(areaTimer)
  const qRaw = areaQuery.value
  const q = qRaw == null ? '' : String(qRaw).trim()
  areaTimer = setTimeout(async () => {
    if (!allAreas.value.length) {
      allAreas.value = normalizeList(await getAllLocations(''))
    }
    if (!q) {
      areaSuggestions.value = allAreas.value.slice(0, 500)
    } else {
      const needle = q.toLowerCase()
      const base = allAreas.value.length ? allAreas.value : normalizeList(await getAllLocations(''))
      areaSuggestions.value = base.filter(s => s.toLowerCase().includes(needle)).slice(0, 500)
      try {
        const remote = await getAllLocations(q)
        const merged = normalizeList([...base, ...remote]).filter(s => s.toLowerCase().includes(needle))
        areaSuggestions.value = merged.slice(0, 500)
      } catch {}
    }
  }, 150)
}
function pickCuisine(v) {
  // "Show all" clears selection and query
  if (!v) {
    filters.value.cuisine = ''
    cuisineQuery.value = ''
    showCuisineList.value = false
    if (allCuisines.value.length) {
      cuisineSuggestions.value = allCuisines.value.slice(0, 500)
    }
    // Blur so user exits the control
    requestAnimationFrame(() => cuisineInput.value && cuisineInput.value.blur())
    runSearch()
    return
  }
  // Otherwise pick value and close
  filters.value.cuisine = v
  cuisineQuery.value = v
  showCuisineList.value = false
  // Blur so user exits the control
  requestAnimationFrame(() => cuisineInput.value && cuisineInput.value.blur())
  runSearch()
}
function pickArea(v) {
  if (!v) {
    filters.value.area = ''
    areaQuery.value = ''
    showAreaList.value = false
    if (allAreas.value.length) {
      areaSuggestions.value = allAreas.value.slice(0, 500)
    }
    requestAnimationFrame(() => areaInput.value && areaInput.value.blur())
    runSearch()
    return
  }
  filters.value.area = v
  areaQuery.value = v
  showAreaList.value = false
  requestAnimationFrame(() => areaInput.value && areaInput.value.blur())
  runSearch()
}

// Price helpers
function priceSymbolToIndex(s) {
  if (!s) return null
  const table = ['$', '$$', '$$$', '$$$$']
  const idx = table.indexOf(String(s))
  return idx >= 0 ? idx : null
}
function normalizePriceIndex(v, scaleMax = 4) {
  if (v == null) return null
  const cap = Math.max(1, Math.min(4, Number(scaleMax))) - 1
  const str = String(v).trim().toLowerCase()
  // Map descriptive labels to price levels
  if (['free', 'inexpensive', 'cheap'].includes(str)) return Math.min(0, cap) // $
  if (['moderate'].includes(str)) return Math.min(1, cap) // $$
  if (['expensive'].includes(str)) return Math.min(2, cap) // $$$
  if (['very expensive', 'very_expensive', 'luxury'].includes(str)) return Math.min(3, cap) // $$$$
  // Symbol '$'..'$$$$' → 0..3
  if (/^\$+$/.test(str)) {
    const idx = Math.min(str.length - 1, cap)
    return idx >= 0 ? idx : null
  }
  const n = Number(v)
  if (Number.isFinite(n)) {
    // Map numeric 0: Free, 1: Inexpensive, 2: Moderate, 3: Expensive, 4: Very Expensive
    if (n === 0 || n === 1) return Math.min(0, cap) // $
    if (n === 2) return Math.min(1, cap) // $$
    if (n === 3) return Math.min(2, cap) // $$$
    if (n === 4) return Math.min(3, cap) // $$$$
    if (n >= 1 && n <= 4) return Math.min(n - 1, cap)
  }
  return null
}
function priceIndexFromPost(p) {
  const cand = [p?.price_range, p?.raw?.price_range, p?.raw?.priceLevel, p?.raw?.price_level, p?.raw?.price, p?.price, p?.price_symbol, p?.raw?.price_symbol]
  for (const v of cand) { const idx = normalizePriceIndex(v, priceScaleMax.value); if (idx !== null) return idx }
  const r = p?.restaurant
  if (r) {
    const idx2 = normalizePriceIndex(r.price_range || r.price_level || r.price, priceScaleMax.value)
    if (idx2 !== null) return idx2
  }
  return null
}
const normStr = (v) => (v == null ? '' : String(v).trim())
const isNonEmpty = (v) => normStr(v) !== ''

// --- Main search runner ---
async function runSearch() {
  const cuisine = normStr(filters.value.cuisine || cuisineQuery.value)
  const area = normStr(filters.value.area || areaQuery.value)
  const sym = normStr(filters.value.priceSymbol)

  const payload = { user_email: ACTIVE_EMAIL }
  payload.friends = !!friendsOnly.value
  payload.public = !friendsOnly.value
  payload.show_public = !friendsOnly.value
  payload.is_public = !friendsOnly.value

  if (isNonEmpty(cuisine)) Object.assign(payload, { cuisine_type: cuisine, cuisine: cuisine, cuisineType: cuisine, cuisine_query: cuisine })
  if (isNonEmpty(area)) Object.assign(payload, { area, location: area, loc: area, area_name: area, neighbourhood: area, neighborhood: area, area_query: area })
  if (isNonEmpty(sym)) {
    payload.price_symbol = sym
    const pr0 = priceSymbolToIndex(sym)
    if (pr0 !== null) {
      payload.price_range = pr0
      payload.price_range_eq = pr0
      payload.price_level_eq = pr0 + 1
      payload.price_eq = pr0 + 1
    }
    delete payload.price; delete payload.price_level; delete payload.priceLevel
  }

  const rows = await getFilteredPosts(payload)
  const safeRows = Array.isArray(rows) ? rows : []
  let feed = safeRows.map(rowToPost)

  // Detect price scale in dataset
  const hasFour = feed.some(p => {
    const c = [p?.price_range,p?.price,p?.price_symbol,p?.raw?.price_range,p?.raw?.price_level,p?.raw?.price,p?.raw?.price_symbol,p?.restaurant?.price_range,p?.restaurant?.price_level]
    return c.some(v => (typeof v==='string' && /^\${4}$/.test(v)) || Number(v)===4)
  })
  const hasThree = feed.some(p => {
    const c = [p?.price_range,p?.price,p?.price_symbol,p?.raw?.price_range,p?.raw?.price_level,p?.raw?.price,p?.raw?.price_symbol,p?.restaurant?.price_range,p?.restaurant?.price_level]
    return c.some(v => (typeof v==='string' && /^\${3}$/.test(v)) || Number(v)===3)
  })
  priceScaleMax.value = hasFour ? 4 : hasThree ? 3 : 4

  // FE filter enforce if user selected a price chip
  if (isNonEmpty(sym)) {
    const want = priceSymbolToIndex(sym)
    if (want !== null) feed = feed.filter(p => { const have = priceIndexFromPost(p); return have !== null && have === want })
  }

  // Hydrate a few missing details
  const needHydrate = feed.filter(p => !p.text && p.id).slice(0, 5)
  if (needHydrate.length) {
    const hydrated = await Promise.all(needHydrate.map(async (p) => {
      const d = await getPostById(p.id); if (!d) return p
      return {
        ...p,
        text: d.review || p.text,
        rating: Number(d.rating ?? p.rating),
        area: d.area ?? p.area ?? null,
        price_range: d.price_range ?? p.price_range ?? null,
        photos: Array.isArray(d.pictures) ? d.pictures.map(resolveImageUrl).filter(Boolean) : p.photos,
        pictures: Array.isArray(d.pictures) ? d.pictures.map(resolveImageUrl).filter(Boolean) : p.pictures,
        restaurant: { ...p.restaurant, name: d.restaurant_name || p.restaurant.name, address: d.restaurant_address || p.restaurant.address, cuisine_type: d.cuisine_type || p.restaurant.cuisine_type },
        raw: { ...p.raw, created_at: d.created_at ?? p.raw.created_at },
      }
    }))
    const byId = new Map(hydrated.map(h => [h.id, h]))
    feed = feed.map(p => byId.get(p.id) || p)
  }

  feed.sort((a,b) => new Date(b.raw.created_at||0) - new Date(a.raw.created_at||0))
  if (!Array.isArray(posts.value)) posts.value = []
  posts.value.splice(0, posts.value.length, ...feed)

  await nextTick()
  await scrollToPostIfAny()
}

// Router bits
const route = useRoute()
const router = useRouter()
function applyVisibilityFromQuery() {
  const q = route.query || {}
  if (q.feed === 'public') { friendsOnly.value = false; return true }
  if (q.feed === 'friends') { friendsOnly.value = true; return true }
  if (q.is_public === '1' || q.public === '1' || q.public === 'true' || q.is_public === 'true') { friendsOnly.value = false; return true }
  if (q.friends === '1' || q.friends === 'true') { friendsOnly.value = true; return true }
  return false
}
async function scrollToPostIfAny() {
  const postId = route.query.postId
  if (!postId) return
  const prev = friendsOnly.value
  const changed = applyVisibilityFromQuery()
  if (changed && friendsOnly.value !== prev) await runSearch()
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
  if (elHeight <= available) { const extra = (available - elHeight)/2; y = elTopAbs - headerOffset - pad - extra }
  else { y = elTopAbs - headerOffset - pad }
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
  if (typeof el.focus === 'function') { el.setAttribute('tabindex','-1'); el.focus({ preventScroll:true }) }
  setTimeout(() => {
    const rect2 = el.getBoundingClientRect()
    const elTopAbs2 = rect2.top + window.pageYOffset
    const elHeight2 = el.offsetHeight
    let y2
    if (elHeight2 <= available) { const extra2 = (available - elHeight2)/2; y2 = elTopAbs2 - headerOffset - pad - extra2 }
    else { y2 = elTopAbs2 - headerOffset - pad }
    window.scrollTo({ top: Math.max(0, y2), behavior: 'auto' })
  }, 350)
  setTimeout(() => { highlightedPostId.value = null; clearPostQuery() }, 1400)
}
function clearPostQuery() {
  const q = { ...route.query }
  delete q.postId
  router.replace({ query: q })
}

// Bootstrap tooltips (optional)
function initTooltips() {
  try {
    const Tooltip = window.bootstrap?.Tooltip
    const els = document.querySelectorAll('[data-bs-toggle="tooltip"]')
    if (Tooltip && els.length) { els.forEach(el => { Tooltip.getInstance?.(el)?.dispose(); new Tooltip(el) }) }
  } catch {}
}
watch(() => route.query.postId, () => { scrollToPostIfAny() })

// Close dropdowns when clicking outside the filter boxes
function handleGlobalClick(e) {
  const t = e.target
  const inCuisine = cuisineBox.value && cuisineBox.value.contains(t)
  const inArea = areaBox.value && areaBox.value.contains(t)
  if (!inCuisine) showCuisineList.value = false
  if (!inArea) showAreaList.value = false
}
function handleGlobalPointerDown(e) {
  const t = e.target
  const inCuisine = cuisineBox.value && cuisineBox.value.contains(t)
  const inArea = areaBox.value && areaBox.value.contains(t)
  if (!inCuisine) showCuisineList.value = false
  if (!inArea) showAreaList.value = false
}
function handleKeydown(e) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    showCuisineList.value = false
    showAreaList.value = false
  }
}
onMounted(() => {
  document.addEventListener('click', handleGlobalClick, true)
  document.addEventListener('pointerdown', handleGlobalPointerDown, true)
  document.addEventListener('keydown', handleKeydown, true)
})
onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick, true)
  document.removeEventListener('pointerdown', handleGlobalPointerDown, true)
  document.removeEventListener('keydown', handleKeydown, true)
})

// Scope toggle
function setFriends(){ friendsOnly.value = true; runSearch() }

function setPublic(){ friendsOnly.value = false; runSearch() }

// Price chip: toggle & search immediately
function setPrice(sym) {
  const cur = filters.value.priceSymbol
  filters.value.priceSymbol = (cur === sym ? '' : sym)
  runSearch()
}

// Clear filters
function clearFilters(){
  filters.value.cuisine = ''
  filters.value.area = ''
  filters.value.priceSymbol = ''
  cuisineQuery.value = ''
  areaQuery.value = ''
  showCuisineList.value = false
  showAreaList.value = false
  cuisineSuggestions.value = []
  areaSuggestions.value = []
  // Refill caches quietly (do not auto-open dropdowns)
  Promise.resolve().then(async () => {
    try {
      if (!allCuisines.value.length) allCuisines.value = normalizeList(await getAllCuisines(''))
      if (!allAreas.value.length) allAreas.value = normalizeList(await getAllLocations(''))
      cuisineSuggestions.value = allCuisines.value.slice(0, 500)
      areaSuggestions.value = allAreas.value.slice(0, 500)
      showCuisineList.value = false
      showAreaList.value = false
    } catch {}
  })
  runSearch()
}

// API helpers
async function getFilteredPosts(payload){
  try {
    const r = await api.post('/map/getFilteredPosts', payload)
    const body = r.data
    if (Array.isArray(body)) return body
    if (Array.isArray(body?.data)) return body.data
    return []
  } catch (e) {
    console.error('[Dashboard] getFilteredPosts failed]:', e.response?.status, e.response?.data || e.message)
    return []
  }
}
async function getPostById(postId){
  const url = '/user/getPostbyId'
  const id = String(postId)
  const tries = [
    () => api.post(url, { post_id: id }),
    () => api.post(url, { postID: id }),
    () => api.post(url, { postid: id }),
    () => api.get(url, { params: { post_id: id } }),
    () => api.get(url, { params: { postID: id } }),
    () => api.get(url, { params: { postid: id } }),
  ]
  for (const t of tries) {
    try { const r = await t(); return (Array.isArray(r.data?.data) ? r.data.data[0] : r.data?.data) || null }
    catch (err) { if (err?.response?.status && err.response.status !== 400) console.warn('[Dashboard] getPostById failed try:', err.response.status, err.response.data || err.message) }
  }
  return null
}
function rowToPost(row){
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
  applyTheme()
  // Preload full filter option lists (so empty inputs show "all")
  Promise.resolve().then(async () => {
    try {
      allCuisines.value = normalizeList(await getAllCuisines(''))
      allAreas.value = normalizeList(await getAllLocations(''))
    } catch {}
  })
  try {
    await runSearch()
    // Trending slides (group by restaurant)
    const feed = posts.value
    const byRest = new Map()
    for (const post of feed) {
      const r = post.restaurant
      if (!r?.id) continue
      if (!byRest.has(r.id))
        byRest.set(r.id, { id: r.id, title: r.name, address: r.address, cuisine: r.cuisine_type, ratings: [], cover: post.photos?.[0] || null })
      const entry = byRest.get(r.id)
      entry.ratings.push(Number(post.rating) || 0)
      if (!entry.cover && post.photos?.[0]) entry.cover = post.photos[0]
    }
    const slides = Array.from(byRest.values()).map(s => {
      const avg = s.ratings.length ? (s.ratings.reduce((a,b)=>a+b,0) / s.ratings.length).toFixed(1) : '—'
      return { ...s, avgRating: avg, subtitle: `${s.cuisine || ''}${s.cuisine && s.address ? ' • ' : ''}${s.address || ''}` }
    })
    trendingSlides.value = slides.sort((a,b)=>Number(b.avgRating)-Number(a.avgRating)).slice(0,6)
  } catch (e) {
    console.error('Dashboard load failed:', e)
  }
}
function handleAdded(){ showAdd.value = false; load() }
function viewOnMap(post){ router.push({ path:'/map', query: { postId:String(post?.id), feed: friendsOnly.value ? 'friends' : 'public' } }) }

onMounted(load)
onMounted(() => nextTick(() => initTooltips()))
watch(() => [filters.value.priceSymbol, showCuisineList.value, showAreaList.value], () => nextTick(() => initTooltips()))
</script>

<template>
  <div class="page sage-bg">
    <!-- Trending Section -->
    <section class="hero container">
      <div class="d-flex align-items-center justify-content-between pe-1">
        <h2 class="section-title">Trending Food</h2>

        <!-- THEME SWITCHER (system & dark removed) -->
        <div class="theme-switcher btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" @click="cycleTheme" title="Cycle theme">
            <span v-if="theme==='light'">☀️ Light</span>
            <span v-else-if="theme==='brand-mint'">🌿 Mint</span>
            <span v-else-if="theme==='brand-lagoon'">🌊 Lagoon</span>
            <span v-else>🍇 Plum</span>
          </button>
          <button class="btn btn-outline-secondary dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false" />
          <ul class="dropdown-menu dropdown-menu-end">
            <li><button class="dropdown-item" @click="setTheme('light')">☀️ Light</button></li>
            <li><button class="dropdown-item" @click="setTheme('brand-mint')">🌿 Mint</button></li>
            <li><button class="dropdown-item" @click="setTheme('brand-lagoon')">🌊 Lagoon</button></li>
            <li><button class="dropdown-item" @click="setTheme('brand-plum')">🍇 Plum</button></li>
          </ul>
        </div>
      </div>

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
            <div class="d-flex align-items-center justify-content-center trend-slide sage-map">
              <div class="text-center">
                <span class="slide-text">{{ s.title || 'Loading…' }}</span>
                <span v-if="s.avgRating" class="slide-sub d-block mt-1">⭐ {{ s.avgRating }}</span>
                <span v-if="s.subtitle" class="slide-sub d-block">{{ s.subtitle }}</span>
              </div>
            </div>
          </div>
        </div>

        <button class="carousel-control-prev" type="button" data-bs-target="#trendingCarousel" data-bs-slide="prev" v-if="trendingSlides.length > 1">
          <span class="carousel-control-prev-icon" aria-hidden="true"></span>
          <span class="visually-hidden">Previous</span>
        </button>
        <button class="carousel-control-next" type="button" data-bs-target="#trendingCarousel" data-bs-slide="next" v-if="trendingSlides.length > 1">
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
        <!-- Filter Bar -->
        <div class="card mb-3">
          <div class="card-body py-3 px-3 px-md-4">
            <!-- Row 1: Typeaheads + Price chips -->
            <div class="row g-3 align-items-end">
              <!-- Cuisine -->
              <div class="col-12 col-md-6 col-lg-4 position-relative" ref="cuisineBox">
                <label class="form-label mb-1 small fw-semibold text-secondary">Cuisine</label>
                <input
                  class="form-control form-control-sm text-start"
                  placeholder="Type to search (e.g. Japanese)"
                  v-model="cuisineQuery"
                  @focus="onCuisineInput"
                  @input="onCuisineInput"
                  @blur="() => (showCuisineList = false)"
                  ref="cuisineInput"
                />
                <ul v-if="showCuisineList" class="dropdown-menu show w-100 shadow-sm filter-list" style="z-index: 1200">
                  <li><button type="button" class="dropdown-item text-muted" @mousedown.prevent @click="pickCuisine('')">Show all cuisines</button></li>
                  <li v-if="cuisineQuery && !cuisineSuggestions.length" class="dropdown-item disabled text-muted">No match</li>
                  <li v-for="(c, i) in cuisineSuggestions" :key="'c-' + i">
                    <button type="button" class="dropdown-item" @mousedown.prevent="pickCuisine(c)">{{ c }}</button>
                  </li>
                </ul>
              </div>

              <!-- Area -->
              <div class="col-12 col-md-6 col-lg-4 position-relative" ref="areaBox">
                <label class="form-label mb-1 small fw-semibold text-secondary">Area</label>
                <input
                  class="form-control form-control-sm text-start"
                  placeholder="Type to search (e.g. Bugis)"
                  v-model="areaQuery"
                  @focus="onAreaInput" @input="onAreaInput"
                  @blur="() => (showAreaList = false)"
                  ref="areaInput"
                />
                <ul v-if="showAreaList" class="dropdown-menu show w-100 shadow-sm filter-list" style="z-index: 1200">
                  <li><button type="button" class="dropdown-item text-muted" @mousedown.prevent @click="pickArea('')">Show all areas</button></li>
                  <li v-if="areaQuery && !areaSuggestions.length" class="dropdown-item disabled text-muted">No match</li>
                  <li v-for="(a, i) in areaSuggestions" :key="'a-' + i">
                    <button type="button" class="dropdown-item" @mousedown.prevent="pickArea(a)">{{ a }}</button>
                  </li>
                </ul>
              </div>

              <!-- Price chips -->
              <div class="col-12 col-lg-4">
                <label class="form-label mb-1 small fw-semibold text-secondary">Price Range</label>
                <div class="d-flex gap-2 flex-wrap">
                  <button type="button" class="btn btn-sm btn-outline-secondary price-chip" :class="{ active: filters.priceSymbol === '$' }" @click="setPrice('$')" data-bs-toggle="tooltip" title="Inexpensive">$</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary price-chip" :class="{ active: filters.priceSymbol === '$$' }" @click="setPrice('$$')" data-bs-toggle="tooltip" title="Moderate">$$</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary price-chip" :class="{ active: filters.priceSymbol === '$$$' }" @click="setPrice('$$$')" data-bs-toggle="tooltip" title="Expensive">$$$</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary price-chip" :class="{ active: filters.priceSymbol === '$$$$' }" @click="setPrice('$$$$')" data-bs-toggle="tooltip" title="Very Expensive">$$$$</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary price-chip" :class="{ active: filters.priceSymbol === '' }" @click="setPrice('')" title="Show all prices">All</button>
                </div>
              </div>
            </div>

            <!-- Row 2: Scope + Actions -->
            <div class="row g-3 align-items-center mt-2">
              <div class="col-12 col-md-6">
                <div class="btn-group" role="group" aria-label="Scope toggle">
                  <button type="button" class="btn btn-outline-secondary" :class="{ active: friendsOnly }" @click="setFriends">Friends</button>
                  <button type="button" class="btn btn-outline-secondary" :class="{ active: !friendsOnly }" @click="setPublic">Public</button>
                </div>
              </div>
              <div class="col-12 col-md-6 text-md-end">
                <div class="d-inline-flex gap-2">
                  <button type="button" class="btn btn-sm btn-clear px-3" @click="clearFilters">Clear</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <template v-if="posts.length">
          <div class="row g-3 g-md-4">
            <div v-for="(p, i) in posts" :key="p.id || p.raw?.id || p.restaurant?.id || i" class="col-12 col-lg-6">
              <div class="card themed-card" :id="`post-${p.id}`" :class="{ active: highlightedPostId === p.id }">
                <PostCard :post="p" :feed="friendsOnly ? 'friends' : 'public'" />
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
    <footer class="bottom-bar fixed-bottom d-flex align-items-center px-3">
      <div class="left d-flex align-items-center gap-2">
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
.page { min-height: calc(100vh - 56px); background: var(--bg); padding: 16px 0 80px; }
.hero { margin: 0 auto 18px; }
.section-title { font-weight: 800; margin: 0 0 10px 8px; color: var(--charcoal); }
.slide-text { font-size: clamp(22px, 5vw, 40px); color: rgba(255,255,255,0.95); user-select: none; font-weight: 800; display: block; }
.slide-sub { display: block; margin-top: 6px; color: #e5e7eb; font-weight: 600; }
.trend-slide { height: 260px; width: 100%; border-radius: var(--radius-md); box-shadow: var(--shadow-card); margin: 12px auto; max-width: 86%; }
.feed { margin: 14px auto 0; }
.feed-title { font-weight: 800; color: var(--charcoal); margin: 0 0 12px 8px; }
.feed-shell { padding: 18px 18px 8px; }
.empty { text-align: center; color: var(--ink-400); font-weight: 500; padding: 20px 0; }
.fab { position: fixed; right: 28px; bottom: 86px; border: none; cursor: pointer; display: grid; place-items: center; }
.fab-label { position: fixed; right: 28px; bottom: 54px; }
.icon { width: 20px; height: 20px; }
.handle { font-size: 14px; color: var(--charcoal); font-weight: 600; }

/* Highlight when opened from map */
.card.active { background: var(--ink-400); color: #f9fafb; border-color: rgba(255,255,255,0.08); }
.card.active .card-title,
.card.active .rating-pill,
.card.active .post-chip,
.card.active .post-chip--cuisine,
.card.active .post-chip--addr {
  color: #f9fafb; border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.06);
}

/* Price chips */
.price-chip { border: 1px solid var(--line-200); border-radius: 10px; background: #fff; font-weight: 700; padding: 6px 12px; color: var(--charcoal); }
.price-chip:hover { background-color: #F2F5F8; }
.price-chip.active {
  background: color-mix(in oklab, var(--sage-600) 12%, white);
  border-color: var(--sage-600);
  box-shadow: inset 0 0 0 1px var(--sage-600);
  color: var(--charcoal);
}

/* limit dropdown height */
.dropdown-menu { max-height: 260px; overflow: auto; }

/* Limit visible options to ~3 (plus the header row), rest scrollable */
.dropdown-menu.filter-list {
  /* Each .dropdown-item is roughly ~44px tall with current padding; 4 rows = header + 3 options */
  max-height: calc(44px * 4);
  overflow: auto;
}

/* Modal defaults (light) */
:deep(.modal .modal-content) {
  background: var(--surface);
  color: var(--charcoal);
  border: 1px solid var(--line-200);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
}
:deep(.modal .form-label),
:deep(.modal label) { color: var(--charcoal); font-weight: 700; }
:deep(.modal .text-muted),
:deep(.modal .form-text) { color: var(--ink-400) !important; }
:deep(.modal .form-control),
:deep(.modal .form-select) {
  background: #fff;
  color: #111827;
  border: 1.5px solid var(--line-200);
  border-radius: 12px;
}
/* Radios / checkboxes */
:deep(.modal .form-check-label) { color: var(--charcoal); font-weight: 600; }
:deep(.modal .form-check-input) { border: 1.5px solid var(--line-200); background-color: #fff; cursor: pointer; }
:deep(.modal .form-check-input:checked) {
  background-color: var(--sage-600);
  border-color: var(--sage-600);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--sage-600) 35%, transparent);
}
/* Dropzone / photo area */
:deep(.modal .dropzone),
:deep(.modal .uploader) {
  background: color-mix(in oklab, var(--cream-100) 70%, white);
  border: 1.5px dashed var(--line-200);
  color: var(--ink-400);
}
/* Submit button */
:deep(.modal .btn-primary),
:deep(.modal .btn-fit) {
  background: var(--sage-600);
  border: none;
  color: #fff;
  font-weight: 800;
  box-shadow: 0 6px 18px rgba(0,0,0,.12);
}
</style>
