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

// ==========================
// THEME
// ==========================
const THEME_KEY = 'fg_theme_v2'
const theme = ref(localStorage.getItem(THEME_KEY) || 'light')

function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme.value)
  localStorage.setItem(THEME_KEY, theme.value)
}
function cycleTheme() {
  const order = ['light', 'brand-mint', 'brand-lagoon', 'brand-plum']
  const idx = order.indexOf(theme.value)
  theme.value = order[(idx + 1) % order.length]
  applyTheme()
}
function setTheme(val) {
  theme.value = val
  applyTheme()
}

// UI state
const loading = ref(true)
const error = ref('')
const friends = ref([]) // array of { email, username, name, avatar, mutual_count, id }
const query = ref('')

// State for Modals
const showAddModal = ref(false) // For "Add Friend" modal
const showAdd = ref(false) // For "Create Post" FAB modal
const adding = ref(false) // For "Add Friend" action
const addEmail = ref('')

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

// ================================================================
// UPDATED loadFriends() FUNCTION
// ================================================================
async function loadFriends() {
  loading.value = true
  error.value = ''
  try {
    // 1. Call the new endpoint with POST and the user_email in the body
    //    (Assuming the path is /friends/getFriends based on your function name)
    const r = await api.post('/friends/getFriends', { user_email: ACTIVE_EMAIL })

    // 2. Get the array of email strings from the 'data' key
    const emailList = Array.isArray(r.data?.data) ? r.data.data : []

    // 3. Map the email strings to the object structure the template needs
    friends.value = emailList.map((email) => {
      const emailString = String(email || '')
      const inferredName = emailString.split('@')[0] || 'friend'

      return {
        id: emailString,
        email: emailString,
        username: inferredName,
        name: inferredName,
        avatar: '/images/avatar1.png', // Use default avatar
        mutual_count: 0, // API no longer provides this
      }
    })
  } catch (e) {
    console.error('[friends] load failed', e)
    error.value = e.response?.data?.message || e.message || 'Failed to load friends.'
  } finally {
    loading.value = false
  }
}

// (This function remains unchanged, assuming /friends/add is still the correct endpoint)
async function addFriend() {
  const email = String(addEmail.value || '').trim()
  if (!email) return
  adding.value = true
  try {
    await api.post('/friends/add', { user_email: ACTIVE_EMAIL, friend_email: email })
    addEmail.value = ''
    showAddModal.value = false
    await loadFriends() // Reload list after adding
  } catch (e) {
    console.error('[friends] add failed', e)
    const msg = e.response?.data?.error || e.response?.data?.message || e.message
    error.value = msg || 'Failed to add friend.'
  } finally {
    adding.value = false
  }
}

// (This function remains unchanged, assuming /friends/remove is still the correct endpoint)
async function removeFriend(f) {
  const yes = confirm(`Remove ${f.name || f.email} from your friends?`)
  if (!yes) return
  const before = friends.value.slice()
  friends.value = friends.value.filter((x) => x.id !== f.id)
  try {
    await api.post('/friends/remove', { user_email: ACTIVE_EMAIL, friend_email: f.email })
  } catch (e) {
    console.error('[friends] remove failed', e)
    friends.value = before // rollback
    error.value = 'Failed to remove friend.'
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

onMounted(async () => {
  applyTheme()
  await loadFriends()
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

    <Modal :show="showAddModal" title="Add Friend" @close="showAddModal = false">
      <div class="mb-3">
        <label class="form-label">Friend's email or username</label>
        <input
          v-model="addEmail"
          class="form-control"
          placeholder="e.g. friend@example.com"
        />
      </div>
      <div class="d-flex justify-content-end gap-2">
        <button class="btn btn-outline-secondary" @click="showAddModal = false">Cancel</button>
        <button class="btn btn-primary" :disabled="adding || !addEmail" @click="addFriend">
          {{ adding ? 'Adding…' : 'Add Friend' }}
        </button>
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

/* Style for the .btn-fit class (from ProfileView) */
.btn-fit {
  background: var(--accent, var(--terra-500, #ca6b4f));
  color: #fff;
  border: 0;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
.btn-fit:disabled {
  opacity: 0.6;
}

/* limit dropdown height (from DashboardView) */
.dropdown-menu {
  max-height: 260px;
  overflow: auto;
}

/* === Modal Styling (Copied from DashboardView for consistency) === */
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
/* Radios / checkboxes */
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
/* Dropzone / photo area */
:deep(.modal .dropzone),
:deep(.modal .uploader) {
  background: color-mix(in oklab, var(--cream-100) 70%, white);
  border: 1.5px dashed var(--line-200);
  color: var(--ink-400);
}
/* Submit button */
:deep(.modal .btn-primary),
:deep(.modal .btn-fit) {
  background: var(--sage-600);
  border: none;
  color: #fff;
  font-weight: 800;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
</style>