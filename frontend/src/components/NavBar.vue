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
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import api from '@/lib/api'

/* ------------------------- Props & Emits ------------------------- */
const props = defineProps({
  searchTerm: { type: String, default: '' },
  user: { type: Object, default: null }, // optional; if parent passes, we'll use it
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

/* ------------------------- Keep in sync with prop ------------------------- */
watch(
  () => props.user,
  (u) => {
    if (u) localUser.value = u
  },
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
    const { data } = await api.get('/search', { params: { q: value } })
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
    await api.post('/auth/logout')
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

  // If parent didn't pass a user, load from backend
  if (!localUser.value) {
    try {
      const { data } = await api.get('/me')
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
.search-icon {
  margin-right: 0.5rem;
}
.search-input {
  background: transparent;
  outline: none;
  color: #374151;
  width: 100%;
}

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
.dd-empty {
  color: #6b7280;
  text-align: center;
  padding: 1rem 0;
}
.dd-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.dd-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem;
  border-bottom: 1px solid #f1f5f9;
  text-decoration: none;
  color: inherit;
  border-radius: 0.5rem;
}
.dd-item:hover {
  background: #f9fafb;
}
.dd-item-main {
  flex: 1;
}
.dd-title {
  margin: 0;
  font-weight: 700;
  color: #1f2937;
}
.dd-sub {
  margin: 0.15rem 0 0 0;
  color: #6b7280;
  font-size: 0.9rem;
}
.dd-rating {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.25rem;
}
.dd-rating-num {
  font-weight: 600;
  color: #111827;
}
.dd-reviews {
  color: #6b7280;
}
.dd-thumb {
  border-radius: 0.5rem;
  object-fit: cover;
}

/* Links */
.links {
  display: none;
  gap: 2rem;
  flex: 1;
  justify-content: center;
}
@media (min-width: 768px) {
  .links {
    display: flex;
  }
}
.link {
  color: #374151;
  font-weight: 700;
  font-size: 1.1rem;
  text-decoration: none;
}
.link:hover {
  color: #eebbc3;
}
.badge-wrap {
  position: relative;
}
.badge {
  position: absolute;
  top: -8px;
  right: -16px;
  background: #ef4444;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 999px;
  padding: 0.1rem 0.4rem;
  min-width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
}

/* Right side */
.right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.bell {
  border-radius: 999px;
  cursor: pointer;
}
.avatar-wrap {
  display: flex;
  align-items: center;
}
.avatar-img {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  overflow: hidden;
}
.avatar-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-fallback {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: #e5e7eb;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #111827;
}
.welcome {
  display: none;
  color: #374151;
}
@media (min-width: 640px) {
  .welcome {
    display: inline;
  }
}
.logout {
  padding: 0.5rem 0.9rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  background: #ff595e;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
}
.logout:hover {
  background: #ff474d;
}
</style>
