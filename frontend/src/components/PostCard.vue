<script setup>
import { ref } from 'vue'

const props = defineProps({
  post: { type: Object, required: true },
})

// local like/comment counters for demo
const liked = ref(false)
const likeCount = ref(props.post.likes || 0)
const commentCount = ref(props.post.comments || 0)

const ratingBadge = (n) => `${Number(n).toFixed(1)}★`

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
  <article class="card">
    <!-- Header -->
    <header class="head">
      <div class="who">
        <img :src="post.user?.avatar || '/images/avatar1.png'" class="avatar" alt="User avatar" />
        <div class="names">
          <div class="handle">{{ post.user?.name }}</div>
          <div class="sub">@{{ post.user?.name?.replace('@', '') }}</div>
        </div>
      </div>
      <div class="rating">{{ ratingBadge(post.rating ?? 0) }}</div>
    </header>

    <!-- Text -->
    <p v-if="post.text" class="text">{{ post.text }}</p>

    <!-- ✅ Restaurant Info -->
    <div v-if="post.restaurant || post.raw?.restaurant" class="restaurant">
      <div class="restaurant-name">
        {{ post.restaurant?.name || post.raw?.restaurant?.name }}
      </div>
      <div class="restaurant-info">
        {{ post.restaurant?.cuisine_type || post.raw?.restaurant?.cuisine_type }}
        •
        
        <!-- clickable location -->
        <RouterLink
          v-if="post.restaurant?.id"
          :to="{ path: '/map', query: { restaurant: String(post.restaurant.id) } }"
          class="map-link"
          title="View on map"
        >
          📍 {{ post.restaurant?.address || 'View on map' }}
        </RouterLink>
      </div>

      
    </div>

    <!-- Images -->
    <div v-if="post.photos?.length" class="grid">
      <img v-for="(p, i) in post.photos" :key="i" :src="p" alt="Post photo" />
    </div>

    <!-- Footer / Meta -->
    <footer class="meta">
      <!-- Like Button -->
      <button class="btn like-btn" :class="{ active: liked }" @click="toggleLike">
        ❤️ <span>{{ likeCount }}</span>
      </button>

      <!-- Comment Button -->
      <button class="btn comment-btn" @click="openComments">
        💬 <span>{{ commentCount }}</span>
      </button>

      <!-- Share -->
      <button class="btn share-btn">🔗 Share</button>
    </footer>
  </article>
</template>

<style scoped>
.card {
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.08);
  padding: 12px 12px 10px;
  margin: 0 0 14px;
  border: 1px solid rgba(0, 0, 0, 0.05);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.who {
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  object-fit: cover;
}
.names {
  line-height: 1.1;
}
.handle {
  font-weight: 700;
  font-size: 14px;
  color: #111;
}
.sub {
  font-size: 12px;
  color: #6b7280;
}
.rating {
  font-weight: 700;
  color: #111;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.text {
  margin: 8px 0 6px;
  color: #111;
}

/* ✅ Restaurant section */
.restaurant {
  margin: 6px 0 10px;
  padding: 8px 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.restaurant-name {
  font-weight: 700;
  color: #111;
  font-size: 14px;
}
.restaurant-info {
  color: #6b7280;
  font-size: 12px;
  margin-top: 2px;
}

.grid {
  display: grid;
  gap: 8px;
  margin: 6px 0 8px;
  grid-template-columns: repeat(3, 1fr);
}
.grid img {
  width: 100%;
  height: 140px;
  object-fit: cover;
  border-radius: 6px;
}

/* Footer buttons */
.meta {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 13px;
  color: #111;
}
.btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #111;
  background: transparent;
  border: none;
  cursor: pointer;
  transition:
    color 0.2s,
    transform 0.1s;
}
.btn:hover {
  color: #eebbc3;
  transform: scale(1.1);
}
.like-btn.active {
  color: #ff595e;
}
.share-btn {
  margin-left: auto;
  color: #6b7280;
}
</style>
