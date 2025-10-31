<!-- src/views/ReverseImageView.vue -->
<template>
  <div class="wrap">
    <div class="header">
      <div class="left">
        <div class="thumb" v-if="previewImage">
          <img :src="previewImage" alt="Uploaded preview" />
        </div>
        <div>
          <h1 class="title">Reverse Image Results</h1>
          <p class="subtitle" v-if="loading">Analyzing your photo for nearby matches…</p>
          <p class="subtitle" v-else-if="items.length">
            We have detected these restaurants.
          </p>
          <p class="subtitle" v-else-if="noFoodMessage">{{ noFoodMessage }}</p>
          <p class="subtitle" v-else-if="error">{{ error }}</p>
          <p class="subtitle" v-else>No results yet. Try another image from the navbar.</p>
        </div>
      </div>

      <div class="actions">
        <label class="sort-wrap" title="Sort by price">
          <span class="sort-label">Sort:</span>
          <select v-model="sortOrder" class="sort-control" aria-label="Sort by price">
            <option value="none">Default</option>
            <option value="asc">Price: High to Low</option>
            <option value="desc">Price: Low to High</option>
          </select>
        </label>
        <RouterLink to="/dashboard" class="btn ghost">Back to Home</RouterLink>
      </div>
    </div>

    <!-- ✨ Moving loader (animated SVG + bouncing dots) -->
    <div v-if="loading" class="loading">
      <div class="spinner-wrap">
        <!-- Animated “plate” spinner (SVG) -->
        <svg
          class="spinner"
          width="64"
          height="64"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <!-- outer ring -->
          <circle
            class="ring"
            cx="32"
            cy="32"
            r="28"
            stroke="var(--terra-500, #d4816f)"
            stroke-width="4"
            stroke-linecap="round"
            stroke-dasharray="140"
            stroke-dashoffset="100"
          />
          <!-- inner plate -->
          <circle cx="32" cy="32" r="16" stroke="#e5e7eb" stroke-width="4" fill="white" />
          <!-- spoon (rotates) -->
          <g class="spoon" transform="translate(32,32)">
            <circle r="4" fill="var(--terra-500, #d4816f)" />
            <rect x="-2" y="-18" width="4" height="11" rx="2" fill="var(--terra-500, #d4816f)" />
          </g>
        </svg>

        <div class="loading-lines">
          <div class="line shimmering"></div>
          <div class="line short shimmering"></div>
        </div>
      </div>

      <div class="loading-text">
        <span>Analyzing your photo for nearby matches…</span>
        <div class="dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
        <p class="loading-sub">
          Detecting dishes, scanning restaurants, and fetching recommendations 🍽️
        </p>
      </div>
    </div>

    <!-- Results -->
    <div v-else-if="items.length" class="grid">
      <div v-for="r in visibleItems" :key="r.placeID || r.name" class="card">
        <div class="photo">
          <img
            :src="(r.pictures && r.pictures[0]) || fallbackPhoto"
            :alt="r.name"
            @error="onImgError"
          />
        </div>

        <div class="body">
          <h3 class="name">{{ r.name }}</h3>
          <div class="meta chips">
            <span v-if="r.cuisine_type" class="chip chip-cuisine">{{ r.cuisine_type }}</span>
            <span v-if="prettyArea(r.area)" class="chip chip-area">{{ prettyArea(r.area) }}</span>
          </div>
          <p class="addr" v-if="prettyAddress(r.address)">{{ prettyAddress(r.address) }}</p>

          <div class="row">
            <div
              class="price-chip"
              v-if="r.price_level !== undefined && r.price_level !== null"
              :aria-label="`Price range: ${priceLabel(clampPrice(r.price_level))}`"
              role="note"
            >
              <span class="price-dollars" aria-hidden="true">
                <span v-for="i in clampPrice(r.price_level)" :key="i">$</span>
              </span>
              <span class="price-label">{{ priceLabel(clampPrice(r.price_level)) }}</span>
            </div>
          </div>
        </div>

        <!-- ✅ Themed & aligned Google Maps button -->
        <div class="footer">
          <a
            v-if="gmapsLink(r)"
            class="btn small"
            :href="gmapsLink(r)"
            target="_blank"
            rel="noopener"
          >
            View on Google Maps
          </a>
        </div>
      </div>
    </div>

    <!-- Empty / Error -->
    <div v-else class="empty">
      <p class="hint" v-if="noFoodMessage">{{ noFoodMessage }}</p>
      <p class="hint" v-else-if="error">{{ error }}</p>
      <p class="hint" v-else>We couldn't display results for this image.</p>
    </div>

    <!-- Floating Create button -->
    <button class="fab fab-terracotta fab-img" @click="showAdd = true" title="Create Post">
      <img src="/images/CreatePost_White.png" alt="Create Post" class="fab-icon" />
    </button>
  </div>

  <!-- Modal: Add Recommendation -->
  <Modal :show="showAdd" title="Add Food Recommendation" @close="showAdd = false">
    <AddRecommendationForm @added="showAdd = false" />
  </Modal>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import axios from 'axios'
import AddRecommendationForm from '@/components/AddRecommendationForm.vue'
import Modal from '@/components/Modal.vue'

// import api
import api from '@/lib/api.js'

const previewImage = ref('')
const items = ref([])
const noFoodMessage = ref('')
const error = ref('')
const loading = ref(false)
const fallbackPhoto = '/images/placeholder-restaurant.jpg'


let pollId = null
const lastPayloadStr = ref('')
const sortOrder = ref('none') // none | asc | desc
const showAdd = ref(false)

onMounted(async () => {
  await loadFromSession()

  // Auto-update when user performs new reverse search
  pollId = window.setInterval(checkForPayloadChange, 700)
  window.addEventListener('focus', checkForPayloadChange)
})

onBeforeUnmount(() => {
  if (pollId) window.clearInterval(pollId)
  window.removeEventListener('focus', checkForPayloadChange)
})

async function checkForPayloadChange() {
  const currentStr = sessionStorage.getItem('reverseImagePayload') || ''
  if (currentStr !== lastPayloadStr.value) {
    await loadFromSession()
  }
}

async function loadFromSession() {
  const raw = sessionStorage.getItem('reverseImagePayload')
  if (!raw) {
    error.value = 'No image payload found. Please upload an image from the Image Search button in the navbar.'
    lastPayloadStr.value = ''
    return
  }

  lastPayloadStr.value = raw
  try {
    const payload = JSON.parse(raw)
    const imgs = Array.isArray(payload?.images) ? payload.images : []
    previewImage.value = imgs[0] || ''
    error.value = ''
    noFoodMessage.value = ''
    items.value = []

    if (payload?.results && typeof payload.results === 'object') {
      const apiRes = payload.results
      if (Array.isArray(apiRes.data)) items.value = apiRes.data.slice(0, 10)
      else if (typeof apiRes.data === 'string') noFoodMessage.value = apiRes.data
      return
    }

    if (previewImage.value) {
      loading.value = true
      const blob = await dataURLToBlob(previewImage.value)
      const form = new FormData()
      form.append('photo', new File([blob], 'reverse.png', { type: blob.type || 'image/png' }))

      const { data } = await api.post('/search/reverseSearch', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      sessionStorage.setItem('reverseImagePayload', JSON.stringify({
        images: [previewImage.value],
        results: data
      }))
      lastPayloadStr.value = sessionStorage.getItem('reverseImagePayload') || raw

      if (Array.isArray(data?.data)) items.value = data.data.slice(0, 10)
      else if (typeof data?.data === 'string') noFoodMessage.value = data.data
      else error.value = 'Unexpected server response.'
    } else {
      error.value = 'No image to analyze. Please try again.'
    }
  } catch (e) {
    const msg = (e?.response?.status === 404)
      ? 'Endpoint /search/reverseSearch not found on the server.'
      : 'Failed to analyze image. Please try again.'
    error.value = msg
    console.warn('Reverse image flow failed:', e)
  } finally {
    loading.value = false
  }
}

function clampPrice(n) {
  const val = Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : 0
  return val || 0
}
function onImgError(e) { if (fallbackPhoto) e.target.src = fallbackPhoto }

/**
 * Build a Google Maps URL preferring placeID, then lat/lng, then address.
 */
function gmapsLink(r) {
  if (r?.placeID) {
    const name = r?.name ? encodeURIComponent(r.name) : ''
    const base = 'https://www.google.com/maps/search/?api=1'
    return name
      ? `${base}&query=${name}&query_place_id=${encodeURIComponent(r.placeID)}`
      : `${base}&query_place_id=${encodeURIComponent(r.placeID)}`
  }
  if (Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude)) {
    return `https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}`
  }
  if (r?.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`
  }
  return ''
}

async function dataURLToBlob(dataUrl) {
  const res = await fetch(dataUrl)
  return await res.blob()
}

// Presentation helpers: strip generic "Singapore" and tidy lines
function prettyArea(val) {
  if (!val) return ''
  const t = String(val).trim()
  if (!t || t.toLowerCase() === 'singapore') return ''
  return t
}
function prettyAddress(addr) {
  if (!addr) return ''
  let t = String(addr).trim()
  t = t.replace(/,\s*singapore\b/i, '').replace(/\bSingapore\b/i, '').trim()
  // Remove trailing commas or dashes left behind
  t = t.replace(/[,-]\s*$/, '').trim()
  return t
}

// Choose a representative area for the header (most common among results)
const headerArea = computed(() => {
  const areas = (items.value || [])
    .map(r => prettyArea(r?.area))
    .filter(Boolean)
  if (!areas.length) return ''
  const counts = Object.create(null)
  for (const a of areas) counts[a] = (counts[a] || 0) + 1
  let best = '', max = 0
  for (const [a, c] of Object.entries(counts)) {
    if (c > max) { max = c; best = a }
  }
  return best
})
// Turn a numeric price level (1–5) into a friendly label
function priceLabel(level) {
  const n = Number(level) || 0
  switch (n) {
    case 1: return 'Budget'
    case 2: return 'Affordable'
    case 3: return 'Moderate'
    case 4: return 'Pricey'
    case 5: return 'Upscale'
    default: return 'Unspecified'
  }
}

// Sorting helpers
function priceNum(r) {
  const n = Number(r?.price_level)
  return Number.isFinite(n) && n > 0 ? n : 999 // unknowns at the end
}
const visibleItems = computed(() => {
  const arr = Array.isArray(items.value) ? items.value.slice() : []
  if (sortOrder.value === 'asc') arr.sort((a, b) => priceNum(a) - priceNum(b))
  else if (sortOrder.value === 'desc') arr.sort((a, b) => priceNum(b) - priceNum(a))
  return arr
})
</script>

<style scoped>
.wrap { padding: 20px 24px 32px; max-width: 1200px; margin: 0 auto; }
.header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.left { display: flex; align-items: center; gap: 12px; }
.thumb { width: 64px; height: 64px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,.08); flex: 0 0 auto; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.title { margin: 0; color: #111827; font-size: 1.4rem; font-weight: 800; }
.subtitle { margin: 2px 0 0; color: #6b7280; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.sort-wrap { display: inline-flex; align-items: center; gap: 6px; }
.sort-label { color: #6b7280; font-weight: 700; }
.sort-control {
  appearance: none;
  border: 1.5px solid #e5e7eb;
  background: #fff;
  color: #374151;
  border-radius: 10px;
  padding: 6px 10px;
  font-weight: 700;
}

/* ✨ Moving Loader */
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #6b7280;
  margin: 48px 0 36px;
  text-align: center;
  animation: fadeIn 0.5s ease;
}
.spinner-wrap {
  display: grid;
  grid-template-columns: auto;
  justify-items: center;
  gap: 10px;
}
.spinner {
  display: block;
  animation: spin 1.2s linear infinite;
}
.spinner .ring {
  transform-origin: 32px 32px;
}
.spinner .spoon {
  transform-origin: 0 0;
  animation: spoonOrbit 1.2s linear infinite;
}
.loading-lines {
  width: 240px;
  display: grid;
  gap: 8px;
}
.line {
  height: 10px;
  border-radius: 999px;
  background: #f0f1f3;
  overflow: hidden;
  position: relative;
}
.line.short { width: 70%; justify-self: center; }
.shimmering::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(212,129,111,0.15), transparent);
  transform: translateX(-100%);
  animation: shimmer 1.4s ease-in-out infinite;
}

.loading-text { font-weight: 800; font-size: 1.1rem; color: #374151; }
.loading-sub { font-weight: 500; color: #9ca3af; font-size: 0.95rem; margin-top: 4px; }

.loading .dots {
  display: inline-flex;
  gap: 6px;
  margin-left: 6px;
  vertical-align: middle;
}
.loading .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--terra-500, #d4816f);
  animation: bounce 0.9s infinite ease-in-out;
}
.loading .dot:nth-child(2) { animation-delay: 0.15s; }
.loading .dot:nth-child(3) { animation-delay: 0.3s; }

/* Results grid */
.grid { margin-top: 8px; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.card { background: #fff; border-radius: 14px; box-shadow: 0 10px 24px rgba(0,0,0,.06); overflow: hidden; display: flex; flex-direction: column; transition: transform .12s ease, box-shadow .2s ease; }
.card:hover { transform: translateY(-4px) scale(1.01); box-shadow: 0 16px 36px rgba(0,0,0,.12); }
.photo { width: 100%; height: 160px; background: #f3f4f6; overflow: hidden; }
.photo img { width: 100%; height: 100%; object-fit: cover; }
.body { padding: 12px 12px 8px; flex: 1; }
.name { margin: 0; color: #1f2937; font-weight: 800; font-size: 1.05rem; }
.meta { margin: 4px 0 2px; color: #6b7280; font-weight: 600; }
.meta .sep { margin: 0 6px; }
.addr { margin: 2px 0 0; color: #4b5563; font-size: 0.925rem; }
.row { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; color: #6b7280; font-weight: 700; }

/* Price chip */
.price-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  border: 1.5px solid #e5e7eb;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.8), 0 4px 14px rgba(227,178,60,0.12);
  max-width: 100%;
  white-space: nowrap;
}
.grid .card .price-chip .price-dollars {
  letter-spacing: 1px;
  color: #e3b23c !important; /* gold */
  font-weight: 900;
  font-size: 1.05rem;
  text-shadow: 0 1px 0 rgba(255,255,255,0.65), 0 2px 8px rgba(227,178,60,0.45);
  flex: 0 0 auto;
}
.price-label { font-weight: 800; color: #374151; font-size: .85rem; overflow: hidden; text-overflow: ellipsis; flex: 1 1 auto; }
/* Keep rows aligned even with long labels */
.row { min-height: 38px; }

/* Chips for cuisine/area */
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  font-weight: 700;
  font-size: 0.8rem;
  color: #374151;
}
.chip-cuisine { color: var(--terra-500, #d4816f); border-color: color-mix(in srgb, var(--terra-500, #d4816f) 35%, #e5e7eb); background: color-mix(in srgb, var(--terra-500, #d4816f) 8%, #f8fafc); }
.chip-area { color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }

.footer { margin-top: auto; display: flex; justify-content: center; padding: 10px 12px 12px; }

.empty { margin: 24px 0; text-align: center; color: #6b7280; }
.hint { margin-bottom: 10px; }

/* Buttons */
.btn { border: none; background: var(--terra-500, #d4816f); color: #fff; font-weight: 800; border-radius: 10px; padding: 0.55rem 0.85rem; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; transition: filter .15s ease, transform .05s ease; }
.btn:hover { filter: brightness(1.03); }
.btn:active { transform: translateY(1px); }
.btn.small { padding: 0.45rem 0.7rem; font-size: 0.9rem; }
.btn.ghost { background: #fff; color: #374151; border: 1.5px solid #e5e7eb; }

/* Floating Action Button (match Map/Dashboard) */
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
.fab-img {
  background: transparent;
  border: none;
  padding: 0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.fab-img:hover { transform: scale(1.08); box-shadow: 0 4px 12px rgba(0,0,0,0.25); }
.fab-img:active { transform: scale(0.96); }
.fab-icon { width: 50px; height: 50px; object-fit: contain; }

/* Animations */
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes spoonOrbit {
  0% { transform: rotate(0deg) translate(16px, -16px) rotate(0deg); }
  100% { transform: rotate(360deg) translate(16px, -16px) rotate(-360deg); }
}
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  60%, 100% { transform: translateX(100%); }
}
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: .8; }
  40% { transform: translateY(-6px); opacity: 1; }
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>
