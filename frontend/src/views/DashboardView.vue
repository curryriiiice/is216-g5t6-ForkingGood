<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import PostCard from '@/components/PostCard.vue'
import Modal from '@/components/Modal.vue'
import AddRecommendationForm from '@/components/AddRecommendationForm.vue'
import axios from 'axios'
import { useRoute } from 'vue-router'

// === Backend config ===
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } })

// TEMP: until auth is wired, use a fixed user for friends feed
const ACTIVE_EMAIL = import.meta.env.VITE_ACTIVE_EMAIL || 'clarice.lim.2024@computing.smu.edu.sg'

const posts = ref([])
const trendingSlides = ref([])
const showAdd = ref(false)
const currentUser = ref({ email: ACTIVE_EMAIL })
const index = ref(0)

// When you click the post in map it directs you to the post here

const route = useRoute()

async function scrollToPostIfAny() {
  const postId = route.query.postId
  if (!postId) return
  await nextTick()
  const el = document.getElementById(`post-${postId}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('highlight')
    setTimeout(() => el.classList.remove('highlight'), 2000)
  }
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

function current() {
  if (!trendingSlides.value.length) return { title: 'Loading...' }
  return trendingSlides.value[index.value]
}

function go(dir) {
  const len = trendingSlides.value.length
  if (len === 0) return
  if (dir === 'next') index.value = (index.value + 1) % len
  else if (dir === 'prev') index.value = (index.value - 1 + len) % len
}

onMounted(load)
</script>

<template>
  <div class="page">
    <!-- Trending Section -->

    <section class="hero">
      <h2 class="section-title">Trending Food</h2>

      <div class="carousel">
        <button class="car-btn left" aria-label="Previous" @click="go('prev')">‹</button>

        <div class="car-track">
          <div class="car-slide">
            <div class="slide-placeholder">
              <div class="slide-wrap">
                <span class="slide-text">{{ current().title }}</span>
                <span v-if="current().avgRating" class="slide-sub"
                  >⭐ {{ current().avgRating }}</span
                >
                <span v-if="current().subtitle" class="slide-sub">{{ current().subtitle }}</span>
              </div>
            </div>
          </div>
        </div>

        <button class="car-btn right" aria-label="Next" @click="go('next')">›</button>
      </div>
    </section>

    <!-- Posts Feed -->
    <section class="feed">
      <h3 class="feed-title">Posts</h3>
      <div class="feed-shell">
        <template v-if="posts.length">
          <div v-for="p in posts" :key="p.id" :id="`post-${p.id}`">
            <PostCard :post="p" />
          </div>
        </template>
        <div v-else class="empty">No posts yet. Create one!</div>
      </div>
    </section>

    <!-- Floating Create button -->
    <button class="fab" aria-label="Create Post" @click="showAdd = true">+</button>
    <div class="fab-label">Create Post</div>

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
  <Modal :show="showAdd" title="Add recommendation" @close="showAdd = false">
    <AddRecommendationForm @added="handleAdded" />
    <template #footer>
      <button class="px-4 py-2 rounded-md border" @click="showAdd = false">Cancel</button>
    </template>
  </Modal>
</template>

<style scoped>
.page {
  min-height: calc(100vh - 56px);
  background: #cfe8f7;
  padding: 16px 0 80px;
}
.hero {
  width: min(920px, 92vw);
  margin: 0 auto 18px;
}
.section-title {
  font-weight: 800;
  margin: 0 0 10px 8px;
  color: #1f2937;
}
.carousel {
  position: relative;
  height: 260px;
  background: #cfe8f7;
  border-radius: 6px;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.car-track {
  width: 86%;
  height: 78%;
  background: #5f6a75;
  border-radius: 4px;
  display: grid;
  place-items: center;
}
.slide-placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}
.slide-wrap {
  text-align: center;
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
.car-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  border: 0;
  cursor: pointer;
  font-size: 28px;
  display: grid;
  place-items: center;
}
.car-btn.left {
  left: 26px;
}
.car-btn.right {
  right: 26px;
}
.car-btn:hover {
  background: rgba(0, 0, 0, 0.35);
}
.feed {
  width: min(900px, 92vw);
  margin: 14px auto 0;
}
.feed-title {
  font-weight: 800;
  color: #1f2937;
  margin: 0 0 12px 8px;
}
.feed-shell {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  padding: 18px 18px 8px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.empty {
  text-align: center;
  color: #555;
  font-weight: 500;
  padding: 20px 0;
}
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
}
.fab-label {
  position: fixed;
  right: 28px;
  bottom: 54px;
  font-size: 14px;
  color: #111;
  font-weight: 600;
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
  animation: flash 1.2s ease;
  background-color: #fff3bf;
}

@keyframes flash {
  0% { background-color: #fff3bf; }
  100% { background-color: transparent; }
}
</style>
