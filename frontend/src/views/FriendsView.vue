<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import axios from 'axios'
import Modal from '@/components/Modal.vue'
import { useRouter } from 'vue-router'

// API
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } })

// TEMP active user until auth is wired
const ACTIVE_EMAIL = import.meta.env.VITE_ACTIVE_EMAIL || 'clarice.lim.2024@computing.smu.edu.sg'

const router = useRouter()

// UI state
const loading = ref(true)
const error = ref('')
const friends = ref([]) // array of { email, username, name, avatar, mutual_count, id }
const query = ref('')
const showAddModal = ref(false)
const adding = ref(false)
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

// API calls
async function loadFriends() {
  loading.value = true
  error.value = ''
  try {
    const r = await api.get('/friends/list', { params: { user_email: ACTIVE_EMAIL } })
    const data = Array.isArray(r.data?.data) ? r.data.data : r.data?.data || []
    // normalize minimal fields
    friends.value = data.map((f) => ({
      id: f.id || f.email || f.username,
      email: f.email || f.poster_email || f.username,
      username: f.username || f.poster_username || f.email,
      name: f.name || f.username || f.email,
      avatar: f.avatar || '/images/avatar1.png',
      mutual_count: f.mutual_count ?? f.mutualFriends ?? 0,
    }))
  } catch (e) {
    console.error('[friends] load failed', e)
    error.value = 'Failed to load friends.'
  } finally {
    loading.value = false
  }
}

async function addFriend() {
  const email = String(addEmail.value || '').trim()
  if (!email) return
  adding.value = true
  try {
    // optimistic: call API then reload
    await api.post('/friends/add', { user_email: ACTIVE_EMAIL, friend_email: email })
    addEmail.value = ''
    showAddModal.value = false
    await loadFriends()
  } catch (e) {
    console.error('[friends] add failed', e)
    error.value = (e.response?.data?.error || e.message) || 'Failed to add friend.'
  } finally {
    adding.value = false
  }
}

async function removeFriend(f) {
  const yes = confirm(`Remove ${f.name || f.email} from your friends?`)
  if (!yes) return
  // optimistic UI remove
  const before = friends.value.slice()
  friends.value = friends.value.filter((x) => x.id !== f.id)
  try {
    await api.post('/friends/remove', { user_email: ACTIVE_EMAIL, friend_email: f.email })
  } catch (e) {
    console.error('[friends] remove failed', e)
    // rollback
    friends.value = before
    error.value = 'Failed to remove friend.'
  }
}

function viewProfile(f) {
  // navigate to a profile route (assumes /profile/:id or /profile?email=)
  if (f?.id) {
    router.push({ path: `/profile/${encodeURIComponent(f.id)}` }).catch(() => {})
  } else {
    router.push({ path: '/profile', query: { email: f.email } }).catch(() => {})
  }
}

onMounted(async () => {
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
            style="min-width:220px"
          />
          <button class="btn btn-sm btn-primary" @click="showAddModal = true">Add</button>
        </div>
      </div>

      <div v-if="loading" class="text-center text-muted py-5">Loading friends…</div>
      <div v-else-if="error" class="text-danger py-2">{{ error }}</div>

      <div v-else>
        <div v-if="!filteredFriends.length" class="empty text-muted p-4 rounded-3 bg-white shadow-sm">
          No friends yet. Add one!
        </div>

        <div class="row g-3" v-else>
          <div
            v-for="f in filteredFriends"
            :key="f.id || f.email"
            class="col-12 col-md-6 col-lg-4"
          >
            <div class="card h-100 shadow-sm border-0">
              <div class="card-body d-flex gap-3 align-items-center">
                <img :src="f.avatar" alt="" class="rounded-circle" style="width:56px;height:56px;object-fit:cover" />
                <div class="flex-grow-1">
                  <div class="fw-bold">{{ f.name }}</div>
                  <div class="text-muted small">{{ f.email }}</div>
                  <div class="text-muted small mt-1">Mutual friends: {{ f.mutual_count }}</div>
                </div>
                <div class="d-flex flex-column align-items-end gap-2">
                  <button class="btn btn-sm btn-outline-primary" @click="viewProfile(f)">View</button>
                  <button class="btn btn-sm btn-outline-danger" @click="removeFriend(f)">Remove</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Floating Create button (convenience) -->
    <button class="fab fab-terracotta" @click="showAdd = true" title="Create Post">＋</button>
    <div class="fab-label sage-chip">Create Post</div>

    <!-- Add Friend Modal -->
    <Modal :show="showAddModal" title="Add Friend" @close="showAddModal = false">
      <div class="mb-3">
        <label class="form-label">Friend's email or username</label>
        <input v-model="addEmail" class="form-control" placeholder="e.g. friend@example.com" />
      </div>
      <div class="d-flex justify-content-end gap-2">
        <button class="btn btn-outline-secondary" @click="showAddModal = false">Cancel</button>
        <button class="btn btn-primary" :disabled="adding || !addEmail" @click="addFriend">
          {{ adding ? 'Adding…' : 'Add Friend' }}
        </button>
      </div>
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
    place-items:
    center; 
    z-index: 85;
}
.fab-label {
    position: 
    fixed; 
    right: 28px; 
    bottom: 54px; 
    z-index: 85; 
}
</style>