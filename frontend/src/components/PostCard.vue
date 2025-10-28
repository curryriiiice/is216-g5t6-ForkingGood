<script setup>
import { ref, computed, reactive, watch, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const emit = defineEmits(['open-comments', 'like-error', 'updated', 'post-updated', 'liked', 'unliked'])



const props = defineProps({
  post: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  controls: { type: Boolean, default: false },
  // Optional: parent-provided live comment count
  externalCommentCount: { type: Number, default: undefined },
})

// --- Image URL resolver (keeps layout, only fixes src values) ---
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const IMAGE_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_IMAGE_BASE_URL || API_BASE)
const JSON_HEADERS = { 'Content-Type': 'application/json' }

const ACTIVE_EMAIL = import.meta.env.VITE_ACTIVE_EMAIL || 'clarice.lim.2024@computing.smu.edu.sg'
const ENDPOINTS = {
  getLikes: `${API_BASE}/friends/getLikesbyPostId`,
  like: `${API_BASE}/friends/likePost`,
  unlike: `${API_BASE}/friends/unlikePost`,
  getComments: `${API_BASE}/friends/getCommentsbyPostId`,
  comment: `${API_BASE}/friends/commentPost`,
  deleteComment: `${API_BASE}/friends/deleteComment`,
  editComment: `${API_BASE}/friends/editComment`,
}

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

const isPublicBool = computed(() => {
  const p = props.post || {}
  // check common fields in order: is_public → public? → raw.public
  let v = (p.is_public !== undefined ? p.is_public
           : (p['public?'] !== undefined ? p['public?']
           : (p.raw && p.raw.public !== undefined ? p.raw.public : null)))
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true','1','yes','y'].includes(s)) return true
    if (['false','0','no','n'].includes(s)) return false
  }
  return !!v
})

const visibilityText = computed(() => {
  const p = props.post || {}
  // Prefer is_public, fallback to legacy "public?"
  const val = (typeof p.is_public === 'boolean')
    ? p.is_public
    : (typeof p['public?'] === 'boolean' ? p['public?'] : null)
  if (val === null) return null
  return val ? 'Everyone' : 'Friends Only'
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

// local like/comment counters (hydrated from backend)
const liked = ref(false)
const likeCount = ref(
  typeof props.post?.raw?.upvote_count === 'number' && !Number.isNaN(props.post.raw.upvote_count)
    ? props.post.raw.upvote_count
    : (typeof props.post?.likes === 'number' && !Number.isNaN(props.post.likes)
        ? props.post.likes
        : 0)
)
const commentCount = ref(
  typeof props.externalCommentCount === 'number' && !Number.isNaN(props.externalCommentCount)
    ? props.externalCommentCount
    : (typeof props.post.comments === 'number' ? props.post.comments : 0)
)
// Prevent rapid double-taps that cause race conditions / count drift
const isLiking = ref(false)

watch(
  () => props.externalCommentCount,
  (n) => {
    if (typeof n === 'number' && !Number.isNaN(n)) {
      commentCount.value = n
    }
  },
  { immediate: true }
)

async function refreshLikes() {
  const postId = props.post?.id || props.post?.postid
  if (!postId) return
  try {
    const res = await fetch(ENDPOINTS.getLikes, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ postid: String(postId) })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const emails = Array.isArray(data?.data) ? data.data : []
    likeCount.value = emails.length
    liked.value = emails.includes(ACTIVE_EMAIL)
  } catch (e) {
    // keep existing optimistic state on failure
  }
}

async function refreshComments() {
  const postId = props.post?.id || props.post?.postid
  if (!postId) return
  try {
    const res = await fetch(ENDPOINTS.getComments, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ postid: String(postId) })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const list = Array.isArray(data?.data) ? data.data : []
    commentCount.value = list.length
  } catch (e) {
    // ignore and keep last known count
  }
}

async function refreshEngagement() {
  await Promise.allSettled([refreshLikes(), refreshComments()])
}

onMounted(refreshEngagement)
watch(() => props.post?.id || props.post?.postid, () => refreshEngagement())

// Keep local like state in sync when parent patches the post (e.g., from preview/dashboard)
watch(
  () => ({
    flatLikes: props.post?.likes,
    flatFlag: props.post?.user_has_upvoted,
    rawLikes: props.post?.raw?.upvote_count,
    rawFlag: props.post?.raw?.user_has_upvoted,
  }),
  (n) => {
    const nextCount =
      (typeof n.rawLikes === 'number' && !Number.isNaN(n.rawLikes)) ? n.rawLikes :
      (typeof n.flatLikes === 'number' && !Number.isNaN(n.flatLikes)) ? n.flatLikes :
      null
    if (nextCount !== null && nextCount !== likeCount.value) {
      likeCount.value = nextCount
    }
    if (typeof n.rawFlag === 'boolean') {
      liked.value = n.rawFlag
    } else if (typeof n.flatFlag === 'boolean') {
      liked.value = n.flatFlag
    }
  },
)

// Toggle like button (optimistic update, revert on error)
async function toggleLike() {
  const postId = props.post?.id || props.post?.postid
  if (!postId) return
  if (isLiking.value) return
  isLiking.value = true

  // optimistic update
  const prevLiked = liked.value
  const prevCount = likeCount.value
  liked.value = !prevLiked
  likeCount.value = Math.max(0, prevCount + (liked.value ? 1 : -1))

  const payload = {
    postid: String(postId),
    liker_email: ACTIVE_EMAIL,
  }

  const request = (url, method) =>
    fetch(url, {
      method,
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    })

  try {
    let res
    if (liked.value) {
      // now liked -> create like
      res = await request(ENDPOINTS.like, 'POST')
    } else {
      // now unliked -> attempt DELETE first
      res = await request(ENDPOINTS.unlike, 'DELETE')
      // Fallback: some backends route unlike as POST instead of DELETE
      if (!res.ok && (res.status === 404 || res.status === 405 || res.status === 415)) {
        res = await request(ENDPOINTS.unlike, 'POST')
      }
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // Try to use server canonical values if provided
    let data = null
    try {
      if (typeof res.json === 'function') data = await res.json()
    } catch {}
    const serverCount = data?.upvote_count ?? data?.upvotes ?? data?.likes
    const serverFlag = data?.user_has_upvoted ?? data?.has_upvoted
    if (Number.isFinite(Number(serverCount))) {
      likeCount.value = Math.max(0, Number(serverCount))
    }
    if (typeof serverFlag === 'boolean') {
      liked.value = serverFlag
    }
    // Notify parent(s) with a compact patch so lists/previews can sync instantly
    try {
      const idStr = String(props.post?.id || props.post?.postid)
      const safeCount = Math.max(0, Number(likeCount.value))
      const newFlag = Boolean(liked.value)
      const patch = {
        id: idStr,
        postid: idStr,
        likes: safeCount,
        user_has_upvoted: newFlag,
        raw: { upvote_count: safeCount, user_has_upvoted: newFlag },
      }
      emit('updated', patch)
      emit('post-updated', patch)
      emit(newFlag ? 'liked' : 'unliked', patch)
    } catch {}
    // Optionally: await refreshLikes() to resync exact count
  } catch (err) {
    // revert on failure
    liked.value = prevLiked
    likeCount.value = prevCount
    emit('like-error', { postId, error: String(err) })
  }
  finally {
    isLiking.value = false
  }
}

// Open comment modal or emit to parent
function openComments() {
  const postId = props.post?.id || props.post?.postid
  if (!postId) return
  emit('open-comments', { postId })
}
</script>

<template>
  <article :class="['card', { active: isActive }]">
    <!-- Top image / hero -->
    <div class="hero">
      <img :src="heroDisplaySrc" alt="Post photo" crossorigin="anonymous" @error="(ev) => onImgError(ev, heroDisplaySrc)" />
      <div class="vis-badge" v-if="isPublicBool !== null">
        <span
          class="badge visibility-tag"
          :class="isPublicBool ? 'sage-tag' : 'terracotta-tag'"
          :aria-label="isPublicBool ? 'Visible to everyone' : 'Visible to friends only'"
        >
          {{ isPublicBool ? 'Everyone' : 'Friends Only' }}
        </span>
      </div>
      <div v-if="tagLine" class="chip">{{ tagLine }}</div>

      <!-- Carousel controls -->
      <button
        v-if="controls && photoCount > 1"
        class="nav prev"
        type="button"
        aria-label="Previous photo"
        @click.stop="prevPhoto"
        data-stop-preview
      >
        ‹
      </button>
      <button
        v-if="controls && photoCount > 1"
        class="nav next"
        type="button"
        aria-label="Next photo"
        @click.stop="nextPhoto"
        data-stop-preview
      >
        ›
      </button>

      <!-- Dots -->
      <div v-if="controls && photoCount > 1" class="dots" role="tablist" aria-label="Photos" data-stop-preview>
        <button
          v-for="(_, i) in photoCount"
          :key="i"
          type="button"
          class="dot"
          :class="{ active: i === currentIndex }"
          :aria-label="`Go to photo ${i+1}`"
          @click.stop="goToPhoto(i)"
          data-stop-preview
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
          <button class="stat as-button" @click.stop="toggleLike" :aria-pressed="liked" data-stop-preview>
            <span v-if="liked">💗</span><span v-else>🤍</span>
            <span>{{ likeCount }}</span>
          </button>
          <button class="stat as-button" @click.stop="openComments" data-stop-preview title="Open comments">
            💬 <span>{{ commentCount }}</span>
          </button>
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

.vis-badge { position: absolute; top: 10px; left: 10px; z-index: 6; }
.visibility-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
  color: #fff;
  border: none;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  text-shadow: 0 1px 1px rgba(0,0,0,0.25);
}
.sage-tag { background-color: var(--sage-600, #2f855a); }
.terracotta-tag { background-color: var(--terracotta-500, #c05621); }

/* ---------------- Responsive tweaks for PostCard ---------------- */

/* Responsive hero image height using clamp and breakpoints */
.hero img {
  height: clamp(160px, 32vw, 220px);
}
@media (min-width: 576px) { /* sm */
  .hero img { height: clamp(200px, 28vw, 260px); }
}
@media (min-width: 768px) { /* md */
  .hero img { height: clamp(220px, 26vw, 300px); }
}
@media (min-width: 1200px) { /* xl */
  .hero img { height: clamp(260px, 24vw, 360px); }
}

/* Title and text scale */
.title {
  font-size: clamp(16px, 2.4vw, 20px);
}
.desc {
  font-size: clamp(13px, 1.8vw, 14px);
  line-height: 1.45;
}
.address, .stats, .name, .date-text {
  font-size: clamp(12px, 1.7vw, 13px);
}

/* Let long text wrap nicely */
.title, .address, .desc {
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* Make the meta section adapt on small screens */
@media (max-width: 575.98px) {
  .meta {
    grid-template-columns: 1fr auto; /* two columns: text and actions */
    row-gap: 8px;
    align-items: center;
  }
  .author,
  .date-text {
    grid-column: 1 / -1; /* full width rows */
  }
  .map-btn,
  .icon-btn {
    justify-self: end;
  }
  .chip {
    font-size: 11px;
    padding: 4px 8px;
  }
  .visibility-tag {
    font-size: 10px;
    padding: 3px 7px;
  }
  .nav {
    width: 36px;
    height: 36px;
  }
  .dots { bottom: 6px; }
  .dot { width: 6px; height: 6px; }
}

/* Medium-up: keep layout tight but readable */
@media (min-width: 768px) {
  .map-btn { font-size: 14px; padding: 6px 14px; }
}

/* Ensure avatar doesn't distort on small screens */
.avatar {
  min-width: 22px;
  min-height: 22px;
}

.stat.as-button {
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  color: #6b7280;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
}
.stat.as-button:hover { color: #111827; }
.stat.as-button[aria-pressed="true"] { color: var(--sage-600, #2f855a); }
</style>