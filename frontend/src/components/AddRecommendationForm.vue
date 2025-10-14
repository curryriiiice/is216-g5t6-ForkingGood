<!-- src/components/AddRecommendationForm.vue -->
<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
import { ref, onMounted, nextTick } from 'vue'
import api from '@/lib/api'

const emit = defineEmits(['added'])

/** Form state */
const comment = ref('')
const rating = ref(4) // default
const cuisine = ref('')

/** Place fields (filled by Google Places) */
const placeName = ref('')
const address = ref('')
const lat = ref(null)
const lng = ref(null)
const placeId = ref('')
const photoUrl = ref('')

/** Autocomplete DOM ref */
const addrInputEl = ref(null)

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
  const ac = new places.Autocomplete(addrInputEl.value, {
    fields: ['place_id', 'name', 'formatted_address', 'geometry'],
    types: ['establishment'], // restaurants/cafes/shops, etc.
  })

  // Geolocation bias (more relevant suggestions near the user)
  const pos = await getUserLocation()
  if (pos) {
    const circle = new google.maps.Circle({ center: pos, radius: 3000 }) // 3km bias
    ac.setBounds(circle.getBounds())
  }

  ac.addListener('place_changed', () => {
    const place = ac.getPlace()
    if (!place) return

    placeId.value = place.place_id || ''
    placeName.value = place.name || ''
    address.value = place.formatted_address || ''

    const location = place.geometry?.location
    lat.value = location?.lat?.() ?? null
    lng.value = location?.lng?.() ?? null
  })
})

function clampRating(num) {
  if (Number.isNaN(num)) return 1
  if (num < 1) return 1
  if (num > 5) return 5
  return Math.round(num * 2) / 2 // keep .5 steps if you like
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
</script>

<template>
  <form class="form" @submit.prevent="submit">
    <!-- Place autocomplete (address/name) -->
    <label>
      <span class="lab">Search place (near you)</span>
      <input
        ref="addrInputEl"
        type="text"
        placeholder="Start typing the restaurant or cafe name…"
        aria-autocomplete="list"
      />
    </label>

    <!-- Name (from place; editable) -->
    <label>
      <span class="lab">Name</span>
      <input v-model="placeName" type="text" placeholder="e.g. Hainan Story" required />
    </label>

    <!-- Address (from place; editable) -->
    <label>
      <span class="lab">Address</span>
      <input v-model="address" type="text" placeholder="Selected address" required />
    </label>

    <!-- Cuisine -->
    <label>
      <span class="lab">Cuisine</span>
      <input v-model="cuisine" type="text" placeholder="e.g. Malay, Japanese, Hotpot" required />
    </label>

    <!-- Rating (strict 1–5) -->
    <label>
      <span class="lab">Rating</span>
      <input
        v-model.number="rating"
        type="number"
        min="1"
        max="5"
        step="0.5"
        @change="rating = Math.max(1, Math.min(5, Number(rating)))"
      />
      <small class="hint">Use 1–5 (you can do halves like 3.5)</small>
    </label>

    <!-- Comment -->
    <label>
      <span class="lab">Comment</span>
      <textarea v-model="comment" rows="3" placeholder="What did you like?" required />
    </label>

    <!-- Optional photo URL -->
    <label>
      <span class="lab">Photo URL (optional)</span>
      <input v-model="photoUrl" type="url" placeholder="https://…" />
    </label>

    <!-- Debug coords -->
    <div class="coords" v-if="lat && lng">
      Using your location bias • Selected coords: {{ lat.toFixed(5) }}, {{ lng.toFixed(5) }}
    </div>

    <p v-if="errorMsg" class="err">{{ errorMsg }}</p>

    <button class="btn" type="submit" :disabled="submitting">
      {{ submitting ? 'Posting…' : 'Post' }}
    </button>
  </form>
</template>

<style scoped>
.form {
  display: grid;
  gap: 10px;
}
.lab {
  display: block;
  font-weight: 700;
  margin-bottom: 6px;
  color: #111827;
}
input,
textarea {
  width: 100%;
  padding: 0.6rem 0.7rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  outline: none;
}
input:focus,
textarea:focus {
  border-color: #94a3b8;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.2);
}
.coords {
  color: #6b7280;
  font-size: 0.85rem;
}
.hint {
  color: #6b7280;
  margin-left: 6px;
}
.btn {
  padding: 0.6rem 0.9rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #111;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}
.err {
  color: #ef4444;
  font-size: 0.9rem;
  font-weight: 600;
}
</style>
