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

// TEMP: until auth is wired, use a fixed user for friends feed
const ACTIVE_EMAIL = import.meta.env.VITE_ACTIVE_EMAIL || 'clarice.lim.2024@computing.smu.edu.sg'

const posts = ref([])
const trendingSlides = ref([])
const showAdd = ref(false)
const currentUser = ref({ email: ACTIVE_EMAIL })
const highlightedPostId = ref(null)

// When you click the post in map it directs you to the post here

const route = useRoute()
const router = useRouter()

async function scrollToPostIfAny() {
  const postId = route.query.postId
  if (!postId) return
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

watch(() => route.query.postId, () => {
  scrollToPostIfAny()
})

// -------- Helpers to call your backend (same as MapView style) --------
async function getFriendRecs(userEmail) {
  try {
    const r = await api.post('/friends/getFriendRecs', { user_email: userEmail })
    return Array.isArray(r.data?.data) ? r.data.data : []
  } catch (e) {
    console.error(
      '[Dashboard] getFriendRecs failed:',
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
    photos: [],
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

async function load() {
  try {
    // 1) Build feed using the same flow as MapView: friends → post details
    const pinsRaw = await getFriendRecs(ACTIVE_EMAIL)
    console.log('[Dashboard] pinsRaw', pinsRaw)

    const details = await Promise.all(pinsRaw.map((p) => getPostById(p.postid)))
    console.log('[Dashboard] details', details)

    const feed = []
    pinsRaw.forEach((p, i) => feed.push(toNicePost(p, details[i])))

    // newest first by created_at if available
    feed.sort((a, b) => new Date(b.raw.created_at || 0) - new Date(a.raw.created_at || 0))

    posts.value = feed

    await nextTick()
    await scrollToPostIfAny()

    // 2) Compute a simple trending list client-side (group by restaurant)
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


onMounted(load)
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
            :aria-label="`Slide ${i+1}`"
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
        <template v-if="posts.length">
          <div class="row g-3 g-md-4">
            <div
              v-for="p in posts"
              :key="p.id"
              class="col-12 col-lg-6"
            >
            
              <div
                class="card themed-card h-100"
                :id="`post-${p.id}`"
                :class="{ active: highlightedPostId === p.id }"
              >
                <div class="card-body">
                  <div class="d-flex align-items-center mb-2">
                    <h5 class="card-title mb-0 flex-grow-1 text-truncate">{{ p.restaurant?.name || 'Restaurant' }}</h5>
                    <span v-if="Number.isFinite(Number(p.rating))" class="rating-pill ms-2">
                      ⭐ {{ Number(p.rating).toFixed(1) }}
                    </span>
                  </div>
                  <div class="d-flex flex-wrap gap-2 mb-2">
                    <span v-if="p.restaurant?.cuisine_type" class="post-chip post-chip--cuisine">
                      {{ p.restaurant.cuisine_type }}
                    </span>
                    <span v-if="p.restaurant?.address" class="post-chip post-chip--addr">
                      {{ p.restaurant.address }}
                    </span>
                  </div>
                  <PostCard :post="p" />
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
  <Modal :show="showAdd" title="Add Food Recommendation"  @close="showAdd = false">
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

.trend-slide{
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
  0% { background-color: #fff3bf; }
  100% { background-color: transparent; }
}

.themed-card:hover{
  transform: none !important;
}

/* ==========================
   Active (opened from map) state
   ========================== */
.card.active {
  background: var(--ink-400); /* charcoal */
  color: #f9fafb;      /* near-white text */
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
</style>
