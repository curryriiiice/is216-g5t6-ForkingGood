<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue' // Added watch
import axios from 'axios'
import Modal from '@/components/Modal.vue'
import { useRouter } from 'vue-router'
import { useAuthUser } from '@/lib/useAuthUser' // Ensure this path is correct

// API
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } })

// Auth User
const { user: authUser, refresh: refreshAuthUser } = useAuthUser()
const activeEmail = computed(() => authUser.value?.email ?? null)

const router = useRouter()

// UI state
const query = ref('')
const searchResults = ref([])
const searchLoading = ref(false)
const searchError = ref('')

// Cache for ALL users
const allUsersCache = ref([])

// --- RE-ADDED: State for Pending Requests Modal ---
const showPendingModal = ref(false)
const pendingRequests = ref([]) // This was the missing ref causing the error
const pendingLoading = ref(false)
const pendingError = ref('')

// --- Function to fetch all users ONCE ---
async function fetchAllUsers() {
  // Ensure user email is available before fetching
  if (!activeEmail.value) {
     searchError.value = 'Please log in to search users.'
     searchLoading.value = false; // Stop loading if no user
     allUsersCache.value = []; // Clear cache
     searchResults.value = []; // Clear results
     return;
  }
  searchLoading.value = true
  searchError.value = ''
  console.log('fetchAllUsers: Loading started...') // Keep console log

  try {
    const r = await api.post('/user/getAllUsers', { user_email: activeEmail.value })
    const usersData = Array.isArray(r.data?.data) ? r.data.data : []
    allUsersCache.value = usersData
      .filter((u) => u.email && u.email.toLowerCase() !== activeEmail.value.toLowerCase())
      .map((u) => ({
        email: u.email,
        username: u.username,
        name: u.username || u.email.split('@')[0],
        avatar: u.profile_image_url || '/images/avatar1.png',
        isFriend: u.friendship_status === 'friend',
        isPending: u.friendship_status === 'pending',
      }))
    searchResults.value = [] // Start empty
    console.log('fetchAllUsers: API call successful')
  } catch (e) {
    console.error('[friends] fetchAllUsers failed', e)
    searchError.value = e.response?.data?.message || 'Failed to load user list.'
  } finally {
    searchLoading.value = false
    console.log('fetchAllUsers: Loading finished. searchLoading =', searchLoading.value)
  }
}

// --- Search function filters the cache ---
const onSearchInput = () => {
  // No need for loading indicator here as it's instant filtering
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
}

// --- sendFriendReq ---
async function sendFriendReq(user) {
  if (!activeEmail.value) return; // Guard against action if not logged in
  user.isPending = true
  user.isFriend = false
  try {
    await api.post('/friends/sendFriendReq', {
      user_email: activeEmail.value,
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
  if (!activeEmail.value) return; // Guard
  const yes = confirm(`Remove ${user.name || user.email} from your friends?`)
  if (!yes) return
  user.isFriend = false
  user.isPending = false
  try {
    await api.delete('/friends/removeFriend', {
      data: {
        user_email: activeEmail.value,
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

// --- RE-ADDED: Functions for Pending Requests ---
async function loadPendingRequests() {
  if (!activeEmail.value) { // Guard
     pendingRequests.value = [] // Clear list if not logged in
     return;
  }
  pendingLoading.value = true
  pendingError.value = ''
  pendingRequests.value = [] // Initialize before fetch
  try {
    const r = await api.post('/friends/getPendingFriendReqs', { user_email: activeEmail.value })
    const emailList = Array.isArray(r.data?.data) ? r.data.data : []
    pendingRequests.value = emailList.map((email) => ({
      sender_email: email,
    }))
  } catch (e) {
    console.error('[friends] loadPendingRequests failed', e)
    pendingError.value = 'Failed to load pending requests.' // Show error in modal
  } finally {
    pendingLoading.value = false
  }
}

async function openPendingModal() {
  showPendingModal.value = true
  await loadPendingRequests() // Refresh when opening
}

async function acceptFriendReq(senderEmail) {
  if (!activeEmail.value) return; // Guard
  try {
    await api.post('/friends/acceptFriendReq', {
      user_email: activeEmail.value,
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
    pendingError.value = 'Failed to accept request.' // Show error in modal
  }
}

async function rejectFriendReq(senderEmail) {
  if (!activeEmail.value) return; // Guard
  try {
    await api.post('/friends/rejectFriendReq', {
      user_email: activeEmail.value,
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
    pendingError.value = 'Failed to reject request.' // Show error in modal
  }
}

function viewProfile(f) {
  if (f?.email) {
    router.push({ path: '/profile', query: { email: f.email } }).catch(() => {})
  }
}

onMounted(async () => {
  await refreshAuthUser() // Ensure user is loaded
  // Fetch data in parallel
  await Promise.all([
     fetchAllUsers(),
     loadPendingRequests() // Call the re-added function
  ])
  await nextTick()
})

// Watcher to refetch data if user logs in/out
watch(activeEmail, async (newEmail, oldEmail) => {
  if (newEmail !== oldEmail) {
    // Refetch data in parallel
    await Promise.all([
       fetchAllUsers(),
       loadPendingRequests() // Call the re-added function
    ])
  }
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

      <div v-if="searchLoading && !allUsersCache.length" class="text-center text-muted py-5 mb-3">
        Loading user list...
      </div>
      <div v-else-if="searchError" class="alert alert-danger py-2 mb-3">{{ searchError }}</div>
      <div
        v-else-if="!searchResults.length && query"
        class="empty text-muted p-4 rounded-3 bg-white shadow-sm mb-3"
      >
        No users found matching your search.
      </div>
      <div
        v-else-if="!searchResults.length && !query"
        class="empty text-muted p-4 rounded-3 bg-white shadow-sm mb-3"
      >
        Search for friends or new users by email or username.
      </div>

      <div class="row g-3" v-else>
        <div v-for="user in searchResults" :key="user.email" class="col-12 col-md-6 col-lg-4">
          <div class="card h-100 shadow-sm border-0">
            <div class="card-body d-flex gap-3 align-items-center">
              <img
                :src="user.avatar"
                alt="Avatar"
                class="rounded-circle"
                style="width: 56px; height: 56px; object-fit: cover; border: 1px solid #eee"
              />
              <div class="flex-grow-1" style="min-width: 0"> <div class="fw-bold text-truncate">{{ user.name }}</div>
                <div class="text-muted small text-truncate">{{ user.email }}</div>
              </div>
              <div class="d-flex flex-column align-items-end gap-2 flex-shrink-0"> <template v-if="user.isFriend">
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
            <div class="fw-semibold text-truncate">{{ req.sender_email }}</div> <div class="d-flex gap-2 flex-shrink-0"> <button
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

    </div>
</template>

<style scoped>
/* Copied from previous Bootstrap versions */
.page {
  min-height: calc(100vh - 56px); /* Adjust if you have a navbar */
  padding: 18px 0 80px; /* Bottom padding for potential fixed elements */
}
.section-title {
  font-weight: 800;
  color: var(--charcoal); /* Make sure --charcoal is defined */
  margin: 0;
}
.empty {
  text-align: center;
  color: var(--ink-400); /* Make sure --ink-400 is defined */
  font-weight: 500;
}

/* Style for the .btn-fit class */
.btn-fit {
  background: var(--accent, var(--terra-500, #ca6b4f)); /* Define --accent or --terra-500 */
  color: #fff;
  border: 0;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
.btn-fit:disabled {
  opacity: 0.6;
}

/* --- Style for pending modal list --- */
.list-group-item {
  background: transparent;
  padding-left: 0;
  padding-right: 0;
  border: 0;
}
.list-group-flush > .list-group-item:last-child {
    border-bottom-width: 0;
}
.list-group-flush > .list-group-item {
    border-width: 0 0 1px; /* Add bottom border back */
}


/* === Modal Styling (Copied from DashboardView/MapView for consistency) === */
:deep(.modal .modal-content) {
  background: var(--surface); /* Define --surface */
  color: var(--charcoal);
  border: 1px solid var(--line-200); /* Define --line-200 */
  border-radius: 16px;
  box-shadow: var(--shadow-card); /* Define --shadow-card */
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
  background-color: var(--sage-600); /* Define --sage-600 */
  border-color: var(--sage-600);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--sage-600) 35%, transparent);
}
/* Submit button in modals */
:deep(.modal .btn-primary),
:deep(.modal .btn-fit) {
  background: var(--sage-600);
  border: none;
  color: #fff;
  font-weight: 800;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
</style>