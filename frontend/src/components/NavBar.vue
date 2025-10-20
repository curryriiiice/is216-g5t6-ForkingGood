<template> 
  <nav class="navbar">
    <!-- Search -->
    <div class="search-wrap" ref="dropdownRef">
      <img src="/images/Search.png" alt="Search" width="18" height="18" class="search-icon" />
      <input
        type="text"
        class="search-input"
        placeholder="Search for restaurants or cuisine..."
        :value="term"
        @input="onSearchInput"
        @focus="searchResults.length && (showDropdown = true)"
      />

      <!-- Reverse Image Search button (right of the search bar) -->
      <button
        type="button"
        class="rev-btn"
        @click="showReversePopup = true"
        aria-label="Reverse image search"
      >
        Image Search
      </button>

      <!-- Dropdown -->
      <div v-if="showDropdown" class="dropdown">
        <div v-if="searchLoading" class="dd-empty">Searching...</div>
        <div v-else-if="!searchResults.length" class="dd-empty">No results found</div>
        <div v-else class="dd-list">
          <RouterLink
            v-for="r in searchResults"
            :key="r.id"
            :to="{ path: '/map', query: { restaurant: r.id } }"
            class="dd-item"
            @click="showDropdown = false"
          >
            <div class="dd-item-main">
              <h3 class="dd-title">{{ r.name }}</h3>
              <p class="dd-sub">{{ r.cuisine_type }} - {{ r.address }}</p>
              <div class="dd-rating">
                <span>⭐</span>
                <span class="dd-rating-num">{{ r.avgRating }}</span>
                <span class="dd-reviews">({{ r.reviewCount }} reviews)</span>
              </div>
            </div>
            <img
              v-if="r.photo"
              :src="r.photo"
              alt="Preview"
              width="60"
              height="60"
              class="dd-thumb"
            />
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- Center links -->
    <div class="links">
      <RouterLink to="/dashboard" class="link">Home</RouterLink>
      <RouterLink to="/map" class="link">Map</RouterLink>
      <RouterLink to="/friends" class="link badge-wrap">
        Friends
        <span v-if="pendingRequestsCount > 0" class="badge">
          {{ pendingRequestsCount > 99 ? '99+' : pendingRequestsCount }}
        </span>
      </RouterLink>
      <RouterLink to="/setting" class="link">Setting</RouterLink>
    </div>

    <!-- Right side -->
    <div class="right">
      <img src="/images/Bell.png" alt="Notifications" width="28" height="28" class="bell" />
      <RouterLink to="/profile" class="avatar-wrap">
        <div v-if="localUser?.avatar_url" class="avatar-img">
          <img :src="localUser.avatar_url" alt="avatar" />
        </div>
        <div v-else class="avatar-fallback">{{ initials }}</div>
      </RouterLink>

      <template v-if="localUser">
        <span class="welcome">Welcome, {{ localUser.username || localUser.first_name }}!</span>
        <button class="logout" :disabled="loading" @click="handleLogout">
          {{ loading ? 'Logging out...' : 'Log out' }}
        </button>
      </template>
    </div>
  </nav>

  <!-- Reverse Image Search Modal -->
  <Modal :show="showReversePopup" title="Reverse Image Search" @close="closeReversePopup">
    <div class="p-3">
      <p class="mb-2 rev-title">Upload a single image</p>

      <!-- hidden native input, triggered by the button below -->
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        capture="environment"
        class="sr-only"
        style="display:none"
        @change="handleSingleFile"
      />

      <!-- file picker / file chip -->
      <div class="file-row">
        <button type="button" class="pick-btn" @click="triggerPick">Choose File</button>

        <div v-if="selectedFile" class="file-chip">
          <span class="file-name" :title="selectedFile.name">{{ selectedFile.name }}</span>
          <button type="button" class="remove-file" @click="removeFile" aria-label="Remove file">×</button>
        </div>

        <div v-else class="no-file">No file chosen</div>
      </div>

      <!-- preview (only one) -->
      <div v-if="previewUrl" class="rev-preview">
        <img :src="previewUrl" alt="Preview" />
      </div>

      <!-- errors -->
      <p v-if="fileError" class="rev-error">{{ fileError }}</p>

      <div class="rev-actions">
        <!-- No Cancel button; users can close with the X in the modal header -->
        <button
          type="button"
          class="rev-submit"
          :disabled="!selectedFile || submitting"
          @click="submitReverseSearch"
        >
          {{ submitting ? 'Submitting…' : 'Submit Image Search' }}
        </button>
      </div>
    </div>
  </Modal>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import axios from 'axios'
import Modal from '@/components/Modal.vue'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

/* ------------------------- Props & Emits ------------------------- */
const props = defineProps({
  searchTerm: { type: String, default: '' },
  user: { type: Object, default: null },
  pendingRequestsCount: { type: Number, default: 0 },
})
const emit = defineEmits(['update:searchTerm'])

/* ------------------------- State ------------------------- */
const router = useRouter()
const loading = ref(false)
const term = ref(props.searchTerm)
const searchResults = ref([])
const searchLoading = ref(false)
const showDropdown = ref(false)
const dropdownRef = ref(null)
const localUser = ref(props.user)

/* === Reverse Image Search (single file) === */
const showReversePopup = ref(false)
const fileInputRef = ref(null)
const selectedFile = ref(null) // File | null
const previewUrl = ref('')
const fileError = ref('')
const submitting = ref(false)

/* -------------------- Reverse helpers -------------------- */
const MAX_BYTES = 6 * 1024 * 1024 // 6MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']

function triggerPick() {
  fileInputRef.value?.click()
}

function handleSingleFile(e) {
  fileError.value = ''
  const f = e.target?.files?.[0]
  if (!f) {
    selectedFile.value = null
    previewUrl.value = ''
    return
  }
  // validate type/size
  if (!ALLOWED_TYPES.includes(f.type) && !f.type.startsWith('image/')) {
    fileError.value = 'Please select an image file.'
    e.target.value = ''
    return
  }
  if (f.size > MAX_BYTES) {
    fileError.value = 'Image is too large (max 6MB).'
    e.target.value = ''
    return
  }
  selectedFile.value = f
  // show preview
  try {
    previewUrl.value = URL.createObjectURL(f)
  } catch {
    previewUrl.value = ''
  }
}

function removeFile() {
  selectedFile.value = null
  fileError.value = ''
  if (fileInputRef.value) fileInputRef.value.value = ''
  if (previewUrl.value) {
    try { URL.revokeObjectURL(previewUrl.value) } catch {}
    previewUrl.value = ''
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function submitReverseSearch() {
  if (!selectedFile.value || submitting.value) return
  submitting.value = true
  fileError.value = ''

  // Prefer backend; fall back to sessionStorage route if it fails
  try {
    const form = new FormData()
    form.append('image', selectedFile.value)
    const { data } = await http.post('/reverse-image', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })

    const restaurantId = data?.restaurantId
    const keyword = data?.keyword

    // close + reset
    showReversePopup.value = false
    removeFile()

    if (restaurantId) {
      router.push({ path: '/map', query: { restaurant: restaurantId } })
    } else if (keyword) {
      router.push({ path: '/search', query: { q: keyword } })
    } else {
      // fallback if backend returns nothing useful
      alert('No match found from the image. Try another photo.')
    }
    return
  } catch (err) {
    console.warn('Backend reverse-image failed, falling back to local route:', err?.message || err)
  }

  // Fallback: your original sessionStorage flow
  try {
    const image = await fileToDataUrl(selectedFile.value)
    sessionStorage.setItem('reverseImagePayload', JSON.stringify({ images: [image] }))
    showReversePopup.value = false
    removeFile()
    router.push('/reverseimage')
  } finally {
    submitting.value = false
  }
}

function closeReversePopup() {
  showReversePopup.value = false
  removeFile()
}

/* ------------------------- Keep in sync with prop ------------------------- */
watch(
  () => props.user,
  (u) => { if (u) localUser.value = u },
  { immediate: true },
)

/* ------------------------- Computed ------------------------- */
const initials = computed(() => {
  const u = localUser.value
  if (!u) return 'U'
  if (u.first_name && u.last_name) return (u.first_name[0] + u.last_name[0]).toUpperCase()
  if (u.username) return u.username.slice(0, 2).toUpperCase()
  if (u.email) return u.email.slice(0, 2).toUpperCase()
  return 'U'
})

/* ------------------------- Search Logic ------------------------- */
let debounceId = null
function debounce(fn, delay = 500) {
  return (...args) => {
    clearTimeout(debounceId)
    debounceId = setTimeout(() => fn(...args), delay)
  }
}
const performSearch = debounce(async (value) => {
  if (!value || value.length < 2) {
    searchResults.value = []
    showDropdown.value = false
    return
  }
  searchLoading.value = true
  showDropdown.value = true
  try {
    const { data } = await http.get('/search', { params: { q: value } })
    searchResults.value = data?.results || []
  } catch (e) {
    console.error('Search error:', e)
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}, 500)

function onSearchInput(e) {
  term.value = e.target.value
  emit('update:searchTerm', term.value)
  performSearch(term.value)
}

/* ------------------------- Events ------------------------- */
function handleOutsideClick(ev) {
  if (!dropdownRef.value) return
  if (!dropdownRef.value.contains(ev.target)) showDropdown.value = false
}

async function handleLogout() {
  loading.value = true
  try {
    await http.post('/auth/logout')
    localUser.value = null
    router.push('/login')
  } catch (e) {
    console.error('Logout error:', e)
    alert('Error logging out. Please try again.')
  } finally {
    loading.value = false
  }
}

/* ------------------------- Lifecycle ------------------------- */
onMounted(async () => {
  document.addEventListener('mousedown', handleOutsideClick)
  if (!localUser.value) {
    try {
      const { data } = await http.get('/me')
      localUser.value = data?.user || data || null
    } catch (e) {
      console.error('Failed to load navbar user:', e)
    }
  }
})
onBeforeUnmount(() => {
  clearTimeout(debounceId)
  document.removeEventListener('mousedown', handleOutsideClick)
})
</script>

<style scoped>
.navbar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 2.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* Search */
.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  background: #e9ebee;
  border-radius: 999px;
  padding: 0.5rem 0.9rem;
  width: min(680px, 100%);
}
.search-icon { margin-right: 0.5rem; }
.search-input {
  background: transparent;
  outline: none;
  color: #374151;
  width: 100%;
}

/* Reverse button (kept minimal to match your theme) */
.rev-btn {
  margin-left: 0.5rem;
  white-space: nowrap;
  background: var(--terra-500, #d4816f);
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 0.45rem 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter .15s ease, transform .05s ease;
}
.rev-btn:hover { filter: brightness(1.03); }
.rev-btn:active { transform: translateY(1px); }

/* Dropdown */
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  max-height: 24rem;
  overflow: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  margin-top: 0.5rem;
  z-index: 50;
  padding: 1rem;
}
.dd-empty { color: #6b7280; text-align: center; padding: 1rem 0; }
.dd-list { display: flex; flex-direction: column; gap: 0.75rem; }
.dd-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.75rem; padding: 1rem; border-bottom: 1px solid #f1f5f9;
  text-decoration: none; color: inherit; border-radius: 0.5rem;
}
.dd-item:hover { background: #f9fafb; }
.dd-item-main { flex: 1; }
.dd-title { margin: 0; font-weight: 700; color: #1f2937; }
.dd-sub { margin: 0.15rem 0 0 0; color: #6b7280; font-size: 0.9rem; }
.dd-rating { display: flex; align-items: center; gap: 0.25rem; margin-top: 0.25rem; }
.dd-rating-num { font-weight: 600; color: #111827; }
.dd-reviews { color: #6b7280; }
.dd-thumb { border-radius: 0.5rem; object-fit: cover; }

/* Links */
.links { display: none; gap: 2rem; flex: 1; justify-content: center; }
@media (min-width: 768px) { .links { display: flex; } }
.link { color: #374151; font-weight: 700; font-size: 1.1rem; text-decoration: none; }
.link:hover { color: #eebbc3; }
.badge-wrap { position: relative; }
.badge {
  position: absolute; top: -8px; right: -16px; background: #ef4444; color: #fff;
  font-size: 0.75rem; font-weight: 700; border-radius: 999px; padding: 0.1rem 0.4rem;
  min-width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
  border: 2px solid #fff;
}

/* Right side */
.right { display: flex; align-items: center; gap: 0.75rem; }
.bell { border-radius: 999px; cursor: pointer; }
.avatar-wrap { display: flex; align-items: center; }
.avatar-img { width: 36px; height: 36px; border-radius: 999px; overflow: hidden; }
.avatar-img img { width: 100%; height: 100%; object-fit: cover; }
.avatar-fallback {
  width: 36px; height: 36px; border-radius: 999px; background: #e5e7eb;
  display: grid; place-items: center; font-weight: 700; color: #111827;
}
.welcome { display: none; color: #374151; }
@media (min-width: 640px) { .welcome { display: inline; } }
.logout {
  padding: 0.5rem 0.9rem; font-size: 0.875rem; font-weight: 600; color: #fff;
  background: #ff595e; border: none; border-radius: 0.5rem; cursor: pointer;
}
.logout:hover { background: #ff474d; }

/* Modal / reverse UI */
.rev-title { font-weight: 600; color: var(--charcoal, #2c3333); }
.file-row { display: flex; align-items: center; gap: .75rem; margin-bottom: 1rem; }
.pick-btn {
  background: #fff; border: 1.5px solid #e5e7eb; color: #374151;
  border-radius: 10px; padding: .45rem .8rem; font-weight: 700; cursor: pointer;
}
.file-chip {
  display: inline-flex; align-items: center; gap: .5rem;
  background: #f3f4f6; border-radius: 999px; padding: .35rem .6rem;
  max-width: 420px;
}
.file-name { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.remove-file {
  background: transparent; border: none; color: #6b7280; font-size: 1rem; cursor: pointer;
}
.no-file { color: #6b7280; }

/* Preview */
.rev-preview { margin-bottom: 12px; }
.rev-preview img {
  width: 100%; max-height: 240px; object-fit: cover;
  border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.1);
}

/* Error text */
.rev-error { color: #ef4444; font-weight: 600; margin: 6px 0 0; }

/* Actions */
.rev-actions { display: flex; justify-content: flex-end; }
.rev-submit {
  background: var(--terra-500, #d4816f); color: #fff; border: none; border-radius: 10px;
  padding: .55rem .95rem; font-weight: 800; cursor: pointer;
}
.rev-submit[disabled] { opacity: .6; cursor: not-allowed; }
</style>
