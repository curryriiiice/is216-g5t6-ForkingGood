<script setup>
// vue imports
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'

// component imports
import Modal from '@/components/Modal.vue'
import PostCard from '@/components/PostCard.vue'

// auth imports
import { useAuthUser } from '@/lib/useAuthUser'

// API configuration
import api from '@/lib/api.js'
// Added from Dashboard/ActivityView for PostCard image resolving
const IMAGE_BASE = import.meta.env.DEV ? '' : import.meta.env.VITE_IMAGE_BASE_URL || api.defaults.baseURL
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' }
const COMMENTS_EP = {
  get: `${API_BASE}/friends/getCommentsbyPostId`,
  add: `${API_BASE}/friends/commentPost`,
  del: `${API_BASE}/friends/deleteComment`,
  edit: `${API_BASE}/friends/editComment`,
}

function resolveImageUrl(p) {
  if (!p) return null
  const s = String(p)
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s
  const clean = s.replace(/^\/+/, '')
  return IMAGE_BASE ? `${IMAGE_BASE}/${clean}` : `/${clean}`
}

const DEFAULT_COMMENT_AVATAR = '/images/default-avatar.jpg'
const commentProfileCache = ref(new Map())
const pendingCommentProfiles = new Map()

function cacheCommentProfile(email, profile) {
  const next = new Map(commentProfileCache.value)
  next.set(email, profile)
  commentProfileCache.value = next
  return profile
}

function deriveNameFromEmail(email) {
  if (!email) return 'Anonymous'
  const [name] = String(email).split('@')
  return name || email
}

function resolveCommentAvatar(raw) {
  if (!raw) return DEFAULT_COMMENT_AVATAR
  return resolveImageUrl(raw) || DEFAULT_COMMENT_AVATAR
}

async function ensureProfileForCommenter(email) {
  if (!email) return null
  const cached = commentProfileCache.value.get(email)
  if (cached) return cached

  if (pendingCommentProfiles.has(email)) {
    return pendingCommentProfiles.get(email)
  }

  const request = api
    .post('/user/getProfile', { user_email: email })
    .then((res) => {
      const info = res.data?.data || {}
      return cacheCommentProfile(email, {
        displayName: (info?.username || '').trim() || deriveNameFromEmail(email),
        avatar: resolveCommentAvatar(info?.profile_image_url),
      })
    })
    .catch(() =>
      cacheCommentProfile(email, {
        displayName: deriveNameFromEmail(email),
        avatar: DEFAULT_COMMENT_AVATAR,
      }),
    )
    .finally(() => {
      pendingCommentProfiles.delete(email)
    })

  pendingCommentProfiles.set(email, request)
  return request
}

async function enrichCommentsWithProfiles(list) {
  if (!Array.isArray(list) || list.length === 0) return []
  const uniqueEmails = [...new Set(list.map((row) => row.commenter_email).filter(Boolean))]
  await Promise.all(uniqueEmails.map((email) => ensureProfileForCommenter(email)))
  return list.map((row) => {
    const profile = commentProfileCache.value.get(row.commenter_email)
    return {
      ...row,
      commenter_name: profile?.displayName ?? deriveNameFromEmail(row.commenter_email),
      commenter_avatar: profile?.avatar ?? DEFAULT_COMMENT_AVATAR,
    }
  })
}

function onCommentAvatarError(event) {
  if (event?.target) {
    event.target.src = DEFAULT_COMMENT_AVATAR
  }
}

// Auth User setup
const { user: authUser, refresh: refreshAuthUser } = useAuthUser()
const activeEmail = computed(() => authUser.value?.email ?? null)

const router = useRouter()

// UI state for search and display
const query = ref('')
const searchResults = ref([])
const searchLoading = ref(false)
const searchError = ref('')

// Cache for ALL users
const allUsersCache = ref([])
// NEW: Cache for profile pictures (for post authors)
const avatarCache = ref(new Map())

// State for Pending Friend Requests Modal
const showPendingModal = ref(false)
const pendingRequests = ref([]) // Will now hold objects: { email, username, avatar }
const pendingLoading = ref(false)
const pendingError = ref('')

// State for Profile Popup Modal
const showProfileModal = ref(false)
const profileData = ref(null)
const profilePosts = ref([])
const profileLoading = ref(false)
const profileError = ref('')

// State for Remove Confirmation Modal
const showConfirmRemoveModal = ref(false)
const userToRemove = ref(null)
const removingFriend = ref(false)

// === START: Logic merged from DashboardView/ActivityView for PostCard ===

// Comment Modal State
const showComments = ref(false)
const commentsForPostId = ref(null)
const comments = ref([])
const newComment = ref('')
const editingComment = ref(null)
const commentCounts = ref({})

// Post Preview Modal State
const showPreview = ref(false)
const previewPost = ref(null)

// Helper function to fetch avatars for post authors
async function fetchAvatarsForPosts(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return
  const emailsToFetch = new Set()
  for (const post of posts) {
    if (post.poster_email && !avatarCache.value.has(post.poster_email)) {
      emailsToFetch.add(post.poster_email)
    }
  }
  if (emailsToFetch.size === 0) return

  const promises = Array.from(emailsToFetch).map((email) =>
    api
      .post('/user/getPfpByEmail', { user_email: email }) //
      .then((res) => ({ email, url: res.data?.data })) //
      .catch((err) => ({ email, url: null, error: err })),
  )
  const results = await Promise.allSettled(promises)
  const newCache = new Map(avatarCache.value)
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.url) {
      newCache.set(result.value.email, result.value.url)
    }
  }
  avatarCache.value = newCache
}

// Comment Modal Functions
async function loadComments(postId) {
  commentsForPostId.value = postId
  try {
    const res = await fetch(COMMENTS_EP.get, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ postid: String(postId) }),
    })
    const data = await res.json()
    const rawComments = Array.isArray(data?.data) ? data.data : []
    comments.value = await enrichCommentsWithProfiles(rawComments)
    commentCounts.value[String(postId)] = comments.value.length
  } catch {
    comments.value = []
  }
}
function onOpenComments({ postId }) {
  showComments.value = true
  loadComments(postId)
}
function closeComments() {
  showComments.value = false
  newComment.value = ''
  comments.value = []
  commentsForPostId.value = null
  editingComment.value = null
}
async function submitComment() {
  const postid = commentsForPostId.value
  const comment = newComment.value?.trim()
  if (!postid || !comment) return
  if (editingComment.value) {
    const item = editingComment.value
    editingComment.value = null
    newComment.value = ''
    return editComment(item, comment)
  }
  const email = activeEmail.value
  if (!email) return
  const profile = await ensureProfileForCommenter(email)
  const draft = {
    commenter_email: email,
    comment,
    commenter_name: profile?.displayName ?? deriveNameFromEmail(email),
    commenter_avatar: profile?.avatar ?? DEFAULT_COMMENT_AVATAR,
  }
  comments.value = [...comments.value, draft]
  newComment.value = ''
  try {
    const res = await fetch(COMMENTS_EP.add, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ commenter_email: email, postid: String(postid), comment }),
    })
    if (!res.ok) throw new Error('comment failed')
    await loadComments(postid)
  } catch {
    comments.value = comments.value.filter((c) => !(c === draft))
  }
}
async function deleteComment(item) {
  const postid = commentsForPostId.value
  if (!postid) return
  const prev = [...comments.value]
  comments.value = comments.value.filter(
    (c) => !(c.commenter_email === item.commenter_email && c.comment === item.comment),
  )
  try {
    const res = await fetch(COMMENTS_EP.del, {
      method: 'DELETE',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        postid: String(postid),
        commenter_email: item.commenter_email,
        comment: item.comment,
      }),
    })
    if (!res.ok) throw new Error('delete failed')
    await loadComments(postid)
  } catch {
    comments.value = prev
  }
}
async function editComment(item, newText) {
  const postid = commentsForPostId.value
  const nextText = (newText ?? '').trim()
  if (!postid || !nextText) return
  const oldText = item.comment
  if (nextText === oldText) return
  const prev = [...comments.value]
  comments.value = comments.value.map((c) => (c === item ? { ...c, comment: nextText } : c))
  try {
    const res = await fetch(COMMENTS_EP.edit, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        postid: String(postid),
        commenter_email: item.commenter_email,
        old_comment: oldText,
        new_comment: nextText,
      }),
    })
    if (!res.ok) throw new Error('edit failed')
    await loadComments(postid)
  } catch {
    comments.value = prev
  }
}

// PostCard Sync Function
function applyPostPatch(patch) {
  if (!patch || (!patch.id && !patch.postid)) return
  const pid = String(patch.id ?? patch.postid)

  let i = Array.isArray(profilePosts.value)
    ? profilePosts.value.findIndex((p) => String(p?.id ?? p?.postid ?? '') === pid)
    : -1
  if (i >= 0) {
    const cur = profilePosts.value[i]
    const next = { ...cur, ...patch, raw: { ...(cur?.raw || {}), ...(patch?.raw || {}) } }
    if (patch.raw?.upvote_count !== undefined) next.likes = patch.raw.upvote_count
    if (patch.raw?.user_has_upvoted !== undefined)
      next.user_has_upvoted = patch.raw.user_has_upvoted
    profilePosts.value.splice(i, 1, next)
  }

  if (previewPost.value) {
    const curId = String(previewPost.value.id ?? previewPost.value.postid ?? '')
    if (curId === pid) {
      const cur = previewPost.value
      const next = { ...cur, ...patch, raw: { ...(cur?.raw || {}), ...(patch?.raw || {}) } }
      if (patch.raw?.upvote_count !== undefined) next.likes = patch.raw.upvote_count
      if (patch.raw?.user_has_upvoted !== undefined)
        next.user_has_upvoted = patch.raw.user_has_upvoted
      previewPost.value = next
    }
  }
}

// Post Preview Modal Functions
function onCardClick(e, post) {
  const t = e.target
  const container = e.currentTarget
  if (e.defaultPrevented) return
  const ignoreSelectors = [
    '.btn',
    '.btn *',
    'a',
    'a *',
    '[data-stop-preview]',
    '.no-preview',
    '.no-preview *',
    '[role="button"]',
    '[data-bs-toggle]',
    'input',
    'select',
    'textarea',
    'label',
    '[contenteditable]',
  ]
  for (const sel of ignoreSelectors) {
    const hit = t.closest(sel)
    if (hit && hit !== container) return
  }
  openPreview(post)
}
function openPreview(p) {
  previewPost.value = p
  showPreview.value = true
}
async function closePreview() {
  showPreview.value = false
  const snap = previewPost.value
  let latestPatch = null

  if (snap && (snap.id || snap.postid)) {
    const key = String(snap.id ?? snap.postid)
    try {
      const fresh = await getPostById(key)
      if (fresh) {
        const latestCount = Number(
          fresh.upvote_count ?? fresh.likes ?? snap?.raw?.upvote_count ?? snap?.likes ?? 0,
        )
        const latestFlag = Boolean(
          fresh.user_has_upvoted ?? snap?.raw?.user_has_upvoted ?? snap?.user_has_upvoted ?? false,
        )
        latestPatch = {
          id: key,
          postid: key,
          likes: latestCount,
          user_has_upvoted: latestFlag,
          raw: { upvote_count: latestCount, user_has_upvoted: latestFlag },
        }
        applyPostPatch(latestPatch)
      }
    } catch {}
  }
  previewPost.value = null
}
async function getPostById(postId) {
  try {
    const r = await api.post('/user/getPostbyId', { post_id: String(postId) }) //
    return (Array.isArray(r.data?.data) ? r.data.data[0] : r.data?.data) || null
  } catch (e) {
    console.warn('[FriendsView] getPostById failed', e)
    return null
  }
}

// === END: Merged functions ===

// Fetch all users
async function fetchAllUsers() {
  if (!activeEmail.value) {
    searchError.value = 'Please log in to view users.'
    searchLoading.value = false
    allUsersCache.value = []
    searchResults.value = []
    return
  }
  searchLoading.value = true
  searchError.value = ''
  try {
    const r = await api.post('/user/getAllUsers', { user_email: activeEmail.value })
    const usersData = Array.isArray(r.data?.data) ? r.data.data : []
    allUsersCache.value = usersData
      .filter((u) => u.email && u.email.toLowerCase() !== activeEmail.value.toLowerCase())
      .map((u) => ({
        email: u.email,
        username: u.username,
        name: u.username || u.email.split('@')[0],
        avatar: u.profile_image_url || '/default-avatar.jpg',
        isFriend: u.friendship_status === 'friend',
        isPending: u.friendship_status === 'pending',
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    onSearchInput() // Apply default view (friends+pending)
  } catch (e) {
    console.error('[friends] fetchAllUsers failed', e)
    searchError.value = e.response?.data?.message || 'Failed to load user list.'
    allUsersCache.value = []
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}

// Filter users based on search input
const onSearchInput = () => {
  searchError.value = ''
  const q = query.value.trim().toLowerCase()
  if (!q) {
    searchResults.value = allUsersCache.value
      .filter((u) => u.isFriend || u.isPending)
      .sort((a, b) => {
        if (a.isFriend && !b.isFriend) return -1
        if (!a.isFriend && b.isFriend) return 1
        return a.name.localeCompare(b.name)
      })
  } else {
    const matches = allUsersCache.value.filter((user) => {
      const emailMatch = user.email.toLowerCase().startsWith(q)
      const usernameMatch =
        user.username && user.username.length > 1
          ? user.username.toLowerCase().substring(1).startsWith(q)
          : false
      return emailMatch || usernameMatch
    })
    matches.sort((a, b) => {
      const scoreA = a.isFriend ? 1 : a.isPending ? 2 : 3
      const scoreB = b.isFriend ? 1 : b.isPending ? 2 : 3
      if (scoreA !== scoreB) {
        return scoreA - scoreB
      }
      return a.name.localeCompare(b.name)
    })
    searchResults.value = matches
  }
}

// Send friend request
async function sendFriendReq(user) {
  if (!activeEmail.value) return
  user.isPending = true
  user.isFriend = false
  try {
    await api.post('/friends/sendFriendReq', {
      user_email: activeEmail.value,
      friend_email: user.email,
    })
  } catch (e) {
    console.error('[friends] add failed', e)
    user.isPending = false
    alert(`Error: ${e.response?.data?.message || 'A request is already pending.'}`)
  }
}

// Open remove friend modal
function removeFriend(user) {
  if (!activeEmail.value) return
  userToRemove.value = user
  showConfirmRemoveModal.value = true
}

// Confirm remove friend
async function confirmRemove() {
  if (!userToRemove.value || !activeEmail.value) return
  const user = userToRemove.value
  removingFriend.value = true
  searchError.value = ''
  const originalStatus = { isFriend: user.isFriend, isPending: user.isPending }
  user.isFriend = false
  user.isPending = false
  onSearchInput() // Re-filter list
  try {
    await api.delete('/friends/removeFriend', {
      data: {
        user_email: activeEmail.value,
        friend_email: user.email,
      },
    })
    closeConfirmRemoveModal()
  } catch (e) {
    console.error('[friends] remove failed', e)
    user.isFriend = originalStatus.isFriend
    user.isPending = originalStatus.isPending
    onSearchInput()
    searchError.value = e.response?.data?.message || 'Could not remove friend'
    closeConfirmRemoveModal()
  } finally {
    removingFriend.value = false
  }
}

// Cancel remove friend
function cancelRemove() {
  closeConfirmRemoveModal()
}

// Close remove friend modal
function closeConfirmRemoveModal() {
  showConfirmRemoveModal.value = false
  setTimeout(() => {
    userToRemove.value = null
    removingFriend.value = false
  }, 300)
}

// --- UPDATED: Load INCOMING pending friend requests ---
async function loadPendingRequests() {
  if (!activeEmail.value) {
    pendingRequests.value = []
    return
  }
  pendingLoading.value = true
  pendingError.value = ''
  pendingRequests.value = []
  try {
    // This endpoint MUST return { email, username, profile_image_url }
    const r = await api.post('/friends/getPendingFriendReqs', { user_email: activeEmail.value })
    // We now expect an array of objects
    const requestData = Array.isArray(r.data?.data) ? r.data.data : []
    pendingRequests.value = requestData.map((req) => ({
      sender_email: req.email, // Use 'email' field
      username: req.username || req.email.split('@')[0],
      avatar: req.profile_image_url || '/default-avatar.jpg',
    }))
  } catch (e) {
    console.error('[friends] loadPendingRequests failed', e)
    pendingError.value = 'Failed to load pending requests.'
  } finally {
    pendingLoading.value = false
  }
}
async function openPendingModal() {
  showPendingModal.value = true
  await loadPendingRequests()
}
async function acceptFriendReq(senderEmail) {
  if (!activeEmail.value) return
  try {
    await api.post('/friends/acceptFriendReq', {
      user_email: activeEmail.value,
      friend_email: senderEmail,
    })
    pendingRequests.value = pendingRequests.value.filter((req) => req.sender_email !== senderEmail)
    const acceptedUserCache = allUsersCache.value.find((u) => u.email === senderEmail)
    if (acceptedUserCache) {
      acceptedUserCache.isFriend = true
      acceptedUserCache.isPending = false
    }
    onSearchInput()
  } catch (e) {
    console.error('[friends] acceptFriendReq failed', e)
    pendingError.value = 'Failed to accept request.'
  }
}
async function rejectFriendReq(senderEmail) {
  if (!activeEmail.value) return
  try {
    await api.post('/friends/rejectFriendReq', {
      user_email: activeEmail.value,
      friend_email: senderEmail,
    })
    pendingRequests.value = pendingRequests.value.filter((req) => req.sender_email !== senderEmail)
    const rejectedUserCache = allUsersCache.value.find((u) => u.email === senderEmail)
    if (rejectedUserCache) {
      rejectedUserCache.isFriend = false
      rejectedUserCache.isPending = false
    }
    onSearchInput()
  } catch (e) {
    console.error('[friends] rejectFriendReq failed', e)
    pendingError.value = 'Failed to reject request.'
  }
}

// Open profile modal
async function viewProfile(user) {
  if (user && !user.hasOwnProperty('isFriend')) {
    const fullUser = allUsersCache.value.find((u) => u.email === user.id)
    if (fullUser) {
      profileData.value = fullUser
    } else {
      profileData.value = {
        email: user.id,
        name: user.name,
        username: user.username,
        avatar: user.avatar || '/default-avatar.jpg',
        isFriend: user.id === activeEmail.value,
        isPending: false,
      }
    }
  } else {
    profileData.value = user
  }

  profilePosts.value = []
  profileError.value = ''
  profileLoading.value = true
  showProfileModal.value = true
  await fetchProfilePosts(profileData.value)
}

// Fetch posts for profile modal
async function fetchProfilePosts(user) {
  if (!user || !user.email) {
    profileError.value = 'User data is missing.'
    profileLoading.value = false
    return
  }
  try {
    const fetchFriendsPosts = user.isFriend === true
    const r = await api.post('/user/getUserPosts', {
      user_email: user.email,
      friends: fetchFriendsPosts,
    })
    const rawPosts = Array.isArray(r.data?.data) ? r.data.data : []
    await fetchAvatarsForPosts(rawPosts)
    profilePosts.value = rawPosts.map(normalizePostData)
  } catch (e) {
    console.error(`[friends] fetchProfilePosts for ${user.email} failed`, e)
    profileError.value = e.response?.data?.message || 'Failed to load posts for this user.'
    profilePosts.value = []
  } finally {
    profileLoading.value = false
  }
}

// Close profile modal
function closeProfileModal() {
  showProfileModal.value = false
  setTimeout(() => {
    profileData.value = null
    profilePosts.value = []
    profileLoading.value = false
    profileError.value = ''
  }, 300)
}

// Normalize post data
function normalizePostData(post) {
  const lat = Number(post.lat)
  const lng = Number(post.long)
  const pics = Array.isArray(post.pictures) //
    ? post.pictures
        .map((pic) => (pic && typeof pic === 'object' ? pic.image_url : pic))
        .filter(Boolean)
    : []

  return {
    id: post.postid,
    postid: post.postid,
    text: post.review,
    rating: post.rating,
    is_public: post.is_public,
    photos: pics,
    pictures: pics,
    user: {
      id: post.poster_email,
      name: post.poster_username,
      username: post.poster_username,
      avatar: avatarCache.value.get(post.poster_email) || null,
    },
    restaurant: {
      id: post.restaurant_id || post.restaurant_name,
      name: post.restaurant_name,
      address: post.address,
      cuisine_type: post.cuisine_type,
      area: post.area,
      price_range: post.price_level,
      latitude: lat,
      longitude: lng,
    },
    likes: 0,
    raw: {
      created_at: post.created_at,
      public: post.is_public,
      upvote_count: 0,
      user_has_upvoted: false,
      comments: [],
    },
  }
}

// Navigate to dashboard post view
function viewPostDetail(postId) {
  closeProfileModal()
  router.push({ path: '/dashboard', query: { postId: postId } }).catch(() => {})
}

// Navigate to map post view
function viewPostOnMap(post) {
  const pid = String(post.id || post.postid)
  router.push({ path: '/map', query: { postId: pid } })
}

// Helper to init tooltips
function initTooltips() {
  try {
    const Tooltip = window.bootstrap?.Tooltip
    const els = document.querySelectorAll('[data-bs-toggle="tooltip"]')
    if (Tooltip && els.length) {
      els.forEach((el) => {
        Tooltip.getInstance?.(el)?.dispose()
        new Tooltip(el)
      })
    }
  } catch {}
}

// Lifecycle Hooks
onMounted(async () => {
  await refreshAuthUser()
  await Promise.all([fetchAllUsers(), loadPendingRequests()])
  await nextTick()
})
watch(activeEmail, async (newEmail, oldEmail) => {
  if (newEmail !== oldEmail) {
    await Promise.all([fetchAllUsers(), loadPendingRequests()])
  }
})
</script>

<template>
  <div class="page sage-bg">
    <section class="container py-3">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h2 class="section-title">Community</h2>
        <div class="d-flex gap-2 align-items-center">
          <input
            v-model="query"
            @input="onSearchInput"
            class="form-control form-control-sm"
            placeholder="Search users..."
            style="min-width: 220px"
          />
          <button
            class="btn btn-sm btn-outline-secondary position-relative"
            @click="openPendingModal"
            title="Pending Requests"
          >
            Requests
            <span
              vif="pendingRequests.length > 0"
              class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
            >
              {{ pendingRequests.length }}
              <span class="visually-hidden">pending requests</span>
            </span>
          </button>
        </div>
      </div>

      <div v-if="searchLoading" class="text-center text-muted py-5 mb-3">Loading user list...</div>
      <div v-else-if="searchError" class="alert alert-danger py-2 mb-3">{{ searchError }}</div>

      <div
        v-else-if="!searchResults.length && query"
        class="empty text-muted p-4 rounded-3 bg-white shadow-sm mb-3"
      >
        No users found matching "{{ query }}".
      </div>
      <div
        v-else-if="!searchResults.length && !query"
        class="empty text-muted p-4 rounded-3 bg-white shadow-sm mb-3"
      >
        Your Friends and Pending Requests will appear here.
      </div>

      <div class="row g-3" v-else>
        <div v-for="user in searchResults" :key="user.email" class="col-12 col-md-6 col-lg-4">
          <div class="card h-100 shadow-sm border-0">
            <div class="card-body d-flex gap-3 align-items-center">
              <img
                :src="user.avatar"
                alt="Avatar"
                class="rounded-circle flex-shrink-0"
                style="width: 56px; height: 56px; object-fit: cover; border: 1px solid #eee"
                @error="$event.target.src = '/default-avatar.jpg'"
              />
              <div class="flex-grow-1" style="min-width: 0">
                <a
                  href="#"
                  @click.prevent="viewProfile(user)"
                  class="text-decoration-none profile-link"
                  :title="`View ${user.name}'s profile`"
                >
                  <div class="fw-bold text-truncate text-dark">{{ user.name }}</div>
                  <div class="text-muted small text-truncate">{{ user.email }}</div>
                </a>
              </div>
              <div class="d-flex flex-column align-items-end gap-2 flex-shrink-0">
                <button
                  v-if="user.isFriend"
                  class="btn btn-sm btn-outline-danger"
                  @click="removeFriend(user)"
                >
                  Remove
                </button>
                <button
                  v-else-if="user.isPending"
                  class="btn btn-sm btn-outline-secondary"
                  disabled
                >
                  Pending
                </button>
                <button v-else class="btn btn-sm btn-fit" @click="sendFriendReq(user)">Add</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <Modal
      :show="showPendingModal"
      title="Incoming Friend Requests"
      @close="showPendingModal = false"
    >
      <div v-if="pendingLoading" class="text-center text-muted py-3">Loading requests…</div>
      <div v-else-if="pendingError" class="alert alert-danger py-2">{{ pendingError }}</div>
      <div v-else-if="!pendingRequests.length" class="text-center text-muted py-3">
        You have no pending friend requests.
      </div>
      <div v-else>
        <ul class="list-group list-group-flush">
          <li
            v-for="req in pendingRequests"
            :key="req.sender_email"
            class="list-group-item d-flex align-items-center justify-content-between"
          >
            <div class="d-flex align-items-center gap-2" style="min-width: 0">
              <img
                :src="req.avatar"
                alt=""
                class="rounded-circle flex-shrink-0"
                style="width: 40px; height: 40px; object-fit: cover; border: 1px solid #eee"
                @error="$event.target.src = '/default-avatar.jpg'"
              />
              <div class="flex-grow-1" style="min-width: 0">
                <div class="fw-semibold text-truncate">{{ req.username }}</div>
                <div class="small text-muted text-truncate">{{ req.sender_email }}</div>
              </div>
            </div>
            <div class="d-flex gap-2 flex-shrink-0">
              <button class="btn btn-sm btn-primary" @click="acceptFriendReq(req.sender_email)">
                Accept
              </button>
              <button
                class="btn btn-sm btn-outline-danger"
                @click="rejectFriendReq(req.sender_email)"
              >
                Reject
              </button>
            </div>
          </li>
        </ul>
      </div>
    </Modal>

    <Modal
      :show="showProfileModal"
      :title="`${profileData?.name || 'User Profile'}`"
      @close="closeProfileModal"
      size="lg"
    >
      <div v-if="profileData" class="profile-modal-content">
        <div
          class="profile-header d-flex align-items-center gap-3 mb-4 p-3 bg-light rounded border"
        >
          <img
            :src="profileData.avatar"
            alt="Avatar"
            class="rounded-circle flex-shrink-0"
            style="
              width: 80px;
              height: 80px;
              object-fit: cover;
              border: 2px solid #fff;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            "
            @error="$event.target.src = '/default-avatar.jpg'"
          />
          <div class="flex-grow-1" style="min-width: 0">
            <div class="fw-bold h5 mb-0 text-truncate">{{ profileData.name }}</div>
            <div class="text-muted small text-truncate">{{ profileData.email }}</div>
          </div>
          <div class="d-flex flex-column align-items-end gap-2 flex-shrink-0">
            <button
              v-if="profileData.isFriend"
              class="btn btn-sm btn-outline-danger"
              @click="removeFriend(profileData)"
            >
              Remove
            </button>
            <button
              v-else-if="profileData.isPending"
              class="btn btn-sm btn-outline-secondary"
              disabled
            >
              Pending
            </button>
            <button v-else class="btn btn-sm btn-fit" @click="sendFriendReq(profileData)">
              Add
            </button>
          </div>
        </div>

        <h6 class="fw-semibold mb-3 ps-1 section-sub-title">
          Posts {{ profileData.isFriend ? '' : '(Public Only)' }}
        </h6>
        <div v-if="profileLoading" class="text-center text-muted py-4">
          <div class="spinner-border spinner-border-sm text-secondary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <span class="ms-2">Loading posts...</span>
        </div>
        <div v-else-if="profileError" class="alert alert-warning py-2 small">
          {{ profileError }}
        </div>
        <div
          v-else-if="!profilePosts.length"
          class="text-center text-muted py-4 small profile-empty-posts"
        >
          {{
            profileData.isFriend
              ? "This user hasn't posted anything yet."
              : "This user hasn't made any public posts yet."
          }}
        </div>
        <div v-else class="row g-3 profile-posts-grid">
          <div v-for="post in profilePosts" :key="post.id" class="col-12 col-md-6">
            <div
              class="card post-card h-100 border-0 card-clickable profile-post-card"
              @click="onCardClick($event, post)"
              role="button"
              tabindex="0"
              :title="`View post for ${post.restaurant_name}`"
            >
              <PostCard
                :post="post"
                :controls="false"
                :current-user-email="activeEmail"
                :external-comment-count="commentCounts[post.id] ?? 0"
                @open-comments="onOpenComments"
                @open-profile="viewProfile"
                @view-on-map="viewPostOnMap"
                @updated="applyPostPatch"
                @post-updated="applyPostPatch"
                @liked="applyPostPatch"
                @unliked="applyPostPatch"
                class="h-100"
              />
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-center text-muted py-5">Loading profile...</div>
    </Modal>

    <Modal
      :show="showConfirmRemoveModal"
      title="Remove Friend"
      @close="cancelRemove"
      modal-class="comments-modal-on-top"
    >
      <div v-if="userToRemove" class="p-2">
        <p>
          Are you sure you want to remove
          <strong>{{ userToRemove.name || userToRemove.email }}</strong> from your friends list?
        </p>
        <div class="d-flex justify-content-end gap-2 mt-4">
          <button
            class="btn btn-outline-secondary"
            @click="cancelRemove"
            :disabled="removingFriend"
          >
            Cancel
          </button>
          <button class="btn btn-danger" @click="confirmRemove" :disabled="removingFriend">
            <span
              v-if="removingFriend"
              class="spinner-border spinner-border-sm me-1"
              role="status"
              aria-hidden="true"
            ></span>
            {{ removingFriend ? 'Removing...' : 'Confirm Remove' }}
          </button>
        </div>
      </div>
    </Modal>

    <Modal
      :show="showPreview"
      title="Post Preview"
      @close="closePreview"
      size="lg"
      modal-class="preview-modal-on-top"
    >
      <div class="preview-wrap">
        <div class="card themed-card position-relative preview-card" v-if="previewPost">
          <PostCard
            :post="previewPost"
            :feed="previewPost?.is_public ? 'public' : 'friends'"
            :controls="true"
            :caption-max-lines="0"
            :current-user-email="activeEmail"
            :external-comment-count="
              commentCounts[previewPost?.id] ??
              commentCounts[previewPost?.postid] ??
              (previewPost?.raw?.comments?.length || 0)
            "
            @open-comments="onOpenComments"
            @open-profile="viewProfile"
            @view-on-map="viewPostOnMap"
            @updated="applyPostPatch"
            @post-updated="applyPostPatch"
            @liked="applyPostPatch"
            @unliked="applyPostPatch"
          />
        </div>
      </div>
    </Modal>

    <Modal
      :show="showComments"
      title="Comments"
      @close="closeComments"
      modal-class="comments-modal-on-top"
    >
      <div class="container py-2">
        <div v-if="!comments.length" class="text-muted mb-2">No comments yet. Be the first!</div>
        <ul class="list-unstyled mb-3">
          <li
            v-for="(c, idx) in comments"
            :key="idx"
            class="d-flex align-items-start gap-2 py-2 border-bottom"
          >
            <img
              :src="
                c?.commenter_avatar ||
                commenter_avatar ||
                item?.commenter_avatar ||
                row?.commenter_avatar
              "
              alt="avatar"
              class="comment-avatar rounded-circle me-2"
              style="width: 32px; height: 32px; object-fit: cover"
              @error="onCommentAvatarError"
            />
            <div class="flex-grow-1">
              <div class="fw-semibold small">{{ c.commenter_name || c.commenter_email }}</div>
              <div class="small">{{ c.comment }}</div>
            </div>
            <div class="d-flex gap-2">
              <button
                class="btn btn-sm btn-outline-secondary"
                :disabled="c.commenter_email !== activeEmail"
                @click="
                  () => {
                    newComment = c.comment
                    editingComment = c
                  }
                "
              >
                Edit
              </button>
              <button
                class="btn btn-sm btn-outline-danger"
                @click="deleteComment(c)"
                :disabled="c.commenter_email !== activeEmail"
              >
                Delete
              </button>
            </div>
          </li>
        </ul>
        <div v-if="editingComment" class="text-muted small mb-2">
          Editing your comment…
          <button
            class="btn btn-link btn-sm p-0 ms-1"
            @click="
              () => {
                editingComment = null
                newComment = ''
              }
            "
          >
            cancel
          </button>
        </div>
        <form class="d-flex gap-2" @submit.prevent="submitComment">
          <input
            v-model="newComment"
            type="text"
            class="form-control"
            placeholder="Write a comment..."
          />
          <button class="btn btn-primary" type="submit" :disabled="!newComment.trim()">
            {{ editingComment ? 'Save' : 'Send' }}
          </button>
        </form>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.page {
  min-height: calc(100vh - 56px);
  padding: 18px 0 80px;
}
.section-title {
  font-weight: 800;
  color: var(--charcoal);
  margin: 0;
}
.empty {
  text-align: center;
  color: var(--ink-400);
  font-weight: 500;
}
.btn-fit {
  background: var(--accent, var(--terra-500, #ca6b4f));
  color: #fff;
  border: 0;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
.btn-fit:disabled {
  opacity: 0.6;
}

.profile-link:hover .text-dark {
  color: var(--accent, #ca6b4f) !important;
}
.profile-link:hover .text-muted {
  color: var(--accent, #ca6b4f) !important;
  opacity: 0.8;
}

.list-group-item {
  background: transparent;
  padding-left: 0;
  padding-right: 0;
  border: 0;
  border-bottom: 1px solid var(--line-100, #eee);
}
.list-group-flush > .list-group-item:last-child {
  border-bottom-width: 0;
}

.profile-modal-content {
  padding: 0.25rem;
}
.profile-header {
  border-bottom: 1px solid var(--line-100, #eee);
  background-color: var(--surface-hover, #f8f9fa) !important;
}
.section-sub-title {
  color: var(--ink-700);
}
.profile-posts-grid {
  max-height: calc(75vh - 200px);
  overflow-y: auto;
  padding: 0 0.5rem 0.5rem;
  margin-right: -8px;
  padding-right: 8px;
}
.profile-empty-posts {
  font-style: italic;
}

.profile-post-card .post-image-wrapper {
  padding-top: 100%;
  position: relative;
}
.profile-post-card .post-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.profile-post-card .rating-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 0.65rem;
  padding: 1px 4px;
  background-color: rgba(0, 0, 0, 0.7);
  color: #fff;
  border-radius: 4px;
}
.profile-post-card.card-clickable:hover {
  transform: none;
  box-shadow: none;
  outline: 2px solid var(--accent, #ca6b4f);
  outline-offset: 1px;
}
.card-clickable {
  cursor: pointer;
  display: block;
  text-decoration: none;
}
.card-clickable:hover .postcard-wrapper {
  transform: translateY(-2px);
  transition: transform 0.15s ease-out;
}

:deep(.modal .modal-content) {
  background: var(--surface);
  color: var(--charcoal);
  border: 1px solid var(--line-200);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
}
:deep(.modal-body) {
  padding: 1rem 1.25rem;
}
:deep(.modal-header) {
  border-bottom: 1px solid var(--line-100);
  padding: 0.75rem 1.25rem;
}
:deep(.modal-title) {
  font-weight: 700;
  font-size: 1.1rem;
}
:deep(.modal.modal-lg .modal-dialog) {
  max-width: 800px;
}
:deep(.modal .btn-primary) {
  background: var(--sage-600);
  border: none;
  color: #fff;
  font-weight: 800;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
:deep(.modal .btn-danger) {
  background-color: #dc3545;
  border-color: #dc3545;
  color: #fff;
}
:deep(.modal .btn-danger:hover) {
  background-color: #bb2d3b;
  border-color: #b02a37;
}

:deep(.modal .form-label),
:deep(.modal label) {
  color: var(--charcoal);
  font-weight: 700;
}
:deep(.modal .text-muted),
:deep(.modal .form-text) {
  color: var(--ink-400) !important;
}
:deep(.modal .form-control),
:deep(.modal .form-select) {
  background: #fff;
  color: #111827;
  border: 1.5px solid var(--line-200);
  border-radius: 12px;
}

.commenter-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: #f2f2f2;
}

/* Compact avatar sizing for comments */
.comment-avatar,
img[alt="avatar"] {
  width: 32px !important;
  height: 32px !important;
  object-fit: cover;
  border-radius: 50%;
}

.preview-wrap {
  position: relative;
}
.preview-card {
  max-width: min(1200px, 96vw);
  margin: 0 auto;
}
:deep(.modal .modal-content) {
  max-height: 96vh;
  overflow: auto;
}
:deep(.modal) .preview-card img:not(.avatar),
:deep(.modal) .preview-card .post-image,
:deep(.modal) .preview-card .media img {
  max-width: 100%;
  width: auto;
  height: auto !important;
  object-fit: contain !important;
  object-position: center center !important;
  display: block;
}
:deep(.modal) .preview-card .image-wrap,
:deep(.modal) .preview-card .photo-wrap,
:deep(.modal) .preview-card .media,
:deep(.modal) .preview-card .photo-box {
  height: auto !important;
  max-height: none !important;
  aspect-ratio: auto !important;
  overflow: visible !important;
}

:deep(.preview-modal-on-top .modal-overlay) {
  z-index: 1060;
}
:deep(.preview-modal-on-top .modal-dialog) {
  z-index: 1061;
}

:deep(.comments-modal-on-top .modal-overlay) {
  z-index: 1070;
}
:deep(.comments-modal-on-top .modal-dialog) {
  z-index: 1071;
}

:deep(.modal .btn-fit) {
  background: var(--accent, var(--terra-500, #ca6b4f));
  color: #fff;
  border: 0;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
</style>