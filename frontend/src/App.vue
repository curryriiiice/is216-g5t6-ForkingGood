<script setup>
import { ref, onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import api from '@/lib/api' // ✅ use Axios API client
import { useRouter } from 'vue-router'

const searchTerm = ref('')
const user = ref(null)
// const pendingRequestsCount = ref(3) // demo
const router = useRouter()
const loading = ref(true)

onMounted(async () => {
  try {
    const { data } = await api.get('/me')
    user.value = data?.user || data || null
    // If your backend returns null for unauthenticated, you can optionally redirect:
    if (!user.value) {
      // router.push('/login') // uncomment if you want hard redirect when not logged in
    }
  } catch (err) {
    // If backend sends 401 for unauthenticated users, redirect to login
    if (err?.response?.status === 401) {
      user.value = null
      // router.push('/login') // uncomment if you want hard redirect on 401
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
      <NavBar
        v-model:searchTerm="searchTerm"
        :user="user"
        :pendingRequestsCount="pendingRequestsCount"
      />
      <router-view />
    </div>
  </div>
</template>
