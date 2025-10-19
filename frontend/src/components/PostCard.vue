<script setup>
import { ref, computed, reactive, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'



const props = defineProps({
  post: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
})

// --- Image URL resolver (keeps layout, only fixes src values) ---
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const IMAGE_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_IMAGE_BASE_URL || API_BASE)

function resolveImageUrl(p) {
  if (!p) return null
  let s = String(p).trim().replace(/^['"]+|['"]+$/g, '')
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s
  s = s.replace(/^[.\/]+/, '').replace(/^\/+/, '')
  return IMAGE_BASE ? `${IMAGE_BASE}/${s}` : `/${s}`
}

// Inline placeholder to avoid endless network fetch loops when an image fails
const PLACEHOLDER_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='360' viewBox='0 0 600 360'>
      <defs>
        <linearGradient id='g' x1='0' x2='0' y1='0' y2='1'>
          <stop offset='0%' stop-color='%23f7f7f5'/>
          <stop offset='100%' stop-color='%23ecebe7'/>
        </linearGradient>
      </defs>
      <rect width='600' height='360' fill='url(%23g)'/>
      <g fill='%2399a29e' font-family='system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' font-size='18'>
        <text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle'>No photo</text>
      </g>
    </svg>`,
  )

// Cache of broken URLs so we don't retry them on re-render
const failedSrc = ref(new Set())
function getSafeSrc(p) {
  return failedSrc.value.has(p) ? PLACEHOLDER_URL : p
}
function onImgError(e, original) {
  try {
    failedSrc.value.add(original)
  } catch {}
  e.target.onerror = null
  e.target.src = PLACEHOLDER_URL
}


// ---- Image handling (relative GET, no credentials) ----
const blobCache = reactive(new Map())

function needsPostFetch(pathLike) {
  // We avoid POST entirely in dev to bypass CORS; treat everything as GET-able
  return false
}

async function fetchImageBlobUrl(pathLike) {
  if (!pathLike) return null
  // Normalize to relative resource path (goes through Vite proxy in dev)
  const clean = String(pathLike)
    .replace(/^https?:\/\/localhost:8000\/?/, '')
    .replace(/^\/+/, '')
  const url = `/${clean}`
  // In most cases we can return the URL directly for <img>
  return url
  // If you need a Blob URL instead, uncomment below (GET without credentials):
  // if (blobCache.has(clean)) return blobCache.get(clean)
  // const res = await fetch(url, { method: 'GET', credentials: 'omit' })
  // if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`)
  // const blob = await res.blob()
  // const blobUrl = URL.createObjectURL(blob)
  // blobCache.set(clean, blobUrl)
  // return blobUrl
}

function revokeAllBlobs() {
  for (const url of blobCache.values()) {
    try { URL.revokeObjectURL(url) } catch {}
  }
  blobCache.clear()
}


// Use post.photos if present; otherwise fall back to post.pictures
const resolvedPhotos = computed(() => {
  const p = props.post || {}
  const arr = Array.isArray(p.photos) ? p.photos : Array.isArray(p.pictures) ? p.pictures : []
  return arr.map(resolveImageUrl).filter(Boolean)
})

const rawPhotos = computed(() => {
  const p = props.post || {}
  return Array.isArray(p.photos) ? p.photos : Array.isArray(p.pictures) ? p.pictures : []
})

const photoCount = computed(() => resolvedPhotos.value.length)
const currentIndex = ref(0)

// Reset to first image whenever the post's photos change
watch(resolvedPhotos, () => { currentIndex.value = 0 })

const currentResolved = computed(() => {
  return resolvedPhotos.value[currentIndex.value] || PLACEHOLDER_URL
})
const currentRaw = computed(() => {
  return rawPhotos.value[currentIndex.value] || null
})

const heroDisplaySrc = ref(PLACEHOLDER_URL)

function nextPhoto() {
  if (photoCount.value <= 1) return
  currentIndex.value = (currentIndex.value + 1) % photoCount.value
}
function prevPhoto() {
  if (photoCount.value <= 1) return
  currentIndex.value = (currentIndex.value - 1 + photoCount.value) % photoCount.value
}
function goToPhoto(i) {
  if (i < 0 || i >= photoCount.value) return
  currentIndex.value = i
}

// Update displayed hero when current index or sources change
watch([currentResolved, currentRaw], async ([resolved, raw]) => {
  try {
    if (raw && needsPostFetch(raw)) {
      heroDisplaySrc.value = PLACEHOLDER_URL
      const blobUrl = await fetchImageBlobUrl(raw)
      heroDisplaySrc.value = blobUrl
    } else if (resolved) {
      heroDisplaySrc.value = getSafeSrc(resolved)
    } else {
      heroDisplaySrc.value = PLACEHOLDER_URL
    }
  } catch (e) {
    heroDisplaySrc.value = PLACEHOLDER_URL
  }
}, { immediate: true })

onBeforeUnmount(revokeAllBlobs)

const tagText = computed(() => {
  const p = props.post || {}
  const r = p.restaurant || p.raw?.restaurant || {}
  const t1 = r.cuisine_type || p.cuisine_type
  const t2 = r.secondary_tag || r.category || p.category
  const tags = [t1, t2].filter(Boolean)
  return tags.length ? tags.join(' • ') : ''
})

const priceRangeText = computed(() => {
  const p = props.post || {}
  const r = p.restaurant || p.raw?.restaurant || {}
  const price = p.price_range ?? r.price_range
  if (price == null) return null
  if (Number.isNaN(price)) return null
  // Convert numeric price (0–4) → $, $$, $$$, $$$$, $$$$$
  return '$'.repeat(Math.max(1, Math.min(5, Math.round(price))))
})

const areaText = computed(() => {
  const p = props.post || {}
  return p.area || p.restaurant?.area || p.raw?.restaurant?.area || null
})

const tagLine = computed(() => {
  const tags = []
  if (tagText.value) tags.push(tagText.value)
  if (areaText.value) tags.push(areaText.value)
  if (priceRangeText.value) tags.push(priceRangeText.value)
  return tags.join(' • ')
})

const ratingValue = computed(() => {
  const p = props.post || {}
  const r = p.restaurant || p.raw?.restaurant || {}
  return p.rating || r.rating || r.avg_rating || null
})

const postDateText = computed(() => {
  const p = props.post || {}
  // Accept common fields and nested raw fields
  const dateStr = (
    p.created_at || p.createdAt ||
    p.timestamp || p.posted_at || p.postedAt || p.date ||
    p.raw?.created_at || p.raw?.createdAt || p.raw?.timestamp || null
  )
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  try {
    return new Intl.DateTimeFormat('en-SG', {
      year: 'numeric', month: 'short', day: 'numeric',
      timeZone: 'Asia/Singapore'
    }).format(d)
  } catch {
    return d.toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' })
  }
})

const router = useRouter()

const hasMapTarget = computed(() => {
  const p = props.post || {}
  return Boolean(p.id || p.postid)
})

function viewOnMap(p) {
  const post = p || props.post
  if (!post?.id && !post?.postid) {
    alert('No post id available to open on map.')
    return
  }
  const pid = String(post.id || post.postid)
  router.push({ path: '/map', query: { postId: pid } })
}

// local like/comment counters for demo
const liked = ref(false)
const likeCount = ref(props.post.likes || 0)
const commentCount = ref(props.post.comments || 0)

// Toggle like button
function toggleLike() {
  liked.value = !liked.value
  likeCount.value += liked.value ? 1 : -1
}

// Open comment modal or show placeholder action
function openComments() {
  alert(`Opening comments for "${props.post.user?.name}"`)
}
</script>

<template>
  <article :class="['card', { active: isActive }]">
    <!-- Top image / hero -->
    <div class="hero">
      <img :src="heroDisplaySrc" alt="Post photo" crossorigin="anonymous" @error="(ev) => onImgError(ev, heroDisplaySrc)" />
      <div v-if="tagLine" class="chip">{{ tagLine }}</div>

      <!-- Carousel controls -->
      <button
        v-if="photoCount > 1"
        class="nav prev"
        type="button"
        aria-label="Previous photo"
        @click="prevPhoto"
      >
        ‹
      </button>
      <button
        v-if="photoCount > 1"
        class="nav next"
        type="button"
        aria-label="Next photo"
        @click="nextPhoto"
      >
        ›
      </button>

      <!-- Dots -->
      <div v-if="photoCount > 1" class="dots" role="tablist" aria-label="Photos">
        <button
          v-for="(_, i) in photoCount"
          :key="i"
          type="button"
          class="dot"
          :class="{ active: i === currentIndex }"
          :aria-label="`Go to photo ${i+1}`"
          @click="goToPhoto(i)"
        />
      </div>
    </div>

    <!-- Content body -->
    <div class="body">
      <!-- Title row with rating on the right -->
      <div class="title-row">
        <h3 class="title">
          {{ post.restaurant?.name || post.raw?.restaurant?.name || post.title || 'Untitled' }}
        </h3>

        <div v-if="ratingValue" class="rating">
          <span class="star">★</span>
          <span class="rating-num">{{ Number(ratingValue).toFixed(1) }}</span>
        </div>
      </div>

      <!-- Subtitle (dish / category) -->
      <div v-if="post.restaurant?.address || post.raw?.restaurant?.address" class="address">
        {{ post.restaurant?.address || post.raw?.restaurant?.address }}
      </div>

      <!-- Description text -->
      <p v-if="post.text" class="desc">{{ post.text }}</p>

      <!-- Meta/footer -->
      <div class="meta">
        <div class="stats">
          <span class="stat">🤍 {{ likeCount }}</span>
          <span class="stat">💬 {{ commentCount }}</span>
          
        </div>

        <div class="author" v-if="post.user">
          <img
            :src="resolveImageUrl(post.user?.avatar) || '/images/avatar1.png'"
            class="avatar"
            alt="User avatar"
          />
          <span class="name">{{ post.user?.name }}</span>
        </div>

        <button v-if="hasMapTarget" class="map-btn" @click="viewOnMap(post)" title="View on map">
          📍 Map
        </button>
        <span v-else class="map-btn disabled" title="No map data">Map</span>

        <button class="icon-btn" @click="openComments" title="Share">⤴︎</button>
        <span v-if="postDateText" class="date-text">Posted on {{ postDateText }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 12px 24px rgba(17, 24, 39, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.hero {
  position: relative;
}
.hero img {
  width: 100%;
  height: 200px;
  object-fit: cover;
  display: block;
}
.chip {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(17, 24, 39, 0.85);
  color: #fff;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}

.body {
  padding: 14px 16px 12px;
}
.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}
.rating {
  display: flex;
  align-items: center;
  gap: 6px;
}
.star {
  color: #f59e0b;
  font-size: 16px;
  line-height: 1;
}
.rating-num {
  font-weight: 700;
  color: #f59e0b;
}

.date-text {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
}

.subtitle {
  margin-top: 2px;
  color: #6b7280;
  font-size: 13px;
}
.address {
  color: #9ca3af;
  font-size: 12px;
  margin-top: 2px;
}
.desc {
  margin: 10px 0 12px;
  color: #374151;
  font-size: 14px;
}

.meta {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 10px;
}
.stats {
  display: flex;
  gap: 14px;
  color: #6b7280;
  font-size: 13px;
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.author {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
}
.name {
  font-size: 13px;
  color: #4b5563;
}

.map-btn {
  margin-left: auto;
  padding: 6px 12px;
  border-radius: 999px;
  background: #eef2ff;
  color: #1f2937;
  font-size: 13px;
  text-decoration: none;
  border: 1px solid #e5e7eb;
}
.map-btn:hover {
  background: #e0e7ff;
}

.map-btn.disabled {
  pointer-events: none;
  opacity: 0.6;
}

.icon-btn {
  background: transparent;
  border: none;
  color: #6b7280;
  font-size: 16px;
  cursor: pointer;
}
.icon-btn:hover {
  color: #111827;
}


/* Carousel controls */
.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.15);
  background: rgba(255,255,255,0.8);
  color: #111827;
  display: grid;
  place-items: center;
  cursor: pointer;
  user-select: none;
}
.nav.prev { left: 10px; }
.nav.next { right: 10px; }
.nav:hover { background: #fff; }

/* Dots */
.dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8px;
  display: flex;
  justify-content: center;
  gap: 6px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.7);
  background: rgba(255,255,255,0.6);
  cursor: pointer;
}
.dot.active { background: #fff; }
</style>