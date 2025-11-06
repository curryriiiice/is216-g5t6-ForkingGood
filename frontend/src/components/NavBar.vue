<template>
  <nav class="navbar">
    <!-- Left: Brand + Image Search -->
    <div class="search-wrap">
      <RouterLink to="/dashboard" class="brand">
        <img src="/images/forkinggood-logo.png" alt="ForkingGood" class="brand-logo" />
      </RouterLink>
      <button
        v-if="!isMobile"
        type="button"
        class="rev-btn with-icon"
        @click="openReversePopup"
        aria-label="Reverse image search"
      >
        <img src="/images/Upload.png" alt="Photo" aria-hidden="true" class="btn-icon" />
        <span class="rev-text">Image Search</span>
      </button>

      <!-- Theme switch (button, no title) -->
      <button
        type="button"
        class="theme-btn"
        @click="cycleTheme"
        :aria-label="`Change theme (current: ${themeCuisine})`"
      >
        {{ themeCuisine }}
      </button>
    </div>

    <!-- Center links -->
    <div class="links">
      <RouterLink to="/dashboard" class="link">Home</RouterLink>
      <RouterLink to="/map" class="link">Map</RouterLink>
      <RouterLink to="/activity" class="link">Activity</RouterLink>
      <RouterLink to="/friends" class="link badge-wrap">
        Friends
        <span v-if="pendingRequestsCount > 0" class="badge">
          {{ pendingRequestsCount > 99 ? '99+' : pendingRequestsCount }}
        </span>
      </RouterLink>
    </div>

    <!-- Right side -->
    <div class="right">
      <span v-if="welcomeHandle" class="welcome">
        Welcome back {{ welcomeHandle }}
      </span>

      <!-- Avatar + menu -->
      <div class="avatar-menu-wrap" ref="avatarMenuRef">
        <button
          type="button"
          class="avatar-wrap"
          @click="toggleAvatarMenu"
          aria-haspopup="menu"
          :aria-expanded="showAvatarMenu ? 'true' : 'false'"
        >
          <div class="avatar-img">
            <img :src="avatarSrc" alt="avatar" @error="onAvatarError" />
          </div>
        </button>

        <!-- Small popup menu -->
        <div v-if="showAvatarMenu" class="avatar-menu" role="menu">
          <RouterLink
            to="/profile"
            class="avatar-menu-item"
            role="menuitem"
            @click="showAvatarMenu = false"
          >
            Edit profile
          </RouterLink>
          <button
            type="button"
            class="avatar-menu-item danger"
            role="menuitem"
            @click="goLogoutPage"
          >
            Log out
          </button>
        </div>
      </div>

      

      <!-- 🔥 Hamburger (mobile only) -->
      <button
        type="button"
        class="hamburger"
        @click="toggleMobileMenu"
        aria-label="Open menu"
        :aria-expanded="showMobileMenu ? 'true' : 'false'"
        aria-controls="mobile-menu"
      >
        <svg v-if="!showMobileMenu" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <svg v-else width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </nav>

  <!-- Reverse Image Search Modal -->
  <Teleport to="body">
    <Modal :show="showReversePopup" title="Reverse Image Search" @close="closeReversePopup">
      <div class="p-3">
        <p class="mb-2 rev-title">Upload a photo of your dish to find similar restaurants!</p>

        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="sr-only"
          style="display: none"
          @change="handleSingleFile"
        />

        <div class="file-row">
          <button type="button" class="pick-btn" @click="triggerPick">Choose File</button>

          <div v-if="selectedFile" class="file-chip">
            <span class="file-name" :title="selectedFile.name">{{ selectedFile.name }}</span>
            <button type="button" class="remove-file" @click="removeFile" aria-label="Remove file">×</button>
          </div>

          <div v-else class="no-file">No file chosen</div>
        </div>

        <div v-if="cropSrc" class="ris-crop-wrap">
          <div
            class="ris-crop-area"
            :class="{ dragging: dragging }"
            ref="areaRef"
            :style="{ width: C + 'px', height: C + 'px' }"
            @mousedown="onDragStart"
            @mousemove="onDragMove"
            @mouseup="onDragEnd"
            @mouseleave="onDragEnd"
            @touchstart="onDragStart"
            @touchmove="onDragMove"
            @touchend="onDragEnd"
            @wheel.prevent="onWheelZoom"
          >
            <img
              :src="cropSrc"
              id="ris-crop-img"
              class="ris-crop-img"
              :style="imgStyleRS"
              @load="onImgLoad"
              draggable="false"
              alt="Crop source"
            />
            <div
              class="ris-crop-mask"
              :style="{
                width: D + 'px',
                height: D + 'px',
                left: (C - D) / 2 + 'px',
                top: (C - D) / 2 + 'px',
              }"
            ></div>
          </div>

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
              <button type="button" class="zoom-btn" @click="zoomOutBtn" aria-label="Zoom out">−</button>
              <span class="zoom-readout" aria-live="polite">{{ Math.round(zoomFactor * 100) }}%</span>
              <button type="button" class="zoom-btn" @click="zoomInBtn" aria-label="Zoom in">+</button>
              <button type="button" class="zoom-btn reset" @click="resetCrop" aria-label="Reset crop">⟲</button>
            </div>
          </div>
        </div>

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

  <!-- 📱 Mobile Menu -->
  <Teleport to="body">
    <Transition name="mm-fade">
      <div
        v-if="showMobileMenu"
        id="mobile-menu"
        class="mm-overlay"
        @click.self="closeMobileMenu"
      >
        <div class="mm-panel" role="menu">
          <button type="button" class="mm-close" aria-label="Close menu" @click="closeMobileMenu">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <RouterLink to="/dashboard" class="mm-link" role="menuitem" @click="closeMobileMenu">Home</RouterLink>
          <RouterLink to="/map" class="mm-link" role="menuitem" @click="closeMobileMenu">Map</RouterLink>
          <RouterLink to="/activity" class="mm-link" role="menuitem" @click="closeMobileMenu">Activity</RouterLink>
          <RouterLink to="/friends" class="mm-link badge-wrap" role="menuitem" @click="closeMobileMenu">
            Friends
            <span v-if="pendingRequestsCount > 0" class="badge">
              {{ pendingRequestsCount > 99 ? '99+' : pendingRequestsCount }}
            </span>
          </RouterLink>

          <hr class="mm-sep" />

          <button
            type="button"
            class="rev-btn with-icon mm-rev"
            @click="() => { closeMobileMenu(); openReversePopup(); }"
          >
            <img src="/images/Upload.png" alt="" aria-hidden="true" class="btn-icon" />
            <span class="rev-text">Image Search</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, reactive } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createClient } from '@supabase/supabase-js'
import Modal from '@/components/Modal.vue'
import api from '@/lib/api'


const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)
const DEFAULT_NAV_AVATAR = '/images/default-avatar.jpg'

/* ------------------------- Props ------------------------- */
const props = defineProps({
  user: { type: Object, default: null },
  pendingRequestsCount: { type: Number, default: 0 },
  themeCuisine: { type: String, default: 'Taro' },
})

const emit = defineEmits(['change-theme'])

/* ------------------------- State ------------------------- */
const router = useRouter()
const localUser = ref(props.user)
const backendUsername = ref('')
const welcomeHandle = computed(() => {
  const be = backendUsername.value && String(backendUsername.value).trim()
  if (be) return be
  const u = localUser.value?.username || localUser.value?.first_name || ''
  if (!u) return ''
  return String(u).startsWith('@') ? u : '@' + u
})
const avatarErrored = ref(false)

/* Avatar menu */
const avatarMenuRef = ref(null)
const showAvatarMenu = ref(false)
function toggleAvatarMenu() {
  showAvatarMenu.value = !showAvatarMenu.value
}

function pickTheme(cuisine) {
  emit('change-theme', cuisine)
  showAvatarMenu.value = false
}

const themes = ['Taro', 'Matcha', 'Vanilla', 'Blueberry']
function cycleTheme() {
  const idx = themes.indexOf(props.themeCuisine)
  const next = themes[(idx + 1 + themes.length) % themes.length]
  pickTheme(next)
}

const isMobile = ref(false)
function updateIsMobile() {
  if (typeof window === 'undefined') return
  try {
    isMobile.value = window.matchMedia('(max-width: 767px)').matches
  } catch {
    isMobile.value = window.innerWidth < 768
  }
}
updateIsMobile()
if (typeof window !== 'undefined') {
  window.addEventListener('resize', updateIsMobile)
}
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateIsMobile)
  }
})

/* === Reverse Image Search (single file + cropper) === */
const showReversePopup = ref(false)
const fileInputRef = ref(null)
const areaRef = ref(null) // for wheel-zoom anchoring
const selectedFile = ref(null) // File | null
const previewUrl = ref('')
const fileError = ref('')
const submitting = ref(false)

/* Cropper state (square) */
const cropSrc = ref('') // object URL of selected image
const cropScale = ref(1) // zoom
const fitScale = ref(1) // scale to keep whole image inside D×D
const minZoom = computed(() => fitScale.value) // floor at fit-to-mask
const C = 420 // outer square
const D = 360 // inner mask square
const OUT = 640 // export size
const pos = reactive({ left: 0, top: 0 }) // image top-left in container coords
const dragging = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
const posStart = reactive({ left: 0, top: 0 })
const imgMeta = reactive({ naturalW: 0, naturalH: 0, ready: false })
let cropBlob = null

/* -------------------- Reverse helpers -------------------- */
const MAX_BYTES = 6 * 1024 * 1024
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]

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
  if (cropSrc.value) {
    try { URL.revokeObjectURL(cropSrc.value) } catch {}
    cropSrc.value = ''
  }
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function onImgLoad(e) {
  imgMeta.naturalW = e.target.naturalWidth
  imgMeta.naturalH = e.target.naturalHeight
  imgMeta.ready = true
  fitScale.value = Math.min(D / imgMeta.naturalW, D / imgMeta.naturalH)
  cropScale.value = fitScale.value
  nextTick(centerImage)
}

function centerImage() {
  const w = imgMeta.naturalW * cropScale.value
  const h = imgMeta.naturalH * cropScale.value
  pos.left = (C - w) / 2
  pos.top = (C - h) / 2
  constrainPosition()
}

function onDragStart(ev) {
  dragging.value = true
  const p = getPoint(ev)
  dragStart.x = p.x
  dragStart.y = p.y
  posStart.left = pos.left
  posStart.top = pos.top
  ev.preventDefault()
}
function onDragMove(ev) {
  if (!dragging.value) return
  const p = getPoint(ev)
  pos.left = posStart.left + (p.x - dragStart.x)
  pos.top = posStart.top + (p.y - dragStart.y)
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
  const maskLeft = C / 2 - half
  const maskRight = C / 2 + half
  const maskTop = C / 2 - half
  const maskBottom = C / 2 + half

  if (w <= D) { pos.left = C / 2 - w / 2 }
  else { pos.left = Math.min(Math.max(pos.left, maskRight - w), maskLeft) }

  if (h <= D) { pos.top = C / 2 - h / 2 }
  else { pos.top = Math.min(Math.max(pos.top, maskBottom - h), maskTop) }
}

/* Anchored Zoom */
function setZoom(nextScale, anchorX, anchorY) {
  nextScale = Math.max(minZoom.value, Math.min(3, Number(nextScale)))
  const old = cropScale.value
  if (!imgMeta.ready || nextScale === old) return

  const u = (anchorX - pos.left) / old
  const v = (anchorY - pos.top) / old

  cropScale.value = nextScale
  pos.left = anchorX - u * nextScale
  pos.top = anchorY - v * nextScale
  constrainPosition()
}
function onWheelZoom(e) {
  if (!imgMeta.ready || !areaRef.value) return
  const rect = areaRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const factor = 1 - Math.sign(e.deltaY) * 0.12
  setZoom(cropScale.value * factor, x, y)
}
function onZoomChange(val) {
  if (!imgMeta.ready) return
  const cx = C / 2, cy = C / 2
  setZoom(val, cx, cy)
}
function resetCrop() { cropScale.value = fitScale.value; centerImage() }
function zoomToFit() { cropScale.value = fitScale.value; centerImage() }

// Center-anchored zoom (match Rec Form behavior)
const zoomFactor = computed(() => (fitScale.value ? cropScale.value / fitScale.value : 1))
const baseW = computed(() => imgMeta.naturalW * fitScale.value)
const baseH = computed(() => imgMeta.naturalH * fitScale.value)
// Convert existing top-left positioning into center-anchored translate offsets
const offsetX = computed(() => pos.left - (C / 2 - (baseW.value * zoomFactor.value) / 2))
const offsetY = computed(() => pos.top - (C / 2 - (baseH.value * zoomFactor.value) / 2))
const imgStyleRS = computed(() => ({
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: baseW.value + 'px',
  height: baseH.value + 'px',
  transform: `translate(calc(-50% + ${offsetX.value}px), calc(-50% + ${offsetY.value}px)) scale(${zoomFactor.value})`,
  transformOrigin: 'center center',
  userSelect: 'none',
  pointerEvents: 'none',
}))

const ZSTEP = 0.15
function zoomInBtn() {
  const cx = C / 2, cy = C / 2
  setZoom(cropScale.value * (1 + ZSTEP), cx, cy)
}
function zoomOutBtn() {
  const cx = C / 2, cy = C / 2
  setZoom(cropScale.value * (1 - ZSTEP), cx, cy)
}

/* Build crop and store cropBlob */
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
    imgMeta.naturalH * cropScale.value * k,
  )
  const dataURL = canvas.toDataURL('image/png')
  cropBlob = await (await fetch(dataURL)).blob()
  return cropBlob
}

/* File/Blob -> dataURL for sessionStorage */
function readAsDataURL(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = reject
    fr.readAsDataURL(fileOrBlob)
  })
}

/* Submit reverse image search and go to /reverseimage */
async function submitReverseSearch() {
  if (submitting.value) return
  if (!selectedFile.value && !cropBlob) return
  submitting.value = true
  fileError.value = ''

  try {
    let blobToSend = cropBlob
    if (!blobToSend && cropSrc.value) blobToSend = await buildCropBlob()
    const fileToSend = blobToSend
      ? new File([blobToSend], 'reverse-crop.png', { type: 'image/png' })
      : selectedFile.value

    const dataUrl = await readAsDataURL(fileToSend)
    // Save only the image; the Reverse Image page will show a loader and call the API
    sessionStorage.setItem('reverseImagePayload', JSON.stringify({ images: [dataUrl] }))
    showReversePopup.value = false
    removeFile()
    router.push('/reverseimage')
    return
  } catch (err) {
    console.warn('Reverse-image request failed, falling back to local route:', err?.message || err)
  }

  try {
    let dataUrl
    if (cropBlob) dataUrl = await readAsDataURL(cropBlob)
    else if (selectedFile.value) dataUrl = await readAsDataURL(selectedFile.value)
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

/* Avatar menu actions */
async function goLogoutPage() {
  showAvatarMenu.value = false
  try {
    await supabase.auth.signOut()
  } catch (e) {
    console.warn('Supabase signOut failed (continuing):', e)
  }
  try {
    localStorage.removeItem('token')
    sessionStorage.removeItem('token')
    localStorage.removeItem('sb-access-token')
    sessionStorage.removeItem('sb-access-token')
  } catch (_) {}
  localUser.value = null
  try {
    await router.replace('/')
  } catch (_) {}
  // Avoid hard refresh; rely on SPA navigation
}

function closeReversePopup() {
  showReversePopup.value = false
  removeFile()
}

/* Keep user in sync with prop */
watch(() => props.user, (u) => { if (u) localUser.value = u }, { immediate: true })
watch(
  () => localUser.value?.avatar_url,
  () => { avatarErrored.value = false },
)

function resolveAvatarUrl(raw) {
  if (!raw || avatarErrored.value) return null
  let s = String(raw).trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s
  s = s.replace(/^supabase:\/\//, '')
  if (s.startsWith('/')) {
    if (api.defaults.baseURL) return `${api.defaults.baseURL}${s}`
    return s
  }
  if (api.defaults.baseURL) return `${api.defaults.baseURL}/${s.replace(/^\/+/, '')}`
  return `/${s.replace(/^\/+/, '')}`
}

const resolvedAvatarUrl = computed(() => resolveAvatarUrl(localUser.value?.avatar_url))
const avatarSrc = computed(() => {
  if (avatarErrored.value) return DEFAULT_NAV_AVATAR
  return resolvedAvatarUrl.value || DEFAULT_NAV_AVATAR
})

function onAvatarError() {
  if (!avatarErrored.value) {
    avatarErrored.value = true
  }
}

/* Initials */
const initials = computed(() => {
  const u = localUser.value
  if (!u) return 'U'
  if (u.first_name && u.last_name) return (u.first_name[0] + u.last_name[0]).toUpperCase()
  if (u.username) return u.username.slice(0, 2).toUpperCase()
  if (u.email) return u.email.slice(0, 2).toUpperCase()
  return 'U'
})

/* ------------------------- Mobile menu ------------------------- */
const showMobileMenu = ref(false)
function toggleMobileMenu() {
  showMobileMenu.value = !showMobileMenu.value
  toggleBodyScroll(showMobileMenu.value)
}
function closeMobileMenu() {
  showMobileMenu.value = false
  toggleBodyScroll(false)
}
function onEscClose(ev) {
  if (ev.key === 'Escape') {
    if (showMobileMenu.value) closeMobileMenu()
    if (showAvatarMenu.value) showAvatarMenu.value = false
  }
}
function toggleBodyScroll(lock) {
  try { document.documentElement.style.overflow = lock ? 'hidden' : '' } catch {}
}

/* Click-outside handler (avatar only) */
function handleOutsideClick(ev) {
  if (avatarMenuRef.value && !avatarMenuRef.value.contains(ev.target)) {
    showAvatarMenu.value = false
  }
}

function handleResize() {
  if (window.innerWidth >= 768) {
    closeMobileMenu()
  }
}

const listenersBound = ref(false)

function bindInteractionListeners() {
  if (listenersBound.value) return
  document.addEventListener('mousedown', handleOutsideClick)
  document.addEventListener('keydown', onEscClose)
  window.addEventListener('resize', handleResize)
  listenersBound.value = true
  handleResize()
}

function unbindInteractionListeners() {
  if (!listenersBound.value) return
  document.removeEventListener('mousedown', handleOutsideClick)
  document.removeEventListener('keydown', onEscClose)
  window.removeEventListener('resize', handleResize)
  listenersBound.value = false
  toggleBodyScroll(false)
}

function ensureFreshListeners() {
  unbindInteractionListeners()
  bindInteractionListeners()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    ensureFreshListeners()
    closeMobileMenu()
    showAvatarMenu.value = false
    showReversePopup.value = false
  } else {
    unbindInteractionListeners()
    closeMobileMenu()
    showAvatarMenu.value = false
    showReversePopup.value = false
  }
}

function handleWindowFocus() {
  ensureFreshListeners()
  closeMobileMenu()
  showAvatarMenu.value = false
  showReversePopup.value = false
}

function handleWindowBlur() {
  unbindInteractionListeners()
  // Ensure overlays are closed when tab loses focus
  closeMobileMenu()
  showAvatarMenu.value = false
  showReversePopup.value = false
}

function handlePageShow() {
  ensureFreshListeners()
}

function handlePageHide() {
  unbindInteractionListeners()
  closeMobileMenu()
  showAvatarMenu.value = false
  showReversePopup.value = false
}

watch(
  () => router.currentRoute.value.fullPath,
  () => {
    closeMobileMenu()
    showAvatarMenu.value = false
    ensureFreshListeners()
  },
)

/* Lifecycle */
onMounted(async () => {
  updateIsMobile()
  bindInteractionListeners()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('blur', handleWindowBlur)
  window.addEventListener('pageshow', handlePageShow)
  window.addEventListener('pagehide', handlePageHide)

  // Load current Supabase user and profile
  try {
    const { data } = await supabase.auth.getUser()
    const user = data?.user || null
    if (user) {
      let profile = null
      try {
        const { data: row } = await supabase
          .from('users')
          .select('username, first_name, last_name, user_email, profile_image_url')
          .eq('uid', user.id)
          .maybeSingle()
        profile = row || null
      } catch (_) {}

      localUser.value = {
        username: profile?.username ?? user.user_metadata?.username ?? null,
        first_name: profile?.first_name ?? user.user_metadata?.first_name ?? null,
        last_name: profile?.last_name ?? user.user_metadata?.last_name ?? null,
        email: profile?.user_email ?? user.email ?? null,
        avatar_url: profile?.profile_image_url ?? user.user_metadata?.avatar_url ?? null,
      }
      // Ensure avatar from backend if missing
      try {
        if (!localUser.value?.avatar_url && localUser.value?.email) {
          const r = await api.post('/user/getPfpByEmail', { user_email: localUser.value.email })
          const url = r?.data?.data
          if (url) localUser.value.avatar_url = url
        }
        if (localUser.value?.email) {
          try {
            const r2 = await api.post('/user/getUsernamebyEmail', { user_email: localUser.value.email })
            backendUsername.value = r2?.data?.data || ''
          } catch (_) { backendUsername.value = '' }
        }
      } catch {}
    } else if (props.user) {
      localUser.value = props.user
    } else {
      localUser.value = null
    }
  } catch (e) {
    console.error('Failed to load navbar user (Supabase):', e)
  }

  // Keep navbar in sync with auth changes
  supabase.auth.onAuthStateChange(async (_event, session) => {
    const user = session?.user || null
    if (!user) {
      localUser.value = null
      return
    }
    try {
      const { data: row } = await supabase
        .from('users')
        .select('username, first_name, last_name, user_email, profile_image_url')
        .eq('uid', user.id)
        .maybeSingle()
      localUser.value = {
        username: row?.username ?? user.user_metadata?.username ?? null,
        first_name: row?.first_name ?? user.user_metadata?.first_name ?? null,
        last_name: row?.last_name ?? user.user_metadata?.last_name ?? null,
        email: row?.user_email ?? user.email ?? null,
        avatar_url: row?.profile_image_url ?? user.user_metadata?.avatar_url ?? null,
      }
      try {
        if (!localUser.value?.avatar_url && localUser.value?.email) {
          const r = await api.post('/user/getPfpByEmail', { user_email: localUser.value.email })
          const url = r?.data?.data
          if (url) localUser.value.avatar_url = url
        }
        if (localUser.value?.email) {
          try {
            const r2 = await api.post('/user/getUsernamebyEmail', { user_email: localUser.value.email })
            backendUsername.value = r2?.data?.data || ''
          } catch (_) { backendUsername.value = '' }
        }
      } catch {}
    } catch (_) {
      localUser.value = {
        username: user.user_metadata?.username ?? null,
        first_name: user.user_metadata?.first_name ?? null,
        last_name: user.user_metadata?.last_name ?? null,
        email: user.email ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
      }
      try {
        if (!localUser.value?.avatar_url && localUser.value?.email) {
          const r = await api.post('/user/getPfpByEmail', { user_email: localUser.value.email })
          const url = r?.data?.data
          if (url) localUser.value.avatar_url = url
        }
        if (localUser.value?.email) {
          try {
            const r2 = await api.post('/user/getUsernamebyEmail', { user_email: localUser.value.email })
            backendUsername.value = r2?.data?.data || ''
          } catch (_) { backendUsername.value = '' }
        }
      } catch {}
    }
  })
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('blur', handleWindowBlur)
  window.removeEventListener('pageshow', handlePageShow)
  window.removeEventListener('pagehide', handlePageHide)
  unbindInteractionListeners()
  toggleBodyScroll(false)
})
</script>

<style scoped>
.navbar {
  position: sticky;
  top: 0;
  /* Elevated above any lingering overlays to keep nav clickable */
  z-index: 11000;
  background: #fff;

  /* Grid keeps center perfectly centered */
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;

  gap: 1rem;
  padding: 0.75rem 2.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* Left: Image Search */
.search-wrap {
  grid-column: 1;
  justify-self: start;
  display: flex;
  align-items: center;
  background: transparent;
  border-radius: 0;
  padding: 0;
  width: auto;
  max-width: 100%;
}

/* Brand (leftmost) */
.brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; margin-right: 10px; }
.brand-logo { width: 36px; height: 36px; display: block; }
@media (min-width: 768px) { .brand-logo { width: 44px; height: 44px; } }
/* brand-text removed (logo-only) */

/* Center links (hidden on small) */
.links {
  grid-column: 2;
  display: none;
  justify-content: center;
  align-items: center;
  gap: 2rem;
}
@media (min-width: 768px) { .links { display: flex; } }
.link {
  color: #374151;
  font-weight: 700;
  font-size: 1.1rem;
  text-decoration: none;
}
.link:hover { color: #eebbc3; }
.badge-wrap { position: relative; }
.badge {
  position: absolute;
  top: -8px; right: -16px;
  background: #ef4444; color: #fff;
  font-size: 0.75rem; font-weight: 700;
  border-radius: 999px; padding: 0.1rem 0.4rem;
  min-width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
  border: 2px solid #fff;
}

/* Right section */
.right {
  grid-column: 3;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
/* .bell styles removed along with icon */

/* Avatar + menu */
.avatar-menu-wrap { position: relative; }
.avatar-wrap { display: flex; align-items: center; background: transparent; border: none; padding: 0; cursor: pointer; }
.avatar-img { width: 36px; height: 36px; border-radius: 999px; overflow: hidden; }
.avatar-img img { width: 100%; height: 100%; object-fit: cover; }
.avatar-fallback {
  width: 36px; height: 36px; border-radius: 999px;
  background: #e5e7eb; display: grid; place-items: center;
  font-weight: 700; color: #111827;
}
.avatar-menu {
  position: absolute; right: 0; top: calc(100% + 8px);
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08); min-width: 160px; z-index: 60; padding: 6px;
}
.avatar-menu-item {
  display: block; width: 100%; text-align: left;
  background: transparent; border: none; padding: 8px 10px;
  border-radius: 8px; color: #374151; font-weight: 700; cursor: pointer; text-decoration: none;
}
.avatar-menu-item:hover { background: #f3f4f6; }
.avatar-menu-item.danger { color: #b91c1c; }

/* Inline theme chips (replaced by dropdown) */
.nav-theme { display: none; gap: 6px; align-items: center; margin: 0 10px; }
.nav-theme .chip { appearance: none; border: 1px solid #e5e7eb; background: #fff; color: #374151; font-weight: 700; font-size: 11px; padding: 6px 10px; border-radius: 999px; cursor: pointer; }
.nav-theme .chip.active { background: var(--sage-600, #8b9d83); color: #fff; border-color: var(--sage-600, #8b9d83); }
@media (min-width: 768px) { .nav-theme { display: inline-flex; } }

/* Theme picker inside avatar menu */
.avatar-menu-section { border-top: 1px solid #e5e7eb; margin: 6px 0 0; padding: 8px 4px 4px; }
.avatar-menu-section .menu-label { font-size: 11px; font-weight: 800; color: #6b7280; margin: 0 0 6px 4px; text-transform: uppercase; letter-spacing: .03em; }
.theme-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.theme-chips .chip { appearance: none; border: 1px solid #e5e7eb; background: #fff; color: #374151; font-weight: 700; font-size: 11px; padding: 6px 10px; border-radius: 999px; cursor: pointer; }
.theme-chips .chip.active { background: var(--sage-600, #8b9d83); color: #fff; border-color: var(--sage-600, #8b9d83); }

.welcome { display: none; color: #374151; }
@media (min-width: 640px) { .welcome { display: inline; } }

/* Reverse Image button */
.rev-btn {
  margin-left: 0.5rem;
  white-space: nowrap;
  background: var(--terra-500, #d4816f);
  color: #fff; border: none; border-radius: 10px;
  padding: 0.45rem 0.8rem; font-weight: 700; cursor: pointer;
  transition: filter 0.15s ease, transform 0.05s ease;
}
.rev-btn:hover { filter: brightness(1.03); }
.rev-btn:active { transform: translateY(1px); }

/* Theme switch button */
.theme-btn {
  margin-left: 0.5rem;
  white-space: nowrap;
  background: #ffffff;
  color: #374151;
  border: 1.5px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.45rem 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.05s ease, background-color 0.15s ease;
}
.theme-btn:hover {
  background: #f9fafb;
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--sage-600, #8b9d83) 25%, transparent);
}
.theme-btn:active { transform: translateY(1px); }

/* Reverse modal bits */
.rev-title { font-weight: 600; color: var(--charcoal, #2c3333); }
.file-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
.pick-btn { background: #fff; border: 1.5px solid #e5e7eb; color: #374151; border-radius: 10px; padding: 0.45rem 0.8rem; font-weight: 700; cursor: pointer; }
.file-chip { display: inline-flex; align-items: center; gap: 0.5rem; background: #f3f4f6; border-radius: 999px; padding: 0.35rem 0.6rem; max-width: 420px; }
.file-name { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.remove-file { background: transparent; border: none; color: #6b7280; font-size: 1rem; cursor: pointer; }
.no-file { color: #6b7280; }
.zoom-actions { display: flex; gap: 8px; margin-top: 8px; align-items: center; justify-content: center; }
.zoom-readout {
  min-width: 52px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-weight: 800;
  color: #374151;
}
.zoom-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 2px solid var(--line-200, #e5e7eb);
  background: #fff;
  font-weight: 900;
  font-size: 18px;
  cursor: pointer;
}
.zoom-btn:disabled { opacity: 0.5; cursor: not-allowed; }
:root[data-theme='dark'] .zoom-btn { background: #0e141b; color: #e9eef6; border-color: #2a3a52; }
.zoom-btn.reset { font-size: 16px; }
.rev-error { color: #ef4444; font-weight: 600; margin: 6px 0 0; }
.rev-actions { display: flex; justify-content: flex-end; }
.rev-submit {
  background: var(--terra-500, #d4816f);
  color: #fff; border: none; border-radius: 10px;
  padding: 0.55rem 0.95rem; font-weight: 800; cursor: pointer;
}
.rev-submit[disabled] { opacity: 0.6; cursor: not-allowed; }

/* Cropper */
.ris-crop-wrap { margin-top: 6px; }
.ris-crop-area { position: relative; background: #faf9f6; overflow: hidden; border-radius: 12px; touch-action: none; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08); margin: 0 auto; border: 2px dashed rgba(139,157,131,0.55); transition: border-width 0.12s ease, border-color 0.12s ease; }
.ris-crop-area.dragging { border-width: 3px; border-color: rgba(139,157,131,0.85); }
.ris-crop-img { position: absolute; user-select: none; -webkit-user-drag: none; will-change: transform; max-width: none; max-height: none; }
.ris-crop-mask {
  position: absolute; border-radius: 10px;
 
  background: transparent;
  pointer-events: none;
}
.form-range { accent-color: var(--terra-500, #d4816f); }

/* Mobile: hamburger + panel */
.hamburger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px;
  border: 1px solid #e5e7eb; border-radius: 10px;
  background: #fff; cursor: pointer;
}
.hamburger:hover { background: #f9fafb; }
@media (min-width: 768px) { .hamburger { display: none; } }

.mm-overlay {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(17, 24, 39, 0.45);
  backdrop-filter: blur(2px);
}
.mm-panel {
  position: relative;
  width: 100%;
  background: #ffffff;
  border-bottom-left-radius: 14px; border-bottom-right-radius: 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.15);
  padding: 46px 18px 18px;
}
.mm-close {
  position: absolute;
  top: 10px;
  right: 12px;
  border: none;
  background: transparent;
  padding: 6px;
  border-radius: 50%;
  cursor: pointer;
  color: #111827;
}
.mm-close:hover {
  background: #f3f4f6;
}
.mm-link {
  display: block; padding: 12px 8px; margin: 2px 0;
  color: #111827; text-decoration: none; font-weight: 700; border-radius: 10px;
}
.mm-link:hover { background: #f3f4f6; }
.mm-sep { border: 0; border-top: 1px solid #e5e7eb; margin: 10px 0; }
.mm-rev { width: 100%; justify-content: center; }
.mm-fade-enter-active, .mm-fade-leave-active { transition: opacity .16s ease; }
.mm-fade-enter-from, .mm-fade-leave-to { opacity: 0; }
</style>

<style scoped>
/* Icon in the Image Search button */
.rev-btn.with-icon { display: inline-flex; align-items: center; gap: 0.4rem; }
.rev-btn .btn-icon {
  width: 18px;
  height: 18px;
  display: block;
  /* force white icon regardless of source image color */
  filter: brightness(0) invert(1);
}
.rev-btn .rev-text { color: #fff; }

/* Theme dropdown */
.nav-theme { display: none; gap: 8px; align-items: center; margin: 0 10px; }
.nav-theme-label { font-size: 12px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: .03em; }
.nav-theme-select { appearance: none; border: 1.5px solid #e5e7eb; background: #fff; color: #374151; font-weight: 700; font-size: 12px; padding: 6px 10px; border-radius: 10px; cursor: pointer; }
.nav-theme-select:focus { outline: none; border-color: var(--sage-600, #8b9d83); box-shadow: 0 0 0 3px color-mix(in oklab, var(--sage-600, #8b9d83) 35%, transparent); }
@media (min-width: 768px) { .nav-theme { display: inline-flex; } }

</style>
