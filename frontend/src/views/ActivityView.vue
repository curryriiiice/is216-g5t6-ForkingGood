// FILENAME: ActivityView.vue
<script setup>
// vue imports
import { ref, onMounted, nextTick, computed, watch } from 'vue'
import Modal from '@/components/Modal.vue'
import { useRoute, useRouter } from 'vue-router'
import PostCard from '@/components/PostCard.vue'

// auth imports
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
const route = useRoute()

// UI State
const activeTab = ref('myPosts')
const myPosts = ref([])
const likedPosts = ref([])
const loadingMyPosts = ref(true)
const errorMyPosts = ref('')
const loadingLikedPosts = ref(true)
const errorLikedPosts = ref('')

// Avatar Cache
const avatarCache = ref(new Map())

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

// Profile Modal State
const showProfileModal = ref(false)
const profileData = ref(null)
const profilePosts = ref([])
const profileLoading = ref(false)
const profileError = ref('')

// Remove Confirmation Modal State (Needed for profile modal)
const showConfirmRemoveModal = ref(false)
const userToRemove = ref(null)
const removingFriend = ref(false)
const awaitingPostId = ref(null)


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
    api.post('/user/getPfpByEmail', { user_email: email })
      .then(res => ({ email, url: res.data?.data }))
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
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ postid: String(postId) }),
    })
    const data = await res.json()
    comments.value = Array.isArray(data?.data) ? data.data : []
    commentCounts.value[String(postId)] = comments.value.length
  } catch { comments.value = [] }
}
function onOpenComments({ postId }) {
  showComments.value = true
  loadComments(postId)
}
function closeComments() {
  showComments.value = false; newComment.value = ''; comments.value = [];
  commentsForPostId.value = null; editingComment.value = null;
}
async function submitComment() {
  const postid = commentsForPostId.value; const comment = newComment.value?.trim();
  if (!postid || !comment) return;
  if (editingComment.value) {
    const item = editingComment.value; editingComment.value = null; newComment.value = '';
    return editComment(item, comment);
  }
  const email = activeEmail.value; if (!email) return;
  const draft = { commenter_email: email, comment };
  comments.value = [...comments.value, draft]; newComment.value = '';
  try {
    const res = await fetch(COMMENTS_EP.add, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ commenter_email: email, postid: String(postid), comment }),
    });
    if (!res.ok) throw new Error('comment failed');
    await loadComments(postid);
  } catch { comments.value = comments.value.filter((c) => !(c === draft)); }
}
async function deleteComment(item) {
  const postid = commentsForPostId.value; if (!postid) return;
  const prev = [...comments.value];
  comments.value = comments.value.filter((c) => !(c.commenter_email === item.commenter_email && c.comment === item.comment));
  try {
    const res = await fetch(COMMENTS_EP.del, {
      method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({ postid: String(postid), commenter_email: item.commenter_email, comment: item.comment }),
    });
    if (!res.ok) throw new Error('delete failed');
    await loadComments(postid);
  } catch { comments.value = prev; }
}
async function editComment(item, newText) {
  const postid = commentsForPostId.value; const nextText = (newText ?? '').trim();
  if (!postid || !nextText) return; const oldText = item.comment; if (nextText === oldText) return;
  const prev = [...comments.value];
  comments.value = comments.value.map((c) => (c === item ? { ...c, comment: nextText } : c));
  try {
    const res = await fetch(COMMENTS_EP.edit, {
      method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ postid: String(postid), commenter_email: item.commenter_email, old_comment: oldText, new_comment: nextText }),
    });
    if (!res.ok) throw new Error('edit failed');
    await loadComments(postid);
  } catch { comments.value = prev; }
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

  if (previewPost.value) {
    const curId = String(previewPost.value.id ?? previewPost.value.postid ?? '')
    if (curId === pid) {
      const cur = previewPost.value
      const next = { ...cur, ...patch, raw: { ...(cur?.raw || {}), ...(patch?.raw || {}) } }
      if (patch.raw?.upvote_count !== undefined) next.likes = patch.raw.upvote_count
      if (patch.raw?.user_has_upvoted !== undefined) next.user_has_upvoted = patch.raw.user_has_upvoted
      previewPost.value = next
    }
  }
  
  if (profileData.value) {
    let j = Array.isArray(profilePosts.value) ? profilePosts.value.findIndex((p) => String(p?.id ?? p?.postid ?? '') === pid) : -1
    if (j >= 0) {
      const cur = profilePosts.value[j]
      const next = { ...cur, ...patch, raw: { ...(cur?.raw || {}), ...(patch?.raw || {}) } }
      if (patch.raw?.upvote_count !== undefined) next.likes = patch.raw.upvote_count
      if (patch.raw?.user_has_upvoted !== undefined) next.user_has_upvoted = patch.raw.user_has_upvoted
      profilePosts.value.splice(j, 1, next)
    }
  }
}

// Post Preview Modal Functions
function onCardClick(e, post) {
  const t = e.target
  const container = e.currentTarget
  if (e.defaultPrevented) return
  const ignoreSelectors = ['.btn', '.btn *', 'a', 'a *', '[data-stop-preview]', '.no-preview', '.no-preview *', '[role="button"]', '[data-bs-toggle]', 'input', 'select', 'textarea', 'label', '[contenteditable]']
  for (const sel of ignoreSelectors) {
    const hit = t.closest(sel)
    if (hit && hit !== container) return
  }
  openPreview(post)
}
function openPreview(p) {
  previewPost.value = p
  showPreview.value = true
  nextTick(() => initTooltips())
}

function tryOpenPostFromMyPosts(postId) {
  const pid = String(postId || '')
  if (!pid) return false
  const list = Array.isArray(myPosts.value) ? myPosts.value : []
  const found = list.find((p) => String(p?.id ?? p?.postid ?? '') === pid)
  if (!found) return false
  activeTab.value = 'myPosts'
  openPreview(found)
  return true
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
        const latestCount = Number(fresh.upvote_count ?? fresh.likes ?? snap?.raw?.upvote_count ?? snap?.likes ?? 0)
        const latestFlag = Boolean(fresh.user_has_upvoted ?? snap?.raw?.user_has_upvoted ?? snap?.user_has_upvoted ?? false)
        latestPatch = {
          id: key, postid: key, likes: latestCount, user_has_upvoted: latestFlag,
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
    const r = await api.post('/user/getPostbyId', { post_id: String(postId) })
    return (Array.isArray(r.data?.data) ? r.data.data[0] : r.data?.data) || null
  } catch (e) { console.warn('[ActivityView] getPostById failed', e); return null; }
}


// --- Profile Modal Functions (MOCKED FRIENDSHIP STATUS) ---
async function viewProfile(user) {
  if (!user || !user.id) { console.warn('viewProfile called with invalid user object', user); return; }
  // Don't open profile modal for yourself, navigate to profile page
  if (user.id === activeEmail.value) {
    router.push('/profile').catch(() => {});
    return;
  }

  showProfileModal.value = true
  profileLoading.value = true
  profileError.value = ''
  profilePosts.value = []
  
  try {
    const userEmail = user.id; // user.id from PostCard is poster_email
    
    // Call getPfpByEmail to get avatar
    const pfpPromise = api.post('/user/getPfpByEmail', { user_email: userEmail });
    
    // We have to mock friendship status as we don't know it here.
    // We only fetch public posts.
    // NOTE: This means 'Add/Remove Friend' buttons in this modal are placeholders
    const pData = {
        email: userEmail,
        username: user.name || user.username,
        name: user.name || user.username,
        avatar: (await pfpPromise).data?.data || '/default-avatar.jpg',
        isFriend: false, // Cannot know this from ActivityView
        isPending: false, // Cannot know this from ActivityView
    };
    profileData.value = pData;
    
    // Fetch only public posts for this user
    await fetchProfilePosts(pData, false); // Force fetch public posts
    
  } catch (e) {
    console.error(`[ActivityView] viewProfile for ${user.id} failed`, e)
    profileError.value = 'Failed to load profile.'
    profileLoading.value = false
  }
  // loading is set to false inside fetchProfilePosts
}
async function fetchProfilePosts(user, isFriend = false) { // Default to fetching public posts
  if (!user || !user.email) {
    profileError.value = 'User data is missing.'; profileLoading.value = false; return;
  }
  profileLoading.value = true;
  profilePosts.value = [];
  profileError.value = '';
  try {
    const r = await api.post('/user/getUserPosts', {
      user_email: user.email,
      friends: isFriend, // Use the passed-in status
    });
    profilePosts.value = (Array.isArray(r.data?.data) ? r.data.data : []).map(normalizePostData)
  } catch (e) {
    console.error(`[ActivityView] fetchProfilePosts for ${user.email} failed`, e);
    profileError.value = e.response?.data?.message || 'Failed to load posts for this user.';
  } finally {
    profileLoading.value = false;
  }
}
function closeProfileModal() {
  showProfileModal.value = false;
  setTimeout(() => {
    profileData.value = null; profilePosts.value = [];
    profileLoading.value = false; profileError.value = '';
  }, 300);
}

// Mocked friend actions for the profile modal
function sendFriendReq(user) { alert('To add this user, please find them on the Friends page.'); }
function removeFriend(user) { alert('To remove this user, please find them on the Friends page.'); }


// --- Fetch User's Own Posts ---
async function fetchMyPosts() {
  if (!activeEmail.value) {
    errorMyPosts.value = 'Please log in to see your posts.'
    loadingMyPosts.value = false; myPosts.value = []; return;
  }
  loadingMyPosts.value = true; errorMyPosts.value = ''; myPosts.value = [];
  try {
    const r = await api.post('/user/getUserPosts', {
      user_email: activeEmail.value,
      friends: true, //
    })
    const rawPosts = Array.isArray(r.data?.data) ? r.data.data : []
    await fetchAvatarsForPosts(rawPosts);
    myPosts.value = rawPosts.map(normalizePostData)
  } catch (e) {
    errorMyPosts.value = e.response?.data?.message || 'Failed to load your posts.'
  } finally {
    loadingMyPosts.value = false
  }
}

// --- Fetch User's Liked Posts ---
async function fetchLikedPosts() {
   if (!activeEmail.value) {
    errorLikedPosts.value = 'Please log in to see liked posts.'
    loadingLikedPosts.value = false; likedPosts.value = []; return;
  }
  loadingLikedPosts.value = true; errorLikedPosts.value = ''; likedPosts.value = [];
  try {
    const r = await api.post('/user/getLikedPosts', {
      user_email: activeEmail.value,
    })
    const rawPosts = Array.isArray(r.data?.data) ? r.data.data : []
    await fetchAvatarsForPosts(rawPosts);
    likedPosts.value = rawPosts.map(normalizePostData)
  } catch (e) {
    errorLikedPosts.value = e.response?.data?.message || 'Failed to load liked posts.'
  } finally {
    loadingLikedPosts.value = false
  }
}

// --- Helper to resolve image URLs ---
function resolveImageUrl(p) {
  if (!p) return null
  let s = String(p).trim().replace(/^['"]+|['"]+$/g, '')
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s
  s = s.replace(/^[./]+/, '').replace(/^\/+/, '')
  return IMAGE_BASE ? `${IMAGE_BASE}/${s}` : `/${s}`
}

// --- Normalize data for PostCard component ---
function normalizePostData(post) {
  const lat = Number(post.lat)
  const lng = Number(post.long)
  
  const pics = Array.isArray(post.pictures) //
    ? post.pictures.map(pic => (pic && typeof pic === 'object' ? pic.image_url : pic)).filter(Boolean)
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

// --- Navigation ---
function viewOnMap(post) {
   const pid = String(post?.id ?? post?.postid ?? '');
   if (!pid) return;
   router.push({ path: '/map', query: { postId: pid } });
}

// --- Helper to init tooltips ---
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

watch(
  () => route.query?.postId,
  (next) => {
    const pid = next ? String(next) : null
    awaitingPostId.value = pid
    if (pid) {
      if (tryOpenPostFromMyPosts(pid)) {
        awaitingPostId.value = null
      }
    }
  },
  { immediate: true },
)

watch(
  () => route.query?.tab,
  (next) => {
    const tab = next ? String(next) : null
    if (!tab) return
    if (tab === 'myPosts' || tab === 'likedPosts') {
      activeTab.value = tab
    }
  },
  { immediate: true },
)

watch(
  [myPosts, awaitingPostId],
  ([_posts, pid]) => {
    if (!pid) return
    if (tryOpenPostFromMyPosts(pid)) {
      awaitingPostId.value = null
    }
  },
  { flush: 'post' },
)

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
            <div v-for="post in myPosts" :key="'my-' + post.id" class="col-12 col-md-6 col-lg-4">
              <div
                class="card-clickable"
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
                  @view-on-map="viewOnMap"
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
            <div v-for="post in likedPosts" :key="'liked-' + post.id" class="col-12 col-md-6 col-lg-4">
               <div
                class="card-clickable"
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
                  @view-on-map="viewOnMap"
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

    <Modal :show="showComments" title="Comments" @close="closeComments" modal-class="comments-modal-on-top">
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

    <Modal :show="showPreview" title="Post Preview" @close="closePreview" size="lg" modal-class="preview-modal-on-top">
      <div class="preview-wrap">
        <div class="card themed-card position-relative preview-card" v-if="previewPost">
          <PostCard
            :post="previewPost"
            :feed="previewPost?.is_public ? 'public' : 'friends'"
            :controls="true"
            :caption-max-lines="0"
            :current-user-email="activeEmail"
            :external-comment-count="commentCounts[previewPost?.id] ?? commentCounts[previewPost?.postid] ?? (previewPost?.raw?.comments?.length || 0)"
            @open-comments="onOpenComments"
            @open-profile="viewProfile"
            @view-on-map="viewOnMap"
            @updated="applyPostPatch"
            @post-updated="applyPostPatch"
            @liked="applyPostPatch"
            @unliked="applyPostPatch"
          />
        </div>
      </div>
    </Modal>
    
    <Modal :show="showProfileModal" :title="`${profileData?.name || 'User Profile'}`" @close="closeProfileModal" size="lg" modal-class="comments-modal-on-top">
        <div v-if="profileData" class="profile-modal-content">
            <div class="profile-header d-flex align-items-center gap-3 mb-4 p-3 bg-light rounded border">
                 <img
                    :src="profileData.avatar"
                    alt="Avatar"
                    class="rounded-circle flex-shrink-0"
                    style="width: 80px; height: 80px; object-fit: cover; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"
                    @error="$event.target.src='/default-avatar.jpg'"
                 />
                 <div class="flex-grow-1" style="min-width: 0">
                    <div class="fw-bold h5 mb-0 text-truncate">{{ profileData.name }}</div>
                    <div class="text-muted small text-truncate">{{ profileData.email }}</div>
                 </div>
                 <div class="d-flex flex-column align-items-end gap-2 flex-shrink-0">
                    <button v-if="profileData.isFriend" class="btn btn-sm btn-outline-danger" @click="removeFriend(profileData)"> Remove </button>
                    <button v-else-if="profileData.isPending" class="btn btn-sm btn-outline-secondary" disabled> Pending </button>
                    <button v-else-if="profileData.email !== activeEmail" class="btn btn-sm btn-fit" @click="sendFriendReq(profileData)"> Add </button>
                 </div>
            </div>

            <h6 class="fw-semibold mb-3 ps-1 section-sub-title">
              Posts {{ profileData.isFriend ? '' : '(Public Only)' }}
            </h6>
            <div v-if="profileLoading" class="text-center text-muted py-4">
              <div class="spinner-border spinner-border-sm text-secondary" role="status"><span class="visually-hidden">Loading...</span></div>
              <span class="ms-2">Loading posts...</span>
            </div>
            <div v-else-if="profileError" class="alert alert-warning py-2 small">{{ profileError }}</div>
            <div v-else-if="!profilePosts.length" class="text-center text-muted py-4 small profile-empty-posts">
                {{ profileData.isFriend ? "This user hasn't posted anything yet." : "This user hasn't made any public posts yet." }}
            </div>
            <div v-else class="row g-2 profile-posts-grid">
                 <div v-for="post in profilePosts" :key="post.id" class="col-6">
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
                          @view-on-map="viewOnMap"
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

    <Modal :show="showConfirmRemoveModal" title="Remove Friend" @close="cancelRemove" modal-class="comments-modal-on-top">
        <div v-if="userToRemove" class="p-2">
            <p>Are you sure you want to remove <strong>{{ userToRemove.name || userToRemove.email }}</strong> from your friends list?</p>
            <div class="d-flex justify-content-end gap-2 mt-4">
                 <button class="btn btn-outline-secondary" @click="cancelRemove" :disabled="removingFriend">Cancel</button>
                 <button class="btn btn-danger" @click="confirmRemove" :disabled="removingFriend">
                    <span v-if="removingFriend" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    {{ removingFriend ? 'Removing...' : 'Confirm Remove' }}
                 </button>
            </div>
        </div>
    </Modal>

  </div>
</template>

<style scoped>
/* All styles rely on theme variables */
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

.profile-modal-content { padding: 0.25rem; }
.profile-header { border-bottom: 1px solid var(--line-100, #eee); background-color: var(--surface-hover, #f8f9fa) !important; }
.section-sub-title { color: var(--ink-700); }
.profile-posts-grid {
    max-height: calc(75vh - 200px);
    overflow-y: auto;
    padding: 0 0.5rem 0.5rem;
    margin-right: -8px;
    padding-right: 8px;
}
.profile-empty-posts { font-style: italic; }

.profile-post-card .post-image-wrapper { padding-top: 100%; position: relative; }
.profile-post-card .post-image { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
.profile-post-card .rating-badge { position: absolute; top: 4px; right: 4px; font-size: 0.65rem; padding: 1px 4px; background-color: rgba(0,0,0,0.7); color: #fff; border-radius: 4px; }
.profile-post-card.card-clickable:hover {
    transform: none; box-shadow: none;
    outline: 2px solid var(--accent, #ca6b4f); outline-offset: 1px;
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

:deep(.modal-body) { padding: 1rem 1.25rem; }
:deep(.modal-header) { border-bottom: 1px solid var(--line-100); padding: 0.75rem 1.25rem; }
:deep(.modal-title) { font-weight: 700; font-size: 1.1rem; }
:deep(.modal.modal-lg .modal-dialog) { max-width: 800px; }

:deep(.modal .btn-danger) { background-color: #dc3545; border-color: #dc3545; color: #fff; }
:deep(.modal .btn-danger:hover) { background-color: #bb2d3b; border-color: #b02a37; }
:deep(.modal .btn-fit) {
  background: var(--accent, var(--terra-500, #ca6b4f));
  color: #fff;
  border: 0;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}

:deep(.preview-modal-on-top .modal-overlay) { z-index: 1060; }
:deep(.preview-modal-on-top .modal-dialog) { z-index: 1061; }
:deep(.comments-modal-on-top .modal-overlay) { z-index: 1070; }
:deep(.comments-modal-on-top .modal-dialog) { z-index: 1071; }

.preview-wrap { position: relative; }
.preview-card { max-width: min(1200px, 96vw); margin: 0 auto; }
:deep(.modal .modal-content) { max-height: 96vh; overflow: auto; }
:deep(.modal) .preview-card img:not(.avatar),
:deep(.modal) .preview-card .post-image,
:deep(.modal) .preview-card .media img {
  max-width: 100%; width: auto; height: auto !important;
  object-fit: contain !important; object-position: center center !important;
  display: block;
}
:deep(.modal) .preview-card .image-wrap,
:deep(.modal) .preview-card .photo-wrap,
:deep(.modal) .preview-card .media,
:deep(.modal) .preview-card .photo-box {
  height: auto !important; max-height: none !important;
  aspect-ratio: auto !important; overflow: visible !important;
}
</style>
