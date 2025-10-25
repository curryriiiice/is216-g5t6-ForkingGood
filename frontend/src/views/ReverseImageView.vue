<!-- src/views/ReverseImageView.vue -->
<template>
  <div class="wrap">
    <div class="header">
      <div class="left">
        <div class="thumb" v-if="previewImage">
          <img :src="previewImage" alt="Uploaded preview" />
        </div>
        <div>
          <h1 class="title">Reverse Image Results</h1>
          <p class="subtitle" v-if="loading">Analyzing your image…</p>
          <p class="subtitle" v-else-if="items.length">
            We found <strong>{{ items.length }}</strong> match{{ items.length === 1 ? '' : 'es' }} for your image.
          </p>
          <p class="subtitle" v-else-if="noFoodMessage">{{ noFoodMessage }}</p>
          <p class="subtitle" v-else-if="error">{{ error }}</p>
          <p class="subtitle" v-else>No results yet. Try another image from the navbar.</p>
        </div>
      </div>

      <div class="actions">
        <RouterLink to="/dashboard" class="btn ghost">Back to Home</RouterLink>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading">
      <div class="spinner" />
      <div class="loading-text">Calling Vision AI and Places…</div>
    </div>

    <!-- Results -->
    <div v-else-if="items.length" class="grid">
      <div v-for="r in items" :key="r.placeID || r.name" class="card">
        <div class="photo">
          <img
            :src="(r.pictures && r.pictures[0]) || fallbackPhoto"
            :alt="r.name"
            @error="onImgError"
          />
        </div>

        <div class="body">
          <h3 class="name">{{ r.name }}</h3>
          <p class="meta">
            <span v-if="r.cuisine_type">{{ r.cuisine_type }}</span>
            <span v-if="r.cuisine_type && r.area" class="dot">•</span>
            <span v-if="r.area">{{ r.area }}</span>
          </p>
          <p class="addr" v-if="r.address">{{ r.address }}</p>

          <div class="row">
            <span class="price" v-if="r.price_level !== undefined && r.price_level !== null">
              <span v-for="i in clampPrice(r.price_level)" :key="i">$</span>
            </span>
            <!-- coords intentionally hidden -->
          </div>
        </div>

        <!-- ✅ Keep only external Google Maps button -->
        <div class="footer">
          <a
            v-if="gmapsLink(r)"
            class="btn small ghost"
            :href="gmapsLink(r)"
            target="_blank"
            rel="noopener"
          >
            Open in Google Maps
          </a>
        </div>
      </div>
    </div>

    <!-- Empty / Error -->
    <div v-else class="empty">
      <p class="hint" v-if="noFoodMessage">{{ noFoodMessage }}</p>
      <p class="hint" v-else-if="error">{{ error }}</p>
      <p class="hint" v-else>We couldn't display results for this image.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const previewImage = ref('')
const items = ref([])
const noFoodMessage = ref('')
const error = ref('')
const loading = ref(false)
const fallbackPhoto = '/images/placeholder-restaurant.jpg'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  withCredentials: false,
})

onMounted(async () => {
  const raw = sessionStorage.getItem('reverseImagePayload')
  if (!raw) {
    error.value = 'No image payload found. Please upload an image from the Image Search button in the navbar.'
    return
  }

  try {
    const payload = JSON.parse(raw)
    const imgs = Array.isArray(payload?.images) ? payload.images : []
    previewImage.value = imgs[0] || ''

    if (payload?.results && typeof payload.results === 'object') {
      const apiRes = payload.results
      if (Array.isArray(apiRes.data)) items.value = apiRes.data.slice(0, 10)
      else if (typeof apiRes.data === 'string') noFoodMessage.value = apiRes.data
      return
    }

    if (previewImage.value) {
      loading.value = true
      const blob = await dataURLToBlob(previewImage.value)
      const form = new FormData()
      form.append('photo', new File([blob], 'reverse.png', { type: blob.type || 'image/png' }))

      const { data } = await api.post('/search/reverseSearch', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      sessionStorage.setItem('reverseImagePayload', JSON.stringify({
        images: [previewImage.value],
        results: data
      }))

      if (Array.isArray(data?.data)) items.value = data.data.slice(0, 10)
      else if (typeof data?.data === 'string') noFoodMessage.value = data.data
      else error.value = 'Unexpected server response.'
    } else {
      error.value = 'No image to analyze. Please try again.'
    }
  } catch (e) {
    const msg = (e?.response?.status === 404)
      ? 'Endpoint /search/reverseSearch not found on the server.'
      : 'Failed to analyze image. Please try again.'
    error.value = msg
    console.warn('Reverse image flow failed:', e)
  } finally {
    loading.value = false
  }
})

function clampPrice(n) {
  const val = Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : 0
  return val || 0
}
function onImgError(e) { if (fallbackPhoto) e.target.src = fallbackPhoto }

/**
 * Build a Google Maps URL preferring placeID, then lat/lng, then address.
 * Returns empty string if nothing usable is available (button will be hidden).
 */
function gmapsLink(r) {
  if (r?.placeID) {
    // Use query_place_id if we also have a name, otherwise just open by place ID
    const name = r?.name ? encodeURIComponent(r.name) : ''
    const base = 'https://www.google.com/maps/search/?api=1'
    return name
      ? `${base}&query=${name}&query_place_id=${encodeURIComponent(r.placeID)}`
      : `${base}&query_place_id=${encodeURIComponent(r.placeID)}`
  }
  if (Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude)) {
    return `https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}`
  }
  if (r?.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`
  }
  return ''
}

async function dataURLToBlob(dataUrl) {
  const res = await fetch(dataUrl)
  return await res.blob()
}
</script>

<style scoped>
.wrap { padding: 20px 24px 32px; max-width: 1200px; margin: 0 auto; }
.header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.left { display: flex; align-items: center; gap: 12px; }
.thumb { width: 64px; height: 64px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,.08); flex: 0 0 auto; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.title { margin: 0; color: #111827; font-size: 1.4rem; font-weight: 800; }
.subtitle { margin: 2px 0 0; color: #6b7280; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* Loading */
.loading { display: grid; place-items: center; gap: 10px; color: #6b7280; margin: 24px 0; }
.spinner { width: 28px; height: 28px; border-radius: 999px; border: 3px solid #e5e7eb; border-top-color: #d4816f; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg) } }
.loading-text { font-weight: 700; }

/* Results grid */
.grid { margin-top: 8px; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.card { background: #fff; border-radius: 14px; box-shadow: 0 10px 24px rgba(0,0,0,.06); overflow: hidden; display: flex; flex-direction: column; }
.photo { width: 100%; height: 160px; background: #f3f4f6; overflow: hidden; }
.photo img { width: 100%; height: 100%; object-fit: cover; }
.body { padding: 12px 12px 8px; }
.name { margin: 0; color: #1f2937; font-weight: 800; font-size: 1.05rem; }
.meta { margin: 4px 0 2px; color: #6b7280; font-weight: 600; }
.meta .dot { margin: 0 6px; }
.addr { margin: 2px 0 0; color: #4b5563; font-size: 0.925rem; }

.row { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; color: #6b7280; font-weight: 700; }
.price { letter-spacing: 1px; }

.footer { display: flex; gap: 8px; padding: 10px 12px 12px; }

.empty { margin: 24px 0; text-align: center; color: #6b7280; }
.hint { margin-bottom: 10px; }

/* Buttons */
.btn { border: none; background: var(--terra-500, #d4816f); color: #fff; font-weight: 800; border-radius: 10px; padding: 0.55rem 0.85rem; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; transition: filter .15s ease, transform .05s ease; }
.btn:hover { filter: brightness(1.03); }
.btn:active { transform: translateY(1px); }
.btn.small { padding: 0.45rem 0.7rem; font-size: 0.9rem; }
.btn.ghost { background: #fff; color: #374151; border: 1.5px solid #e5e7eb; }
</style>
