<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue' // Added computed and watch
import axios from 'axios'
import Modal from '@/components/Modal.vue'
import { useRouter } from 'vue-router'
// --- NEW: Import useAuthUser ---
import { useAuthUser } from '@/lib/useAuthUser' // Assuming this is the correct path

// API
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } })

// --- REMOVED: Hardcoded ACTIVE_EMAIL ---
// const ACTIVE_EMAIL = import.meta.env.VITE_ACTIVE_EMAIL || 'clarice.lim.2024@computing.smu.edu.sg'

// --- NEW: Use authenticated user ---
const { user: authUser, refresh: refreshAuthUser } = useAuthUser()
const activeEmail = computed(() => authUser.value?.email ?? null)

const router = useRouter()

// UI state
const activeTab = ref('myPosts') // 'myPosts' or 'likedPosts'

const myPosts = ref([])
const likedPosts = ref([])

const loadingMyPosts = ref(true)
const errorMyPosts = ref('')
const loadingLikedPosts = ref(true)
const errorLikedPosts = ref('')

// --- Fetch User's Own Posts ---
async function fetchMyPosts() {
  // --- UPDATED: Check for activeEmail value ---
  if (!activeEmail.value) {
    errorMyPosts.value = 'Please log in to see your posts.'
    loadingMyPosts.value = false
    myPosts.value = [] // Ensure list is empty
    return
  }
  loadingMyPosts.value = true
  errorMyPosts.value = ''
  myPosts.value = []
  try {
    // --- UPDATED: Use activeEmail.value ---
    const r = await api.post('/user/getUserPosts', {
      user_email: activeEmail.value,
      friends: false, // As per documentation
    })
    myPosts.value = (Array.isArray(r.data?.data) ? r.data.data : []).map(normalizePostData)
  } catch (e) {
    console.error('[ActivityView] fetchMyPosts failed', e)
    errorMyPosts.value = e.response?.data?.message || 'Failed to load your posts.'
  } finally {
    loadingMyPosts.value = false
  }
}

// --- Fetch User's Liked Posts ---
async function fetchLikedPosts() {
  // --- UPDATED: Check for activeEmail value ---
   if (!activeEmail.value) {
    errorLikedPosts.value = 'Please log in to see liked posts.'
    loadingLikedPosts.value = false
    likedPosts.value = [] // Ensure list is empty
    return
  }
  loadingLikedPosts.value = true
  errorLikedPosts.value = ''
  likedPosts.value = []
  try {
    // --- UPDATED: Use activeEmail.value ---
    const r = await api.post('/user/getLikedPosts', {
      user_email: activeEmail.value,
    })
    likedPosts.value = (Array.isArray(r.data?.data) ? r.data.data : []).map(normalizePostData)
  } catch (e) {
    console.error('[ActivityView] fetchLikedPosts failed', e)
    errorLikedPosts.value = e.response?.data?.message || 'Failed to load liked posts.'
  } finally {
    loadingLikedPosts.value = false
  }
}

// --- Helper to normalize post data structure ---
function normalizePostData(post) {
  const imageUrl = Array.isArray(post.picURLs) && post.picURLs.length > 0
    ? post.picURLs[0] //
    : '/images/placeholder-restaurant.jpg'

  let rating = post.rating ?? null //
  if (rating !== null && !isNaN(Number(rating))) {
     rating = Number(rating)
  } else {
     rating = null
  }

  return {
    id: post.postid, //
    restaurant_name: post.restaurant_name || 'Restaurant', //
    rating: rating,
    imageUrl: imageUrl,
    cuisine_type: post.cuisine_type, //
    address: post.address, //
    area: post.area, //
    price_level: post.price_level, //
    review: post.review, //
    created_at: post.created_at, //
    poster_username: post.poster_username, //
    poster_email: post.poster_email, //
    is_public: post.is_public, //
    lat: post.lat, //
    long: post.long, //
  }
}

// --- Navigation ---
function viewPostDetail(postId) {
   router.push({ path: '/dashboard', query: { postId: postId } }).catch(() => {})
}

onMounted(async () => {
  // --- UPDATED: Refresh auth user before fetching ---
  await refreshAuthUser()
  await Promise.all([fetchMyPosts(), fetchLikedPosts()])
  await nextTick()
})

// --- NEW: Watcher to refetch data if user logs in/out ---
watch(activeEmail, async (newEmail, oldEmail) => {
  if (newEmail !== oldEmail) {
    // User changed, refetch data
    await Promise.all([fetchMyPosts(), fetchLikedPosts()])
  }
})

</script>

<template>
  <div class="page sage-bg">
    <section class="container py-3">
      <h2 class="section-title mb-4">Activity</h2>

      <ul class="nav nav-pills justify-content-center mb-4 activity-tabs">
        <li class="nav-item">
          <button
            class="nav-link"
            :class="{ active: activeTab === 'myPosts' }"
            @click="activeTab = 'myPosts'"
            type="button"
          >
            My Posts
          </button>
        </li>
        <li class="nav-item">
          <button
            class="nav-link"
            :class="{ active: activeTab === 'likedPosts' }"
            @click="activeTab = 'likedPosts'"
            type="button"
          >
            Liked Posts
          </button>
        </li>
      </ul>

      <div>
        <div v-show="activeTab === 'myPosts'">
          <div v-if="loadingMyPosts" class="text-center text-muted py-5">Loading your posts…</div>
          <div v-else-if="errorMyPosts" class="alert alert-danger py-2">{{ errorMyPosts }}</div>
          <div
            v-else-if="!myPosts.length"
            class="empty text-muted p-4 rounded-3 bg-white shadow-sm"
          >
            You haven't created any posts yet.
          </div>
          <div class="row g-2 g-sm-3" v-else>
            <div v-for="post in myPosts" :key="'my-' + post.id" class="col-4 col-md-3 col-lg-2dot4">
              <div
                class="card post-card h-100 shadow-sm border-0 card-clickable"
                @click="viewPostDetail(post.id)"
                role="button"
                tabindex="0"
                :title="`View post for ${post.restaurant_name}`"
              >
                <div class="post-image-wrapper">
                   <img :src="post.imageUrl" class="card-img-top post-image" alt="Post image" @error="$event.target.src='/images/placeholder-restaurant.jpg'">
                   <span v-if="post.rating !== null" class="badge rating-badge">⭐ {{ Number(post.rating).toFixed(1) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'likedPosts'">
          <div v-if="loadingLikedPosts" class="text-center text-muted py-5">Loading liked posts…</div>
          <div v-else-if="errorLikedPosts" class="alert alert-danger py-2">{{ errorLikedPosts }}</div>
          <div
            v-else-if="!likedPosts.length"
            class="empty text-muted p-4 rounded-3 bg-white shadow-sm"
          >
            You haven't liked any posts yet.
          </div>
          <div class="row g-2 g-sm-3" v-else>
            <div v-for="post in likedPosts" :key="'liked-' + post.id" class="col-4 col-md-3 col-lg-2dot4">
               <div
                class="card post-card h-100 shadow-sm border-0 card-clickable"
                @click="viewPostDetail(post.id)"
                role="button"
                tabindex="0"
                :title="`View post for ${post.restaurant_name}`"
              >
                <div class="post-image-wrapper">
                   <img :src="post.imageUrl" class="card-img-top post-image" alt="Post image" @error="$event.target.src='/images/placeholder-restaurant.jpg'">
                   <span v-if="post.rating !== null" class="badge rating-badge">⭐ {{ Number(post.rating).toFixed(1) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    </div>
</template>

<style scoped>
/* Copied from previous Bootstrap versions */
.page {
  min-height: calc(100vh - 56px); /* Adjust based on navbar height */
  padding: 18px 0 80px;
  background-color: var(--page-bg, var(--app-bg, var(--bg, #f3f4f6))); /* Match MapView/Dashboard */
}
.section-title {
  font-weight: 800;
  color: var(--charcoal);
  text-align: center; /* Center title */
}
.empty {
  text-align: center;
  color: var(--ink-400);
  font-weight: 500;
}

/* Tab Switcher Styling (TikTok inspired) */
.activity-tabs {
  border-bottom: 1px solid var(--line-100, #e5e7eb);
  padding-bottom: 0;
}
.activity-tabs .nav-item {
  flex-grow: 1;
  text-align: center;
}
.activity-tabs .nav-link {
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--ink-400, #6b7280);
  font-weight: 600;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
  margin-bottom: -1px; /* Overlap border */
  border-radius: 0;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
  width: 100%; /* Ensure button takes full width of nav-item */
}
.activity-tabs .nav-link:hover {
  border-bottom-color: var(--line-200, #d1d5db);
  color: var(--charcoal, #1f2937);
}
.activity-tabs .nav-link.active {
  color: var(--charcoal, #1f2937);
  background-color: transparent !important;
  border-bottom-color: var(--charcoal, #1f2937);
  font-weight: 700;
}
.activity-tabs .nav-link:focus {
  outline: none;
  box-shadow: none;
}

/* Post Card Styling for Grid */
.post-card {
    position: relative;
    overflow: hidden;
    background-color: var(--line-100); /* Ensure background for loading state */
}
.post-image-wrapper {
    width: 100%;
    padding-top: 100%; /* Creates a 1:1 aspect ratio */
    position: relative;
}
.post-image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.rating-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    background-color: rgba(0, 0, 0, 0.65);
    color: white;
    font-size: 0.7rem;
    padding: 2px 5px;
    border-radius: 4px;
}
.card-clickable {
    cursor: pointer;
    transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
}
.card-clickable:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 8px 16px rgba(0,0,0,0.1);
}

/* Custom grid column for 5 items per row on large screens */
@media (min-width: 992px) { /* Corresponds to lg breakpoint */
  .col-lg-2dot4 {
    flex: 0 0 auto;
    width: 20%;
  }
}

/* Modal Styling */
:deep(.modal .modal-content) {
  background: var(--surface);
  color: var(--charcoal);
  border: 1px solid var(--line-200);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
}
:deep(.modal .btn-primary) {
  background: var(--sage-600);
  border: none;
  color: #fff;
  font-weight: 800;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
</style>