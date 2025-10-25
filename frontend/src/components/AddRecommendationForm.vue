<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import api from '@/lib/api'

// TEMP: until auth is wired, use a fixed user for friends feed
const ACTIVE_EMAIL = import.meta.env.VITE_ACTIVE_EMAIL || 'clarice.lim.2024@computing.smu.edu.sg'

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
const priceRange = ref(null)    // '$' | '$$' | '$$$' | '$$$$'
const visibility = ref('friends')
const isDragging = ref(false)
const MAX_PHOTOS = 6

/** Autocomplete DOM refs */
const nameInputEl = ref(null)
const addressInputEl = ref(null)
const rootEl = ref(null)
const nameWrap = ref(null)
const addrWrap = ref(null)

/** File input (so drop zone is clickable) */
const fileInputEl = ref(null)

// --- Google Places Autocomplete: classic predictions state/services ---
const namePreds = ref([])
const addrPreds = ref([])
let acService = null
let placesSvc = null

// --- Helpers to allow free typing + hide lists on click-out / Esc ---
function hideNameList() { namePreds.value = [] }
function hideAddrList() { addrPreds.value = [] }

function onNameBlur() { window.setTimeout(hideNameList, 120) }
function onAddrBlur() { window.setTimeout(hideAddrList, 120) }

function onDocClick(e) {
  const nw = nameWrap.value
  const aw = addrWrap.value
  if (nw && !nw.contains(e.target)) hideNameList()
  if (aw && !aw.contains(e.target)) hideAddrList()
  const cw = cuisineWrap?.value
  if (cw && !cw.contains(e.target)) hideCuisineList()
}

function onEscKey(e) {
  if (e.key === 'Escape') { hideNameList(); hideAddrList() }
}

/** Cuisine suggestions (with free-typing + spell check) */
const cuisineOptions = [
  'Chinese','Malay','Indian','Peranakan','Thai','Japanese','Korean','Italian','French','Spanish','Mexican',
  'Vietnamese','Indonesian','Turkish','Middle Eastern','Mediterranean','American','Burgers','BBQ','Seafood',
  'Vegetarian','Vegan','Halal','Bakery','Cafe','Dim Sum','Noodles','Sushi','Ramen','Hotpot','Steakhouse',
  'Pizza','Pasta','Desserts','Bubble Tea','Hawker','Teochew','Cantonese','Hainanese','Sichuan','Malay-Indo', 'Western'
]
const cuisinePreds = ref([])
const cuisineHint = ref('')
const cuisineWrap = ref(null)

function hideCuisineList() { cuisinePreds.value = [] }
function onCuisineBlur() { window.setTimeout(hideCuisineList, 120) }

function filterCuisineOptions(query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []
  const starts = [], contains = []
  for (const opt of cuisineOptions) {
    const o = opt.toLowerCase()
    if (o.startsWith(q)) starts.push(opt)
    else if (o.includes(q)) contains.push(opt)
  }
  return [...starts, ...contains].slice(0, 8)
}

// Simple Levenshtein distance for spell checking
function levenshtein(a = '', b = '') {
  a = a.toLowerCase(); b = b.toLowerCase()
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      prev = temp
    }
  }
  return dp[n]
}

function bestCuisineSuggestion(q) {
  const query = (q || '').trim()
  if (!query) return ''
  let best = '', bestDist = Infinity
  for (const opt of cuisineOptions) {
    const d = levenshtein(query, opt)
    if (d < bestDist) { bestDist = d; best = opt }
  }
  // Only suggest if reasonably close (<=2 edits) and not exact
  if (best && bestDist > 0 && bestDist <= 2) return best
  return ''
}

function onCuisineInput() {
  cuisinePreds.value = filterCuisineOptions(cuisine.value)
  cuisineHint.value = bestCuisineSuggestion(cuisine.value)
}

function pickCuisine(opt) {
  cuisine.value = opt
  cuisinePreds.value = []
  cuisineHint.value = ''
}

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
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly&libraries=places&region=SG&language=en`
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
  // Ensure Places library is ready
  await google.maps.importLibrary('places')
  await nextTick()

  // Initialize classic Places AutocompleteService and PlacesService (for details)
  acService = new google.maps.places.AutocompleteService()
  placesSvc = new google.maps.places.PlacesService(document.createElement('div'))

  document.addEventListener('mousedown', onDocClick)
  document.addEventListener('keydown', onEscKey)
})

function onNameInput() {
  const input = (placeName.value || '').trim()
  if (!input) { namePreds.value = []; return }
  acService.getPlacePredictions(
    {
      input,
      componentRestrictions: { country: 'sg' },
      types: ['establishment']
    },
    (preds) => { namePreds.value = preds || [] }
  )
}

function onAddrInput() {
  const input = (address.value || '').trim()
  if (!input) { addrPreds.value = []; return }
  acService.getPlacePredictions(
    {
      input,
      componentRestrictions: { country: 'sg' },
      types: ['address']
    },
    (preds) => { addrPreds.value = preds || [] }
  )
}

function pickPrediction(pred, fillName = true) {
  if (!pred?.place_id) return
  placesSvc.getDetails(
    { placeId: pred.place_id, fields: ['place_id','name','formatted_address','geometry'] },
    (res, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !res) return
      placeId.value = res.place_id || ''
      if (fillName && res.name) placeName.value = res.name
      address.value = res.formatted_address || address.value
      const loc = res.geometry?.location
      if (loc) {
        const la = typeof loc.lat === 'function' ? loc.lat() : loc.lat
        const ln = typeof loc.lng === 'function' ? loc.lng() : loc.lng
        if (la != null) lat.value = la
        if (ln != null) lng.value = ln
      }
      namePreds.value = []
      addrPreds.value = []
    }
  )
}


function clampRating(num) {
  if (Number.isNaN(num)) return 1
  return Math.min(5, Math.max(1, Math.round(num * 2) / 2))
}

/** ---------- File / Preview helpers ---------- */
function openFilePicker() {
  fileInputEl.value?.click()
}


function handleChosenFiles(fileList) {
  const list = Array.from(fileList || []).filter(f => f && f.type && f.type.startsWith('image/'))
  if (!list.length) return

  // Ensure we don't exceed MAX_PHOTOS
  const remaining = Math.max(0, MAX_PHOTOS - photos.value.length)
  const toAdd = list.slice(0, remaining)

  // Read each file as DataURL and append to photos
  toAdd.forEach((file, idx) => {
    const reader = new FileReader()
    reader.onload = () => {
      const data = String(reader.result || '')
      if (idx === 0) photoUrl.value = data // keep the first as the main photo
      photos.value = [...photos.value, data]
    }
    reader.readAsDataURL(file)
  })
}

function onInputChange(e) {
  const files = e.target?.files
  handleChosenFiles(files)
}

function onDrop(e) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (!files || !files.length) return
  handleChosenFiles(files)
}
function onDragOver(e) { e.preventDefault(); isDragging.value = true }
function onDragLeave() { isDragging.value = false }

function removePhoto() {
  photos.value = []
  photoUrl.value = ''
  if (fileInputEl.value) fileInputEl.value.value = ''
}

function removePhotoAt(idx) {
  try {
    const arr = Array.isArray(photos.value) ? [...photos.value] : []
    if (idx < 0 || idx >= arr.length) return
    arr.splice(idx, 1)
    photos.value = arr
    // Keep the first image as the main data url fallback
    photoUrl.value = arr[0] || ''
    if (!arr.length && fileInputEl.value) fileInputEl.value.value = ''
  } catch {}
}

// Helper: Convert DataURL to File object
function dataURLtoFile(dataURL, filename) {
  try {
    const [meta, base64] = String(dataURL || '').split(',')
    const mime = (meta.match(/data:(.*?);/) || [])[1] || 'application/octet-stream'
    const bin = atob(base64 || '')
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return new File([arr], filename, { type: mime })
  } catch {
    return null
  }
}

/** ---------- Submit ---------- */
async function submit() {
  try {
    if (!placeName.value.trim()) { alert('Please enter a restaurant name.'); return }
    if (!rating.value || rating.value < 1 || rating.value > 5) {
      alert('Please enter a rating between 1 and 5.'); return
    }

    const userEmail = ACTIVE_EMAIL

    // Build FormData matching backend (multer upload.array("photos"))
    const fd = new FormData()
    fd.append('user_email', String(userEmail))
    fd.append('name', placeName.value.trim())
    fd.append('address', address.value.trim())
    fd.append('cuisine_type', cuisine.value.trim())
    fd.append('rating', String(Number(rating.value)))
    fd.append('review', comment.value.trim())
    fd.append('is_public', String(visibility.value === 'everyone'))

    // Attach photos (if any)
    const sources = (Array.isArray(photos.value) && photos.value.length)
      ? photos.value
      : (photoUrl.value ? [photoUrl.value] : [])

    sources.forEach((d, i) => {
      const f = dataURLtoFile(d, `photo_${i + 1}.jpg`)
      if (f) fd.append('photos', f)
    })

    submitting.value = true
    errorMsg.value = ''

    // POST multipart to /user/createPost
    const res = await api.post('/user/createPost', fd) // axios will set multipart boundary automatically
    const data = res?.data || {}
    const payload = data?.data || data

    const restaurantId = payload?.restaurantid || payload?.restaurantId || placeId.value || crypto.randomUUID()
    const postId = payload?.postId

    emit('added', { restaurantId, postId })
    router.push({ path: '/map', query: { restaurant: restaurantId } })
  } catch (err) {
    console.error('Error creating post:', err)
    const msg = err?.response?.data?.message || err.message || 'Failed to create post.'
    alert(msg)
    errorMsg.value = msg
  } finally {
    submitting.value = false
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
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onEscKey)
  destroyTooltipsLocal()
})
</script>

<template>
  <form ref="rootEl" class="rec-form" @submit.prevent="submit">
    <!-- Restaurant or Place -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Restaurant or Place</label>
      <div ref="nameWrap" class="ac-wrap">
        <input
          ref="nameInputEl"
          v-model="placeName"
          type="text"
          class="form-control"
          placeholder="E.g., Mario's Trattoria"
          @input="onNameInput"
          @focus="onNameInput"
          @keydown.esc.prevent="hideNameList()"
          @blur="onNameBlur"
          autocomplete="off"
          required
        />
        <ul v-if="namePreds.length" class="ac-list">
          <li v-for="p in namePreds" :key="p.place_id" class="ac-item" @mousedown.prevent="pickPrediction(p, true)">
            {{ p.description }}
          </li>
        </ul>
      </div>
    </div>

    <!-- Address -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Address</label>
      <div ref="addrWrap" class="ac-wrap">
        <input
          ref="addressInputEl"
          v-model="address"
          type="text"
          class="form-control"
          placeholder="Start typing a location…"
          @input="onAddrInput"
          @focus="onAddrInput"
          @keydown.esc.prevent="hideAddrList()"
          @blur="onAddrBlur"
          autocomplete="off"
          required
        />
        <ul v-if="addrPreds.length" class="ac-list">
          <li v-for="p in addrPreds" :key="p.place_id" class="ac-item" @mousedown.prevent="pickPrediction(p, !placeName)">
            {{ p.description }}
          </li>
        </ul>
      </div>
    </div>

    <!-- Cuisine Type -->
    <div class="mb-3">
      <label class="form-label fw-semibold">Cuisine Type</label>
      <div ref="cuisineWrap" class="ac-wrap">
        <input
          v-model="cuisine"
          type="text"
          class="form-control"
          placeholder="E.g., Italian, Thai, Mexican"
          @input="onCuisineInput"
          @focus="onCuisineInput"
          @keydown.esc.prevent="hideCuisineList()"
          @blur="onCuisineBlur"
          autocomplete="off"
          required
        />
        <ul v-if="cuisinePreds.length" class="ac-list" role="listbox" aria-label="Cuisine suggestions">
          <li
            v-for="opt in cuisinePreds"
            :key="opt"
            class="ac-item"
            role="option"
            @mousedown.prevent="pickCuisine(opt)"
          >
            {{ opt }}
          </li>
        </ul>
        <div v-if="!cuisinePreds.length && cuisine && cuisineHint" class="ac-hint">Did you mean <button type="button" class="hint-btn" @mousedown.prevent="pickCuisine(cuisineHint)">{{ cuisineHint }}</button>?</div>
      </div>
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
          Click to select images or drag &amp; drop here (up to {{ MAX_PHOTOS }})
        </div>
        <input
          ref="fileInputEl"
          type="file"
          accept="image/*"
          multiple
          class="hidden-file"
          @change="onInputChange"
        />
      </div>


      <!-- Thumbnails with per-item remove -->
      <div class="thumbs" v-if="photos.length">
        <div v-for="(src, i) in photos" :key="i" class="thumb">
          <img :src="src" alt="" />
          <button type="button" class="thumb-del" aria-label="Remove photo" @click.stop="removePhotoAt(i)">×</button>
        </div>
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


/* Thumbnails */
.thumbs { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.thumb { position: relative; width: 84px; height: 84px; }
.thumb img {
  width: 100%; height: 100%; object-fit: cover; border-radius: 10px;
  box-shadow: var(--shadow-card);
  background: #fff; border: 1px solid #e5e7eb;
  display: block;
}
:root[data-theme="dark"] .rec-form .thumb img {
  background: #0B1117; border-color: #2a3a52;
}
.thumb-del {
  position: absolute; top: -6px; right: -6px;
  width: 22px; height: 22px; border-radius: 50%;
  border: 0; cursor: pointer; line-height: 1; font-weight: 900;
  background: #111827; color: #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,.3);
}
.thumb-del:hover { filter: brightness(1.05); }
:root[data-theme="dark"] .rec-form .thumb-del { background: #e9eef6; color: #0B1117; }

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

.ac-wrap { position: relative; }
.ac-list {
  position: absolute;
  top: 100%; left: 0; right: 0;
  background: #fff;
  border: 1px solid var(--line-200);
  border-radius: 10px;
  margin: 6px 0 0; padding: 6px 0;
  max-height: 260px; overflow: auto;
  z-index: 2000;
  box-shadow: 0 6px 18px rgba(0,0,0,.08);
}
:root[data-theme="dark"] .rec-form .ac-list { background: #0E141B; border-color: #2a3a52; }
.ac-item { padding: 8px 12px; cursor: pointer; }
.ac-item:hover { background: #f6faf7; }
:root[data-theme="dark"] .rec-form .ac-item:hover { background: #0d1218; }


/* Cuisine hint */
.ac-hint { margin-top: 6px; font-size: 12px; color: #64748b; }
.ac-hint .hint-btn { border: none; background: none; color: var(--sage-600); font-weight: 800; cursor: pointer; padding: 0; }
.ac-hint .hint-btn:hover { text-decoration: underline; }
:root[data-theme="dark"] .rec-form .ac-hint { color: #9fb0c6; }
</style>




