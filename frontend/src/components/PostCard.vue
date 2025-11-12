<script setup>
import { ref, computed, reactive, watch, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/lib/api'

const emit = defineEmits([
  'open-comments',
  'like-error',
  'updated',
  'post-updated',
  'liked',
  'unliked',
  'edit-post', // Emit for edit
  'delete-post', // Emit for delete
])

const props = defineProps({
  post: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  controls: { type: Boolean, default: false },
  // Optional: parent-provided live comment count
  externalCommentCount: { type: Number, default: undefined },
  currentUserEmail: { type: String, default: null },
  captionMaxLines: { type: Number, default: 4 },
  showOwnerMenu: { type: Boolean, default: false }, // CHANGED: Replaced showOwnerControls
})

// --- Image URL resolver (keeps layout, only fixes src values) ---
const IMAGE_BASE = import.meta.env.DEV ? '' : import.meta.env.VITE_IMAGE_BASE_URL || api.defaults.baseURL

const currentUserEmail = computed(() => props.currentUserEmail || null)
const ENDPOINTS = {
    getLikes: '/friends/getLikesbyPostId',
    like: '/friends/likePost',
    unlike: '/friends/unlikePost',
    getComments: '/friends/getCommentsbyPostId',
    comment: '/friends/commentPost',
    deleteComment: '/friends/deleteComment',
    editComment: '/friends/editComment',
    getPfpByEmail: '/user/getPfpByEmail',
    getPfpByUsername: '/user/getPfpByUsername',
}

function resolveImageUrl(p) {
  if (!p) return null
  let s = String(p)
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s
  s = s.replace(/^[./]+/, '').replace(/^\/+/, '')
  return IMAGE_BASE ? `${IMAGE_BASE}/${s}` : `/${s}`
}

// Inline placeholder to avoid endless network fetch loops when an image fails
const PLACEHOLDER_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='360' viewBox='0 0 600 360'>
      <defs>
        <linearGradient id='g' x1='0' x2='0' y1='0' y2='1'>
          <stop offset='0%' stop-color='%23f7f7f5'/>
          <stop offset='100%' stop-color='%23ecebe7'/>
        </linearGradient>
      </defs>
      <rect width='600' height='360' fill='url(%23g)'/>
      <g fill='%2399a29e' font-family='system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' font-size='18'>
        <text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle'>No photo</text>
      </g>
    </svg>`,
  )

// Cache of broken URLs so we don't retry them on re-render
const failedSrc = ref(new Set())
function getSafeSrc(p) {
  return failedSrc.value.has(p) ? PLACEHOLDER_URL : p
}
function onImgError(e, original) {
  try {
    failedSrc.value.add(original)
  } catch {}
  e.target.onerror = null
  e.target.src = PLACEHOLDER_URL
}

function onAvatarError(e) {
  e.target.onerror = null
  e.target.src = DEFAULT_AVATAR
  authorPfpUrl.value = DEFAULT_AVATAR
}

// ---- Image handling (relative GET, no credentials) ----
const blobCache = reactive(new Map())
const pfpCache = reactive(new Map())

function needsPostFetch(pathLike) {
  // We avoid POST entirely in dev to bypass CORS; treat everything as GET-able
  return false
}

async function fetchImageBlobUrl(pathLike) {
  if (!pathLike) return null
  // Normalize to relative resource path (goes through Vite proxy in dev)
  const clean = String(pathLike)
    .replace(/^https?:\/\/localhost:8000\/?/, '')
    .replace(/^\/+/, '')
  const url = `/${clean}`
  // In most cases we can return the URL directly for <img>
  return url
  // If you need a Blob URL instead, uncomment below (GET without credentials):
  // if (blobCache.has(clean)) return blobCache.get(clean)
  // const res = await fetch(url, { method: 'GET', credentials: 'omit' })
  // if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`)
  // const blob = await res.blob()
  // const blobUrl = URL.createObjectURL(blob)
  // blobCache.set(clean, blobUrl)
  // return blobUrl
}

function revokeAllBlobs() {
  for (const url of blobCache.values()) {
    try {
      URL.revokeObjectURL(url)
    } catch {}
  }
  blobCache.clear()
}

// --- Stabilize post data during transient nulls (e.g. while previews reload) ---
const lastGoodPost = ref(null)
function hasDisplayData(p) {
  if (!p || typeof p !== 'object') return false
  const r = p.restaurant || p.raw?.restaurant || {}
  const hasTitleOrName = Boolean(p.title || r.name)
  const hasUsername =
    Boolean(
      p.user?.username ||
      p.poster_username ||
      p.username ||
      p.raw?.user?.username ||
      p.raw?.poster?.username
    )
  return hasTitleOrName || hasUsername
}
watch(
  () => props.post,
  (p) => {
    if (hasDisplayData(p)) lastGoodPost.value = p
  },
  { immediate: true },
)
const effectivePost = computed(() => {
  return hasDisplayData(props.post) ? props.post : lastGoodPost.value || props.post || {}
})

// Use post.photos if present; otherwise fall back to post.pictures
const resolvedPhotos = computed(() => {
  const p = effectivePost.value || {}
  const arr = Array.isArray(p.photos) ? p.photos : Array.isArray(p.pictures) ? p.pictures : []
  return arr.map(resolveImageUrl).filter(Boolean)
})

const rawPhotos = computed(() => {
  const p = effectivePost.value || {}
  return Array.isArray(p.photos) ? p.photos : Array.isArray(p.pictures) ? p.pictures : []
})

const photoCount = computed(() => resolvedPhotos.value.length)
const currentIndex = ref(0)

// Reset to first image whenever the post's photos change
watch(resolvedPhotos, () => {
  currentIndex.value = 0
})

const currentResolved = computed(() => {
  return resolvedPhotos.value[currentIndex.value] || PLACEHOLDER_URL
})
const currentRaw = computed(() => {
  return rawPhotos.value[currentIndex.value] || null
})

const heroDisplaySrc = ref(PLACEHOLDER_URL)

function nextPhoto() {
  if (photoCount.value <= 1) return
  currentIndex.value = (currentIndex.value + 1) % photoCount.value
}
function prevPhoto() {
  if (photoCount.value <= 1) return
  currentIndex.value = (currentIndex.value - 1 + photoCount.value) % photoCount.value
}
function goToPhoto(i) {
  if (i < 0 || i >= photoCount.value) return
  currentIndex.value = i
}

// Update displayed hero when current index or sources change
watch(
  [currentResolved, currentRaw],
  async ([resolved, raw]) => {
    try {
      if (raw && needsPostFetch(raw)) {
        heroDisplaySrc.value = PLACEHOLDER_URL
        const blobUrl = await fetchImageBlobUrl(raw)
        heroDisplaySrc.value = blobUrl
      } else if (resolved) {
        heroDisplaySrc.value = getSafeSrc(resolved)
      } else {
        heroDisplaySrc.value = PLACEHOLDER_URL
      }
    } catch (e) {
      heroDisplaySrc.value = PLACEHOLDER_URL
    }
  },
  { immediate: true },
)

onBeforeUnmount(revokeAllBlobs)

// --- Author profile picture (via getPfpByEmail) ---
const DEFAULT_AVATAR = '/images/default-avatar.jpg'
const DEFAULT_AVATAR_REGEX = /default-avatar/i

function isDefaultAvatarUrl(url) {
  if (!url) return true
  if (typeof url !== 'string') return false
  return DEFAULT_AVATAR_REGEX.test(url)
}

const authorEmail = computed(() => {
  const p = props.post || {}
  // Try common fields for email on post/user
  return p.user?.email || p.poster_email || p.user_email || p.owner_email || p.email || null
})

function sanitizeUsername(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === '@user') return null
  return trimmed
}

function sanitizeName(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function sanitizeEmail(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!trimmed.includes('@')) return null
  return trimmed
}

const authorUsername = computed(() => {
  const p = props.post || {}
  return (
    sanitizeUsername(p.user?.username) ||
    sanitizeUsername(p.poster_username) ||
    sanitizeUsername(p.username) ||
    null
  )
})

const normalizedAuthorEmail = computed(() => sanitizeEmail(authorEmail.value))

const authorDisplayName = computed(() => {
  const p = props.post || {}
  const nameFromEmail = normalizedAuthorEmail.value
    ? normalizedAuthorEmail.value.split('@')[0]
    : null
  return (
    sanitizeName(p.user?.name) ||
    sanitizeName(p.user?.full_name) ||
    sanitizeName(p.user?.display_name) ||
    sanitizeName(p.poster_name) ||
    sanitizeName(p.poster_full_name) ||
    sanitizeName(p.owner_name) ||
    sanitizeName(p.raw?.user?.name) ||
    sanitizeName(p.raw?.poster?.name) ||
    sanitizeName(p.raw?.owner?.name) ||
    sanitizeUsername(p.user?.username) ||
    sanitizeUsername(p.poster_username) ||
    sanitizeUsername(p.username) ||
    sanitizeUsername(p.raw?.user?.username) ||
    sanitizeUsername(p.raw?.poster?.username) ||
    sanitizeUsername(p.raw?.owner?.username) ||
    nameFromEmail ||
    'Unknown user'
  )
})

const authorPfpUrl = ref(null)

function extractAvatarFromResponse(payload) {
  if (!payload) return null
  if (typeof payload === 'string') return payload
  if (Array.isArray(payload)) {
    const first = payload[0]
    if (!first) return null
    return (
      first.public_url ||
      first.publicUrl ||
      first.url ||
      first.avatar ||
      (typeof first.data === 'string' ? first.data : null) ||
      null
    )
  }
  if (typeof payload === 'object') {
    return (
      payload.data?.public_url ||
      payload.data?.publicUrl ||
      payload.data?.url ||
      (typeof payload.data === 'string' ? payload.data : null) ||
      payload.url ||
      payload.public_url ||
      payload.publicUrl ||
      payload.avatar ||
      null
    )
  }
  return null
}

function readCachedAvatar(key) {
  if (!key) return null
  if (!pfpCache.has(key)) return null
  const cached = pfpCache.get(key)
  if (cached && !isDefaultAvatarUrl(cached)) {
    return cached
  }
  pfpCache.delete(key)
  return null
}

function writeCachedAvatar(key, url) {
  if (!key || !url) return
  pfpCache.set(key, url)
}

async function fetchPfpByUsername(username) {
  const clean = sanitizeUsername(username)
  if (!clean) return null
  const cacheKey = `username:${clean}`
  const cached = readCachedAvatar(cacheKey)
  if (cached) return cached
  try {
    const response = await api.post(ENDPOINTS.getPfpByUsername, { username: clean })
    const rawPayload = response.data
    const rawUrl = extractAvatarFromResponse(rawPayload?.data ?? rawPayload) || null
    const url = rawUrl ? resolveImageUrl(rawUrl) : null
    if (url) writeCachedAvatar(cacheKey, url)
    return url
  } catch (e) {
    return null
  }
}

async function fetchPfpByEmail(email) {
  const clean = sanitizeEmail(email)
  if (!clean) return null
  const cacheKey = `email:${clean}`
  const cached = readCachedAvatar(cacheKey)
  if (cached) return cached
  try {
    const response = await api.post(ENDPOINTS.getPfpByEmail, { user_email: clean })
    const rawPayload = response.data
    const rawUrl = extractAvatarFromResponse(rawPayload?.data ?? rawPayload) || null
    const url = rawUrl ? resolveImageUrl(rawUrl) : null
    if (url) writeCachedAvatar(cacheKey, url)
    return url
  } catch (e) {
    return null
  }
}

async function loadAuthorPfp() {
  let url = null
  const username = authorUsername.value
  if (username) {
    url = await fetchPfpByUsername(username)
  }
  if (!url) {
    const email = normalizedAuthorEmail.value
    if (email) {
      url = await fetchPfpByEmail(email)
    }
  }
  authorPfpUrl.value = url
}

watch(
  [authorUsername, normalizedAuthorEmail],
  () => {
    loadAuthorPfp()
  },
  { immediate: true },
)

const tagText = computed(() => {
  const p = effectivePost.value || {}
  const r = p.restaurant || p.raw?.restaurant || {}
  const t1 = r.cuisine_type || p.cuisine_type
  const t2 = r.secondary_tag || r.category || p.category
  const tags = [t1, t2].filter(Boolean)
  return tags.length ? tags.join(' • ') : ''
})

const priceRangeText = computed(() => {
  const p = effectivePost.value || {}
  const r = p.restaurant || p.raw?.restaurant || {}
  const price = p.price_range ?? r.price_range
  if (price == null) return null
  if (Number.isNaN(price)) return null
  // Convert numeric price (0–4) → $, $$, $$$, $$$$, $$$$$
  return '$'.repeat(Math.max(1, Math.min(5, Math.round(price))))
})

const areaText = computed(() => {
  const p = effectivePost.value || {}
  return p.area || p.restaurant?.area || p.raw?.restaurant?.area || null
})

const isPublicBool = computed(() => {
  const p = props.post || {}
  // check common fields in order: is_public → public? → raw.public
  let v =
    p.is_public !== undefined
      ? p.is_public
      : p['public?'] !== undefined
        ? p['public?']
        : p.raw && p.raw.public !== undefined
          ? p.raw.public
          : null
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(s)) return true
    if (['false', '0', 'no', 'n'].includes(s)) return false
  }
  return !!v
})

const visibilityText = computed(() => {
  const p = props.post || {}
  // Prefer is_public, fallback to legacy "public?"
  const val =
    typeof p.is_public === 'boolean'
      ? p.is_public
      : typeof p['public?'] === 'boolean'
        ? p['public?']
        : null
  if (val === null) return null
  return val ? 'Everyone' : 'Friends Only'
})

const tagLine = computed(() => {
  const tags = []
  if (tagText.value) tags.push(tagText.value)
  if (areaText.value) tags.push(areaText.value)
  if (priceRangeText.value) tags.push(priceRangeText.value)
  return tags.join(' • ')
})

const ratingValue = computed(() => {
  const p = effectivePost.value || {}
  const r = p.restaurant || p.raw?.restaurant || {}
  return p.rating || r.rating || r.avg_rating || null
})

const postDateText = computed(() => {
  const p = effectivePost.value || {}
  // Accept common fields and nested raw fields
  const dateStr =
    p.created_at ||
    p.createdAt ||
    p.timestamp ||
    p.posted_at ||
    p.postedAt ||
    p.date ||
    p.raw?.created_at ||
    p.raw?.createdAt ||
    p.raw?.timestamp ||
    null
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  try {
    return new Intl.DateTimeFormat('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Singapore',
    }).format(d)
  } catch {
    return d.toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' })
  }
})

const router = useRouter()

const hasMapTarget = computed(() => {
  const p = effectivePost.value || {}
  return Boolean(p.id || p.postid)
})

const titleText = computed(() => {
  const p = effectivePost.value || {}
  const r = p.restaurant || p.raw?.restaurant || {}
  return r.name || p.title || ''
})

const addressText = computed(() => {
  const p = effectivePost.value || {}
  const r = p.restaurant || p.raw?.restaurant || {}
  return r.address || ''
})

const authorAvatarUrl = computed(() => {
  if (authorPfpUrl.value) return authorPfpUrl.value
  const p = effectivePost.value || {}
  const candidates = [
    p.user?.avatar,
    p.user?.profile_pic,
    p.user?.profile_image_url,
    p.user?.profileImageUrl,
    p.user?.picture,
    p.user?.photo,
    p.user?.pfp,
    p.user?.image,
    p.user?.avatar_url,
    p.poster_avatar,
    p.poster_avatar_url,
    p.poster_profile_pic,
    p.poster_profile_image_url,
    p.posterProfileImageUrl,
    p.posterAvatar,
    p.avatar,
    p.profile_image_url,
    p.profileImageUrl,
    p.raw?.user?.avatar,
    p.raw?.user?.profile_image_url,
    p.raw?.user?.profileImageUrl,
    p.raw?.poster?.avatar,
    p.raw?.poster?.profile_image_url,
    p.raw?.poster?.profileImageUrl,
    p.raw?.owner?.avatar,
    p.raw?.owner?.profile_image_url,
    p.poster_profile_image,
    p.posterImage,
    p.poster?.avatar,
  ]
  for (const cand of candidates) {
    const resolved = resolveImageUrl(cand)
    if (resolved) return resolved
  }
  return DEFAULT_AVATAR
})

function viewOnMap(p) {
  const post = p || effectivePost.value
  if (!post?.id && !post?.postid) {
    alert('No post id available to open on map.')
    return
  }
  const pid = String(post.id || post.postid)
  router.push({ path: '/map', query: { postId: pid } })
}

// local like/comment counters (hydrated from backend)
const liked = ref(false)
const likeCount = ref(
  typeof effectivePost.value?.raw?.upvote_count === 'number' &&
    !Number.isNaN(effectivePost.value.raw.upvote_count)
    ? effectivePost.value.raw.upvote_count
    : typeof effectivePost.value?.likes === 'number' && !Number.isNaN(effectivePost.value.likes)
      ? effectivePost.value.likes
      : 0,
)
const commentCount = ref(
  typeof props.externalCommentCount === 'number' && !Number.isNaN(props.externalCommentCount)
    ? props.externalCommentCount
    : typeof effectivePost.value?.comments === 'number'
      ? effectivePost.value.comments
      : 0,
)
// Prevent rapid double-taps that cause race conditions / count drift
const isLiking = ref(false)

watch(
  () => props.externalCommentCount,
  (n) => {
    if (typeof n === 'number' && !Number.isNaN(n)) {
      commentCount.value = n
    }
  },
  { immediate: true },
)

function emitEngagementPatch({ nextLikes, nextLikedFlag, nextCommentCount }) {
  const post = effectivePost.value || {}
  const pid = post.id || post.postid
  if (!pid) return

  const id = String(pid) 
  const raw = {}
  const patch = { id, postid: id }
  let dirty = false

  if (Number.isFinite(Number(nextLikes))) {
    const safeLikes = Math.max(0, Number(nextLikes))
    patch.likes = safeLikes
    raw.upvote_count = safeLikes
    dirty = true
  }
  if (typeof nextLikedFlag === 'boolean') {
    patch.user_has_upvoted = nextLikedFlag
    raw.user_has_upvoted = nextLikedFlag
    dirty = true
  }
  if (Number.isFinite(Number(nextCommentCount))) {
    const safeComments = Math.max(0, Number(nextCommentCount))
    patch.comment_count = safeComments
    patch.comments_count = safeComments
    patch.comments = safeComments
    raw.comments_count = safeComments
    dirty = true
  }

  if (!dirty) return
  if (Object.keys(raw).length) patch.raw = raw

  try {
    emit('updated', patch)
    emit('post-updated', patch)
  } catch {}
}

async function refreshLikes() {
  const postId = effectivePost.value?.id || effectivePost.value?.postid
  if (!postId) return
  try {
    const response = await api.post(ENDPOINTS.getLikes, { postid: String(postId) })
    const emails = Array.isArray(response.data?.data) ? response.data.data : []
    likeCount.value = emails.length
    const email = currentUserEmail.value
    liked.value = email ? emails.includes(email) : false
    emitEngagementPatch({ nextLikes: likeCount.value, nextLikedFlag: liked.value })
  } catch (e) {
    // keep existing optimistic state on failure
  }
}

async function refreshComments() {
  const postId = effectivePost.value?.id || effectivePost.value?.postid
  if (!postId) return
  try {
    const response = await api.post(ENDPOINTS.getComments, { postid: String(postId) })
    const list = Array.isArray(response.data?.data) ? response.data.data : []
    commentCount.value = list.length
    emitEngagementPatch({ nextCommentCount: commentCount.value })
  } catch (e) {
    // ignore and keep last known count
  }
}

async function refreshEngagement() {
  await Promise.allSettled([refreshLikes(), refreshComments()])
}

onMounted(refreshEngagement)
watch(
  () => effectivePost.value?.id || effectivePost.value?.postid,
  () => refreshEngagement(),
)
watch(
  () => currentUserEmail.value,
  () => refreshLikes(),
)

// Keep local like state in sync when parent patches the post (e.g., from preview/dashboard)
watch(
  () => ({
    flatLikes: effectivePost.value?.likes,
    flatFlag: effectivePost.value?.user_has_upvoted,
    rawLikes: effectivePost.value?.raw?.upvote_count,
    rawFlag: effectivePost.value?.raw?.user_has_upvoted,
  }),
  (n) => {
    const nextCount =
      typeof n.rawLikes === 'number' && !Number.isNaN(n.rawLikes)
        ? n.rawLikes
        : typeof n.flatLikes === 'number' && !Number.isNaN(n.flatLikes)
          ? n.flatLikes
          : null
    if (nextCount !== null && nextCount !== likeCount.value) {
      likeCount.value = nextCount
    }
    if (typeof n.rawFlag === 'boolean') {
      liked.value = n.rawFlag
    } else if (typeof n.flatFlag === 'boolean') {
      liked.value = n.flatFlag
    }
  },
)

// Toggle like button (optimistic update, revert on error)
async function toggleLike() {
  const postId = effectivePost.value?.id || effectivePost.value?.postid
  if (!postId) return
  if (isLiking.value) return
  isLiking.value = true

  // optimistic update
  const prevLiked = liked.value
  const prevCount = likeCount.value
  liked.value = !prevLiked
  likeCount.value = Math.max(0, prevCount + (liked.value ? 1 : -1))

  const email = currentUserEmail.value
  if (!email) {
    isLiking.value = false
    liked.value = prevLiked
    likeCount.value = prevCount
    emit('like-error', { postId, error: 'Missing authenticated user' })
    return
  }

  const payload = {
    postid: String(postId),
    liker_email: email,
  }

  try {
    let response
    if (liked.value) {
      // now liked -> create like
      response = await api.post(ENDPOINTS.like, payload)
    } else {
      // now unliked -> attempt DELETE first
      try {
        response = await api.delete(ENDPOINTS.unlike, { data: payload })
      } catch (error) {
        // Fallback: some backends route unlike as POST instead of DELETE
        if (error.response?.status === 404 || error.response?.status === 405 || error.response?.status === 415) {
          response = await api.post(ENDPOINTS.unlike, payload)
        } else {
          throw error
        }
      }
    }

    // Try to use server canonical values if provided
    const data = response.data
    const serverCount = data?.upvote_count ?? data?.upvotes ?? data?.likes
    const serverFlag = data?.user_has_upvoted ?? data?.has_upvoted
    if (Number.isFinite(Number(serverCount))) {
      likeCount.value = Math.max(0, Number(serverCount))
    }
    if (typeof serverFlag === 'boolean') {
      liked.value = serverFlag
    }
    
    // Notify parent(s) with a compact patch so lists/previews can sync instantly
    try {
      const idStr = String(effectivePost.value?.id || effectivePost.value?.postid)
      const safeCount = Math.max(0, Number(likeCount.value))
      const newFlag = Boolean(liked.value)
      const patch = {
        id: idStr,
        postid: idStr,
        likes: safeCount,
        user_has_upvoted: newFlag,
        raw: { upvote_count: safeCount, user_has_upvoted: newFlag },
      }
      emit('updated', patch)
      emit('post-updated', patch)
      emit(newFlag ? 'liked' : 'unliked', patch)
    } catch {}
    // Optionally: await refreshLikes() to resync exact count
  } catch (err) {
    // revert on failure
    liked.value = prevLiked
    likeCount.value = prevCount
    emit('like-error', { postId, error: String(err) })
  } finally {
    isLiking.value = false
  }
}

// Open comment modal or emit to parent
function openComments() {
  const postId = effectivePost.value?.id || effectivePost.value?.postid
  if (!postId) return
  emit('open-comments', { postId })
}

// function openProfile() {
//   const post = props.post || {}
//   const payloadUser =
//     post.user || {
//       email: normalizedAuthorEmail.value,
//       username: authorUsername.value,
//       name: authorDisplayName.value,
//     }
//   emit('open-profile', { post, user: payloadUser })
// }

const resolvedCaptionLines = computed(() => {
  const raw = props.captionMaxLines
  if (raw == null) return 0
  const num = typeof raw === 'string' ? Number(raw) : raw
  if (!Number.isFinite(num)) return 0
  if (num <= 0) return 0
  return Math.max(1, Math.floor(num))
})

const isCompactScreen = ref(false)
let compactMql = null
let compactMqlListener = null

function setupCompactScreenListener() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    isCompactScreen.value = false
    return
  }
  compactMql = window.matchMedia('(max-width: 575.98px)')
  isCompactScreen.value = compactMql.matches
  compactMqlListener = (event) => {
    isCompactScreen.value = event.matches
  }
  if (typeof compactMql.addEventListener === 'function') {
    compactMql.addEventListener('change', compactMqlListener)
  } else if (typeof compactMql.addListener === 'function') {
    compactMql.addListener(compactMqlListener)
  }
}

function teardownCompactScreenListener() {
  if (!compactMql) return
  if (compactMqlListener) {
    if (typeof compactMql.removeEventListener === 'function') {
      compactMql.removeEventListener('change', compactMqlListener)
    } else if (typeof compactMql.removeListener === 'function') {
      compactMql.removeListener(compactMqlListener)
    }
  }
  compactMql = null
  compactMqlListener = null
}

onMounted(() => {
  setupCompactScreenListener()
})

onBeforeUnmount(() => {
  teardownCompactScreenListener()
})

const effectiveCaptionLines = computed(() => {
  const base = resolvedCaptionLines.value
  if (!base) return 0
  if (!isCompactScreen.value) return base
  return Math.max(1, Math.min(base, 3))
})

const isCaptionClamped = computed(() => effectiveCaptionLines.value > 0)

const captionClampInlineStyle = computed(() => {
  const lines = effectiveCaptionLines.value
  if (!lines) return {}
  return {
    display: '-webkit-box',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    wordBreak: 'break-word',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: String(lines),
    '--caption-line-count': lines,
  }
})
</script>

<template>
  <article :class="['card', { active: isActive }]">
    <div class="hero">
      <img
        :src="heroDisplaySrc"
        alt="Post photo"
        crossorigin="anonymous"
        @error="(ev) => onImgError(ev, heroDisplaySrc)"
      />
      <div class="vis-badge" v-if="isPublicBool !== null">
        <span
          class="badge visibility-tag"
          :class="isPublicBool ? 'sage-tag' : 'terracotta-tag'"
          :aria-label="isPublicBool ? 'Visible to everyone' : 'Visible to friends only'"
        >
          {{ isPublicBool ? 'Everyone' : 'Friends Only' }}
        </span>
      </div>
      <div v-if="tagLine" class="chip">{{ tagLine }}</div>

      <button
        v-if="controls && photoCount > 1"
        class="nav prev"
        type="button"
        aria-label="Previous photo"
        @click.stop="prevPhoto"
        data-stop-preview
      >
        ‹
      </button>
      <button
        v-if="controls && photoCount > 1"
        class="nav next"
        type="button"
        aria-label="Next photo"
        @click.stop="nextPhoto"
        data-stop-preview
      >
        ›
      </button>

      <div
        v-if="controls && photoCount > 1"
        class="dots"
        role="tablist"
        aria-label="Photos"
        data-stop-preview
      >
        <button
          v-for="(_, i) in photoCount"
          :key="i"
          type="button"
          class="dot"
          :class="{ active: i === currentIndex }"
          :aria-label="`Go to photo ${i + 1}`"
          @click.stop="goToPhoto(i)"
          data-stop-preview
        />
      </div>
      <div
        v-if="photoCount > 0"
        class="photo-count"
        :aria-label="`Photo ${currentIndex + 1} of ${photoCount}`"
      >
        <span class="pc-num">{{ currentIndex + 1 }}/{{ photoCount }}</span>
      </div>
    </div>

    <div class="body">
      <div class="title-row">
        <h3 class="title">
          {{ titleText || 'Untitled' }}
        </h3>

        <div v-if="ratingValue" class="rating">
          <span class="star">★</span>
          <span class="rating-num">{{ Number(ratingValue).toFixed(1) }}</span>
        </div>

        <div v-if="showOwnerMenu" class="dropdown owner-menu ms-2" data-stop-preview>
          <button
            class="btn btn-icon"
            type="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
            @click.stop
            data-stop-preview
            aria-label="Post options"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-three-dots-vertical" viewBox="0 0 16 16">
              <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/>
            </svg>
          </button>
          <ul class="dropdown-menu dropdown-menu-end" data-stop-preview>
            <li>
              <button class="dropdown-item" type="button" @click.stop="$emit('edit-post', post)">
                Edit Post
              </button>
            </li>
            <li>
              <button class="dropdown-item text-danger" type="button" @click.stop="$emit('delete-post', post)">
                Delete Post
              </button>
            </li>
          </ul>
        </div>

      </div>

      <div v-if="addressText" class="address">
        {{ addressText }}
      </div>

      <p
        v-if="effectivePost?.text"
        class="desc"
        :class="{ clamped: isCaptionClamped }"
        :style="captionClampInlineStyle"
      >
        {{ effectivePost?.text }}
      </p>

      <div class="meta">
        <div class="stats">
          <button
            class="stat as-button"
            @click.stop="toggleLike"
            :aria-pressed="liked"
            data-stop-preview
          >
            <img
              v-if="!liked"
              src="/images/like.png"
              alt="Like"
              class="icon-20 me-1"
              width="16"
              height="16"
            />
            <img
              v-else
              src="/images/liked.png"
              alt="Liked"
              class="icon-20 me-1"
              width="16"
              height="16"
            />
            <span>{{ likeCount }}</span>
          </button>
          <button
            class="stat as-button"
            @click.stop="openComments"
            data-stop-preview
            title="Open comments"
          >
            <img
              src="/images/comment.png"
              alt="Comments"
              class="icon-20 me-1"
              width="16"
              height="16"
            />
            <span>{{ commentCount }}</span>
          </button>
        </div>

        <div class="author" v-if="authorDisplayName" style="min-width: 0;" role="button" data-stop-preview>
          <img
            :src="authorAvatarUrl"
            class="avatar"
            alt="User avatar"
            width="24"
            height="24"
            crossorigin="anonymous"
            @error="onAvatarError"
          />
          <span class="name text-truncate">{{ authorDisplayName }}</span>
        </div>

        <button
          v-if="hasMapTarget"
          class="map-btn"
          @click.stop="viewOnMap(effectivePost)"
          title="View on map"
          data-stop-preview
        >
          <img src="/images/map.png" alt="Map" class="icon-20 me-1" width="16" height="16" />
          Map
        </button>
        <span v-else class="map-btn disabled" title="No map data">
          <img src="/images/map.png" alt="Map" class="icon-20 me-1" width="16" height="16" />
          Map
        </span>

        <span v-if="postDateText" class="date-text">Posted on {{ postDateText }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  height: 100%; /* Make card fill the height of its grid container */
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 12px 24px rgba(17, 24, 39, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.hero {
  position: relative;
  flex-shrink: 0; /* Prevent image from shrinking */
}
.hero img {
  width: 100%;
  height: 200px;
  object-fit: cover;
  display: block;
}
.chip {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(17, 24, 39, 0.85);
  color: #fff;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}

/* ADDED: flex styles for body */
.body {
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  flex-grow: 1; /* Allow body to grow and fill empty space */
}
.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #111827;
  /* Allow title to shrink if menu is present */
  flex: 1 1 auto;
  min-width: 0;
}
.rating {
  display: flex;
  align-items: center;
  gap: 6px;
  /* Don't let rating shrink */
  flex: 0 0 auto;
}
.star {
  color: #f59e0b;
  font-size: 16px;
  line-height: 1;
}
.rating-num {
  font-weight: 700;
  color: #f59e0b;
}

.date-text {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
}

.subtitle {
  margin-top: 2px;
  color: #6b7280;
  font-size: 13px;
}
.address {
  color: #9ca3af;
  font-size: 12px;
  margin-top: 2px;
  /* MODIFIED: Added truncation styles */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.desc {
  margin: 10px 0 12px;
  color: #374151;
  font-size: 14px;
  line-height: 1.4;
  flex-shrink: 0; /* Prevent description from shrinking */
}
.desc.clamped {
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  min-height: calc(var(--caption-line-count, 4) * 1.4em);
}

/* ADDED: margin-top: auto to push meta to bottom */
.meta {
  margin-top: auto; /* This is the key change */
  padding-top: 8px; /* Add some space above the meta block */
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: #6b7280;
  font-size: 13px;
  flex: 1 1 160px;
  min-width: 0;
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.author {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: default;
  min-width: 0; /* Allow text-truncate to work */
  flex: 1 1 auto;
  overflow: hidden;
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  max-width: 24px;
  max-height: 24px;
  flex: 0 0 24px;
}
.name {
  font-size: 13px;
  color: #4b5563;
  font-weight: 600; /* Make name slightly bolder */
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-btn {
  margin-left: auto;
  padding: 6px 12px;
  border-radius: 999px;
  background: #eef2ff;
  color: #1f2937;
  font-size: 13px;
  text-decoration: none;
  border: 1px solid #e5e7eb;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.map-btn:hover {
  background: #e0e7ff;
}

.map-btn.disabled {
  pointer-events: none;
  opacity: 0.6;
  display: inline-flex;
  align-items: center;
}

.icon-btn {
  background: transparent;
  border: none;
  color: #6b7280;
  font-size: 16px;
  cursor: pointer;
}
.icon-btn:hover {
  color: #111827;
}


/* Carousel controls */
.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: rgba(255, 255, 255, 0.8);
  color: #111827;
  display: grid;
  place-items: center;
  cursor: pointer;
  user-select: none;
}
.nav.prev {
  left: 10px;
}
.nav.next {
  right: 10px;
}
.nav:hover {
  background: #fff;
}

/* Dots */
.dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8px;
  display: flex;
  justify-content: center;
  gap: 6px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.6);
  cursor: pointer;
}
.dot.active {
  background: #fff;
}

.vis-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 6;
}
.visibility-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
  color: #fff;
  border: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
}
.sage-tag {
  background-color: var(--sage-600, #2f855a);
}
.terracotta-tag {
  background-color: var(--terracotta-500, #c05621);
}

/* ---------------- Responsive tweaks for PostCard ---------------- */

/* Responsive hero image height using clamp and breakpoints */
.hero img {
  height: clamp(160px, 32vw, 220px);
}
@media (min-width: 576px) {
  /* sm */
  .hero img {
    height: clamp(200px, 28vw, 260px);
  }
}

/* --- Default (dashboard/feed) cards: stats | author | map --- */
@media (min-width: 576px) {
  :not(.preview-modal) > .card .meta,
  .card:not(.preview-modal .card) .meta {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
      'stats author map'
      'date  date   date';
    align-items: center;
    column-gap: 10px;
    row-gap: 6px;
  }
  :not(.preview-modal) > .card .stats,
  .card:not(.preview-modal .card) .stats {
    grid-area: stats; flex: 0 0 auto; width: auto; gap: 10px;
  }
  :not(.preview-modal) > .card .author,
  .card:not(.preview-modal .card) .author {
    grid-area: author; flex: 0 1 auto; min-width: 0; justify-self: end; text-align: right;
  }
  :not(.preview-modal) > .card .map-btn,
  .card:not(.preview-modal .card) .map-btn {
    grid-area: map; margin-left: 0; justify-self: end;
  }
  :not(.preview-modal) > .card .map-btn.disabled,
  .card:not(.preview-modal .card) .map-btn.disabled {
    grid-area: map; margin-left: 0; justify-self: end;
  }
  :not(.preview-modal) > .card .date-text,
  .card:not(.preview-modal .card) .date-text {
    grid-area: date; width: 100%;
  }
  .author .name { max-width: 100%; display: inline-block; }
}
@media (min-width: 768px) {
  /* md */
  .hero img {
    height: clamp(220px, 26vw, 300px);
  }
}
@media (min-width: 1200px) {
  /* xl */
  .hero img {
    height: clamp(260px, 24vw, 360px);
  }
}

/* Title and text scale */
.title {
  font-size: clamp(16px, 2.4vw, 20px);
}
.desc {
  font-size: clamp(13px, 1.8vw, 14px);
  line-height: 1.45;
}
.address,
.stats,
.name,
.date-text {
  font-size: clamp(12px, 1.7vw, 13px);
}

/* Let long text wrap nicely */
.title,
.desc {
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* Make the meta section adapt on small screens */
@media (max-width: 575.98px) {
  .body {
    padding: 12px 12px 10px;
  }
  .meta {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'stats stats'
      'author map'
      'date date';
    align-items: center;
    column-gap: 8px;
    row-gap: 6px;
    width: 100%;
  }
  .stats {
    grid-area: stats;
    flex: 0 0 auto;
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
  }
  .chip {
    font-size: 11px;
    padding: 4px 8px;
  }
  .hero .chip {
    top: 40px;
    right: auto;
    left: 10px;
    max-width: calc(100% - 20px);
    white-space: normal;
    line-height: 1.2;
  }
  .visibility-tag {
    font-size: 10px;
    padding: 3px 7px;
  }
  .nav {
    width: 36px;
    height: 36px;
  }
  .dots {
    bottom: 6px;
  }
  .dot {
    width: 6px;
    height: 6px;
  }

  /* --- Mobile preview layout fixes --- */
  .title-row { align-items: flex-start; gap: 8px; }
  .title { flex: 1 1 auto; min-width: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .rating { flex: 0 0 auto; margin-left: 4px; }

  .stats { flex-wrap: wrap; }
  .author {
    grid-area: author;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0; /* allow long names to wrap */
    flex: 1 1 auto;
    justify-self: start;
  }
  .author .name { min-width: 0; }
  /* Map button stays on the right column */
  .map-btn {
    grid-area: map;
    margin-left: 0;
    font-size: 12px;
    padding: 5px 10px;
    justify-self: end;
  }
  .map-btn.disabled {
    grid-area: map;
    margin-left: 0;
    justify-self: end;
  }
  .date-text {
    grid-area: date;
    width: 100%;
    padding-top: 2px;
  }

  /* Prevent overflow from long addresses/titles */
  /* .address rule removed, handled by base style */

  /* Clamp long author names to two lines in preview */
  .author .name {
    display: block;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* Medium-up: keep layout tight but readable */
@media (min-width: 768px) {
  .map-btn {
    font-size: 14px;
    padding: 6px 14px;
  }
}

@media (min-width: 992px) {
  .author {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    flex: 0 0 auto;
    min-width: 0;
    cursor: default;
  }
  .author .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex: 0 0 28px;
  }
  .author .name {
    margin-left: 4px !important;
    display: inline-block;
    vertical-align: middle;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  }
  /* Ensure modal preview version also aligns */
  .preview-modal .card .author {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    cursor: default;
  }
  .preview-modal .card .author .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
  }
  .preview-modal .card .author .name {
    margin-left: 4px !important;
    display: inline-block;
    vertical-align: middle;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  }
}

/* Ensure avatar doesn't distort on small screens */
.avatar {
  min-width: 24px;
  min-height: 24px;
}

.stat.as-button {
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  color: #6b7280;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
}
.stat.as-button:hover {
  color: #111827;
}
.stat.as-button[aria-pressed='true'] {
  color: var(--sage-600, #2f855a);
}

.icon-20 {
  width: 16px !important;
  height: 16px !important;
  object-fit: contain;
  display: inline-block;
  vertical-align: middle;
}
.stat.as-button {
  line-height: 1;
}
.stat.as-button {
  gap: 4px;
}
.map-btn .icon-20 {
  margin-right: 4px;
}
.stat.as-button .me-1 {
  margin-right: 4px;
}

.photo-count {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 7;
  background: rgba(17, 24, 39, 0.82);
  color: #fff;
  padding: 4px 9px;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  border-radius: 999px;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.photo-count .pc-num {
  display: inline-block;
  min-width: 1.5em;
  text-align: center;
  color: white;
}

/* Small screen adjustments */
@media (max-width: 575.98px) {
  .photo-count {
    right: 8px;
    bottom: 8px;
    font-size: 11px;
    padding: 3px 7px;
  }
}

/* NEW: Kebab Menu Styles */
.owner-menu {
  flex: 0 0 auto; /* Don't shrink */
}
.owner-menu .btn-icon {
  background: transparent;
  border: none;
  padding: 0.25rem;
  border-radius: 50%;
  color: #6b7280; /* var(--ink-400) */
  line-height: 1;
}
.owner-menu .btn-icon:hover {
  background-color: #f3f4f6; /* var(--surface-hover) */
  color: #111827; /* var(--charcoal) */
}
.owner-menu .btn-icon:focus,
.owner-menu .btn-icon.show {
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--sage-600) 35%, transparent);
}
.owner-menu .dropdown-menu {
  z-index: 10; /* Ensure it's above card content */
}
.owner-menu .dropdown-item {
  cursor: pointer;
  padding: 0.5rem 1rem;
}
.owner-menu .dropdown-item.text-danger:hover {
  color: #fff !important;
  background-color: #dc3545;
}


/* === Preview modal: compact author + map on mobile (≤767.98px) === */
@media (max-width: 767.98px) {
  .preview-modal .card .meta {
    display: grid;
    grid-template-columns: auto auto 1fr;
    grid-template-areas:
      'stats stats stats'
      'author map map'
      'date date date';
    column-gap: 6px;
    row-gap: 6px;
    align-items: center;
    width: 100%;
  }
  .preview-modal .card .stats { grid-area: stats; justify-content: flex-start; gap: 8px; width: 100%; }
  .preview-modal .card .author { grid-area: author; display: inline-flex; align-items: center; gap: 8px; min-width: 0; justify-self: start; cursor: default; }
  .preview-modal .card .author .name { min-width: 0; margin-left: 0 !important; }
  .preview-modal .card .map-btn { grid-area: map; justify-self: start; margin-left: 8px; font-size: 12px; padding: 5px 10px; display: inline-flex; align-items: center; }
  .preview-modal .card .map-btn.disabled { grid-area: map; justify-self: start; margin-left: 8px; }
  .preview-modal .card .date-text { grid-area: date; width: 100%; padding-top: 2px; }
}

</style>
