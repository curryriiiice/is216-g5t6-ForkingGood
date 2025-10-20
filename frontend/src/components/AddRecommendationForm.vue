<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import api from '@/lib/api'

const emit = defineEmits(['added'])

/** Form state */
const comment = ref('')
const rating = ref(0)
const cuisine = ref('')

/** Place fields (filled by Google Places) */
const placeName = ref('')
const address = ref('')
const lat = ref(null)
const lng = ref(null)
const placeId = ref('')
const photoUrl = ref('')        // dataURL for submit
const photos = ref([])          // array of dataURLs (we keep your original)
const previewUrl = ref('')      // objectURL for fast, reliable preview
const priceRange = ref(null)    // '$' | '$$' | '$$$' | '$$$$'
const visibility = ref('friends')
const isDragging = ref(false)

/** Autocomplete DOM refs */
const nameInputEl = ref(null)
const addressInputEl = ref(null)
const rootEl = ref(null)

/** File input (so drop zone is clickable) */
const fileInputEl = ref(null)

/** Stars */
const stars = [1, 2, 3, 4, 5]
function setRating(n) { rating.value = clampRating(n) }

/** Status */
const submitting = ref(false)
const errorMsg = ref('')

/** Maps JS (Places) */
const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
async function ensureMapsApiLoaded(key) {
  if (window.google?.maps?.importLibrary) return
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly&libraries=places`
    s.async = true
    s.defer = true
    s.onload = resolve
    s.onerror = () => reject(new Error('Failed to load Google Maps JS API'))
    document.head.appendChild(s)
  })
}

async function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}

onMounted(async () => {
  if (!apiKey) {
    console.warn('Missing VITE_GOOGLE_MAPS_API_KEY; Places autocomplete disabled.')
    return
  }
  await ensureMapsApiLoaded(apiKey)
  await nextTick()

  const { places } = google.maps

  let circleBounds = null
  const pos = await getUserLocation()
  if (pos) {
    const circle = new google.maps.Circle({ center: pos, radius: 3000 })
    circleBounds = circle.getBounds()
  }

  const acName = new places.Autocomplete(nameInputEl.value, {
    fields: ['place_id', 'name', 'formatted_address', 'geometry'],
    types: ['establishment'],
  })
  if (circleBounds) acName.setBounds(circleBounds)
  acName.addListener('place_changed', () => {
    const place = acName.getPlace()
    if (!place) return
    placeId.value = place.place_id || ''
    placeName.value = place.name || placeName.value || ''
    address.value = place.formatted_address || address.value || ''
    const location = place.geometry?.location
    lat.value = location?.lat?.() ?? lat.value
    lng.value = location?.lng?.() ?? lng.value
  })

  const acAddr = new places.Autocomplete(addressInputEl.value, {
    fields: ['place_id', 'formatted_address', 'geometry', 'name'],
    types: ['geocode'],
  })
  if (circleBounds) acAddr.setBounds(circleBounds)
  acAddr.addListener('place_changed', () => {
    const place = acAddr.getPlace()
    if (!place) return
    if (!placeName.value && place.name) placeName.value = place.name
    placeId.value = place.place_id || placeId.value || ''
    address.value = place.formatted_address || address.value || ''
    const location = place.geometry?.location
    lat.value = location?.lat?.() ?? lat.value
    lng.value = location?.lng?.() ?? lng.value
  })
})

function clampRating(num) {
  if (Number.isNaN(num)) return 1
  return Math.min(5, Math.max(1, Math.round(num * 2) / 2))
}

/** ---------- File / Preview helpers ---------- */
function openFilePicker() {
  fileInputEl.value?.click()
}

function clearPreview() {
  try { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value) } catch {}
  previewUrl.value = ''
}

function handleChosenFile(file) {
  if (!file) return
  // objectURL for reliable <img> preview (not blocked by CSP)
  clearPreview()
  previewUrl.value = URL.createObjectURL(file)

  // also keep your existing dataURL array for submission
  const reader = new FileReader()
  reader.onload = () => {
    const data = String(reader.result || '')
    photoUrl.value = data
    photos.value = [data] // keep first image only (your code uses first anyway)
  }
  reader.readAsDataURL(file)
}

function onInputChange(e) {
  const f = e.target?.files?.[0]
  handleChosenFile(f)
}

function onDrop(e) {
  isDragging.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  if (!files.length) return
  const img = files.find((f) => f.type.startsWith('image/'))
  if (img) handleChosenFile(img)
}
function onDragOver(e) { e.preventDefault(); isDragging.value = true }
function onDragLeave() { isDragging.value = false }

function removePhoto() {
  clearPreview()
  photos.value = []
  photoUrl.value = ''
  if (fileInputEl.value) fileInputEl.value.value = ''
}

/** ---------- Submit ---------- */
async function submit() {
  try {
    if (!placeName.value.trim()) { alert('Please enter a restaurant name.'); return }
    if (!rating.value || rating.value < 1 || rating.value > 5) {
      alert('Please enter a rating between 1 and 5.'); return
    }

    const restId = placeId?.value || crypto.randomUUID()
    const restaurant = {
      id: restId,
      name: placeName.value.trim(),
      address: address.value.trim(),
      cuisine_type: cuisine.value.trim(),
      latitude: lat.value || null,
      longitude: lng.value || null,
    }

    const payload = {
      restaurant,
      comment: comment.value.trim(),
      rating: Number(rating.value),
      price_range: priceRange.value,
      visibility: visibility.value,
      photos: photoUrl.value ? [photoUrl.value.trim()] : [],
    }

    const { data } = await api.post('/recommendations', payload)
    const restaurantId = data?.restaurantId || restaurant.id
    emit('added', { restaurantId })
    router.push({ path: '/map', query: { restaurant: restaurantId } })
  } catch (err) {
    console.error('Error adding recommendation:', err)
    alert(err.message || 'Failed to add recommendation.')
  }
}

/** Tooltips (unchanged) */
function initTooltipsLocal() {
  try {
    const Tooltip = window.bootstrap?.Tooltip
    if (!Tooltip) return
    const scope = rootEl.value
    if (!scope) return
    const els = scope.querySelectorAll('[data-bs-toggle="tooltip"]')
    els.forEach((el) => {
      if (!el || !el.isConnected) return
      const existing = Tooltip.getInstance?.(el)
      if (existing) existing.dispose()
      new Tooltip(el, {
        container: 'body',
        boundary: 'window',
        placement: 'top',
        trigger: 'hover focus',
        delay: { show: 100, hide: 120 },
      })
    })
  } catch {}
}
function destroyTooltipsLocal() {
  try {
    const Tooltip = window.bootstrap?.Tooltip
    if (!Tooltip) return
    const scope = rootEl.value
    if (!scope) return
    const els = scope.querySelectorAll('[data-bs-toggle="tooltip"]')
    els.forEach((el) => {
      try {
        if (!el || !el.isConnected) return
        const inst = Tooltip.getInstance?.(el)
        if (inst) inst.dispose()
      } catch {}
    })
  } catch {}
}
onMounted(() => nextTick(() => initTooltipsLocal()))
onBeforeUnmount(() => { destroyTooltipsLocal(); clearPreview() })
</script>

<template>
  <form ref="rootEl" class="rec-form" @submit.prevent="submit">
    <!-- Restaurant or Place -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Restaurant or Place</label>
      <input
        ref="nameInputEl"
        v-model="placeName"
        type="text"
        class="form-control"
        placeholder="E.g., Mario's Trattoria"
        aria-autocomplete="list"
        required
      />
    </div>

    <!-- Address -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Address</label>
      <input
        ref="addressInputEl"
        v-model="address"
        type="text"
        class="form-control"
        placeholder="Start typing a location…"
        required
      />
    </div>

    <!-- Cuisine Type -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Cuisine Type</label>
      <input
        v-model="cuisine"
        type="text"
        class="form-control"
        placeholder="E.g., Italian, Thai, Mexican"
        required
      />
    </div>

    <!-- Rating -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Rating</label>
      <div class="stars" role="radiogroup" aria-label="Rating from 1 to 5">
        <button
          v-for="s in stars"
          :key="s"
          type="button"
          class="star-btn"
          :aria-checked="rating >= s ? 'true' : 'false'"
          @click="setRating(s)"
        >
          {{ rating >= s ? '★' : '☆' }}
        </button>
      </div>
    </div>

    <!-- Notes -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Notes or Why You Recommend It</label>
      <textarea
        v-model="comment"
        class="form-control"
        rows="3"
        placeholder="This dish is creamy and authentic..."
        required
      />
    </div>

    <!-- Photos -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Photos</label>

      <!-- Clickable drop area -->
      <div
        class="drop-area"
        :class="{ dragging: isDragging }"
        @click="openFilePicker"
        @dragover.prevent="onDragOver"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
        tabindex="0"
        role="button"
        title="Click to choose an image or drop here"
      >
        <div class="drop-hint text-center">
          Click to select an image or drag &amp; drop here
        </div>
        <input
          ref="fileInputEl"
          type="file"
          accept="image/*"
          class="hidden-file"
          @change="onInputChange"
        />
      </div>

      <!-- Large live preview (always shows the first image) -->
      <div v-if="previewUrl" class="live-preview">
        <img :src="previewUrl" alt="Selected image preview" />
        <button type="button" class="remove-btn" @click="removePhoto">Remove</button>
      </div>

      <!-- Thumbnails (kept for compatibility) -->
      <div class="thumbs" v-if="photos.length">
        <img v-for="(src, i) in photos" :key="i" :src="src" alt="" />
      </div>
    </div>

    <!-- Visibility -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Who can see this?</label>
      <div class="vis-group" role="radiogroup" aria-label="Visibility">
        <input class="vis-input" type="radio" id="vis-friends" value="friends" v-model="visibility" />
        <label class="vis-chip" for="vis-friends">👥 Friends</label>

        <input class="vis-input" type="radio" id="vis-everyone" value="everyone" v-model="visibility" />
        <label class="vis-chip" for="vis-everyone">🌍 Everyone</label>
      </div>
    </div>

    <button class="btn submit-btn w-100" type="submit" :disabled="submitting">
      {{ submitting ? 'Posting…' : 'Submit Recommendation' }}
    </button>
  </form>
</template>

<style scoped>
.rec-form {
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  padding: 18px 20px 22px;
}

/* Labels visible on dark */
.form-label { color: var(--charcoal); margin-bottom: 6px; }
:root[data-theme="dark"] .rec-form .form-label { color: #e9eef6; }

/* Inputs */
.form-control {
  border-radius: 12px;
  border: 2px solid var(--line-200);
  padding: 10px 12px;
  background: #fff;
  color: #111827;
}
.form-control:focus {
  border-color: var(--sage-600);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--sage-600) 35%, transparent);
}
:root[data-theme="dark"] .rec-form .form-control {
  background: #0E141B;
  color: #e9eef6;
  border-color: #2a3a52;
}

/* Stars */
.stars { display: inline-flex; gap: 6px; user-select: none; }
.star-btn { appearance: none; border: none; background: transparent; font-size: 24px; line-height: 1; cursor: pointer; padding: 0 2px; color: var(--sage-600); }
.star-btn[aria-checked='false'] { color: #c9cfc6; }
:root[data-theme="dark"] .rec-form .star-btn[aria-checked='false'] { color: #3a4759; }

/* Drop zone */
.drop-area {
  border: 2px dashed rgba(139,157,131,0.45);
  border-radius: 12px;
  padding: 14px;
  background: rgba(250,249,246,0.6);
  cursor: pointer;
}
.drop-area.dragging { background: rgba(250,249,246,0.9); border-color: var(--sage-600); }
:root[data-theme="dark"] .rec-form .drop-area {
  background: #0d1218;
  border-color: #2a3a52;
}
.drop-hint { color: var(--ink-400); }
:root[data-theme="dark"] .rec-form .drop-hint { color: #b7c3d3; }

/* hide the actual file input */
.hidden-file { display: none; }

/* Live large preview */
.live-preview {
  margin-top: 10px;
  padding: 10px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--line-200);
}
:root[data-theme="dark"] .rec-form .live-preview {
  background: #0E141B;
  border-color: #2a3a52;
}
.live-preview img {
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  border-radius: 10px;
  background: #fff; /* ensure visible if image has transparency */
  border: 1px solid #e5e7eb;
}
:root[data-theme="dark"] .rec-form .live-preview img {
  border-color: #2a3a52;
  background: #0B1117;
}
.remove-btn {
  margin-top: 8px;
  background: transparent;
  color: #ef4444;
  border: none;
  font-weight: 700;
  cursor: pointer;
}

/* Thumbs (kept) */
.thumbs { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.thumbs img {
  width: 84px; height: 84px; object-fit: cover; border-radius: 10px;
  box-shadow: var(--shadow-card);
  background: #fff; border: 1px solid #e5e7eb;
}
:root[data-theme="dark"] .rec-form .thumbs img {
  background: #0B1117; border-color: #2a3a52;
}

/* Visibility chips */
.vis-group { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.vis-input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
.vis-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 14px; font-weight: 900; font-size: 14px;
  border-radius: 999px; cursor: pointer; user-select: none;
  background: #fff; color: #111827; border: 2px solid var(--line-200);
  box-shadow: 0 2px 0 rgba(0,0,0,.05);
}
.vis-chip:hover { filter: brightness(0.98); }
:root[data-theme="dark"] .rec-form .vis-chip { background: #0E141B; color: #e9eef6; border-color: #2a3a52; }
#vis-friends.vis-input:checked + .vis-chip,
#vis-everyone.vis-input:checked + .vis-chip {
  background: var(--sage-600); color: #fff; border-color: var(--sage-600);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--sage-600) 35%, transparent);
}
.vis-input:focus + .vis-chip { outline: 3px solid color-mix(in oklab, var(--sage-600) 45%, transparent); outline-offset: 2px; }

/* Submit */
.submit-btn {
  background: linear-gradient(135deg, var(--sage-600), var(--terra-500));
  color: #fff; font-weight: 900; border: none; border-radius: 12px; padding: 12px 16px;
  box-shadow: 0 8px 20px rgba(0,0,0,.18);
}
.submit-btn:disabled { opacity: 0.7; }
</style>
