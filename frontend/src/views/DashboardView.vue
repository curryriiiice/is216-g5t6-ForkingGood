<script setup>
import { ref, onMounted } from 'vue'
import PostCard from '@/components/PostCard.vue'
import Modal from '@/components/Modal.vue'
import AddRecommendationForm from '@/components/AddRecommendationForm.vue'

import api from '@/lib/api'

const posts = ref([])
const trendingSlides = ref([])
const showAdd = ref(false)
const currentUser = ref(null)
const index = ref(0)

async function load() {
  try {
    // 1) current user/profile from your dedicated backend
    //    backend should read the Supabase JWT from Authorization header
    //    and return either { user: {...} } or the profile directly
    const meRes = await api.get('/me')
    currentUser.value = meRes.data?.user || meRes.data || null
    if (!currentUser.value) return

    // 2) trending slides
    const trendingRes = await api.get('/trending')
    trendingSlides.value = trendingRes.data?.trending ?? trendingRes.data ?? []

    // 3) dashboard feed
    const feedRes = await api.get('/feed')
    posts.value = feedRes.data?.feed ?? feedRes.data ?? []
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
          <PostCard v-for="p in posts" :key="p.id" :post="p" />
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
</style>
