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
const loading = ref(true)
const error = ref('') // Page-level error
const friends = ref([])
const query = ref('')

// State for Modals
const showAddModal = ref(false)
const showAdd = ref(false)
const adding = ref(false)
const addEmail = ref('')
const addFriendError = ref('') // Error for the Add Friend modal

// --- State for Pending Requests Modal ---
const showPendingModal = ref(false)
const pendingRequests = ref([])
const pendingLoading = ref(false)
const pendingError = ref('')

// Derived
const filteredFriends = computed(() => {
  const q = String(query.value || '').trim().toLowerCase()
  if (!q) return friends.value
  return friends.value.filter((f) => {
    return (
      String(f.name || f.username || f.email).toLowerCase().includes(q) ||
      String(f.email || '').toLowerCase().includes(q)
    )
  })
})

async function loadFriends() {
  loading.value = true
  error.value = ''
  try {
    const r = await api.post('/friends/getFriends', { user_email: ACTIVE_EMAIL })
    const emailList = Array.isArray(r.data?.data) ? r.data.data : []
    friends.value = emailList.map((email) => {
      const emailString = String(email || '')
      const inferredName = emailString.split('@')[0] || 'friend'
      return {
        id: emailString,
        email: emailString,
        username: inferredName,
        name: inferredName,
        avatar: '/images/avatar1.png',
        mutual_count: 0,
      }
    })
  } catch (e) {
    console.error('[friends] load failed', e)
    error.value = e.response?.data?.message || e.message || 'Failed to load friends.'
  } finally {
    loading.value = false
  }
}

// --- UPDATED addFriend function with frontend checks ---
async function addFriend() {
  adding.value = true
  addFriendError.value = ''
  const email = String(addEmail.value || '').trim().toLowerCase()

  try {
    // 1. Check for empty email
    if (!email) {
      addFriendError.value = 'Please enter an email.'
      adding.value = false
      return
    }

    // 2. Check if user is adding themselves
    if (email === ACTIVE_EMAIL.toLowerCase()) {
      addFriendError.value = 'You cannot add yourself as a friend.'
      adding.value = false
      return
    }

    // 3. Check local friends list first
    if (friends.value.some((f) => f.email.toLowerCase() === email)) {
      addFriendError.value = 'You are already friends with this user.'
      adding.value = false
      return
    }

    // 4. Check database using isFriends endpoint
    const { data: isFriendsData } = await api.post('/friends/isFriends', {
      user_email: ACTIVE_EMAIL,
      friend_email: email,
    })

    if (isFriendsData.data === true) {
      addFriendError.value = 'You are already friends with this user.'
      adding.value = false
      // Sync local list if it was out of date
      if (!friends.value.some((f) => f.email.toLowerCase() === email)) {
        await loadFriends()
      }
      return
    }

    // 5. If all checks pass, send the request
    await api.post('/friends/sendFriendReq', {
      user_email: ACTIVE_EMAIL,
      friend_email: email,
    })

    addEmail.value = ''
    showAddModal.value = false
    alert('Friend request sent!')
  } catch (e) {
    console.error('[friends] add failed', e)
    // Check for the 500 error, which now implies a duplicate PENDING request
    if (e.response && e.response.status === 500) {
      addFriendError.value = 'A friend request is already pending.'
    } else {
      const msg = e.response?.data?.message || e.response?.data?.error || e.message
      addFriendError.value = msg || 'Failed to send request.'
    }
  } finally {
    adding.value = false
  }
}

// --- removeFriend function (using DELETE) ---
async function removeFriend(f) {
  const yes = confirm(`Remove ${f.name || f.email} from your friends?`)
  if (!yes) return
  const before = friends.value.slice()
  friends.value = friends.value.filter((x) => x.id !== f.id)
  error.value = ''
  try {
    // Using api.delete to match your router
    await api.delete('/friends/removeFriend', {
      data: {
        user_email: ACTIVE_EMAIL,
        friend_email: f.email,
      },
    })
  } catch (e) {
    console.error('[friends] remove failed', e)
    friends.value = before // rollback
    error.value = e.response?.data?.message || 'Failed to remove friend.'
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
    // Don't show a page-level error, just log it
  } finally {
    pendingLoading.value = false
  }
}

async function openPendingModal() {
  showPendingModal.value = true
  await loadPendingRequests()
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
    await loadFriends()
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
  } catch (e) {
    console.error('[friends] rejectFriendReq failed', e)
    pendingError.value = 'Failed to reject request.'
  }
}

function viewProfile(f) {
  if (f?.id) {
    router.push({ path: `/profile/${encodeURIComponent(f.id)}` }).catch(() => {})
  } else {
    router.push({ path: '/profile', query: { email: f.email } }).catch(() => {})
  }
}

function handleAdded() {
  showAdd.value = false
}

function closeAddModal() {
  showAddModal.value = false
  addFriendError.value = ''
  addEmail.value = ''
}

onMounted(async () => {
  // Theme logic removed from here
  await loadFriends()
  await loadPendingRequests() // Load pending requests on page load for the badge
  await nextTick()
})
</script>

<template>
  <div class="page sage-bg">
    <section class="container py-3">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h2 class="section-title">Friends</h2>
        <div class="d-flex gap-2 align-items-center">
          <input
            v-model="query"
            class="form-control form-control-sm"
            placeholder="Search friends"
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
          <button class="btn btn-sm btn-fit" @click="showAddModal = true">Add</button>
        </div>
      </div>

      <div v-if="loading" class="text-center text-muted py-5">Loading friends…</div>
      <div v-else-if="error" class="alert alert-danger py-2">{{ error }}</div>

      <div v-else>
        <div
          v-if="!filteredFriends.length"
          class="empty text-muted p-4 rounded-3 bg-white shadow-sm"
        >
          <span v-if="!friends.length">No friends yet. Add one!</span>
          <span v-else>No friends found matching your search.</span>
        </div>

        <div class="row g-3" v-else>
          <div
            v-for="f in filteredFriends"
            :key="f.id || f.email"
            class="col-12 col-md-6 col-lg-4"
          >
            <div class="card h-100 shadow-sm border-0">
              <div class="card-body d-flex gap-3 align-items-center">
                <img
                  :src="f.avatar"
                  alt=""
                  class="rounded-circle"
                  style="width: 56px; height: 56px; object-fit: cover"
                />
                <div class="flex-grow-1">
                  <div class="fw-bold">{{ f.name }}</div>
                  <div class="text-muted small">{{ f.email }}</div>
                  <div class="text-muted small mt-1">Mutual friends: {{ f.mutual_count }}</div>
                </div>
                <div class="d-flex flex-column align-items-end gap-2">
                  <button class="btn btn-sm btn-outline-primary" @click="viewProfile(f)">
                    View
                  </button>
                  <button class="btn btn-sm btn-outline-danger" @click="removeFriend(f)">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <button class="fab fab-terracotta" @click="showAdd = true" title="Create Post">＋</button>
    <div class="fab-label sage-chip">Create Post</div>

    <Modal :show="showAddModal" title="Add Friend" @close="closeAddModal">
      <div class="mb-3">
        <label class="form-label">Friend's email or username</label>
        <input
          v-model="addEmail"
          class="form-control"
          placeholder="e.g. friend@example.com"
        />
      </div>
      <div v-if="addFriendError" class="alert alert-danger py-2 small">{{ addFriendError }}</div>
      <div class="d-flex justify-content-end gap-2">
        <button class="btn btn-outline-secondary" @click="closeAddModal">Cancel</button>
        <button class="btn btn-primary" :disabled="adding || !addEmail" @click="addFriend">
          {{ adding ? 'Sending…' : 'Send Request' }}
        </button>
      </div>
    </Modal>

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