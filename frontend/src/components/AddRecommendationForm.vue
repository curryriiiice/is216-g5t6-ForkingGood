<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import api from '@/lib/api'
import { useAuthUser } from '@/lib/useAuthUser'

const { user: authUser, refresh: refreshAuthUser } = useAuthUser()
const activeEmail = computed(() => authUser.value?.email ?? null)

const props = defineProps({
  postToEdit: { type: Object, default: null }
})
const emit = defineEmits(['added', 'edited'])

const isEditMode = computed(() => !!props.postToEdit)

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
const photoUrl = ref('') // dataURL for submit
const photos = ref([]) // array of dataURLs (we keep your original)
const originalPhotos = ref([]) // raw originals (as selected)
const initialCrops = ref([])   // first auto-cropped 3:2 versions to allow revert
const cropStates = ref([]) // per-index { zoom, x, y } for restoring edits
// --- Cropper state ---
// Target fixed output size (3:2 landscape)
const CROP_W = 1200; // px
const CROP_H = 800;  // px
// Preview box dimensions used by the in-app cropper (3:2)
const PREV_W = 540;
const PREV_H = 360;
const cropOpen = ref(false);
const cropIndex = ref(-1);
const cropSrc = ref('');
const cropZoom = ref(1);        // 1..5
const cropX = ref(0);           // drag offsets (px)
const cropY = ref(0);
const cropDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const imgNatural = ref({ w: 0, h: 0 });

// Zoom controls
const ZOOM_MIN = 1
const ZOOM_MAX = 5
const ZOOM_STEP = 0.15
function zoomBy(delta) {
  const next = +(cropZoom.value + delta).toFixed(2)
  cropZoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
}
function zoomIn() { zoomBy(ZOOM_STEP) }
function zoomOut() { zoomBy(-ZOOM_STEP) }

// Live preview sizing to match confirmCrop math (contain into PREV_W x PREV_H, then apply zoom + offsets)
const baseScale = computed(() => {
  const w = imgNatural.value.w || 1
  const h = imgNatural.value.h || 1
  return Math.max(PREV_W / w, PREV_H / h)
})
const displayW = computed(() => (imgNatural.value.w || 0) * baseScale.value * cropZoom.value)
const displayH = computed(() => (imgNatural.value.h || 0) * baseScale.value * cropZoom.value)
// Base size before zoom (fit/contain to preview); scale is applied via CSS transform
const baseW = computed(() => (imgNatural.value.w || 0) * baseScale.value)
const baseH = computed(() => (imgNatural.value.h || 0) * baseScale.value)
const imgStyle = computed(() => ({
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: baseW.value + 'px',
  height: baseH.value + 'px',
  transform: `translate(calc(-50% + ${cropX.value}px), calc(-50% + ${cropY.value}px)) scale(${cropZoom.value})`,
  transformOrigin: 'center center',
  userSelect: 'none',
  pointerEvents: 'none',
}))

function resetCrop() {
  cropZoom.value = 1
  cropX.value = 0
  cropY.value = 0
}

function openCropper(i) {
  // Always use the original so you can zoom back out beyond prior crop
  const src = originalPhotos.value?.[i] || photos.value?.[i]
  if (!src) return
  cropIndex.value = i
  cropSrc.value = src
  const st = cropStates.value?.[i] || { zoom: 1, x: 0, y: 0 }
  cropZoom.value = st.zoom ?? 1
  cropX.value = st.x ?? 0
  cropY.value = st.y ?? 0
  cropOpen.value = true
}
function revertPhotoAt(i) {
  const init = initialCrops.value?.[i]
  if (!init) return
  const arr = [...photos.value]
  arr[i] = init
  photos.value = arr
  if (i === 0) photoUrl.value = init
  try {
    const cs = Array.isArray(cropStates.value) ? [...cropStates.value] : []
    cs[i] = { zoom: 1, x: 0, y: 0 }
    cropStates.value = cs
  } catch {}
}
function revertCurrentSlide() {
  revertPhotoAt(currentSlide.value)
}
function onCropImgLoad(e) {
  const img = e.target
  imgNatural.value = { w: img.naturalWidth, h: img.naturalHeight }
  // Do NOT reset cropX/cropY here; we restore from saved cropStates in openCropper()
}
function onCropWheel(e) {
  e.preventDefault()
  const direction = e.deltaY > 0 ? -1 : 1 // wheel up => zoom in
  zoomBy(direction * ZOOM_STEP)
}
function startDrag(e) {
  if (cropZoom.value <= 1) return // only drag when zoomed-in
  cropDragging.value = true;
  const p = ('touches' in e) ? e.touches[0] : e;
  dragStart.value = { x: p.clientX - cropX.value, y: p.clientY - cropY.value };
}
function onDrag(e) {
  if (!cropDragging.value) return;
  const p = ('touches' in e) ? e.touches[0] : e;
  cropX.value = p.clientX - dragStart.value.x;
  cropY.value = p.clientY - dragStart.value.y;
}
function endDrag() { cropDragging.value = false; }
function cancelCrop() {
  cropOpen.value = false;
  cropIndex.value = -1;
  cropSrc.value = '';
}
function confirmCrop() {
  const canvas = document.createElement('canvas')
  canvas.width = CROP_W
  canvas.height = CROP_H
  const ctx = canvas.getContext('2d')

  const img = new Image()
  img.onload = () => {
    const scaleBase = Math.max(PREV_W / img.width, PREV_H / img.height)
    const displayW = img.width * scaleBase * cropZoom.value
    const displayH = img.height * scaleBase * cropZoom.value

    const scaleToCanvasX = CROP_W / PREV_W
    const scaleToCanvasY = CROP_H / PREV_H

    const drawX = (PREV_W / 2 - displayW / 2 + cropX.value) * scaleToCanvasX
    const drawY = (PREV_H / 2 - displayH / 2 + cropY.value) * scaleToCanvasY

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, CROP_W, CROP_H)
    ctx.drawImage(img, drawX, drawY, displayW * scaleToCanvasX, displayH * scaleToCanvasY)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    if (cropIndex.value >= 0) {
      const arr = [...photos.value]
      arr[cropIndex.value] = dataUrl
      photos.value = arr
      if (cropIndex.value === 0) photoUrl.value = dataUrl
    }
    // Persist crop params on Apply
    if (cropIndex.value >= 0) {
      const cs = Array.isArray(cropStates.value) ? [...cropStates.value] : []
      cs[cropIndex.value] = { zoom: cropZoom.value, x: cropX.value, y: cropY.value }
      cropStates.value = cs
    }
    cancelCrop()
  }
  img.crossOrigin = 'anonymous'
  img.src = cropSrc.value
}
const priceRange = ref(null) // '$' | '$$' | '$$$' | '$$$$'
const visibility = ref('friends')
const friendsOnly = computed(() => visibility.value === 'friends')
function setFriends() { visibility.value = 'friends' }
function setPublic() { visibility.value = 'everyone' }
const isDragging = ref(false)
const MAX_PHOTOS = 6
// --- Simple carousel state ---
const currentSlide = ref(0)
const totalSlides = computed(() => (Array.isArray(photos.value) ? photos.value.length : 0))
function nextSlide() {
  if (!totalSlides.value) return
  currentSlide.value = (currentSlide.value + 1) % totalSlides.value
}
function prevSlide() {
  if (!totalSlides.value) return
  currentSlide.value = (currentSlide.value - 1 + totalSlides.value) % totalSlides.value
}
watch(photos, () => {
  if (currentSlide.value >= (photos.value?.length || 0)) currentSlide.value = 0
})

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
function hideNameList() {
  namePreds.value = []
}
function hideAddrList() {
  addrPreds.value = []
}

function onNameBlur() {
  window.setTimeout(hideNameList, 120)
}
function onAddrBlur() {
  window.setTimeout(hideAddrList, 120)
}

function onDocClick(e) {
  const nw = nameWrap.value
  const aw = addrWrap.value
  if (nw && !nw.contains(e.target)) hideNameList()
  if (aw && !aw.contains(e.target)) hideAddrList()
  const cw = cuisineWrap?.value
  if (cw && !cw.contains(e.target)) hideCuisineList()
}

function onEscKey(e) {
  if (e.key === 'Escape') {
    hideNameList()
    hideAddrList()
  }
}

/** Cuisine suggestions (with free-typing + spell check) */
const cuisineOptions = [
  'Chinese',
  'Malay',
  'Indian',
  'Peranakan',
  'Thai',
  'Japanese',
  'Korean',
  'Italian',
  'French',
  'Spanish',
  'Mexican',
  'Vietnamese',
  'Indonesian',
  'Turkish',
  'Middle Eastern',
  'Mediterranean',
  'American',
  'Burgers',
  'BBQ',
  'Seafood',
  'Vegetarian',
  'Vegan',
  'Halal',
  'Bakery',
  'Cafe',
  'Dim Sum',
  'Noodles',
  'Sushi',
  'Ramen',
  'Hotpot',
  'Steakhouse',
  'Pizza',
  'Pasta',
  'Desserts',
  'Bubble Tea',
  'Hawker',
  'Teochew',
  'Cantonese',
  'Hainanese',
  'Sichuan',
  'Malay-Indo',
  'Western',
]
const cuisinePreds = ref([])
const cuisineHint = ref('')
const cuisineWrap = ref(null)

function hideCuisineList() {
  cuisinePreds.value = []
}
function onCuisineBlur() {
  window.setTimeout(hideCuisineList, 120)
}

function filterCuisineOptions(query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []
  const starts = [],
    contains = []
  for (const opt of cuisineOptions) {
    const o = opt.toLowerCase()
    if (o.startsWith(q)) starts.push(opt)
    else if (o.includes(q)) contains.push(opt)
  }
  return [...starts, ...contains].slice(0, 8)
}

// Simple Levenshtein distance for spell checking
function levenshtein(a = '', b = '') {
  a = a.toLowerCase()
  b = b.toLowerCase()
  const m = a.length,
    n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = temp
    }
  }
  return dp[n]
}

function bestCuisineSuggestion(q) {
  const query = (q || '').trim()
  if (!query) return ''
  let best = '',
    bestDist = Infinity
  for (const opt of cuisineOptions) {
    const d = levenshtein(query, opt)
    if (d < bestDist) {
      bestDist = d
      best = opt
    }
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

/** Stars (supports half selection) */
const stars = [1, 2, 3, 4, 5]
function setRating(n) {
  rating.value = clampRating(n)
}

/* helper: how much of each star should be filled */
function getFill(i) {
  const val = Number(rating.value) - (i - 1)
  return Math.max(0, Math.min(1, val))
}
function setHalf(i) {
  setRating(i - 0.5)
} // click left half
function setFull(i) {
  setRating(i)
} // click right half

// keyboard arrows adjust by 0.5
function onStarsKeydown(e) {
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    setRating(Math.max(1, (rating.value || 1) - 0.5))
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    setRating(Math.min(5, (rating.value || 1) + 0.5))
  }
}

/* live feedback for screen readers */
const ratingLive = ref('')
watch(rating, (r) => {
  ratingLive.value = `${r} out of 5 stars selected`
})

/** Numeric rating input (typed control) */
if (!rating.value) rating.value = 3 // default to 3 stars

const ratingInput = ref(rating.value)
const ratingErr = ref('')

watch(rating, (r) => {
  // keep typed field in sync
  ratingInput.value = r
})

function onRatingTextBlur() {
  setRatingFromInput(ratingInput.value)
}
function onRatingTextInput() {
  // update stars as the user types, but don't overwrite the input yet
  setRatingFromInput(ratingInput.value, { soft: true })
}

function setRatingFromInput(val, { soft = false } = {}) {
  const n = Number(val)
  if (Number.isNaN(n)) {
    ratingErr.value = 'Enter a number from 1 to 5 (0.5 steps).'
    return
  }
  const clamped = clampRating(n) // snaps to nearest 0.5 and bounds 1..5

  // always update the actual rating so the stars move immediately
  rating.value = clamped

  // only push the normalized value back to the text field when we're done typing
  if (!soft) {
    ratingInput.value = clamped
  }

  ratingErr.value =
    clamped < 1 || clamped > 5 ? 'Rating must be between 1 and 5.' : ''
}

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
  if (!input) {
    namePreds.value = []
    return
  }
  acService.getPlacePredictions(
    {
      input,
      componentRestrictions: { country: 'sg' },
      types: ['establishment'],
    },
    (preds) => {
      namePreds.value = preds || []
    },
  )
}

function onAddrInput() {
  const input = (address.value || '').trim()
  if (!input) {
    addrPreds.value = []
    return
  }
  acService.getPlacePredictions(
    {
      input,
      componentRestrictions: { country: 'sg' },
      types: ['address'],
    },
    (preds) => {
      addrPreds.value = preds || []
    },
  )
}

function pickPrediction(pred, fillName = true) {
  if (!pred?.place_id) return
  placesSvc.getDetails(
    { placeId: pred.place_id, fields: ['place_id', 'name', 'formatted_address', 'geometry'] },
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
    },
  )
}

function clampRating(num) {
  if (Number.isNaN(num)) return 1
  return Math.min(5, Math.max(1, Math.round(num * 2) / 2))
}

// Auto-crop any image to 3:2 (center-cover) and export at CROP_W x CROP_H
function cropToAspect(dataURL, W = CROP_W, H = CROP_H) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      const scale = Math.max(W / img.width, H / img.height)
      const drawW = img.width * scale
      const drawH = img.height * scale
      const dx = (W - drawW) / 2
      const dy = (H - drawH) / 2
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, W, H)
      ctx.drawImage(img, dx, dy, drawW, drawH)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.crossOrigin = 'anonymous'
    img.src = dataURL
  })
}

/** ---------- File / Preview helpers ---------- */
function openFilePicker() {
  fileInputEl.value?.click()
}

function handleChosenFiles(fileList) {
  const list = Array.from(fileList || []).filter((f) => f && f.type && f.type.startsWith('image/'))
  if (!list.length) return

  // Ensure we don't exceed MAX_PHOTOS
  const remaining = Math.max(0, MAX_PHOTOS - photos.value.length)
  const toAdd = list.slice(0, remaining)

  // Read each file as DataURL and append to photos
  toAdd.forEach((file, idx) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const raw = String(reader.result || '')
      const cropped = await cropToAspect(raw)
      if (idx === 0 && photos.value.length === 0) photoUrl.value = cropped
      originalPhotos.value = [...originalPhotos.value, raw]
      initialCrops.value = [...initialCrops.value, cropped]
      photos.value = [...photos.value, cropped]
      cropStates.value = [...cropStates.value, { zoom: 1, x: 0, y: 0 }]
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
function onDragOver(e) {
  e.preventDefault()
  isDragging.value = true
}
function onDragLeave() {
  isDragging.value = false
}

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
    try {
      const o = Array.isArray(originalPhotos.value) ? [...originalPhotos.value] : []
      const ic = Array.isArray(initialCrops.value) ? [...initialCrops.value] : []
      o.splice(idx, 1)
      ic.splice(idx, 1)
      originalPhotos.value = o
      initialCrops.value = ic
    } catch {}
    try {
      const cs = Array.isArray(cropStates.value) ? [...cropStates.value] : []
      cs.splice(idx, 1)
      cropStates.value = cs
    } catch {}
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

// Normalize cuisine to start with a capital letter
function capitalizeFirst(str = '') {
  const t = String(str || '').trim()
  if (!t) return ''
  return t.charAt(0).toUpperCase() + t.slice(1)
}


// --- NEW: Helper to fetch image URL and convert to Data URL ---
// This is necessary to load existing server images into the cropper
async function urlToDataUrl(url) {
  if (!url) return null;
  // If it's already a data URL, return it
  if (String(url).startsWith('data:')) return url;
  
  // This requires the image server to have CORS enabled
  try {
    // MODIFIED: Use api.get with responseType 'blob' to handle auth/CORS
    const response = await api.get(url, { responseType: 'blob' });
    if (!response.data) throw new Error(`fetch failed`);
    
    const blob = response.data;
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn(`Failed to convert image URL (${url}) to Data URL:`, e);
    return null; // Return null on failure
  }
}

// --- NEW: Function to populate form for editing ---
async function populateFormForEdit(post) {
  if (!post) return;
  comment.value = post.text || '';
  rating.value = post.rating || 3;
  ratingInput.value = post.rating || 3;
  cuisine.value = post.restaurant?.cuisine_type || '';
  placeName.value = post.restaurant?.name || '';
  address.value = post.restaurant?.address || '';
  lat.value = post.restaurant?.latitude || null;
  lng.value = post.restaurant?.longitude || null;
  placeId.value = post.restaurant?.id || '';
  visibility.value = post.is_public ? 'everyone' : 'friends';

  // Handle Photos
  if (post.photos && post.photos.length > 0) {
    // Fetch and convert all image URLs to Data URLs
    const fetchedPhotos = await Promise.all(post.photos.map(urlToDataUrl));
    const validPhotos = fetchedPhotos.filter(Boolean); // Filter out any that failed
    
    photos.value = [...validPhotos];
    originalPhotos.value = [...validPhotos]; // For cropper to revert
    initialCrops.value = [...validPhotos];   // For cropper to revert
    cropStates.value = validPhotos.map(() => ({ zoom: 1, x: 0, y: 0 }));
    
    if (validPhotos[0]) {
      photoUrl.value = validPhotos[0];
    }
  } else {
    // Clear photos if the post has none
    photos.value = [];
    originalPhotos.value = [];
    initialCrops.value = [];
    cropStates.value = [];
    photoUrl.value = '';
  }
  currentSlide.value = 0;
}

// --- NEW: Function to reset the form (for create mode) ---
function resetForm() {
  comment.value = '';
  rating.value = 3;
  ratingInput.value = 3;
  cuisine.value = '';
  placeName.value = '';
  address.value = '';
  lat.value = null;
  lng.value = null;
  placeId.value = '';
  visibility.value = 'friends';
  photos.value = [];
  originalPhotos.value = [];
  initialCrops.value = [];
  cropStates.value = [];
  photoUrl.value = '';
  currentSlide.value = 0;
  errorMsg.value = '';
  submitting.value = false;
  
  if (fileInputEl.value) fileInputEl.value.value = ''
}

// --- NEW: Watch prop to populate or reset form ---
watch(() => props.postToEdit, (newPost) => {
  if (newPost) {
    populateFormForEdit(newPost);
  } else {
    resetForm(); // Reset form if prop is cleared
  }
}, { immediate: true }); // 'immediate' runs this on component mount


/** ---------- Submit (Create) ---------- */
// Original submit function, renamed to createPost
async function createPost() {
  try {
    if (!placeName.value.trim()) {
      alert('Please enter a restaurant name.')
      return
    }
    if (!rating.value || rating.value < 1 || rating.value > 5) {
      alert('Please enter a rating between 1 and 5.')
      return
    }

    let userEmail = activeEmail.value
    if (!userEmail) {
      const refreshed = await refreshAuthUser()
      userEmail = refreshed?.email ?? null
    }
    if (!userEmail) {
      alert('Please log in to submit a recommendation.')
      return
    }

    const normalizedCuisine = capitalizeFirst(cuisine.value)
    cuisine.value = normalizedCuisine

    // Build FormData matching backend (multer upload.array("photos"))
    const fd = new FormData()
    fd.append('user_email', String(userEmail))
    fd.append('name', placeName.value.trim())
    fd.append('address', address.value.trim())
    fd.append('cuisine_type', (cuisine.value || '').trim())
    fd.append('rating', String(Number(rating.value)))
    fd.append('review', comment.value.trim())
    fd.append('is_public', String(visibility.value === 'everyone'))

    // Attach photos (if any)
    const sources =
      Array.isArray(photos.value) && photos.value.length
        ? photos.value
        : photoUrl.value
          ? [photoUrl.value]
          : []

    sources.forEach((d, i) => {
      const file = dataURLtoFile(d, `photo_${i + 1}.jpg`)
      if (file) fd.append('photos', file);
    })

    submitting.value = true
    errorMsg.value = ''

    // POST multipart to /user/createPost
    const res = await api.post('/user/createPost', fd, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      transformRequest: (data) => data
    });
    const data = res?.data || {}
    const payload = data?.data || data

    const restaurantId =
      payload?.restaurantid || payload?.restaurantId || placeId.value || crypto.randomUUID()
    const postId = payload?.postId || payload?.postid || null

    emit('added', { restaurantId, postId })

    const query = { tab: 'myPosts' }
    if (postId) query.postId = String(postId)
    router.push({ path: '/activity', query })
  } catch (err) {
    console.error('Error creating post:', err)
    const msg = err?.response?.data?.message || err.message || 'Failed to create post.'
    alert(msg)
    errorMsg.value = msg
  } finally {
    submitting.value = false
  }
}

/** ---------- Submit (Update) ---------- */
// NEW: Function to update an existing post
async function editPost() {
  try {
    if (!placeName.value.trim() || !rating.value) {
       alert('Please enter a restaurant name and rating.')
       return
    }
    let userEmail = activeEmail.value
    if (!userEmail) {
      alert('Authentication error. Please log in again.')
      return
    }

    const normalizedCuisine = capitalizeFirst(cuisine.value);
    cuisine.value = normalizedCuisine;

    // MODIFIED: Send a plain JSON object, not FormData
    const payload = {
      postid: props.postToEdit.id,
      user_email: String(userEmail),
      name: placeName.value.trim(),
      address: address.value.trim(),
      cuisine_type: (cuisine.value || '').trim(),
      rating: Number(rating.value),
      review: comment.value.trim(),
      is_public: visibility.value === 'everyone'
    };

    // NOTE: This endpoint does not support updating photos.
    // New photos added in the form will not be sent.

    submitting.value = true;
    errorMsg.value = '';

    // MODIFIED: Use api.put and send the JSON payload
    await api.put('/user/editPost', payload);

    emit('edited'); // Emit 'edited' on success
    
  } catch (err) {
    console.error('Error updating post:', err);
    const msg = err?.response?.data?.message || err.message || 'Failed to update post.';
    alert(msg);
    errorMsg.value = msg;
  } finally {
    submitting.value = false;
  }
}

/** ---------- Submit (Main Handler) ---------- */
// NEW: Main submit function that branches
async function submit() {
  if (isEditMode.value) {
    await editPost();
  } else {
    await createPost();
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
          <li
            v-for="p in namePreds"
            :key="p.place_id"
            class="ac-item"
            @mousedown.prevent="pickPrediction(p, true)"
          >
            {{ p.description }}
          </li>
        </ul>
      </div>
    </div>

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
          <li
            v-for="p in addrPreds"
            :key="p.place_id"
            class="ac-item"
            @mousedown.prevent="pickPrediction(p, !placeName)"
          >
            {{ p.description }}
          </li>
        </ul>
      </div>
    </div>

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
        <ul
          v-if="cuisinePreds.length"
          class="ac-list"
          role="listbox"
          aria-label="Cuisine suggestions"
        >
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
        <div v-if="!cuisinePreds.length && cuisine && cuisineHint" class="ac-hint">
          Did you mean
          <button type="button" class="hint-btn" @mousedown.prevent="pickCuisine(cuisineHint)">
            {{ cuisineHint }}</button
          >?
        </div>
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label fw-semibold">Rating</label>

      <div class="sr-only" aria-live="polite">{{ ratingLive }}</div>

      <div
        class="stars"
        role="radiogroup"
        aria-label="Rating from 1 to 5 in half steps"
        tabindex="0"
        @keydown="onStarsKeydown"
      >
        <button
          v-for="s in stars"
          :key="s"
          type="button"
          class="star-btn"
          :aria-checked="rating >= s - 0.5 ? 'true' : 'false'"
        >
          <span class="star">
            <span class="star-empty">☆</span>
            <span class="star-fill" :style="{ width: getFill(s) * 100 + '%' }">★</span>
          </span>

          <span class="hit half-left" @click.stop="setHalf(s)" aria-hidden="true"></span>
          <span class="hit half-right" @click.stop="setFull(s)" aria-hidden="true"></span>
        </button>
      </div>
      <div class="rating-type">
        <label for="ratingInput" class="rating-type-label">or type</label>
        <input
          id="ratingInput"
          class="rating-input"
          type="number"
          inputmode="decimal"
          step="0.5"
          min="1"
          max="5"
          v-model="ratingInput"
          @input="onRatingTextInput"
          @blur="onRatingTextBlur"
          @keydown.enter.prevent="onRatingTextBlur"
          aria-describedby="ratingHelp"
        />
        <span id="ratingHelp" class="rating-help">1–5 (0.5 steps)</span>
      </div>
      <p v-if="ratingErr" class="rating-err">{{ ratingErr }}</p>
    </div>

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

    <div class="mb-3">
      <label class="form-label fw-semibold">Photos</label>
      <div vNote v-if="isEditMode" class="form-text text-muted small mb-2">
        Note: Photo editing is not supported. New photos will not be saved.
      </div>

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
        :disabled="isEditMode"
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
          :disabled="isEditMode"
        />
      </div>

      <div v-if="photos.length" class="carousel-wrap">
        <div class="carousel-stage" @click="!isEditMode && openCropper(currentSlide)">
          <img :src="photos[currentSlide]" alt="Selected" />
        </div>
        <div class="carousel-nav">
          <button type="button" class="nav-btn" @click.stop="prevSlide">‹</button>
          <span class="nav-ind">{{ currentSlide + 1 }} / {{ photos.length }}</span>
          <button type="button" class="nav-btn" @click.stop="nextSlide">›</button>
        </div>
        <div class="carousel-actions">
          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!initialCrops[currentSlide] || isEditMode" @click.stop="revertCurrentSlide">
            Revert to Original
          </button>
          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="photos.length === 0 || isEditMode" @click.stop="openCropper(currentSlide)">
            Edit Crop
          </button>
        </div>
        <div class="mini-thumbs">
          <button
            v-for="(src, i) in photos"
            :key="'mini-' + i"
            type="button"
            class="mini"
            :class="{ active: i === currentSlide }"
            @click.stop="currentSlide = i"
            :aria-label="'Show photo ' + (i+1)"
          >
            <img :src="src" alt="" />
            <span class="mini-del" @click.stop="!isEditMode && removePhotoAt(i)" :class="{ 'd-none': isEditMode }">×</span>
          </button>
        </div>
      </div>
    <div v-if="cropOpen" class="cropper-modal" @mousedown.self="cancelCrop">
      <div class="cropper-panel">
        <div
          class="crop-preview"
          :class="{ dragging: cropDragging }"
          :style="{ width: PREV_W + 'px', height: PREV_H + 'px' }"
          @wheel.prevent="onCropWheel"
          @mousedown="startDrag"
          @mousemove="onDrag"
          @mouseup="endDrag"
          @mouseleave="endDrag"
          @touchstart.passive="startDrag"
          @touchmove.passive="onDrag"
          @touchend="endDrag"
        >
          <img :src="cropSrc" @load="onCropImgLoad" alt="Crop" :style="imgStyle" draggable="false" />
        </div>
        <div class="crop-ctrls">
          <div class="zoom-ctrls" role="group" aria-label="Zoom controls">
            <button type="button" class="zoom-btn" :disabled="cropZoom <= ZOOM_MIN" @click="zoomOut" aria-label="Zoom out">−</button>
            <span class="zoom-readout" aria-live="polite">{{ Math.round(cropZoom * 100) }}%</span>
            <button type="button" class="zoom-btn" :disabled="cropZoom >= ZOOM_MAX" @click="zoomIn" aria-label="Zoom in">+</button>
            <button type="button" class="zoom-btn reset" @click="resetCrop" aria-label="Reset crop">⟲</button>
          </div>
          <div class="act-ctrls">
            <button type="button" class="btn btn-light" @click="cancelCrop">Cancel</button>
            <button type="button" class="btn btn-primary" @click="confirmCrop">Apply Crop</button>
          </div>
        </div>
      </div>
    </div>
    </div>

    <div class="mb-3">
      <label class="form-label fw-semibold">Who can see this?</label>
      <div class="segmented bg-white shadow-sm" role="tablist" aria-label="Feed scope">
        <button
          type="button"
          class="seg-btn"
          :class="{ active: friendsOnly }"
          @click="setFriends"
          aria-pressed="friendsOnly ? 'true' : 'false'"
          title="Friends only"
        >
          <img
            :src="friendsOnly ? '/images/friends_white.png' : '/images/friends.png'"
            alt="Friends"
            class="icon-20 me-1"
          />
          <span class="seg-label">Friends Only</span>
        </button>

        <button
          type="button"
          class="seg-btn"
          :class="{ active: !friendsOnly }"
          @click="setPublic"
          aria-pressed="!friendsOnly ? 'true' : 'false'"
          title="Public"
        >
          <img
            :src="!friendsOnly ? '/images/everyone_white.png' : '/images/everyone.png'"
            alt="Public"
            class="icon-20 me-1"
          />
          <span class="seg-label">Everyone</span>
        </button>
      </div>
    </div>

    <button class="btn submit-btn w-100" type="submit" :disabled="submitting">
      {{ isEditMode ? (submitting ? 'Updating...' : 'Update Post') : (submitting ? 'Posting...' : 'Submit Recommendation') }}
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
.form-label {
  display: block; /* force label onto its own line so the toggle sits below */
  color: var(--charcoal);
  margin-bottom: 6px;
}
:root[data-theme='dark'] .rec-form .form-label {
  color: #e9eef6;
}

/* Inputs */
.form-control {
  border-radius: var(--radius-md);
  border: 2px solid var(--line-200);
  padding: 10px 12px;
  background: #fff;
  color: #111827;
}
.form-control:focus {
  border-color: var(--sage-600);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--sage-600) 35%, transparent);
}
:root[data-theme='dark'] .rec-form .form-control {
  background: #0e141b;
  color: #e9eef6;
  border-color: #2a3a52;
}

/* Stars (supports half selection + feedback) */
.stars {
  display: inline-flex;
  gap: 6px;
  user-select: none;
}

.star-btn {
  position: relative;
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  width: 28px;
  height: 28px;
  cursor: pointer;
  outline: none;
  border-radius: var(--radius-xs);
  transition: transform 0.06s ease;
}
.star-btn:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--sage-600) 35%, transparent);
}
.star-btn:active {
  transform: translateY(1px) scale(0.98);
}

/* Typed rating input */
.rating-type {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.rating-type-label {
  color: var(--ink-400);
  font-size: 12px;
}
.rating-input {
  width: 88px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--line-200);
  padding: 6px 10px;
  background: #fff;
  color: #111827;
  font-weight: 700;
  text-align: center;
}
.rating-input:focus {
  border-color: var(--sage-600);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--sage-600) 35%, transparent);
}
:root[data-theme="dark"] .rec-form .rating-input {
  background: #0e141b;
  color: #e9eef6;
  border-color: #2a3a52;
}
.rating-help {
  font-size: 12px;
  color: var(--ink-400);
}
.rating-err {
  margin-top: 6px;
  color: #b91c1c;
  font-weight: 700;
}

/* visual layering: empty star behind, filled overlay clipped by width */
.star {
  position: relative;
  display: inline-block;
  width: 100%;
  height: 100%;
  line-height: 28px;
  font-size: 24px;
}
.star-empty {
  color: #c9cfc6;
}
:root[data-theme='dark'] .rec-form .star-empty {
  color: #3a4759;
}

.star-fill {
  position: absolute;
  inset: 0;
  overflow: hidden;
  color: var(--sage-600);
  width: 0%;
  pointer-events: none;
}
.star-fill::before {
  content: '★';
  position: absolute;
  inset: 0;
  line-height: 28px;
  font-size: 24px;
}

/* half click zones */
.hit {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
}
.half-left {
  left: 0;
}
.half-right {
  right: 0;
}

/* subtle hover glow */
.star-btn:hover .star-fill {
  filter: drop-shadow(0 0 2px color-mix(in oklab, var(--sage-600) 40%, transparent));
}

/* Drop zone */
.drop-area {
  border: 2px dashed rgba(139, 157, 131, 0.45);
  border-radius: var(--radius-md);
  padding: 14px;
  background: rgba(250, 249, 246, 0.6);
  cursor: pointer;
}
.drop-area[disabled] {
  cursor: not-allowed;
  opacity: 0.7;
}
.drop-area.dragging {
  background: rgba(250, 249, 246, 0.9);
  border-color: var(--sage-600);
}
:root[data-theme='dark'] .rec-form .drop-area {
  background: #0d1218;
  border-color: #2a3a52;
}
.drop-hint {
  color: var(--ink-400);
}
:root[data-theme='dark'] .rec-form .drop-hint {
  color: #b7c3d3;
}

/* hide the actual file input */
.hidden-file {
  display: none;
}

/* Thumbnails */
.thumbs {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.thumb {
  position: relative;
  width: 84px;
  height: 84px;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-card);
  background: #fff;
  border: 1px solid #e5e7eb;
  display: block;
}
:root[data-theme='dark'] .rec-form .thumb img {
  background: #0b1117;
  border-color: #2a3a52;
}
.thumb-del {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 0;
  cursor: pointer;
  line-height: 1;
  font-weight: 900;
  background: #111827;
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.thumb-del:hover {
  filter: brightness(1.05);
}
:root[data-theme='dark'] .rec-form .thumb-del {
  background: #e9eef6;
  color: #0b1117;
}

/* Visibility chips */
.vis-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.vis-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  pointer-events: none;
}
.vis-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  font-weight: 900;
  font-size: 14px;
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  background: #fff;
  color: #111827;
  border: 2px solid var(--line-200);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.05);
}
.vis-chip:hover {
  filter: brightness(0.98);
}
:root[data-theme='dark'] .rec-form .vis-chip {
  background: #0e141b;
  color: #e9eef6;
  border-color: #2a3a52;
}
#vis-friends.vis-input:checked + .vis-chip,
#vis-everyone.vis-input:checked + .vis-chip {
  background: var(--sage-600);
  color: #fff;
  border-color: var(--sage-600);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--sage-600) 35%, transparent);
}
.vis-input:focus + .vis-chip {
  outline: 3px solid color-mix(in oklab, var(--sage-600) 45%, transparent);
  outline-offset: 2px;
}

/* Submit */
.submit-btn {
  background: linear-gradient(135deg, var(--sage-600), var(--terra-500));
  color: #fff;
  font-weight: 900;
  border: none;
  border-radius: var(--radius-md);
  padding: 12px 16px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
}
.submit-btn:disabled {
  opacity: 0.7;
}

.ac-wrap {
  position: relative;
}
.ac-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid var(--line-200);
  border-radius: var(--radius-sm);
  margin: 6px 0 0;
  padding: 6px 0;
  max-height: 260px;
  overflow: auto;
  z-index: 2000;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}
:root[data-theme='dark'] .rec-form .ac-list {
  background: #0e141b;
  border-color: #2a3a52;
}
.ac-item {
  padding: 8px 12px;
  cursor: pointer;
}
.ac-item:hover {
  background: #f6faf7;
}
:root[data-theme='dark'] .rec-form .ac-item:hover {
  background: #0d1218;
}

/* Cuisine hint */
.ac-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
}
.ac-hint .hint-btn {
  border: none;
  background: none;
  color: var(--sage-600);
  font-weight: 800;
  cursor: pointer;
  padding: 0;
}
.ac-hint .hint-btn:hover {
  text-decoration: underline;
}
:root[data-theme='dark'] .rec-form .ac-hint {
  color: #9fb0c6;
}

/* Cropper modal */
.cropper-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: grid; place-items: center; z-index: 4000; }
.cropper-panel { background: #fff; border-radius: var(--radius-md); padding: 16px; box-shadow: 0 12px 30px rgba(0,0,0,0.25); }
:root[data-theme='dark'] .rec-form .cropper-panel { background: #0e141b; }
.crop-preview { position: relative; overflow: hidden; border-radius: var(--radius-sm); border: 2px dashed rgba(139,157,131,0.5); background: #faf9f6; user-select: none; transition: border-width 0.12s ease, border-color 0.12s ease; }
.crop-preview.dragging { border-width: 3px; border-color: rgba(139,157,131,0.85); }
.crop-preview img { width: auto; height: 100%; display: block; }
.crop-ctrls { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }

/* Carousel */
.carousel-wrap { margin: 12px auto; max-width: 720px; }
.carousel-stage { width: 100%; max-width: 720px; aspect-ratio: 3 / 2; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--line-200); box-shadow: var(--shadow-card); cursor: pointer; }
.carousel-stage { width: 100%; }
.carousel-stage img { width: 100%; height: 100%; object-fit: cover; display: block; }
.carousel-nav { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 8px; }
.nav-btn { border: 0; background: var(--sage-600); color: #fff; font-weight: 900; width: 36px; height: 36px; border-radius: var(--radius-sm); cursor: pointer; }
.nav-ind { font-weight: 800; color: var(--ink-400); }
.mini-thumbs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; justify-content: center; align-items: center; }
.mini { position: relative; padding: 0; border: 2px solid transparent; border-radius: var(--radius-sm); background: transparent; cursor: pointer; }
.mini.active { border-color: var(--sage-600); }
.mini img { width: 84px; height: 56px; object-fit: cover; border-radius: var(--radius-xs); display: block; }
.mini-del { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; border: 0; background: #111827; color: #fff; cursor: pointer; line-height: 1; font-weight: 900; }
.mini-del.d-none { display: none; }


/* Zoom controls */
.zoom-ctrls { display: inline-flex; align-items: center; gap: 8px; margin-right: auto; }
.zoom-btn { width: 36px; height: 36px; border-radius: var(--radius-sm); border: 2px solid var(--line-200); background: #fff; font-weight: 900; font-size: 18px; cursor: pointer; }
.zoom-btn:disabled { opacity: 0.5; cursor: not-allowed; }
:root[data-theme='dark'] .rec-form .zoom-btn { background: #0e141b; color: #e9eef6; border-color: #2a3a52; }
.zoom-readout { min-width: 52px; text-align: center; font-weight: 800; color: var(--ink-400); }
.act-ctrls { display: inline-flex; gap: 10px; }

/* Ensure crop-preview positions absolutely placed image */
.crop-preview { position: relative; }
.zoom-btn.reset { font-size: 16px; }

.carousel-actions { display: flex; gap: 8px; justify-content: center; margin-top: 8px; }

/* Segmented visibility toggle */
.segmented {
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border-radius: 16px;
  border: 1px solid var(--line-200);
  background: #fff;
  margin-top: 6px;
}
.seg-btn {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 6px 12px;
  border-radius: 12px;
  font-weight: 700;
  color: var(--charcoal);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}
.seg-btn:hover {
  background: var(--sage-100);
  color: var(--charcoal);
}
.seg-btn.active {
  background: var(--sage-600);
  color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15) inset;
}
.seg-label { font-size: 13px; }
.seg-btn .icon-20 {
  width: 20px !important;
  height: 20px !important;
  vertical-align: -1px;
  display: inline-block;
  flex: 0 0 12px;
}
</style>
