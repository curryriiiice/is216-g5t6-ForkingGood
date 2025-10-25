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
        @click="openReversePopup"
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
    </div>

    <!-- Right side -->
    <div class="right">
      <img src="/images/Bell.png" alt="Notifications" width="28" height="28" class="bell" />

      <!-- Avatar -->
      <RouterLink to="/profile" class="avatar-wrap">
        <div v-if="localUser?.avatar_url" class="avatar-img">
          <img :src="localUser.avatar_url" alt="avatar" />
        </div>
        <div v-else class="avatar-fallback">{{ initials }}</div>
      </RouterLink>

      <!-- Welcome (optional) -->
      <span v-if="localUser" class="welcome">Welcome, {{ localUser.username || localUser.first_name }}!</span>

      <!-- Logout button styled like .rev-btn -->
      <button class="rev-btn logout" @click.stop="goLogoutPage">Log out</button>
    </div>
  </nav>

  <!-- Reverse Image Search Modal (teleported to body, with cropper) -->
  <Teleport to="body">
    <Modal :show="showReversePopup" title="Reverse Image Search" @close="closeReversePopup">
      <div class="p-3">
        <p class="mb-2 rev-title">Upload an image, zoom/drag to adjust, then submit.</p>

        <!-- hidden native input, triggered by the button below -->
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
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

        <!-- CROP UI -->
        <div v-if="cropSrc" class="ris-crop-wrap">
          <div
            class="ris-crop-area"
            :style="{ width: C + 'px', height: C + 'px' }"
            @mousedown="onDragStart"
            @mousemove="onDragMove"
            @mouseup="onDragEnd"
            @mouseleave="onDragEnd"
            @touchstart="onDragStart"
            @touchmove="onDragMove"
            @touchend="onDragEnd"
          >
            <img
              :src="cropSrc"
              id="ris-crop-img"
              class="ris-crop-img"
              :style="{
                left: pos.left + 'px',
                top: pos.top + 'px',
                width: (imgMeta.naturalW * cropScale) + 'px',
                height: (imgMeta.naturalH * cropScale) + 'px'
              }"
              @load="onImgLoad"
              draggable="false"
              alt="Crop source"
            />
            <!-- square guide -->
            <div
              class="ris-crop-mask"
              :style="{ width: D + 'px', height: D + 'px', left: (C - D)/2 + 'px', top: (C - D)/2 + 'px' }"
            ></div>
          </div>

          <!-- Zoom control -->
          <div class="mt-3">
            <label class="form-label small text-muted">Zoom</label>
            <input
              class="form-range"
              type="range"
              :min="minZoom"
              :max="3"
              step="0.01"
              :value="cropScale"
              @input="onZoomChange($event.target.value)"
            />
            <div class="zoom-actions">
              <button type="button" class="btn btn-ghost" @click="zoomToFit">Fit to view</button>
              <button type="button" class="btn btn-ghost" @click="resetCrop">Reset</button>
              <button type="button" class="btn btn-ghost" @click="removeFile">Remove Image</button>
            </div>
          </div>
        </div>

        <!-- errors -->
        <p v-if="fileError" class="rev-error">{{ fileError }}</p>

        <div class="rev-actions">
          <button
            type="button"
            class="rev-submit"
            :disabled="(!selectedFile && !cropBlob) || submitting"
            @click="submitReverseSearch"
          >
            {{ submitting ? 'Submitting…' : 'Submit Image Search' }}
          </button>
        </div>
      </div>
    </Modal>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, reactive } from 'vue'
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
const term = ref(props.searchTerm)
const searchResults = ref([])
const searchLoading = ref(false)
const showDropdown = ref(false)
const dropdownRef = ref(null)
const localUser = ref(props.user)

/* === Reverse Image Search (single file + cropper) === */
const showReversePopup = ref(false)
const fileInputRef = ref(null)
const selectedFile = ref(null) // File | null
const previewUrl = ref('')
const fileError = ref('')
const submitting = ref(false)

/* Cropper state (square) */
const cropSrc = ref('')            // object URL of selected image
const cropScale = ref(1)           // zoom
const fitScale = ref(1)            // computed scale to show whole image inside the square view
const minZoom = computed(() => Math.min(0.25, fitScale.value)) // allow zooming out to at least fit (or further down to 0.25)
const C = 420                      // container size (outer square)
const D = 360                      // square selection size (inner mask)
const OUT = 640                    // export resolution (square)
const pos = reactive({ left: 0, top: 0 })
const dragging = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
const posStart = reactive({ left: 0, top: 0 })
const imgMeta = reactive({ naturalW: 0, naturalH: 0, ready: false })
let cropBlob = null                // exported blob to send

/* -------------------- Reverse helpers -------------------- */
const MAX_BYTES = 6 * 1024 * 1024 // 6MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']

function openReversePopup() { showReversePopup.value = true }
function triggerPick() { fileInputRef.value?.click() }

function handleSingleFile(e) {
  fileError.value = ''
  const f = e.target?.files?.[0]
  if (!f) { removeFile(); return }
  if (!ALLOWED_TYPES.includes(f.type) && !f.type.startsWith('image/')) {
    fileError.value = 'Please select an image file.'; e.target.value = ''; return
  }
  if (f.size > MAX_BYTES) {
    fileError.value = 'Image is too large (max 6MB).'; e.target.value = ''; return
  }
  selectedFile.value = f

  // Create preview/crop source
  if (cropSrc.value) { try { URL.revokeObjectURL(cropSrc.value) } catch {} }
  cropSrc.value = URL.createObjectURL(f)
  imgMeta.ready = false
  cropScale.value = 1
  fitScale.value = 1
  cropBlob = null
  if (fileInputRef.value) fileInputRef.value.value = ''
  e.target.value = ''
}

function removeFile() {
  selectedFile.value = null
  previewUrl.value = ''
  cropBlob = null
  if (cropSrc.value) { try { URL.revokeObjectURL(cropSrc.value) } catch {} ; cropSrc.value = '' }
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function onImgLoad(e) {
  imgMeta.naturalW = e.target.naturalWidth
  imgMeta.naturalH = e.target.naturalHeight
  imgMeta.ready = true

  // Compute a "fit to view" scale so the whole image is visible within the outer square (C x C)
  fitScale.value = Math.min(C / imgMeta.naturalW, C / imgMeta.naturalH)

  // Start by fitting the whole picture
  cropScale.value = fitScale.value
  nextTick(centerImage)
}

function centerImage() {
  const w = imgMeta.naturalW * cropScale.value
  const h = imgMeta.naturalH * cropScale.value
  pos.left = (C - w) / 2
  pos.top  = (C - h) / 2
  constrainPosition()
}

function onDragStart(ev) {
  dragging.value = true
  const p = getPoint(ev)
  dragStart.x = p.x; dragStart.y = p.y
  posStart.left = pos.left; posStart.top = pos.top
  ev.preventDefault()
}
function onDragMove(ev) {
  if (!dragging.value) return
  const p = getPoint(ev)
  pos.left = posStart.left + (p.x - dragStart.x)
  pos.top  = posStart.top  + (p.y - dragStart.y)
  constrainPosition()
}
function onDragEnd() { dragging.value = false }
function getPoint(ev) {
  if (ev.touches?.[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
  return { x: ev.clientX, y: ev.clientY }
}
function constrainPosition() {
  const w = imgMeta.naturalW * cropScale.value
  const h = imgMeta.naturalH * cropScale.value
  const half = D / 2
  const minLeft = C/2 + half - w
  const maxLeft = C/2 - half
  const minTop  = C/2 + half - h
  const maxTop  = C/2 - half
  pos.left = Math.min(Math.max(pos.left, minLeft), maxLeft)
  pos.top  = Math.min(Math.max(pos.top,  minTop),  maxTop)
}
function onZoomChange(val) {
  const old = cropScale.value
  const next = Number(val)
  if (!imgMeta.ready) { cropScale.value = next; return }
  const cx = C/2, cy = C/2
  const relX = cx - pos.left, relY = cy - pos.top
  const ratio = next / old
  pos.left = cx - relX * ratio
  pos.top  = cy  - relY * ratio
  cropScale.value = next
  constrainPosition()
}
function resetCrop() {
  cropScale.value = 1
  centerImage()
}
function zoomToFit() {
  cropScale.value = fitScale.value
  centerImage()
}

/* Build a crop and store cropBlob */
async function buildCropBlob() {
  if (!cropSrc.value || !imgMeta.ready) return null
  const canvas = document.createElement('canvas')
  canvas.width = OUT; canvas.height = OUT
  const ctx = canvas.getContext('2d')
  const k = OUT / D
  const img = document.getElementById('ris-crop-img')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    img,
    pos.left * k,
    pos.top * k,
    imgMeta.naturalW * cropScale.value * k,
    imgMeta.naturalH * cropScale.value * k
  )
  const dataURL = canvas.toDataURL('image/png')
  cropBlob = await (await fetch(dataURL)).blob()
  return cropBlob
}

/* Helper: File/Blob -> dataURL for sessionStorage */
function readAsDataURL(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = reject
    fr.readAsDataURL(fileOrBlob)
  })
}

/* ✅ Submit reverse image search and ALWAYS go to /reverseimage */
async function submitReverseSearch() {
  if (submitting.value) return
  if (!selectedFile.value && !cropBlob) return
  submitting.value = true
  fileError.value = ''

  try {
    // prefer the crop if present or can be built; else original file
    let blobToSend = cropBlob
    if (!blobToSend && cropSrc.value) {
      blobToSend = await buildCropBlob()
    }
    const fileToSend = blobToSend
      ? new File([blobToSend], 'reverse-crop.png', { type: 'image/png' })
      : selectedFile.value

    const form = new FormData()
    form.append('photo', fileToSend) // <-- match backend field name

    // Call backend endpoint
    const { data } = await http.post('/search/reverseSearch', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })

    // Convert to Data URL for persistence
    const dataUrl = await readAsDataURL(fileToSend)

    // Save payload for ReverseImageView to consume
    sessionStorage.setItem('reverseImagePayload', JSON.stringify({
      images: [dataUrl],
      results: data || null
    }))

    // Close popup & reset
    showReversePopup.value = false
    removeFile()

    // Always go to Reverse Image results page
    router.push('/reverseimage')
    return
  } catch (err) {
    console.warn('Backend reverse-image failed, falling back to local route:', err?.message || err)
  }

  // Local fallback: still go to /reverseimage with the image only
  try {
    let dataUrl
    if (cropBlob) {
      dataUrl = await readAsDataURL(cropBlob)
    } else if (selectedFile.value) {
      dataUrl = await readAsDataURL(selectedFile.value)
    }
    if (dataUrl) {
      sessionStorage.setItem('reverseImagePayload', JSON.stringify({ images: [dataUrl] }))
      showReversePopup.value = false
      removeFile()
      router.push('/reverseimage')
    }
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

/* ✅ Direct logout: navigate to /login regardless of API result */
async function goLogoutPage() {
  try { http.post('/auth/logout').catch(() => {}) } catch (_) {}
  localStorage.removeItem('token')
  sessionStorage.removeItem('token')
  localUser.value = null
  router.push('/login')
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
/* (your styles unchanged) */
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

/* Reverse button (and shared style for Logout via .rev-btn) */
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
@media (min-width: 640px) {
  .welcome { display: inline; }
}

/* spacing tweak for logout; colors come from .rev-btn */
.logout { margin-left: 0.25rem; }

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

/* Extra controls */
.zoom-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
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

/* --- Reverse Image Search Cropper styles --- */
.ris-crop-wrap { margin-top: 6px; }
.ris-crop-area {
  position: relative;
  background: #1111;
  overflow: hidden;
  border-radius: 12px;
  touch-action: none;
  box-shadow: 0 8px 20px rgba(0,0,0,.08);
  margin: 0 auto;
}
.ris-crop-img {
  position: absolute;
  user-select: none;
  -webkit-user-drag: none;
  will-change: transform;
}
.ris-crop-mask {
  position: absolute;
  border-radius: 8px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.45), 0 0 0 2px rgba(255,255,255,.9);
  pointer-events: none;
}

/* Inputs */
.form-range { accent-color: var(--terra-500, #d4816f); }
</style>

<!-- Make teleported modal overlay sit above all content -->
<style>
.modal-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 9999 !important;
}
</style>
