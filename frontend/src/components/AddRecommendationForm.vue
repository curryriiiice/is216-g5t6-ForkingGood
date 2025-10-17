<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import api from '@/lib/api'

const emit = defineEmits(['added'])

/** Form state */
const comment = ref('')
const rating = ref(0) // start empty until user selects
const cuisine = ref('')

/** Place fields (filled by Google Places) */
const placeName = ref('')
const address = ref('')
const lat = ref(null)
const lng = ref(null)
const placeId = ref('')
const photoUrl = ref('')
const photos = ref([])
const priceRange = ref(null) // '$' | '$$' | '$$$' | '$$$$'
const visibility = ref('friends') // 'friends' | 'everyone'
const isDragging = ref(false)

/** Autocomplete DOM ref */
const nameInputEl = ref(null) // Autocomplete for place/restaurant name
const addressInputEl = ref(null) // Autocomplete for address/location
const stars = [1, 2, 3, 4, 5]
function setRating(n) {
  rating.value = clampRating(n)
}

/** Status */
const submitting = ref(false)
const errorMsg = ref('')

/** Load Maps JS (Places) if not already loaded */
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

/** Bias autocomplete to user's current location */
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

  // --- Bias suggestions around user's current location ---
  let circleBounds = null
  const pos = await getUserLocation()
  if (pos) {
    const circle = new google.maps.Circle({ center: pos, radius: 3000 }) // 3km bias
    circleBounds = circle.getBounds()
  }

  // --- Autocomplete for Restaurant/Place NAME (establishments) ---
  const acName = new places.Autocomplete(nameInputEl.value, {
    fields: ['place_id', 'name', 'formatted_address', 'geometry'],
    types: ['establishment'], // restaurants/cafes/shops, etc.
  })
  if (circleBounds) acName.setBounds(circleBounds)

  acName.addListener('place_changed', () => {
    const place = acName.getPlace()
    if (!place) return

    placeId.value = place.place_id || ''
    placeName.value = place.name || placeName.value || '' // keep user-entered if missing
    address.value = place.formatted_address || address.value || ''

    const location = place.geometry?.location
    lat.value = location?.lat?.() ?? lat.value
    lng.value = location?.lng?.() ?? lng.value
  })

  // --- Autocomplete for ADDRESS (geocode). Lets user type a location and keep a custom name ---
  const acAddr = new places.Autocomplete(addressInputEl.value, {
    fields: ['place_id', 'formatted_address', 'geometry', 'name'],
    types: ['geocode'], // address/location results
  })
  if (circleBounds) acAddr.setBounds(circleBounds)

  acAddr.addListener('place_changed', () => {
    const place = acAddr.getPlace()
    if (!place) return

    // Only set name if the user didn't type one yet (so they can keep a custom name)
    if (!placeName.value && place.name) {
      placeName.value = place.name
    }

    placeId.value = place.place_id || placeId.value || ''
    address.value = place.formatted_address || address.value || ''

    const location = place.geometry?.location
    lat.value = location?.lat?.() ?? lat.value
    lng.value = location?.lng?.() ?? lng.value
  })
})

function clampRating(num) {
  if (Number.isNaN(num)) return 1
  if (num < 1) return 1
  if (num > 5) return 5
  return Math.round(num * 2) / 2 // keep .5 steps if you like
}

function onDrop(e) {
  isDragging.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  if (!files.length) return
  const imgFiles = files.filter((f) => f.type.startsWith('image/')).slice(0, 6)
  photos.value = []
  imgFiles.forEach((f) => {
    const reader = new FileReader()
    reader.onload = () => {
      photos.value.push(reader.result)
      if (!photoUrl.value) photoUrl.value = String(reader.result)
    }
    reader.readAsDataURL(f)
  })
}
function onDragOver(e) {
  e.preventDefault()
  isDragging.value = true
}
function onDragLeave() {
  isDragging.value = false
}

async function submit() {
  try {
    // basic validation
    if (!placeName.value.trim()) {
      alert('Please enter a restaurant name.')
      return
    }
    if (!rating.value || rating.value < 1 || rating.value > 5) {
      alert('Please enter a rating between 1 and 5.')
      return
    }

    // ✅ make sure to define restId before using it
    const restId = placeId?.value || crypto.randomUUID()

    // create a simple restaurant object
    const restaurant = {
      id: restId,
      name: placeName.value.trim(),
      address: address.value.trim(),
      cuisine_type: cuisine.value.trim(),
      latitude: lat.value || null,
      longitude: lng.value || null,
    }

    // send to backend (Axios)
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

    // redirect to map and focus new pin
    router.push({ path: '/map', query: { restaurant: restaurantId } })
  } catch (err) {
    console.error('Error adding recommendation:', err)
    alert(err.message || 'Failed to add recommendation.')
  }

  
}



let tooltipInstances = []

onMounted(() => {
  // Ensure Bootstrap JS bundle is loaded on the page (index.html or via import)
  const triggers = document.querySelectorAll('[data-bs-toggle="tooltip"]')
  tooltipInstances = [...triggers].map(el => {
    const tooltip = new bootstrap.Tooltip(el, {
      container: 'body',
      boundary: 'window',
      placement: 'top',
      trigger: 'hover focus',      // hide when you leave or blur
      delay: { show: 100, hide: 120 } // tiny delay helps prevent “sticky” feel
    });
    el.addEventListener('click', () => tooltip.hide());
    return tooltip;
  })
})

onBeforeUnmount(() => {
  tooltipInstances.forEach(t => t.dispose())
  tooltipInstances = []
})
</script>

<template>
  <form class="rec-form" @submit.prevent="submit">
    <!-- <h2 class="form-title">Add a Food Recommendation</h2> -->

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

    <!-- Price Range -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Price Range</label>
      <div class="d-flex gap-2 flex-wrap">
        <button
          type="button"
          class="btn btn-outline-secondary price-chip"
          :class="{ active: priceRange === '$' }"
          @click="priceRange = '$'"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          title="Under $10 per person"
        >
          $
        </button>

        <button
          type="button"
          class="btn btn-outline-secondary price-chip"
          :class="{ active: priceRange === '$$' }"
          @click="priceRange = '$$'"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          title="$10–$30 per person"
        >
          $$
        </button>

        <button
          type="button"
          class="btn btn-outline-secondary price-chip"
          :class="{ active: priceRange === '$$$' }"
          @click="priceRange = '$$$'"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          title="$30–$60 per person"
        >
          $$$
        </button>

        <button
          type="button"
          class="btn btn-outline-secondary price-chip"
          :class="{ active: priceRange === '$$$$' }"
          @click="priceRange = '$$$$'"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          title="$60+ per person"
        >
          $$$$
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
      <div
        class="drop-area"
        :class="{ dragging: isDragging }"
        @dragover.prevent="onDragOver"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
        tabindex="0"
      >
        <div class="drop-hint text-center">Drag &amp; drop your photos here or click to upload</div>
        <input
          type="file"
          accept="image/*"
          class="mt-2"
          @change="
            (e) => {
              const f = e.target.files?.[0]
              if (f) {
                const r = new FileReader()
                r.onload = () => {
                  photoUrl = r.result
                  photos = [r.result]
                }
                r.readAsDataURL(f)
              }
            }
          "
        />
      </div>
      <div class="thumbs" v-if="photos.length">
        <img v-for="(src, i) in photos" :key="i" :src="src" alt="" />
      </div>
    </div>

    <!-- Visibility -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Who can see this?</label>
      <div class="form-check">
        <input
          class="form-check-input"
          type="radio"
          id="vis-friends"
          value="friends"
          v-model="visibility"
        />
        <label class="form-check-label" for="vis-friends">Friends</label>
      </div>
      <div class="form-check">
        <input
          class="form-check-input"
          type="radio"
          id="vis-everyone"
          value="everyone"
          v-model="visibility"
        />
        <label class="form-check-label" for="vis-everyone">Everyone</label>
      </div>
    </div>

    <button class="btn submit-btn w-100" type="submit" :disabled="submitting">
      {{ submitting ? 'Posting…' : 'Submit Recommendation' }}
    </button>
  </form>
</template>

<style scoped>
.rec-form {
  background: var(--cream-50);
  border: 1px solid rgba(139, 157, 131, 0.15);
  border-radius: var(--radius-md);
  padding: 18px 20px 22px;
}
.form-title {
  text-align: center;
  color: var(--charcoal);
  font-weight: 800;
  margin: 0 0 16px;
}
.form-label {
  color: var(--charcoal);
  margin-bottom: 6px;
}
.form-control {
  border-radius: 10px;
  border: 1px solid var(--line-200);
  padding: 10px 12px;
}
.form-control:focus {
  border-color: var(--sage-500);
  box-shadow: 0 0 0 3px rgba(168, 185, 165, 0.25);
}

/* Stars */
.stars {
  display: inline-flex;
  gap: 6px;
  user-select: none;
}
.star-btn {
  appearance: none;
  border: none;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  color: var(--sage-600);
}
.star-btn[aria-checked='false'] {
  color: #c9cfc6;
}

/* Price range chips */
.price-chip {
  border: 1px solid var(--line-200);
  border-radius: 10px;
  background: #fff;
  font-weight: 700;
  padding: 6px 12px;
}

.price-chip:hover {
  background-color: #e0e0e0;
  color: var(--charcoal);
}
.price-chip.active {
  background: var(--cream-100);
  border-color: var(--sage-500);
  box-shadow: inset 0 0 0 1px var(--sage-500);
  color: var(--charcoal);
}

/* Drop zone */
.drop-area {
  border: 2px dashed rgba(139, 157, 131, 0.45);
  border-radius: 12px;
  padding: 14px;
  background: rgba(250, 249, 246, 0.6);
}
.drop-area.dragging {
  background: rgba(250, 249, 246, 0.9);
  border-color: var(--sage-600);
}
.drop-hint {
  color: var(--ink-400);
}
.thumbs {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.thumbs img {
  width: 84px;
  height: 84px;
  object-fit: cover;
  border-radius: 10px;
  box-shadow: var(--shadow-card);
}

/* Submit */
.submit-btn {
  background: linear-gradient(135deg, var(--terra-500), var(--terra-600));
  color: #fff;
  font-weight: 700;
  border: none;
  border-radius: 12px;
  padding: 10px 16px;
}
.submit-btn:disabled {
  opacity: 0.7;
}
</style>
