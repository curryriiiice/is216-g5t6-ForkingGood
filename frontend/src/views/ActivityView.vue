<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue'
import axios from 'axios'
import Modal from '@/components/Modal.vue'
import { useRouter } from 'vue-router'
import PostCard from '@/components/PostCard.vue'
import { useAuthUser } from '@/lib/useAuthUser'

// API
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } })
const IMAGE_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_IMAGE_BASE_URL || API_BASE)
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' }
const COMMENTS_EP = {
  get: `${API_BASE}/friends/getCommentsbyPostId`,
  add: `${API_BASE}/friends/commentPost`,
  del: `${API_BASE}/friends/deleteComment`,
  edit: `${API_BASE}/friends/editComment`,
}

// Auth
const { user: authUser, refresh: refreshAuthUser } = useAuthUser()
const activeEmail = computed(() => authUser.value?.email ?? null)

const router = useRouter()

// UI State
const activeTab = ref('myPosts')
const myPosts = ref([])
const likedPosts = ref([])
const loadingMyPosts = ref(true)
const errorMyPosts = ref('')
const loadingLikedPosts = ref(true)
const errorLikedPosts = ref('')

// Comment Modal State
const showComments = ref(false)
const commentsForPostId = ref(null)
const comments = ref([])
const newComment = ref('')
const editingComment = ref(null)
const commentCounts = ref({})

// Cache for profile pictures
const avatarCache = ref(new Map())

// Helper function to fetch avatars for a list of posts
async function fetchAvatarsForPosts(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return;
  const emailsToFetch = new Set();
  for (const post of posts) {
    if (post.poster_email && !avatarCache.value.has(post.poster_email)) {
      emailsToFetch.add(post.poster_email);
    }
  }
  if (emailsToFetch.size === 0) return;

  const promises = Array.from(emailsToFetch).map(email =>
    api.post('/user/getPfpByEmail', { user_email: email }) //
      .then(res => ({ email, url: res.data?.data })) //
      .catch(err => ({ email, url: null, error: err }))
  );

  const results = await Promise.allSettled(promises);

  const newCache = new Map(avatarCache.value);
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.url) {
      newCache.set(result.value.email, result.value.url);
    }
  }
  avatarCache.value = newCache;
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
    comments.value = Array.isArray(data?.data) ? data.data : []
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

  const draft = { commenter_email: email, comment }
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
  
  let i = Array.isArray(myPosts.value) ? myPosts.value.findIndex((p) => String(p?.id ?? p?.postid ?? '') === pid) : -1
  if (i >= 0) {
    const cur = myPosts.value[i]
    const next = { ...cur, ...patch, raw: { ...(cur?.raw || {}), ...(patch?.raw || {}) } }
    if (patch.raw?.upvote_count !== undefined) next.likes = patch.raw.upvote_count
    if (patch.raw?.user_has_upvoted !== undefined) next.user_has_upvoted = patch.raw.user_has_upvoted
    myPosts.value.splice(i, 1, next)
  }

  i = Array.isArray(likedPosts.value) ? likedPosts.value.findIndex((p) => String(p?.id ?? p?.postid ?? '') === pid) : -1
  if (i >= 0) {
    const cur = likedPosts.value[i]
    const next = { ...cur, ...patch, raw: { ...(cur?.raw || {}), ...(patch?.raw || {}) } }
    if (patch.raw?.upvote_count !== undefined) next.likes = patch.raw.upvote_count
    if (patch.raw?.user_has_upvoted !== undefined) next.user_has_upvoted = patch.raw.user_has_upvoted
    likedPosts.value.splice(i, 1, next)
  }
}

// Fetch User's Own Posts
async function fetchMyPosts() {
  if (!activeEmail.value) {
    errorMyPosts.value = 'Please log in to see your posts.'
    loadingMyPosts.value = false
    myPosts.value = []
    return
  }
  loadingMyPosts.value = true
  errorMyPosts.value = ''
  myPosts.value = []
  try {
    const r = await api.post('/user/getUserPosts', { //
      user_email: activeEmail.value,
      friends: false, //
    })
    const rawPosts = Array.isArray(r.data?.data) ? r.data.data : []
    await fetchAvatarsForPosts(rawPosts);
    myPosts.value = rawPosts.map(normalizePostData)
  } catch (e) {
    console.error('[ActivityView] fetchMyPosts failed', e)
    errorMyPosts.value = e.response?.data?.message || 'Failed to load your posts.'
  } finally {
    loadingMyPosts.value = false
  }
}

// Fetch User's Liked Posts
async function fetchLikedPosts() {
   if (!activeEmail.value) {
    errorLikedPosts.value = 'Please log in to see liked posts.'
    loadingLikedPosts.value = false
    likedPosts.value = []
    return
  }
  loadingLikedPosts.value = true
  errorLikedPosts.value = ''
  likedPosts.value = []
  try {
    const r = await api.post('/user/getLikedPosts', { //
      user_email: activeEmail.value,
    })
    const rawPosts = Array.isArray(r.data?.data) ? r.data.data : []
    await fetchAvatarsForPosts(rawPosts);
    likedPosts.value = rawPosts.map(normalizePostData)
  } catch (e) {
    console.error('[ActivityView] fetchLikedPosts failed', e)
    errorLikedPosts.value = e.response?.data?.message || 'Failed to load liked posts.'
  } finally {
    loadingLikedPosts.value = false
  }
}

// Helper to resolve image URLs (used by PostCard)
function resolveImageUrl(p) {
  if (!p) return null
  let s = String(p).trim().replace(/^['"]+|['"]+$/g, '')
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s
  s = s.replace(/^[./]+/, '').replace(/^\/+/, '')
  return IMAGE_BASE ? `${IMAGE_BASE}/${s}` : `/${s}`
}

// Normalize data for PostCard component
function normalizePostData(post) {
  const lat = Number(post.lat) //
  const lng = Number(post.long) //
  
  // Handle picURLs array
  const pics = Array.isArray(post.picURLs)
    ? post.picURLs.map(pic => (pic && typeof pic === 'object' ? pic.image_url : pic)).filter(Boolean)
    : []

  return {
    id: post.postid, //
    postid: post.postid,
    text: post.review, //
    rating: post.rating, //
    is_public: post.is_public, //
    photos: pics,
    pictures: pics,
    user: {
      id: post.poster_email, //
      name: post.poster_username, //
      username: post.poster_username,
      avatar: avatarCache.value.get(post.poster_email) || null,
    },
    restaurant: {
      id: post.restaurant_id || post.restaurant_name,
      name: post.restaurant_name, //
      address: post.address, //
      cuisine_type: post.cuisine_type, //
      area: post.area, //
      price_range: post.price_level, //
      latitude: lat,
      longitude: lng,
    },
    likes: 0,
    raw: {
      created_at: post.created_at, //
      public: post.is_public,
      upvote_count: 0,
      user_has_upvoted: false,
      comments: [],
    },
  }
}

// Navigation
function viewPostDetail(postId) {
   router.push({ path: '/dashboard', query: { postId: postId } }).catch(() => {})
}

onMounted(async () => {
  await refreshAuthUser()
  await Promise.all([fetchMyPosts(), fetchLikedPosts()])
  await nextTick()
})

watch(activeEmail, async (newEmail, oldEmail) => {
  if (newEmail !== oldEmail) {
    await Promise.all([fetchMyPosts(), fetchLikedPosts()])
  }
})

</script>

<template>
  <div class="page sage-bg">
    <section class="container py-3">
      <h2 class="section-title mb-4">Activity</h2>

      <ul class="nav nav-pills justify-content-center mb-4 activity-tabs">
        <li class="nav-item">
          <button
            class="nav-link"
            :class="{ active: activeTab === 'myPosts' }"
            @click="activeTab = 'myPosts'"
            type="button"
          >
            My Posts
          </button>
        </li>
        <li class="nav-item">
          <button
            class="nav-link"
            :class="{ active: activeTab === 'likedPosts' }"
            @click="activeTab = 'likedPosts'"
            type="button"
          >
            Liked Posts
          </button>
        </li>
      </ul>

      <div>
        <div v-show="activeTab === 'myPosts'">
          <div v-if="loadingMyPosts" class="text-center text-muted py-5">Loading your posts…</div>
          <div v-else-if="errorMyPosts" class="alert alert-danger py-2">{{ errorMyPosts }}</div>
          <div
            v-else-if="!myPosts.length"
            class="empty text-muted p-4 rounded-3 bg-white shadow-sm"
          >
            You haven't created any posts yet.
          </div>
          <div class="row g-3" v-else>
            <div v-for="post in myPosts" :key="'my-' + post.id" class="col-12 col-md-6">
              <div
                class="card-clickable"
                @click="viewPostDetail(post.id)"
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

        <div v-show="activeTab === 'likedPosts'">
          <div v-if="loadingLikedPosts" class="text-center text-muted py-5">Loading liked posts…</div>
          <div v-else-if="errorLikedPosts" class="alert alert-danger py-2">{{ errorLikedPosts }}</div>
          <div
            v-else-if="!likedPosts.length"
            class="empty text-muted p-4 rounded-3 bg-white shadow-sm"
          >
            You haven't liked any posts yet.
          </div>
          <div class="row g-3" v-else>
            <div v-for="post in likedPosts" :key="'liked-' + post.id" class="col-12 col-md-6">
               <div
                class="card-clickable"
                @click="viewPostDetail(post.id)"
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
      </div>
    </section>

    <Modal :show="showComments" title="Comments" @close="closeComments">
      <div class="container py-2">
        <div v-if="!comments.length" class="text-muted mb-2">No comments yet. Be the first!</div>
        <ul class="list-unstyled mb-3">
          <li
            v-for="(c, idx) in comments"
            :key="idx"
            class="d-flex align-items-start gap-2 py-2 border-bottom"
          >
            <div class="flex-grow-1">
              <div class="fw-semibold small">{{ c.commenter_email }}</div>
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
  background-color: var(--page-bg, var(--app-bg, var(--bg, #f3f4f6)));
}
.section-title {
  font-weight: 800;
  color: var(--charcoal);
  text-align: center;
}
.empty {
  text-align: center;
  color: var(--ink-400);
  font-weight: 500;
}

.activity-tabs {
  border-bottom: 1px solid var(--line-100, #e5e7eb);
  padding-bottom: 0;
}
.activity-tabs .nav-item {
  flex-grow: 1;
  text-align: center;
}
.activity-tabs .nav-link {
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--ink-400, #6b7280);
  font-weight: 600;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
  margin-bottom: -1px;
  border-radius: 0;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
  width: 100%;
}
.activity-tabs .nav-link:hover {
  border-bottom-color: var(--line-200, #d1d5db);
  color: var(--charcoal, #1f2937);
}
.activity-tabs .nav-link.active {
  color: var(--charcoal, #1f2937);
  background-color: transparent !important;
  border-bottom-color: var(--charcoal, #1f2937);
  font-weight: 700;
}
.activity-tabs .nav-link:focus {
  outline: none;
  box-shadow: none;
}

.card-clickable {
    cursor: pointer;
    display: block;
    text-decoration: none;
}
.card-clickable:hover {
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
:deep(.modal .btn-primary) {
  background: var(--sage-600);
  border: none;
  color: #fff;
  font-weight: 800;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
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
</style>