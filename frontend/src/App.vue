<!-- src/App.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import api from '@/lib/api' // Axios API client

const searchTerm = ref('')
const user = ref(null)
const pendingRequestsCount = ref(0)
const router = useRouter()
const route = useRoute()
const loading = ref(true)

/** ✅ Hide navbar on routes with meta.hideNavbar (e.g. /login, /signup) */
const hideNavbar = computed(() => !!route.meta?.hideNavbar)

onMounted(async () => {
  try {
    const { data } = await api.get('/me')
    // normalize server response
    user.value = data?.user ?? data?.data ?? data ?? null
    // If you want to force auth flow, uncomment:
    // if (!user.value) router.replace({ name: 'login' })
  } catch (err) {
    if (err?.response?.status === 401 || err?.response?.status === 404) {
      user.value = null
      // router.replace({ name: 'login' })
    } else {
      console.error('Failed to fetch current user:', err)
    }
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div style="background: #f0f2f5; min-height: 100vh">
    <div v-if="loading" style="padding: 16px; color: #6b7280">Loading…</div>

    <div v-else>
      <!-- ✅ Navbar hidden when route.meta.hideNavbar = true -->
      <NavBar
        v-if="!hideNavbar"
        v-model:searchTerm="searchTerm"
        :user="user"
        :pendingRequestsCount="pendingRequestsCount"
      />

      <!-- Page content -->
      <RouterView />
    </div>
  </div>
</template>

<style>
html, body, #app { height: 100%; margin: 0; }
</style>
