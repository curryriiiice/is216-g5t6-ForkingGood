<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import axios from 'axios'
import Modal from '@/components/Modal.vue'
import AddRecommendationForm from '@/components/AddRecommendationForm.vue'
import { useRouter } from 'vue-router'

// API
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } })

// TEMP active user until auth is wired
const ACTIVE_EMAIL = import.meta.env.VITE_ACTIVE_EMAIL || 'clarice.lim.2024@computing.smu.edu.sg'

const router = useRouter()

// UI state
const query = ref('')
const searchResults = ref([]) // Filtered results shown to the user
const searchLoading = ref(false)
const searchError = ref('')

// Cache for ALL users
const allUsersCache = ref([]) // Holds the full list fetched on load

// State for Modals
const showAdd = ref(false) // For "Create Post" FAB modal

// --- State for Pending Requests Modal ---
const showPendingModal = ref(false)
const pendingRequests = ref([])
const pendingLoading = ref(false)
const pendingError = ref('')

// --- UPDATED: Function to fetch all users ONCE ---
async function fetchAllUsers() {
  searchLoading.value = true
  searchError.value = ''
  try {
    const r = await api.post('/user/getAllUsers', { user_email: ACTIVE_EMAIL })

    const usersData = Array.isArray(r.data?.data) ? r.data.data : []

    // Map the raw data to the structure needed by the template
    allUsersCache.value = usersData
      .filter((u) => u.email && u.email.toLowerCase() !== ACTIVE_EMAIL.toLowerCase()) // Added check for u.email existence
      .map((u) => ({
        email: u.email,
        username: u.username,
        name: u.username || u.email.split('@')[0],
        avatar: u.profile_image_url || '/images/avatar1.png', // Uses profile_image_url
        isFriend: u.friendship_status === 'friend',
        isPending: u.friendship_status === 'pending',
      }))

    searchResults.value = [] // Start with empty results
  } catch (e) {
    console.error('[friends] fetchAllUsers failed', e)
    searchError.value = e.response?.data?.message || 'Failed to load user list.'
  } finally {
    searchLoading.value = false
  }
}

// --- Search function filters the cache ---
const onSearchInput = () => {
  searchLoading.value = true
  searchError.value = ''
  const q = query.value.trim().toLowerCase()

  if (!q) {
    searchResults.value = []
  } else {
    searchResults.value = allUsersCache.value.filter((user) => {
      return (
        user.email.toLowerCase().includes(q) ||
        (user.username && user.username.toLowerCase().includes(q))
      )
    })
  }
  searchLoading.value = false
}

// --- sendFriendReq ---
async function sendFriendReq(user) {
  user.isPending = true
  user.isFriend = false

  try {
    await api.post('/friends/sendFriendReq', {
      user_email: ACTIVE_EMAIL,
      friend_email: user.email,
    })
    // Success
  } catch (e) {
    console.error('[friends] add failed', e)
    user.isPending = false // Rollback
    alert(`Error: ${e.response?.data?.message || 'A request is already pending.'}`)
  }
}

// --- removeFriend (using DELETE) ---
async function removeFriend(user) {
  const yes = confirm(`Remove ${user.name || user.email} from your friends?`)
  if (!yes) return

  user.isFriend = false
  user.isPending = false

  try {
    await api.delete('/friends/removeFriend', {
      data: {
        user_email: ACTIVE_EMAIL,
        friend_email: user.email,
      },
    })
    // Success
  } catch (e) {
    console.error('[friends] remove failed', e)
    user.isFriend = true // Rollback
    alert(`Error: ${e.response?.data?.message || 'Could not remove friend'}`)
  }
}

// --- Functions for Pending Requests ---
async function loadPendingRequests() {
  pendingLoading.value = true
  pendingError.value = ''
  pendingRequests.value = []
  try {
    const r = await api.post('/friends/getPendingFriendReqs', { user_email: ACTIVE_EMAIL })
    const emailList = Array.isArray(r.data?.data) ? r.data.data : []
    pendingRequests.value = emailList.map((email) => ({
      sender_email: email,
    }))
  } catch (e) {
    console.error('[friends] loadPendingRequests failed', e)
    pendingError.value = 'Failed to load pending requests.'
  } finally {
    pendingLoading.value = false
  }
}

async function openPendingModal() {
  showPendingModal.value = true
  await loadPendingRequests() // Refresh when opening
}

async function acceptFriendReq(senderEmail) {
  try {
    await api.post('/friends/acceptFriendReq', {
      user_email: ACTIVE_EMAIL,
      friend_email: senderEmail,
    })
    pendingRequests.value = pendingRequests.value.filter(
      (req) => req.sender_email !== senderEmail,
    )
    // Update caches
    const acceptedUserCache = allUsersCache.value.find((u) => u.email === senderEmail)
    if (acceptedUserCache) {
      acceptedUserCache.isFriend = true
      acceptedUserCache.isPending = false
    }
    const acceptedUserSearch = searchResults.value.find((u) => u.email === senderEmail)
    if (acceptedUserSearch) {
      acceptedUserSearch.isFriend = true
      acceptedUserSearch.isPending = false
    }
  } catch (e) {
    console.error('[friends] acceptFriendReq failed', e)
    pendingError.value = 'Failed to accept request.'
  }
}

async function rejectFriendReq(senderEmail) {
  try {
    await api.post('/friends/rejectFriendReq', {
      user_email: ACTIVE_EMAIL,
      friend_email: senderEmail,
    })
    pendingRequests.value = pendingRequests.value.filter(
      (req) => req.sender_email !== senderEmail,
    )
    // Update caches
    const rejectedUserCache = allUsersCache.value.find((u) => u.email === senderEmail)
    if (rejectedUserCache) {
      rejectedUserCache.isFriend = false
      rejectedUserCache.isPending = false
    }
    const rejectedUserSearch = searchResults.value.find((u) => u.email === senderEmail)
    if (rejectedUserSearch) {
      rejectedUserSearch.isFriend = false
      rejectedUserSearch.isPending = false
    }
  } catch (e) {
    console.error('[friends] rejectFriendReq failed', e)
    pendingError.value = 'Failed to reject request.'
  }
}

function viewProfile(f) {
  if (f?.email) {
    router.push({ path: '/profile', query: { email: f.email } }).catch(() => {})
  }
}

function handleAdded() {
  showAdd.value = false
}

onMounted(async () => {
  await fetchAllUsers() // Load ALL users first
  await loadPendingRequests() // Then load pending requests for the badge
  await nextTick()
})
</script>

<template>
  <div class="page sage-bg">
    <section class="container py-3">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h2 class="section-title">Find Users</h2>
        <div class="d-flex gap-2 align-items-center">
          <input
            v-model="query"
            @input="onSearchInput"
            class="form-control form-control-sm"
            placeholder="Search by email or username"
            style="min-width: 220px"
          />
          <button
            class="btn btn-sm btn-outline-secondary position-relative"
            @click="openPendingModal"
            title="Pending Requests"
          >
            Requests
            <span
              v-if="pendingRequests.length > 0"
              class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
            >
              {{ pendingRequests.length }}
              <span class="visually-hidden">pending requests</span>
            </span>
          </button>
        </div>
      </div>

      <div v-if="searchLoading && !allUsersCache.length" class="text-center text-muted py-5">
        Loading user list...
      </div>
      <div v-else-if="searchError" class="alert alert-danger py-2">{{ searchError }}</div>
      <div
        v-else-if="!searchResults.length && query"
        class="empty text-muted p-4 rounded-3 bg-white shadow-sm"
      >
        No users found matching your search.
      </div>
      <div
        v-else-if="!searchResults.length && !query"
        class="empty text-muted p-4 rounded-3 bg-white shadow-sm"
      >
        Search for friends or new users by email or username.
      </div>
      <div class="row g-3" v-else>
        <div v-for="user in searchResults" :key="user.email" class="col-12 col-md-6 col-lg-4">
          <div class="card h-100 shadow-sm border-0">
            <div class="card-body d-flex gap-3 align-items-center">
              <img
                :src="user.avatar"
                alt=""
                class="rounded-circle"
                style="width: 56px; height: 56px; object-fit: cover"
              />
              <div class="flex-grow-1">
                <div class="fw-bold">{{ user.name }}</div>
                <div class="text-muted small">{{ user.email }}</div>
              </div>
              <div class="d-flex flex-column align-items-end gap-2">
                <template v-if="user.isFriend">
                  <button class="btn btn-sm btn-outline-primary" @click="viewProfile(user)">
                    View
                  </button>
                  <button class="btn btn-sm btn-outline-danger" @click="removeFriend(user)">
                    Remove
                  </button>
                </template>
                <template v-else-if="user.isPending">
                  <button class="btn btn-sm btn-outline-primary" @click="viewProfile(user)">
                    View
                  </button>
                  <button class="btn btn-sm btn-outline-secondary" disabled>Pending</button>
                </template>
                <template v-else>
                  <button class="btn btn-sm btn-outline-primary" @click="viewProfile(user)">
                    View
                  </button>
                  <button class="btn btn-sm btn-fit" @click="sendFriendReq(user)">Add</button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <button class="fab fab-terracotta" @click="showAdd = true" title="Create Post">＋</button>
    <div class="fab-label sage-chip">Create Post</div>

    <Modal :show="showPendingModal" title="Pending Friend Requests" @close="showPendingModal = false">
      <div v-if="pendingLoading" class="text-center text-muted py-3">Loading requests…</div>
      <div v-else-if="pendingError" class="alert alert-danger py-2">{{ pendingError }}</div>
      <div
        v-else-if="!pendingRequests.length"
        class="text-center text-muted py-3"
      >
        You have no pending friend requests.
      </div>
      <div v-else>
        <ul class="list-group list-group-flush">
          <li
            v-for="req in pendingRequests"
            :key="req.sender_email"
            class="list-group-item d-flex align-items-center justify-content-between"
          >
            <div class="fw-semibold">{{ req.sender_email }}</div>
            <div class="d-flex gap-2">
              <button
                class="btn btn-sm btn-primary"
                @click="acceptFriendReq(req.sender_email)"
              >
                Accept
              </button>
              <button
                class="btn btn-sm btn-outline-danger"
                @click="rejectFriendReq(req.sender_email)"
              >
                Reject
              </button>
            </div>
          </li>
        </ul>
      </div>
    </Modal>

    <Modal :show="showAdd" title="Add Food Recommendation" @close="showAdd = false">
      <AddRecommendationForm @added="handleAdded" />
    </Modal>
  </div>
</template>

<style scoped>
.page {
  min-height: calc(100vh - 56px);
  padding: 18px 0 80px;
}
.section-title {
  font-weight: 800;
  color: var(--charcoal);
  margin: 0;
}
.empty {
  text-align: center;
  color: var(--ink-400);
  font-weight: 500;
}
.fab {
  position: fixed;
  right: 28px;
  bottom: 86px;
  border: none;
  cursor: pointer;
  display: grid;
  place-items: center;
  z-index: 85;
}
.fab-label {
  position: fixed;
  right: 28px;
  bottom: 54px;
  z-index: 85;
}

/* Style for the .btn-fit class */
.btn-fit {
  background: var(--accent, var(--terra-500, #ca6b4f));
  color: #fff;
  border: 0;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
.btn-fit:disabled {
  opacity: 0.6;
}

/* --- Style for pending modal --- */
.list-group-item {
  background: transparent;
  padding-left: 0;
  padding-right: 0;
}

/* === Modal Styling === */
:deep(.modal .modal-content) {
  background: var(--surface);
  color: var(--charcoal);
  border: 1px solid var(--line-200);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
}
:deep(.modal .form-label),
:deep(.modal label) {
  color: var(--charcoal);
  font-weight: 700;
}
:deep(.modal .text-muted),
:deep(.modal .form-text) {
  color: var(--ink-400) !important;
}
:deep(.modal .form-control),
:deep(.modal .form-select) {
  background: #fff;
  color: #111827;
  border: 1.5px solid var(--line-200);
  border-radius: 12px;
}
:deep(.modal .form-check-label) {
  color: var(--charcoal);
  font-weight: 600;
}
:deep(.modal .form-check-input) {
  border: 1.5px solid var(--line-200);
  background-color: #fff;
  cursor: pointer;
}
:deep(.modal .form-check-input:checked) {
  background-color: var(--sage-600);
  border-color: var(--sage-600);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--sage-600) 35%, transparent);
}
:deep(.modal .dropzone),
:deep(.modal .uploader) {
  background: color-mix(in oklab, var(--cream-100) 70%, white);
  border: 1.5px dashed var(--line-200);
  color: var(--ink-400);
}
:deep(.modal .btn-primary),
:deep(.modal .btn-fit) {
  background: var(--sage-600);
  border: none;
  color: #fff;
  font-weight: 800;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
</style>